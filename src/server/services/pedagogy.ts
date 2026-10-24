import "server-only";
import type { LearningResult } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { audit } from "@/server/audit";
import { storeUpload } from "@/server/storage";

export class PedagogyError extends Error {}

/** Needs analysis of the client (D2): a note and/or a document (PDF or Word). */
export async function recordNeedsAnalysis(
  enrollmentId: string,
  input: { note: string | null; file: File | null },
  actorId: string,
) {
  const enrollment = await db.enrollment.findUnique({ where: { id: enrollmentId } });
  if (!enrollment) throw new PedagogyError("Inscription introuvable.");
  const filePath = input.file ? await storeUpload(input.file, `pedagogie/${enrollment.sessionId}`, "document") : null;
  const data = { needsAnalysisNote: input.note, ...(filePath ? { needsAnalysisPath: filePath } : {}) };
  await db.enrollment.update({ where: { id: enrollmentId }, data });
  await audit(db, {
    userId: actorId,
    action: "update",
    entity: "enrollment",
    entityId: enrollmentId,
    before: { needsAnalysisNote: enrollment.needsAnalysisNote, needsAnalysisPath: enrollment.needsAnalysisPath },
    after: data,
  });
}

/** Entry assessment passed outside the app (D3): the uploaded result. */
export async function recordPositioningFile(enrollmentId: string, file: File, actorId: string) {
  const enrollment = await db.enrollment.findUnique({ where: { id: enrollmentId } });
  if (!enrollment) throw new PedagogyError("Inscription introuvable.");
  const positioningPath = await storeUpload(file, `pedagogie/${enrollment.sessionId}`, "document");
  await db.enrollment.update({ where: { id: enrollmentId }, data: { positioningPath } });
  await audit(db, {
    userId: actorId,
    action: "upload",
    entity: "enrollment",
    entityId: enrollmentId,
    after: { positioningPath },
  });
}

/**
 * Learning assessment of a trainee (D5), by an admin or a trainer of the
 * session; printed on the certificate.
 */
export async function recordLearningAssessment(
  enrollmentId: string,
  input: { result: LearningResult; comment: string | null; file: File | null },
  actor: { userId: string | null; label: string },
) {
  const enrollment = await db.enrollment.findUnique({ where: { id: enrollmentId } });
  if (!enrollment) throw new PedagogyError("Inscription introuvable.");
  if (!["confirmed", "present", "absent", "dropped_out"].includes(enrollment.status)) {
    throw new PedagogyError("Seuls les stagiaires inscrits peuvent être évalués.");
  }
  const filePath = input.file ? await storeUpload(input.file, `pedagogie/${enrollment.sessionId}`, "document") : null;
  const data = {
    learningResult: input.result,
    learningComment: input.comment,
    learningAssessedAt: new Date(),
    learningAssessedBy: actor.label,
    ...(filePath ? { learningFilePath: filePath } : {}),
  };
  await db.enrollment.update({ where: { id: enrollmentId }, data });
  await audit(db, {
    userId: actor.userId,
    action: "learning_assessment",
    entity: "enrollment",
    entityId: enrollmentId,
    before: { learningResult: enrollment.learningResult, learningComment: enrollment.learningComment },
    after: data,
  });
}

/**
 * Adaptation need (D8): restricted to admins. Every read is written to the
 * audit log; the value itself is never logged.
 */
export async function readAdaptationNeed(enrollmentId: string, actorId: string): Promise<string | null> {
  const enrollment = await db.enrollment.findUnique({
    where: { id: enrollmentId },
    select: { adaptationNeed: true },
  });
  if (!enrollment) throw new PedagogyError("Inscription introuvable.");
  await audit(db, { userId: actorId, action: "read_sensitive", entity: "enrollment", entityId: enrollmentId });
  return enrollment.adaptationNeed;
}

export async function saveAdaptationNeed(enrollmentId: string, value: string | null, actorId: string) {
  const enrollment = await db.enrollment.findUnique({ where: { id: enrollmentId }, select: { id: true } });
  if (!enrollment) throw new PedagogyError("Inscription introuvable.");
  await db.enrollment.update({ where: { id: enrollmentId }, data: { adaptationNeed: value } });
  // The content is sensitive: only the fact that it changed is logged.
  await audit(db, {
    userId: actorId,
    action: "update_sensitive",
    entity: "enrollment",
    entityId: enrollmentId,
    after: { adaptationNeed: value ? "renseigné" : "effacé" },
  });
}
