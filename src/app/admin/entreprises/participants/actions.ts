"use server";

import { refresh } from "next/cache";
import { requireRole } from "@/server/auth/guards";
import { errorState, text, type ActionState } from "@/server/forms";
import { anonymizeParticipant, PrivacyError } from "@/server/services/privacy";

export async function anonymizeParticipantAction(_state: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireRole(["admin"]);
  const participantId = text(formData, "participantId");
  const reason = text(formData, "reason");
  if (!participantId) return errorState(formData, "Participant introuvable.");
  if (!reason) return errorState(formData, "Indiquez l'origine de la demande.", { reason: "Obligatoire." });
  if (text(formData, "confirmation")?.toUpperCase() !== "ANONYMISER") {
    return errorState(formData, "Saisissez ANONYMISER pour confirmer.", { confirmation: "Confirmation requise." });
  }
  try {
    await anonymizeParticipant(participantId, actor.id, reason);
  } catch (error) {
    if (error instanceof PrivacyError) return errorState(formData, error.message);
    throw error;
  }
  refresh();
  return { status: "success", message: "Le participant a été anonymisé." };
}
