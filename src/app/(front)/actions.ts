"use server";

import { refresh } from "next/cache";
import { db } from "@/lib/db";
import { requireUser } from "@/server/auth/guards";
import { canSelfEnroll, canSelfUnenroll } from "@/server/domain/front-enrollment";
import { noticeForStatus, promotionNotices, scheduleEnrollmentNotices } from "@/server/email/notifications";
import { errorState, text, type ActionState } from "@/server/forms";
import { ensureInternalParticipant } from "@/server/services/companies";
import {
  EnrollmentError,
  enrollParticipant,
  overlappingEnrollments,
  updateEnrollment,
} from "@/server/services/enrollments";

async function loadFrontSession(sessionId: string | null) {
  if (!sessionId) return null;
  const session = await db.trainingSession.findUnique({
    where: { id: sessionId },
    include: { slots: { orderBy: { startsAt: "asc" }, take: 1 }, training: true },
  });
  if (!session) return null;
  return { ...session, firstSlotStart: session.slots[0]?.startsAt ?? null };
}

/** Collaborator self-enrollment: confirmed automatically, or waitlisted when full (rules 1 and 3). */
export async function enrollSelf(_state: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser();
  const session = await loadFrontSession(text(formData, "sessionId"));
  if (!session || !session.training.active) return errorState(formData, "Session introuvable.");
  if (!canSelfEnroll(session, new Date())) {
    return errorState(
      formData,
      "Les inscriptions à cette session sont closes. Contactez le service formation si besoin.",
    );
  }

  const existingParticipant = await db.participant.findUnique({ where: { userId: user.id } });
  if (existingParticipant) {
    // Rule 4: blocking on the front.
    const overlaps = await overlappingEnrollments(existingParticipant.id, session.id);
    if (overlaps.length > 0) {
      return errorState(
        formData,
        `Vous êtes déjà inscrit(e) à une session aux mêmes horaires : ${overlaps.join(" ; ")}.`,
      );
    }
  }

  try {
    const enrollment = await db.$transaction(async (tx) => {
      const participant = await ensureInternalParticipant(tx, user.id, user.id);
      return enrollParticipant(tx, {
        sessionId: session.id,
        participantId: participant.id,
        source: "front",
        actorId: user.id,
        motivation: text(formData, "motivation"),
        adaptationNeed: text(formData, "adaptationNeed"),
      });
    });
    scheduleEnrollmentNotices([{ enrollmentId: enrollment.id, notice: noticeForStatus(enrollment.status) }]);
    refresh();
    return {
      status: "success",
      message:
        enrollment.status === "waitlisted"
          ? "La session est complète : vous êtes inscrit(e) en liste d'attente. Vous serez prévenu(e) par email si une place se libère."
          : "Votre inscription est confirmée. Un email de confirmation avec l'invitation d'agenda vous a été envoyé.",
      data: { status: enrollment.status },
    };
  } catch (error) {
    if (error instanceof EnrollmentError) return errorState(formData, error.message);
    throw error;
  }
}

/** Unenrollment until the deadline, or until the session starts (rule 5). Frees the seat for the waitlist. */
export async function unenrollSelf(_state: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser();
  const enrollmentId = text(formData, "enrollmentId");
  const enrollment = enrollmentId
    ? await db.enrollment.findUnique({ where: { id: enrollmentId }, include: { participant: true } })
    : null;
  if (!enrollment || enrollment.participant.userId !== user.id) return errorState(formData, "Inscription introuvable.");

  const session = await loadFrontSession(enrollment.sessionId);
  if (!session || !canSelfUnenroll(enrollment.status, session, new Date())) {
    return errorState(formData, "La désinscription n'est plus possible en ligne. Contactez le service formation.");
  }

  try {
    const { promoted } = await updateEnrollment(
      enrollment.id,
      {
        status: "cancelled",
        appliedPrice: enrollment.appliedPrice ? Number(enrollment.appliedPrice) : null,
        billingCompanyId: enrollment.billingCompanyId,
        cancellationReason: text(formData, "reason") ?? "Désinscription par le collaborateur",
      },
      user.id,
    );
    scheduleEnrollmentNotices(promotionNotices(promoted));
    refresh();
    return { status: "success", message: "Votre désinscription est enregistrée." };
  } catch (error) {
    if (error instanceof EnrollmentError) return errorState(formData, error.message);
    throw error;
  }
}
