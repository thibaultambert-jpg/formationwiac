"use server";

import { refresh } from "next/cache";
import { parisDateTimeToUtc } from "@/lib/dates";
import { requireRole } from "@/server/auth/guards";
import { scheduleEnrollmentNotices } from "@/server/email/notifications";
import { errorState, text, type ActionState } from "@/server/forms";
import {
  cancelConvention,
  ConventionError,
  createConvention,
  recordSignedConvention,
  refreshConvention,
  sendConvention,
} from "@/server/services/conventions";
import { readUpload, UploadError } from "@/server/storage";

async function run(formData: FormData, work: () => Promise<string>): Promise<ActionState> {
  try {
    const message = await work();
    refresh();
    return { status: "success", message };
  } catch (error) {
    if (error instanceof ConventionError || error instanceof UploadError) return errorState(formData, error.message);
    throw error;
  }
}

export async function createConventionAction(_state: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireRole(["admin"]);
  const sessionId = text(formData, "sessionId");
  const companyId = text(formData, "companyId");
  if (!sessionId || !companyId) return errorState(formData, "Entreprise introuvable.");
  return run(formData, async () => {
    const convention = await createConvention(
      { sessionId, companyId, financialTerms: text(formData, "financialTerms") },
      actor.id,
    );
    return `Convention ${convention.reference} générée.`;
  });
}

export async function refreshConventionAction(_state: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireRole(["admin"]);
  const conventionId = text(formData, "conventionId");
  if (!conventionId) return errorState(formData, "Convention introuvable.");
  return run(formData, async () => {
    await refreshConvention(conventionId, text(formData, "financialTerms"), actor.id);
    return "Convention mise à jour et régénérée.";
  });
}

export async function sendConventionAction(_state: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireRole(["admin"]);
  const conventionId = text(formData, "conventionId");
  if (!conventionId) return errorState(formData, "Convention introuvable.");
  return run(formData, async () => {
    await sendConvention(conventionId, actor.id);
    return "Convention envoyée à l'entreprise.";
  });
}

export async function recordSignedConventionAction(_state: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireRole(["admin"]);
  const conventionId = text(formData, "conventionId");
  const file = readUpload(formData.get("signedFile"));
  const date = text(formData, "signedAt");
  const signedAt = date ? parisDateTimeToUtc(date, "12:00") : null;
  if (!conventionId) return errorState(formData, "Convention introuvable.");
  if (!file) return errorState(formData, "Joignez la convention signée (PDF).", { signedFile: "Obligatoire." });
  if (!signedAt) return errorState(formData, "Indiquez la date de signature.", { signedAt: "Date invalide." });
  if (signedAt.getTime() > Date.now() + 24 * 3_600_000)
    return errorState(formData, "La date de signature ne peut pas être dans le futur.", { signedAt: "Date future." });
  return run(formData, async () => {
    const confirmed = await recordSignedConvention(conventionId, { file, signedAt }, actor.id);
    scheduleEnrollmentNotices(confirmed.map((enrollmentId) => ({ enrollmentId, notice: "confirmation" as const })));
    return confirmed.length > 0
      ? `Convention signée enregistrée : ${confirmed.length} inscription(s) confirmée(s).`
      : "Convention signée enregistrée.";
  });
}

export async function cancelConventionAction(_state: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireRole(["admin"]);
  const conventionId = text(formData, "conventionId");
  if (!conventionId) return errorState(formData, "Convention introuvable.");
  return run(formData, async () => {
    await cancelConvention(conventionId, actor.id);
    return "Convention annulée : les inscriptions concernées attendent une nouvelle convention.";
  });
}
