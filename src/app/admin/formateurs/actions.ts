"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { audit, diff } from "@/server/audit";
import { requireRole } from "@/server/auth/guards";
import { checkbox, errorState, text, zodFieldErrors, type ActionState } from "@/server/forms";
import { syncTrainerRole } from "@/server/services/trainer-role";
import { readUpload, storeUpload, UploadError } from "@/server/storage";

const trainerSchema = z
  .object({
    type: z.enum(["internal", "external"], { error: "Type obligatoire." }),
    userId: z.uuid().nullable(),
    firstName: z.string({ error: "Prénom obligatoire." }).min(1, "Prénom obligatoire."),
    lastName: z.string({ error: "Nom obligatoire." }).min(1, "Nom obligatoire."),
    email: z.email("Adresse email invalide."),
    phone: z.string().nullable(),
    company: z.string().nullable(),
    specialties: z.array(z.string()),
    active: z.boolean(),
  })
  .refine((data) => data.type === "external" || data.userId, {
    path: ["userId"],
    message: "Sélectionnez le compte Google du formateur interne.",
  });

function parseTrainer(formData: FormData) {
  const specialties = (text(formData, "specialties") ?? "")
    .split(/[,;\n]/)
    .map((value) => value.trim())
    .filter(Boolean);
  const type = text(formData, "type");
  return trainerSchema.safeParse({
    type: type ?? undefined,
    userId: type === "internal" ? text(formData, "userId") : null,
    firstName: text(formData, "firstName"),
    lastName: text(formData, "lastName"),
    email: text(formData, "email")?.toLowerCase(),
    phone: text(formData, "phone"),
    company: text(formData, "company"),
    specialties: [...new Set(specialties)],
    active: checkbox(formData, "active"),
  });
}

async function userAlreadyLinked(userId: string | null, exceptTrainerId?: string): Promise<boolean> {
  if (!userId) return false;
  const existing = await db.trainer.findUnique({ where: { userId } });
  return Boolean(existing && existing.id !== exceptTrainerId);
}

async function uploadCv(formData: FormData): Promise<string | undefined> {
  const file = readUpload(formData.get("cv"));
  return file ? storeUpload(file, "cv", "document") : undefined;
}

export async function createTrainer(_state: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireRole(["admin"]);
  const parsed = parseTrainer(formData);
  if (!parsed.success)
    return errorState(formData, "Certains champs sont invalides.", zodFieldErrors(parsed.error.issues));
  if (await userAlreadyLinked(parsed.data.userId)) {
    return errorState(formData, "Ce compte est déjà lié à une autre fiche formateur.", { userId: "Déjà lié." });
  }

  let cvPath: string | undefined;
  try {
    cvPath = await uploadCv(formData);
  } catch (error) {
    if (error instanceof UploadError) return errorState(formData, error.message, { cv: error.message });
    throw error;
  }

  const trainer = await db.trainer.create({ data: { ...parsed.data, cvPath } });
  await audit(db, { userId: actor.id, action: "create", entity: "trainer", entityId: trainer.id, after: trainer });
  await syncTrainerRole(trainer.userId, actor.id);
  redirect(`/admin/formateurs/${trainer.id}?cree=1`);
}

export async function updateTrainer(_state: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireRole(["admin"]);
  const id = text(formData, "id");
  const existing = id ? await db.trainer.findUnique({ where: { id } }) : null;
  if (!existing) return errorState(formData, "Formateur introuvable.");

  const parsed = parseTrainer(formData);
  if (!parsed.success)
    return errorState(formData, "Certains champs sont invalides.", zodFieldErrors(parsed.error.issues));
  if (await userAlreadyLinked(parsed.data.userId, existing.id)) {
    return errorState(formData, "Ce compte est déjà lié à une autre fiche formateur.", { userId: "Déjà lié." });
  }

  let cvPath: string | undefined;
  try {
    cvPath = await uploadCv(formData);
  } catch (error) {
    if (error instanceof UploadError) return errorState(formData, error.message, { cv: error.message });
    throw error;
  }

  const update = { ...parsed.data, ...(cvPath ? { cvPath } : {}) };
  await db.trainer.update({ where: { id: existing.id }, data: update });
  const changes = diff(existing, update);
  if (changes)
    await audit(db, { userId: actor.id, action: "update", entity: "trainer", entityId: existing.id, ...changes });

  // Both the previous and the new linked accounts may need a role change.
  await syncTrainerRole(existing.userId, actor.id);
  if (parsed.data.userId !== existing.userId) await syncTrainerRole(parsed.data.userId, actor.id);

  refresh();
  return { status: "success", message: "Fiche formateur enregistrée." };
}
