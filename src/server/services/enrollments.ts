import "server-only";
import type { EnrollmentSource, EnrollmentStatus, FundingType, Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { formatDateRange } from "@/lib/dates";
import { invoicedOutside } from "@/server/domain/invoicing";
import { audit } from "@/server/audit";
import {
  automaticSessionStatus,
  enrollmentsToPromote,
  holdsSeat,
  SEAT_HOLDING_STATUSES,
  statusForNewEnrollment,
} from "@/server/domain/capacity";
import { agreementSatisfied, defaultFunding, seatStatus } from "@/server/domain/compliance";
import { acceptsEnrollments } from "@/server/domain/session-status";
import { anyOverlap } from "@/server/domain/slots";

type Tx = Prisma.TransactionClient;

/** Business rule violation, shown to the user as is. */
export class EnrollmentError extends Error {}

/** Locks the session row so that seat counting is serialized (rule 1). */
async function lockSession(tx: Tx, sessionId: string) {
  await tx.$queryRaw`SELECT id FROM sessions WHERE id = ${sessionId}::uuid FOR UPDATE`;
  return tx.trainingSession.findUniqueOrThrow({ where: { id: sessionId }, include: { training: true } });
}

/** Whether an enrollment may be confirmed: internal, signed agreement or admin waiver (B2). */
async function agreementOk(
  tx: Tx,
  enrollment: { participantType: "internal" | "external"; conventionId: string | null; agreementWaivedAt: Date | null },
): Promise<boolean> {
  const convention = enrollment.conventionId
    ? await tx.convention.findUnique({ where: { id: enrollment.conventionId }, select: { status: true } })
    : null;
  return agreementSatisfied({
    participantType: enrollment.participantType,
    conventionSigned: convention?.status === "signed",
    agreementWaived: enrollment.agreementWaivedAt !== null,
  });
}

async function occupiedSeats(tx: Tx, sessionId: string): Promise<number> {
  return tx.enrollment.count({ where: { sessionId, status: { in: [...SEAT_HOLDING_STATUSES] } } });
}

/** Sets the session to full / published according to its occupancy (rule 7). */
async function refreshSessionStatus(tx: Tx, sessionId: string, actorId: string | null) {
  const session = await tx.trainingSession.findUniqueOrThrow({ where: { id: sessionId } });
  const status = automaticSessionStatus(session.status, await occupiedSeats(tx, sessionId), session.capacityMax);
  if (status === session.status) return;
  await tx.trainingSession.update({ where: { id: sessionId }, data: { status } });
  await audit(tx, {
    userId: actorId,
    action: "status_change",
    entity: "session",
    entityId: sessionId,
    before: { status: session.status },
    after: { status, automatic: true },
  });
}

/**
 * Promotes waitlisted enrollments, in enrollment order, while seats are free
 * (rule 2). Returns the promoted enrollment ids so that callers can notify
 * the participants (emails arrive in lot 3).
 */
export async function promoteWaitlist(tx: Tx, sessionId: string, actorId: string | null): Promise<string[]> {
  const session = await tx.trainingSession.findUniqueOrThrow({ where: { id: sessionId } });
  if (!acceptsEnrollments(session.status)) return [];
  const waitlisted = await tx.enrollment.findMany({
    where: { sessionId, status: "waitlisted" },
    orderBy: { enrolledAt: "asc" },
  });
  const promoted = enrollmentsToPromote(waitlisted, await occupiedSeats(tx, sessionId), session.capacityMax);
  for (const enrollment of promoted) {
    const status = seatStatus(await agreementOk(tx, enrollment));
    await tx.enrollment.update({ where: { id: enrollment.id }, data: { status } });
    await audit(tx, {
      userId: actorId,
      action: "promote",
      entity: "enrollment",
      entityId: enrollment.id,
      before: { status: "waitlisted" },
      after: { status, sessionId },
    });
  }
  return promoted.map((enrollment) => enrollment.id);
}

export type EnrollInput = {
  sessionId: string;
  participantId: string;
  source: EnrollmentSource;
  actorId: string;
  motivation?: string | null;
  fundingType?: FundingType | null;
  /** Adaptation need given by the trainee (D8); never written to the audit log. */
  adaptationNeed?: string | null;
};

/**
 * Enrolls a participant inside a transaction: confirmed while seats remain,
 * waitlisted otherwise. A previously cancelled enrollment is reactivated at
 * the end of the queue.
 */
export async function enrollParticipant(tx: Tx, input: EnrollInput) {
  const session = await lockSession(tx, input.sessionId);
  if (!acceptsEnrollments(session.status)) {
    throw new EnrollmentError("Cette session est annulée ou terminée : les inscriptions sont fermées.");
  }
  const participant = await tx.participant.findUniqueOrThrow({ where: { id: input.participantId } });
  if (participant.archivedAt || participant.anonymizedAt) {
    throw new EnrollmentError("Ce participant est archivé.");
  }
  if (participant.type === "external" && !session.openToExternal) {
    throw new EnrollmentError("Cette session n'est pas ouverte aux participants externes.");
  }

  const existing = await tx.enrollment.findUnique({
    where: { sessionId_participantId: { sessionId: session.id, participantId: participant.id } },
  });
  if (existing && existing.status !== "cancelled") {
    throw new EnrollmentError(`${participant.firstName} ${participant.lastName} est déjà inscrit(e) à cette session.`);
  }

  // A reactivated enrollment keeps its agreement link or waiver.
  const agreement = await agreementOk(tx, {
    participantType: participant.type,
    conventionId: existing?.conventionId ?? null,
    agreementWaivedAt: existing?.agreementWaivedAt ?? null,
  });
  const seat = statusForNewEnrollment(await occupiedSeats(tx, session.id), session.capacityMax);
  const status = seat === "waitlisted" ? seat : seatStatus(agreement);
  const billing =
    participant.type === "external"
      ? { appliedPrice: session.training.priceExclTax, billingCompanyId: participant.companyId }
      : { appliedPrice: null, billingCompanyId: null };
  const data = {
    status,
    source: input.source,
    enrolledById: input.actorId,
    enrolledAt: new Date(),
    motivation: input.motivation ?? null,
    ...(input.adaptationNeed !== undefined ? { adaptationNeed: input.adaptationNeed } : {}),
    participantType: participant.type,
    fundingType: input.fundingType ?? existing?.fundingType ?? defaultFunding(participant.type),
    cancelledAt: null,
    cancellationReason: null,
    ...billing,
  };

  const enrollment = existing
    ? await tx.enrollment.update({ where: { id: existing.id }, data })
    : await tx.enrollment.create({ data: { ...data, sessionId: session.id, participantId: participant.id } });

  await audit(tx, {
    userId: input.actorId,
    action: existing ? "restore" : "create",
    entity: "enrollment",
    entityId: enrollment.id,
    after: { sessionId: session.id, participantId: participant.id, status, source: input.source },
  });
  await refreshSessionStatus(tx, session.id, input.actorId);
  return enrollment;
}

/** Other active enrollments of the participant whose slots overlap this session (rule 4). */
export async function overlappingEnrollments(participantId: string, sessionId: string): Promise<string[]> {
  const slots = await db.sessionSlot.findMany({ where: { sessionId } });
  if (slots.length === 0) return [];
  const others = await db.enrollment.findMany({
    where: {
      participantId,
      sessionId: { not: sessionId },
      status: { in: ["confirmed", "waitlisted"] },
      session: { status: { notIn: ["cancelled", "completed"] } },
    },
    include: { session: { include: { training: true, slots: true } } },
  });
  return others
    .filter((other) => anyOverlap(slots, other.session.slots))
    .map(
      (other) =>
        `${other.session.training.title} (${other.session.reference}, ${formatDateRange(other.session.slots.map((slot) => slot.startsAt))})`,
    );
}

export type EnrollmentUpdate = {
  status: EnrollmentStatus;
  fundingType?: FundingType;
  appliedPrice: number | null;
  billingCompanyId: string | null;
  cancellationReason: string | null;
  /** Reason of a dropout (D6), required with the status `dropped_out`. */
  dropoutReason?: string | null;
  /** Funding details (externals): subrogation to a funder such as an OPCO. */
  funding?: {
    subrogation: boolean;
    funderId: string | null;
    agreementNumber: string | null;
    fundedAmount: number | null;
  };
};

/** Changes an enrollment from the BO; freeing a seat promotes the waitlist. */
export async function updateEnrollment(enrollmentId: string, update: EnrollmentUpdate, actorId: string) {
  return db.$transaction(async (tx) => {
    const current = await tx.enrollment.findUniqueOrThrow({ where: { id: enrollmentId } });
    const session = await lockSession(tx, current.sessionId);
    const statusChanged = update.status !== current.status;
    if (statusChanged && update.status === "confirmed" && !(await agreementOk(tx, current))) {
      throw new EnrollmentError(
        "Une inscription externe ne peut être confirmée qu'avec une convention signée ou une dérogation motivée.",
      );
    }

    if (statusChanged && update.status === "dropped_out") {
      if (!update.dropoutReason?.trim()) throw new EnrollmentError("Indiquez le motif de l'abandon.");
      if (!["confirmed", "present", "absent"].includes(current.status)) {
        throw new EnrollmentError("Seul un stagiaire inscrit peut abandonner la formation.");
      }
      const started = await tx.sessionSlot.count({ where: { sessionId: session.id, startsAt: { lte: new Date() } } });
      if (started === 0) {
        throw new EnrollmentError(
          "La formation n'a pas commencé : annulez l'inscription plutôt que de déclarer un abandon.",
        );
      }
    }

    if (statusChanged && holdsSeat(update.status) && !holdsSeat(current.status)) {
      if (!acceptsEnrollments(session.status) && update.status === "confirmed") {
        throw new EnrollmentError("Cette session est annulée ou terminée.");
      }
      if ((await occupiedSeats(tx, session.id)) >= session.capacityMax) {
        throw new EnrollmentError(
          "La session est complète : augmentez la capacité maximale ou libérez une place avant de confirmer cette inscription.",
        );
      }
    }

    if (update.funding?.subrogation) {
      if (!update.funding.funderId)
        throw new EnrollmentError("Choisissez le financeur (OPCO) qui paie directement la formation.");
      if (invoicedOutside(update.fundingType ?? current.fundingType))
        throw new EnrollmentError(
          "Le CPF, France Travail et la Région se règlent sur leur plateforme : pas de subrogation.",
        );
    }

    const data = {
      status: update.status,
      ...(update.fundingType ? { fundingType: update.fundingType } : {}),
      ...(update.funding
        ? {
            fundingSubrogation: update.funding.subrogation,
            funderId: update.funding.funderId,
            fundingAgreementNumber: update.funding.agreementNumber,
            fundedAmount: update.funding.fundedAmount,
          }
        : {}),
      appliedPrice: update.appliedPrice,
      billingCompanyId: update.billingCompanyId,
      ...(update.status === "cancelled"
        ? {
            cancelledAt: current.status === "cancelled" ? current.cancelledAt : new Date(),
            cancellationReason: update.cancellationReason,
          }
        : { cancelledAt: null, cancellationReason: null }),
      ...(update.status === "dropped_out"
        ? {
            droppedOutAt: current.status === "dropped_out" ? current.droppedOutAt : new Date(),
            dropoutReason: update.dropoutReason ?? current.dropoutReason,
          }
        : { droppedOutAt: null, dropoutReason: null }),
      // Going back to the waitlist puts the enrollment at the end of the queue.
      ...(statusChanged && update.status === "waitlisted" ? { enrolledAt: new Date() } : {}),
    };
    await tx.enrollment.update({ where: { id: current.id }, data });
    await audit(tx, {
      userId: actorId,
      action: statusChanged ? "status_change" : "update",
      entity: "enrollment",
      entityId: current.id,
      before: {
        status: current.status,
        fundingType: current.fundingType,
        appliedPrice: current.appliedPrice,
        billingCompanyId: current.billingCompanyId,
        fundingSubrogation: current.fundingSubrogation,
        funderId: current.funderId,
        fundingAgreementNumber: current.fundingAgreementNumber,
        fundedAmount: current.fundedAmount,
      },
      after: {
        status: update.status,
        fundingType: update.fundingType ?? current.fundingType,
        appliedPrice: update.appliedPrice,
        billingCompanyId: update.billingCompanyId,
        ...(update.funding
          ? {
              fundingSubrogation: update.funding.subrogation,
              funderId: update.funding.funderId,
              fundingAgreementNumber: update.funding.agreementNumber,
              fundedAmount: update.funding.fundedAmount,
            }
          : {}),
        reason: update.status === "dropped_out" ? update.dropoutReason : update.cancellationReason,
      },
    });

    const promoted =
      holdsSeat(current.status) && !holdsSeat(update.status) ? await promoteWaitlist(tx, session.id, actorId) : [];
    await refreshSessionStatus(tx, session.id, actorId);
    return { promoted };
  });
}

/** Moves an enrollment to another session, keeping its history (BO only). */
export async function moveEnrollment(enrollmentId: string, targetSessionId: string, actorId: string) {
  return db.$transaction(async (tx) => {
    const current = await tx.enrollment.findUniqueOrThrow({
      where: { id: enrollmentId },
      include: { participant: true },
    });
    if (current.sessionId === targetSessionId) throw new EnrollmentError("Choisissez une autre session.");

    // Lock both sessions in a stable order to avoid deadlocks.
    const [first, second] = [current.sessionId, targetSessionId].sort();
    await lockSession(tx, first);
    await lockSession(tx, second);
    const source = await tx.trainingSession.findUniqueOrThrow({
      where: { id: current.sessionId },
      include: { training: true },
    });
    const target = await tx.trainingSession.findUniqueOrThrow({
      where: { id: targetSessionId },
      include: { training: true },
    });

    if (!acceptsEnrollments(target.status)) throw new EnrollmentError("La session cible est annulée ou terminée.");
    if (current.participant.type === "external" && !target.openToExternal) {
      throw new EnrollmentError("La session cible n'est pas ouverte aux participants externes.");
    }
    const already = await tx.enrollment.findUnique({
      where: { sessionId_participantId: { sessionId: target.id, participantId: current.participantId } },
    });
    if (already && already.status !== "cancelled") {
      throw new EnrollmentError("Ce participant est déjà inscrit à la session cible.");
    }

    // The agreement is tied to the source session: the moved enrollment needs a
    // new agreement (or keeps its waiver).
    const seat = statusForNewEnrollment(await occupiedSeats(tx, target.id), target.capacityMax);
    const status = seat === "waitlisted" ? seat : seatStatus(await agreementOk(tx, { ...current, conventionId: null }));
    const reason = `Déplacé vers ${target.reference}`;
    let movedId = current.id;
    if (already) {
      // Reuse the cancelled enrollment of the target session and cancel the source one.
      await tx.enrollment.update({
        where: { id: already.id },
        data: {
          status,
          enrolledAt: new Date(),
          cancelledAt: null,
          cancellationReason: null,
          enrolledById: actorId,
          conventionId: null,
          agreementWaiverReason: current.agreementWaiverReason,
          agreementWaivedAt: current.agreementWaivedAt,
          agreementWaivedById: current.agreementWaivedById,
        },
      });
      await tx.enrollment.update({
        where: { id: current.id },
        data: { status: "cancelled", cancelledAt: new Date(), cancellationReason: reason },
      });
      movedId = already.id;
    } else {
      await tx.enrollment.update({
        where: { id: current.id },
        data: {
          sessionId: target.id,
          status,
          enrolledAt: new Date(),
          conventionId: null,
          ...(source.trainingId !== target.trainingId && current.participant.type === "external"
            ? { appliedPrice: target.training.priceExclTax }
            : {}),
        },
      });
    }

    await audit(tx, {
      userId: actorId,
      action: "move",
      entity: "enrollment",
      entityId: movedId,
      before: { sessionId: source.id, reference: source.reference, status: current.status },
      after: { sessionId: target.id, reference: target.reference, status },
    });

    const promoted = holdsSeat(current.status) ? await promoteWaitlist(tx, source.id, actorId) : [];
    await refreshSessionStatus(tx, source.id, actorId);
    await refreshSessionStatus(tx, target.id, actorId);
    return { status, promoted, target };
  });
}

/** Re-applies capacity rules after the capacity of a session changed. */
export async function applyCapacityChange(tx: Tx, sessionId: string, actorId: string) {
  const promoted = await promoteWaitlist(tx, sessionId, actorId);
  await refreshSessionStatus(tx, sessionId, actorId);
  return promoted;
}

/** Admin waiver of the training agreement, with a mandatory reason (B2): confirms a pending enrollment. */
export async function waiveAgreement(enrollmentId: string, reason: string, actorId: string) {
  return db.$transaction(async (tx) => {
    const current = await tx.enrollment.findUniqueOrThrow({ where: { id: enrollmentId } });
    if (current.participantType !== "external")
      throw new EnrollmentError("Seules les inscriptions externes ont une convention.");
    const confirm = current.status === "pending_agreement";
    await tx.enrollment.update({
      where: { id: current.id },
      data: {
        agreementWaiverReason: reason,
        agreementWaivedAt: new Date(),
        agreementWaivedById: actorId,
        ...(confirm ? { status: "confirmed" as const } : {}),
      },
    });
    await audit(tx, {
      userId: actorId,
      action: "agreement_waiver",
      entity: "enrollment",
      entityId: current.id,
      before: { status: current.status },
      after: { status: confirm ? "confirmed" : current.status, reason },
    });
    return { confirmed: confirm };
  });
}

/** Confirms the pending enrollments linked to a convention that has just been signed. */
export async function confirmConventionEnrollments(tx: Tx, conventionId: string, actorId: string): Promise<string[]> {
  const pending = await tx.enrollment.findMany({ where: { conventionId, status: "pending_agreement" } });
  for (const enrollment of pending) {
    await tx.enrollment.update({ where: { id: enrollment.id }, data: { status: "confirmed" } });
    await audit(tx, {
      userId: actorId,
      action: "status_change",
      entity: "enrollment",
      entityId: enrollment.id,
      before: { status: "pending_agreement" },
      after: { status: "confirmed", conventionId },
    });
  }
  return pending.map((enrollment) => enrollment.id);
}
