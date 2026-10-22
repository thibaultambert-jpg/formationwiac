"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { formatSlot, parisYear } from "@/lib/dates";
import { audit, diff } from "@/server/audit";
import { requireRole } from "@/server/auth/guards";
import { SEAT_HOLDING_STATUSES } from "@/server/domain/capacity";
import { canCancel, canDeleteSession, canPublish, canUnpublish } from "@/server/domain/session-status";
import { errorState, formValues, isConfirmed, text, type ActionState } from "@/server/forms";
import { applyCapacityChange } from "@/server/services/enrollments";
import {
  allocateReference,
  createSessionRecord,
  parseSessionForm,
  SessionError,
  sessionData,
  trainerConflicts,
  updateSessionRecord,
} from "@/server/services/sessions";

function slotsSummary(slots: { startsAt: Date; endsAt: Date }[]): string[] {
  return slots.map((slot) => formatSlot(slot.startsAt, slot.endsAt));
}

export async function createSession(_state: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireRole(["admin"]);
  const parsed = parseSessionForm(formData);
  if (!parsed.ok) return errorState(formData, parsed.message, parsed.fieldErrors);

  const training = await db.training.findUnique({ where: { id: parsed.data.trainingId } });
  if (!training || !training.active)
    return errorState(formData, "Formation introuvable ou archivée.", { trainingId: "Invalide." });

  if (!isConfirmed(formData)) {
    const conflicts = await trainerConflicts(parsed.data.trainerIds, parsed.data.slots);
    if (conflicts.length > 0) return { status: "warning", warnings: conflicts, values: formValues(formData) };
  }

  const session = await db.$transaction(async (tx) => {
    const created = await createSessionRecord(tx, parsed.data);
    await audit(tx, {
      userId: actor.id,
      action: "create",
      entity: "session",
      entityId: created.id,
      after: { ...created, slots: slotsSummary(parsed.data.slots), trainerIds: parsed.data.trainerIds },
    });
    return created;
  });
  redirect(`/admin/sessions/${session.id}?cree=1`);
}

export async function updateSession(_state: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireRole(["admin"]);
  const id = text(formData, "id");
  const existing = id
    ? await db.trainingSession.findUnique({
        where: { id },
        include: { slots: { orderBy: { startsAt: "asc" } }, trainers: true },
      })
    : null;
  if (!existing) return errorState(formData, "Session introuvable.");
  if (existing.status === "cancelled" || existing.status === "completed") {
    return errorState(formData, "Une session annulée ou terminée ne peut plus être modifiée.");
  }

  const parsed = parseSessionForm(formData);
  if (!parsed.ok) return errorState(formData, parsed.message, parsed.fieldErrors);
  const training = await db.training.findUnique({ where: { id: parsed.data.trainingId } });
  if (!training) return errorState(formData, "Formation introuvable.", { trainingId: "Invalide." });

  if (!isConfirmed(formData)) {
    const warnings = await trainerConflicts(parsed.data.trainerIds, parsed.data.slots, existing.id);
    const seats = await db.enrollment.count({
      where: { sessionId: existing.id, status: { in: [...SEAT_HOLDING_STATUSES] } },
    });
    if (parsed.data.capacityMax < seats) {
      warnings.push(
        `La capacité maximale (${parsed.data.capacityMax}) est inférieure au nombre d'inscrits confirmés (${seats}).`,
      );
    }
    if (warnings.length > 0) return { status: "warning", warnings, values: formValues(formData) };
  }

  try {
    await db.$transaction(async (tx) => {
      await updateSessionRecord(tx, existing.id, parsed.data);
      const before = {
        ...existing,
        slots: slotsSummary(existing.slots),
        trainerIds: existing.trainers.map((t) => t.trainerId).sort(),
      };
      const after = {
        ...sessionData(parsed.data),
        slots: slotsSummary(parsed.data.slots),
        trainerIds: [...parsed.data.trainerIds].sort(),
      };
      const changes = diff(before, after);
      if (changes)
        await audit(tx, { userId: actor.id, action: "update", entity: "session", entityId: existing.id, ...changes });
      await applyCapacityChange(tx, existing.id, actor.id);
    });
  } catch (error) {
    if (error instanceof SessionError) return errorState(formData, error.message);
    throw error;
  }
  redirect(`/admin/sessions/${existing.id}?modifie=1`);
}

export async function duplicateSession(formData: FormData): Promise<void> {
  const actor = await requireRole(["admin"]);
  const id = text(formData, "id");
  const source = id
    ? await db.trainingSession.findUnique({ where: { id }, include: { slots: true, trainers: true } })
    : null;
  if (!source) return;

  const copy = await db.$transaction(async (tx) => {
    const firstSlot = [...source.slots].sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime())[0];
    const reference = await allocateReference(tx, parisYear(firstSlot?.startsAt ?? new Date()));
    const created = await tx.trainingSession.create({
      data: {
        trainingId: source.trainingId,
        reference,
        status: "draft",
        location: source.location,
        videoLink: source.videoLink,
        capacityMax: source.capacityMax,
        capacityMin: source.capacityMin,
        registrationDeadline: source.registrationDeadline,
        openToInternal: source.openToInternal,
        openToExternal: source.openToExternal,
        internalNotes: source.internalNotes,
        slots: { create: source.slots.map(({ startsAt, endsAt }) => ({ startsAt, endsAt })) },
        trainers: { create: source.trainers.map(({ trainerId }) => ({ trainerId })) },
      },
    });
    await audit(tx, {
      userId: actor.id,
      action: "create",
      entity: "session",
      entityId: created.id,
      after: { duplicatedFrom: source.reference, reference },
    });
    return created;
  });
  redirect(`/admin/sessions/${copy.id}/modifier?duplique=1`);
}

async function changeStatus(
  formData: FormData,
  allowed: (status: Parameters<typeof canPublish>[0]) => boolean,
  status: "published" | "draft",
  action: string,
) {
  const actor = await requireRole(["admin"]);
  const id = text(formData, "id");
  const session = id ? await db.trainingSession.findUnique({ where: { id } }) : null;
  if (!session || !allowed(session.status)) return;
  await db.$transaction(async (tx) => {
    await tx.trainingSession.update({ where: { id: session.id }, data: { status } });
    await audit(tx, {
      userId: actor.id,
      action,
      entity: "session",
      entityId: session.id,
      before: { status: session.status },
      after: { status },
    });
    // A published session at capacity becomes full immediately.
    if (status === "published") await applyCapacityChange(tx, session.id, actor.id);
  });
  refresh();
}

export async function publishSession(formData: FormData): Promise<void> {
  await changeStatus(formData, canPublish, "published", "publish");
}

export async function unpublishSession(formData: FormData): Promise<void> {
  await changeStatus(formData, canUnpublish, "draft", "unpublish");
}

export async function cancelSession(_state: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireRole(["admin"]);
  const id = text(formData, "id");
  const reason = text(formData, "reason");
  const session = id ? await db.trainingSession.findUnique({ where: { id } }) : null;
  if (!session) return errorState(formData, "Session introuvable.");
  if (!canCancel(session.status)) return errorState(formData, "Cette session ne peut plus être annulée.");
  if (!reason) return errorState(formData, "Indiquez le motif de l'annulation.", { reason: "Obligatoire." });

  await db.trainingSession.update({
    where: { id: session.id },
    data: { status: "cancelled", cancelledAt: new Date(), cancellationReason: reason },
  });
  await audit(db, {
    userId: actor.id,
    action: "cancel",
    entity: "session",
    entityId: session.id,
    before: { status: session.status },
    after: { status: "cancelled", reason },
  });
  refresh();
  return { status: "success", message: "La session a été annulée." };
}

export async function deleteSession(formData: FormData): Promise<void> {
  const actor = await requireRole(["admin"]);
  const id = text(formData, "id");
  const session = id
    ? await db.trainingSession.findUnique({ where: { id }, include: { _count: { select: { enrollments: true } } } })
    : null;
  if (!session || !canDeleteSession(session._count.enrollments)) return;

  await db.$transaction(async (tx) => {
    await tx.document.deleteMany({ where: { sessionId: session.id } });
    await tx.trainingSession.delete({ where: { id: session.id } });
    await audit(tx, {
      userId: actor.id,
      action: "delete",
      entity: "session",
      entityId: session.id,
      before: { reference: session.reference },
    });
  });
  redirect("/admin/sessions");
}
