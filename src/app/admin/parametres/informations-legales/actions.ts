"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { parisDateTimeToUtc } from "@/lib/dates";
import { audit, diff } from "@/server/audit";
import { requireRole } from "@/server/auth/guards";
import { legalNoticeText, privacyNoticeText, privacyPolicyText } from "@/server/domain/legal";
import { errorState, text, zodFieldErrors, type ActionState } from "@/server/forms";
import { addRegulationVersion, legalOrganization } from "@/server/services/legal";
import { currentRetentionPolicy } from "@/server/services/privacy";
import { readUpload, UploadError } from "@/server/storage";

const schema = z.object({
  dpoContact: z.string().nullable(),
  disabilityReferentName: z.string().nullable(),
  disabilityReferentEmail: z.email("Adresse email invalide.").nullable(),
  disabilityReferentPhone: z.string().nullable(),
  pedagogicalContact: z.string().nullable(),
  administrativeContact: z.string().nullable(),
  privacyNotice: z.string().nullable(),
  privacyPolicy: z.string().nullable(),
  legalNotice: z.string().nullable(),
});

/** A text identical to the model is stored empty, so that the model keeps following the settings. */
function unlessModel(value: string | null, model: string): string | null {
  return value && value.replace(/\r\n/g, "\n").trim() !== model.trim() ? value.replace(/\r\n/g, "\n").trim() : null;
}

export async function saveLegalInformation(_state: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireRole(["admin"]);
  const parsed = schema.safeParse(
    Object.fromEntries(Object.keys(schema.shape).map((key) => [key, text(formData, key)])),
  );
  if (!parsed.success)
    return errorState(formData, "Certains champs sont invalides.", zodFieldErrors(parsed.error.issues));

  const existing = await db.organizationSettings.findUnique({ where: { id: 1 } });
  // Models are computed without the custom texts, with the contacts being saved.
  const base = {
    ...(await legalOrganization()),
    ...parsed.data,
    privacyNotice: null,
    privacyPolicy: null,
    legalNotice: null,
  };
  const data = {
    ...parsed.data,
    privacyNotice: unlessModel(parsed.data.privacyNotice, privacyNoticeText(base)),
    privacyPolicy: unlessModel(parsed.data.privacyPolicy, privacyPolicyText(base, await currentRetentionPolicy())),
    legalNotice: unlessModel(parsed.data.legalNotice, legalNoticeText(base)),
  };
  await db.organizationSettings.upsert({
    where: { id: 1 },
    update: data,
    create: { id: 1, name: "Organisme de formation", ...data },
  });
  const changes = existing ? diff(existing, data) : { before: null, after: data };
  if (changes) await audit(db, { userId: user.id, action: "update", entity: "settings", entityId: "1", ...changes });
  refresh();
  return { status: "success", message: "Informations légales enregistrées." };
}

export async function uploadRegulation(_state: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireRole(["admin"]);
  const dateInput = text(formData, "effectiveFrom");
  const effectiveFrom = dateInput ? parisDateTimeToUtc(dateInput, "00:00") : null;
  if (!effectiveFrom)
    return errorState(formData, "Date invalide.", { effectiveFrom: "La date d'entrée en vigueur est obligatoire." });
  try {
    const file = readUpload(formData.get("file"));
    if (!file) return errorState(formData, "Choisissez le PDF du règlement.", { file: "Fichier obligatoire." });
    const created = await addRegulationVersion(file, effectiveFrom, user.id);
    refresh();
    return { status: "success", message: `Version ${created.version} du règlement intérieur enregistrée.` };
  } catch (error) {
    if (error instanceof UploadError) return errorState(formData, error.message);
    throw error;
  }
}
