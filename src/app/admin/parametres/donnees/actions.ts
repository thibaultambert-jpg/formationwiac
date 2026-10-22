"use server";

import { refresh } from "next/cache";
import { db } from "@/lib/db";
import { audit } from "@/server/audit";
import { requireRole } from "@/server/auth/guards";
import { errorState, text, type ActionState } from "@/server/forms";
import {
  anonymizeParticipant,
  participantsPastRetention,
  PrivacyError,
  purgeProofFiles,
} from "@/server/services/privacy";

export async function saveRetention(_state: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireRole(["admin"]);
  const years = Number(text(formData, "dataRetentionYears"));
  if (!Number.isInteger(years) || years < 1 || years > 30) {
    return errorState(formData, "Durée invalide.", { dataRetentionYears: "Entre 1 et 30 ans." });
  }
  const existing = await db.organizationSettings.findUnique({ where: { id: 1 } });
  await db.organizationSettings.upsert({
    where: { id: 1 },
    update: { dataRetentionYears: years },
    create: { id: 1, name: "Organisme de formation", dataRetentionYears: years },
  });
  await audit(db, {
    userId: actor.id,
    action: "update",
    entity: "settings",
    entityId: "1",
    before: { dataRetentionYears: existing?.dataRetentionYears ?? null },
    after: { dataRetentionYears: years },
  });
  refresh();
  return { status: "success", message: "Durée de conservation enregistrée." };
}

async function retentionYears(): Promise<number> {
  const settings = await db.organizationSettings.findUnique({ where: { id: 1 }, select: { dataRetentionYears: true } });
  return settings?.dataRetentionYears ?? 5;
}

export async function anonymizeExpired(_state: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireRole(["admin"]);
  const participants = await participantsPastRetention(new Date(), await retentionYears());
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
  const count = await purgeProofFiles(new Date(), await retentionYears(), actor.id);
  refresh();
  return { status: "success", message: `${count} fichier(s) de preuve supprimé(s).` };
}
