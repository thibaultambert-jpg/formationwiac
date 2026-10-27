"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { audit, diff } from "@/server/audit";
import { requireRole } from "@/server/auth/guards";
import { isValidSiret, normalizeSiret } from "@/server/domain/siret";
import { errorState, text, zodFieldErrors, type ActionState } from "@/server/forms";
import { readUpload, storeUpload, UploadError } from "@/server/storage";

const schema = z.object({
  name: z.string({ error: "Le nom est obligatoire." }).min(1, "Le nom est obligatoire."),
  addressLine: z.string().nullable(),
  postalCode: z.string().nullable(),
  city: z.string().nullable(),
  siret: z
    .string()
    .nullable()
    .refine((value) => !value || isValidSiret(value), "SIRET invalide (14 chiffres)."),
  activityDeclarationNumber: z.string().nullable(),
  managerName: z.string().nullable(),
  managerTitle: z.string().nullable(),
  contactEmail: z.email("Adresse email invalide.").nullable(),
  vatExemptionMention: z.string().nullable(),
});

export async function saveOrganization(_state: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireRole(["admin"]);

  const parsed = schema.safeParse({
    name: text(formData, "name"),
    addressLine: text(formData, "addressLine"),
    postalCode: text(formData, "postalCode"),
    city: text(formData, "city"),
    siret: text(formData, "siret"),
    activityDeclarationNumber: text(formData, "activityDeclarationNumber"),
    managerName: text(formData, "managerName"),
    managerTitle: text(formData, "managerTitle"),
    contactEmail: text(formData, "contactEmail"),
    vatExemptionMention: text(formData, "vatExemptionMention"),
  });
  if (!parsed.success)
    return errorState(formData, "Certains champs sont invalides.", zodFieldErrors(parsed.error.issues));

  const data = { ...parsed.data, siret: parsed.data.siret ? normalizeSiret(parsed.data.siret) : null };
  const files: { logoPath?: string; managerSignaturePath?: string } = {};
  try {
    const logo = readUpload(formData.get("logo"));
    if (logo) files.logoPath = await storeUpload(logo, "organisme", "image");
    const signature = readUpload(formData.get("managerSignature"));
    if (signature) files.managerSignaturePath = await storeUpload(signature, "organisme", "image");
  } catch (error) {
    if (error instanceof UploadError) return errorState(formData, error.message);
    throw error;
  }

  const existing = await db.organizationSettings.findUnique({ where: { id: 1 } });
  const saved = await db.organizationSettings.upsert({
    where: { id: 1 },
    update: { ...data, ...files },
    create: { id: 1, ...data, ...files },
  });
  const changes = existing ? diff(existing, { ...data, ...files }) : { before: null, after: saved };
  if (changes) await audit(db, { userId: user.id, action: "update", entity: "settings", entityId: "1", ...changes });

  refresh();
  return { status: "success", message: "Les coordonnées de l'organisme ont été enregistrées." };
}
