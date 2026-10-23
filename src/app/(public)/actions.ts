"use server";

import { refresh } from "next/cache";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import { audit } from "@/server/audit";
import { globalScore, validateAnswers, type AnswerType } from "@/server/domain/evaluations";
import { errorState, formValues, text, type ActionState } from "@/server/forms";
import { AttendanceError, signParticipant, signTrainer } from "@/server/services/attendance";
import { resolveTrainerAccess } from "@/server/services/trainer-access";
import { resolveToken } from "@/server/tokens";

async function clientIp(): Promise<string | null> {
  const list = await headers();
  return list.get("x-forwarded-for")?.split(",")[0]?.trim() || list.get("x-real-ip") || null;
}

function attendanceError(formData: FormData, error: unknown): ActionState {
  if (error instanceof AttendanceError) return errorState(formData, error.message);
  throw error;
}

/** Participant signs a slot with their personal link. */
export async function signWithLink(_state: ActionState, formData: FormData): Promise<ActionState> {
  const record = await resolveToken(text(formData, "token") ?? "", ["attendance"]);
  if (!record?.enrollmentId) return errorState(formData, "Ce lien d'émargement n'est plus valide.");
  try {
    await signParticipant({
      enrollmentId: record.enrollmentId,
      slotId: text(formData, "slotId") ?? "",
      signature: text(formData, "signature"),
      ipAddress: await clientIp(),
      method: "participant_link",
      actorId: null,
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
      ipAddress: await clientIp(),
      method: "trainer_device",
      actorId: access.actorId,
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
      actorId: access.actorId,
    });
  } catch (error) {
    return attendanceError(formData, error);
  }
  refresh();
  return { status: "success", message: "Votre signature est enregistrée." };
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
