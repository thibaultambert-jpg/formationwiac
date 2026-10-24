"use server";

import { refresh } from "next/cache";
import { db } from "@/lib/db";
import { audit, diff } from "@/server/audit";
import { requireRole } from "@/server/auth/guards";
import { validRetentionPolicy, type RetentionPolicy } from "@/server/domain/privacy";
import { errorState, text, type ActionState } from "@/server/forms";
import {
  anonymizeParticipant,
  currentRetentionPolicy,
  LegalHoldError,
  participantsPastRetention,
  PrivacyError,
  purgeProofFiles,
  purgeTechnicalData,
  setLegalHold,
} from "@/server/services/privacy";

export async function saveRetention(_state: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireRole(["admin"]);
  const policy: RetentionPolicy = {
    externalYears: Number(text(formData, "externalYears")),
    internalYears: Number(text(formData, "internalYears")),
    technicalMonths: Number(text(formData, "technicalMonths")),
    tokenDays: Number(text(formData, "tokenDays")),
  };
  const errors = validRetentionPolicy(policy);
  if (Object.keys(errors).length > 0) return errorState(formData, "Durées invalides.", errors);
  const data = {
    dataRetentionYears: policy.externalYears,
    internalRetentionYears: policy.internalYears,
    technicalRetentionMonths: policy.technicalMonths,
    tokenRetentionDays: policy.tokenDays,
  };
  const existing = await db.organizationSettings.findUnique({ where: { id: 1 } });
  await db.organizationSettings.upsert({
    where: { id: 1 },
    update: data,
    create: { id: 1, name: "Organisme de formation", ...data },
  });
  const changes = existing ? diff(existing, data) : { before: null, after: data };
  if (changes) await audit(db, { userId: actor.id, action: "update", entity: "settings", entityId: "1", ...changes });
  refresh();
  return { status: "success", message: "Durées de conservation enregistrées." };
}

export async function anonymizeExpired(_state: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireRole(["admin"]);
  const participants = await participantsPastRetention(new Date(), await currentRetentionPolicy());
  let done = 0;
  const skipped: string[] = [];
  for (const participant of participants) {
    try {
      await anonymizeParticipant(participant.id, actor.id, "Fin de la durée de conservation");
      done++;
    } catch (error) {
      if (!(error instanceof PrivacyError)) throw error;
      skipped.push(`${participant.firstName} ${participant.lastName} (${error.message})`);
    }
  }
  refresh();
  if (done === 0 && skipped.length > 0)
    return errorState(formData, `Aucun participant anonymisé : ${skipped.join(" ; ")}`);
  return {
    status: "success",
    message: `${done} participant(s) anonymisé(s).${skipped.length ? ` Ignorés : ${skipped.join(" ; ")}.` : ""}`,
  };
}

export async function purgeExpiredProofs(): Promise<ActionState> {
  const actor = await requireRole(["admin"]);
  const count = await purgeProofFiles(new Date(), await currentRetentionPolicy(), actor.id);
  refresh();
  return { status: "success", message: `${count} fichier(s) de preuve supprimé(s).` };
}

export async function purgeTechnicalNow(): Promise<ActionState> {
  const actor = await requireRole(["admin"]);
  const counts = await purgeTechnicalData(new Date(), await currentRetentionPolicy(), actor.id);
  refresh();
  return {
    status: "success",
    message: `${counts.technical} trace(s) technique(s) effacée(s), ${counts.tokens} lien(s) expiré(s) supprimé(s).`,
  };
}

export async function legalHoldAction(_state: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireRole(["admin"]);
  const kind = text(formData, "kind");
  const id = text(formData, "id");
  if ((kind !== "session" && kind !== "participant") || !id) return errorState(formData, "Requête invalide.");
  const release = text(formData, "release") === "1";
  const reason = text(formData, "reason");
  if (!release && !reason) return errorState(formData, "Indiquez le motif.", { reason: "Le motif est obligatoire." });
  try {
    await setLegalHold({ kind, id }, release ? null : reason, actor.id);
  } catch (error) {
    if (error instanceof LegalHoldError) return errorState(formData, error.message);
    throw error;
  }
  refresh();
  return {
    status: "success",
    message: release ? "Conservation légale levée." : "Conservation légale placée : aucune purge ne s'applique.",
  };
}
