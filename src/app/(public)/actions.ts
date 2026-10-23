"use server";

import { refresh } from "next/cache";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import { audit } from "@/server/audit";
import { globalScore, validateAnswers, type AnswerType } from "@/server/domain/evaluations";
import { checkbox, errorState, formValues, text, type ActionState } from "@/server/forms";
import {
  AttendanceError,
  correctionFromForm,
  recordCorrection,
  signParticipant,
  signTrainer,
} from "@/server/services/attendance";
import { resolveTrainerAccess } from "@/server/services/trainer-access";
import { resolveAttendanceLink, resolveToken } from "@/server/tokens";

/** Technical proof data of a signature (C6), from the request headers. */
async function proofContext(): Promise<{ ipAddress: string | null; userAgent: string | null }> {
  const list = await headers();
  return {
    ipAddress: list.get("x-forwarded-for")?.split(",")[0]?.trim() || list.get("x-real-ip") || null,
    userAgent: list.get("user-agent")?.slice(0, 500) ?? null,
  };
}

function attendanceError(formData: FormData, error: unknown): ActionState {
  if (error instanceof AttendanceError) return errorState(formData, error.message);
  throw error;
}

/** Participant signs the slot of their personal link: drawn signature or checkbox attestation (H1). */
export async function signWithLink(_state: ActionState, formData: FormData): Promise<ActionState> {
  const link = await resolveAttendanceLink(text(formData, "token") ?? "");
  if (link.status === "used") return errorState(formData, "Votre présence pour ce créneau est déjà enregistrée.");
  if (link.status !== "ok") return errorState(formData, "Ce lien d'émargement n'est pas ou plus valide.");
  const attestation = text(formData, "mode") === "checkbox";
  if (attestation && !checkbox(formData, "attest"))
    return errorState(formData, "Cochez la case pour certifier votre présence.", { attest: "Obligatoire." });
  try {
    await signParticipant({
      enrollmentId: link.record.enrollmentId!,
      slotId: link.record.slotId!,
      signature: attestation ? null : text(formData, "signature"),
      method: attestation ? "attestation_checkbox" : "participant_link",
      tokenId: link.record.id,
      actorId: null,
      ...(await proofContext()),
    });
  } catch (error) {
    return attendanceError(formData, error);
  }
  refresh();
  return { status: "success", message: "Merci, votre présence est enregistrée." };
}

/** A participant signs on the trainer's device (tablet mode). */
export async function signOnTrainerDevice(_state: ActionState, formData: FormData): Promise<ActionState> {
  const access = await resolveTrainerAccess({ token: text(formData, "token"), sessionId: text(formData, "sessionId") });
  if (!access) return errorState(formData, "Accès refusé.");
  const enrollmentId = text(formData, "enrollmentId") ?? "";
  const enrollment = await db.enrollment.findUnique({ where: { id: enrollmentId } });
  if (!enrollment || enrollment.sessionId !== access.sessionId) return errorState(formData, "Participant introuvable.");
  try {
    await signParticipant({
      enrollmentId,
      slotId: text(formData, "slotId") ?? "",
      signature: text(formData, "signature"),
      method: "trainer_device",
      tokenId: null,
      actorId: access.actorId,
      ...(await proofContext()),
    });
  } catch (error) {
    return attendanceError(formData, error);
  }
  refresh();
  return { status: "success", message: "Signature enregistrée." };
}

export async function signAsTrainer(_state: ActionState, formData: FormData): Promise<ActionState> {
  const access = await resolveTrainerAccess({ token: text(formData, "token"), sessionId: text(formData, "sessionId") });
  if (!access) return errorState(formData, "Accès refusé.");
  try {
    await signTrainer({
      sessionId: access.sessionId,
      trainerId: access.trainerId,
      slotId: text(formData, "slotId") ?? "",
      signature: text(formData, "signature"),
      tokenId: access.tokenId,
      actorId: access.actorId,
      ...(await proofContext()),
    });
  } catch (error) {
    return attendanceError(formData, error);
  }
  refresh();
  return { status: "success", message: "Votre signature est enregistrée." };
}

/** Trainer declares an absence, lateness or early departure with its reason (C3). */
export async function correctAsTrainer(_state: ActionState, formData: FormData): Promise<ActionState> {
  const access = await resolveTrainerAccess({ token: text(formData, "token"), sessionId: text(formData, "sessionId") });
  if (!access) return errorState(formData, "Accès refusé.");
  try {
    const correction = await correctionFromForm(formData);
    const enrollment = await db.enrollment.findUnique({ where: { id: correction.enrollmentId } });
    if (!enrollment || enrollment.sessionId !== access.sessionId)
      return errorState(formData, "Participant introuvable.");
    await recordCorrection({ ...correction, authorUserId: access.actorId, authorTrainerId: access.trainerId });
  } catch (error) {
    return attendanceError(formData, error);
  }
  refresh();
  return { status: "success", message: "Déclaration enregistrée." };
}

export async function submitEvaluation(_state: ActionState, formData: FormData): Promise<ActionState> {
  const record = await resolveToken(text(formData, "token") ?? "", ["hot_evaluation", "cold_evaluation"]);
  if (!record?.enrollmentId) return errorState(formData, "Ce lien d'évaluation n'est plus valide.");
  const type = record.purpose === "hot_evaluation" ? "hot" : "cold";
  const evaluation = await db.evaluation.upsert({
    where: { enrollmentId_type: { enrollmentId: record.enrollmentId, type } },
    update: {},
    create: { enrollmentId: record.enrollmentId, type },
  });
  if (evaluation.submittedAt)
    return { status: "success", message: "Vous avez déjà répondu à ce questionnaire. Merci !" };

  const questions = await db.evaluationQuestion.findMany({
    where: { evaluationType: type, active: true },
    orderBy: { position: "asc" },
  });
  const result = validateAnswers(
    questions.map((question) => ({
      ...question,
      answerType: question.answerType as AnswerType,
      options: (question.options as string[] | null) ?? null,
    })),
    formValues(formData),
  );
  if (!result.ok) return errorState(formData, "Merci de répondre aux questions obligatoires.", result.errors);

  await db.evaluation.update({
    where: { id: evaluation.id },
    data: { answers: result.answers, globalScore: globalScore(result.answers), submittedAt: new Date() },
  });
  await audit(db, {
    userId: null,
    action: "create",
    entity: "enrollment",
    entityId: record.enrollmentId,
    after: { evaluation: type },
  });
  refresh();
  return { status: "success", message: "Merci pour vos réponses !" };
}
