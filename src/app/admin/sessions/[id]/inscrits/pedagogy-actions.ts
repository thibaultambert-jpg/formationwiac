"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { displayName, requireRole } from "@/server/auth/guards";
import { errorState, text, type ActionState } from "@/server/forms";
import {
  PedagogyError,
  readAdaptationNeed,
  recordLearningAssessment,
  recordNeedsAnalysis,
  recordPositioningFile,
  saveAdaptationNeed,
} from "@/server/services/pedagogy";
import { readUpload, UploadError } from "@/server/storage";

const LEARNING_RESULTS = ["acquired", "partially_acquired", "not_acquired"] as const;

async function handle(formData: FormData, work: () => Promise<string>): Promise<ActionState> {
  try {
    const message = await work();
    refresh();
    return { status: "success", message };
  } catch (error) {
    if (error instanceof PedagogyError || error instanceof UploadError) return errorState(formData, error.message);
    throw error;
  }
}

export async function needsAnalysisAction(_state: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireRole(["admin"]);
  const enrollmentId = text(formData, "enrollmentId");
  if (!enrollmentId) return errorState(formData, "Inscription introuvable.");
  return handle(formData, async () => {
    await recordNeedsAnalysis(
      enrollmentId,
      { note: text(formData, "needsAnalysisNote"), file: readUpload(formData.get("needsAnalysisFile")) },
      actor.id,
    );
    return "Analyse du besoin enregistrée.";
  });
}

export async function positioningFileAction(_state: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireRole(["admin"]);
  const enrollmentId = text(formData, "enrollmentId");
  const file = readUpload(formData.get("positioningFile"));
  if (!enrollmentId) return errorState(formData, "Inscription introuvable.");
  if (!file) return errorState(formData, "Choisissez le fichier du test.", { positioningFile: "Fichier obligatoire." });
  return handle(formData, async () => {
    await recordPositioningFile(enrollmentId, file, actor.id);
    return "Test de positionnement enregistré.";
  });
}

export async function learningAssessmentAction(_state: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireRole(["admin"]);
  const enrollmentId = text(formData, "enrollmentId");
  const result = z.enum(LEARNING_RESULTS).safeParse(text(formData, "learningResult"));
  if (!enrollmentId) return errorState(formData, "Inscription introuvable.");
  if (!result.success) return errorState(formData, "Choisissez un résultat.", { learningResult: "Résultat obligatoire." });
  return handle(formData, async () => {
    await recordLearningAssessment(
      enrollmentId,
      {
        result: result.data,
        comment: text(formData, "learningComment"),
        file: readUpload(formData.get("learningFile")),
      },
      { userId: actor.id, label: displayName(actor) },
    );
    return "Évaluation des acquis enregistrée.";
  });
}

/** Reveals the adaptation need of an enrollment (D8): the read is logged. */
export async function revealAdaptationNeed(enrollmentId: string): Promise<string | null> {
  const actor = await requireRole(["admin"]);
  return readAdaptationNeed(z.uuid().parse(enrollmentId), actor.id);
}

export async function adaptationNeedAction(_state: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireRole(["admin"]);
  const enrollmentId = text(formData, "enrollmentId");
  if (!enrollmentId) return errorState(formData, "Inscription introuvable.");
  return handle(formData, async () => {
    await saveAdaptationNeed(enrollmentId, text(formData, "adaptationNeed"), actor.id);
    return "Besoin d'aménagement enregistré.";
  });
}
