"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { audit, diff } from "@/server/audit";
import { requireRole } from "@/server/auth/guards";
import { importReport, nothingToImport, readCsvUpload } from "@/server/csv-upload";
import { parseTrainerImport } from "@/server/domain/csv-import";
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

/**
 * CSV import of trainers: a trainer with the same email is left as it is; an
 * internal trainer is linked to the Google account of the same email.
 */
export async function importTrainersCsv(_state: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireRole(["admin"]);
  const upload = await readCsvUpload(formData);
  if (!upload.ok) return upload.state;
  const { rows, errors } = parseTrainerImport(upload.rows);
  if (rows.length === 0) return nothingToImport(formData, errors);

  const report = { created: 0, existing: 0, errors: [...errors] };
  const linkedUserIds: string[] = [];
  await db.$transaction(
    async (tx) => {
      for (const row of rows) {
        if (await tx.trainer.findFirst({ where: { email: { equals: row.email, mode: "insensitive" } } })) {
          report.existing++;
          continue;
        }
        let userId: string | null = null;
        if (row.type === "internal") {
          const user = await tx.user.findUnique({ where: { email: row.email }, include: { trainer: true } });
          if (!user || !user.active) {
            report.errors.push({
              line: row.line,
              message: `aucun compte collaborateur actif pour ${row.email} (il doit s'être connecté une fois)`,
            });
            continue;
          }
          if (user.trainer) {
            report.errors.push({ line: row.line, message: "ce compte est déjà lié à une autre fiche formateur" });
            continue;
          }
          userId = user.id;
        }
        const trainer = await tx.trainer.create({
          data: {
            type: row.type,
            userId,
            firstName: row.firstName,
            lastName: row.lastName,
            email: row.email,
            phone: row.phone,
            company: row.company,
            specialties: row.specialties,
            active: row.active,
          },
        });
        await audit(tx, {
          userId: actor.id,
          action: "create",
          entity: "trainer",
          entityId: trainer.id,
          after: trainer,
        });
        if (userId) linkedUserIds.push(userId);
        report.created++;
      }
      await audit(tx, {
        userId: actor.id,
        action: "import",
        entity: "trainer",
        entityId: "list",
        after: { file: upload.name, created: report.created, existing: report.existing, errors: report.errors.length },
      });
    },
    { timeout: 60_000 },
  );
  for (const userId of linkedUserIds) await syncTrainerRole(userId, actor.id);

  refresh();
  const message = importReport(
    [
      `${report.created} formateur(s) créé(s)`,
      report.existing > 0 && `${report.existing} déjà existant(s), non modifié(s)`,
    ],
    report.errors,
  );
  return { status: "success", message };
}
