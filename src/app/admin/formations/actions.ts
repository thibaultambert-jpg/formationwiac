"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { audit, diff } from "@/server/audit";
import { requireRole } from "@/server/auth/guards";
import { parseFrenchDecimal } from "@/server/domain/numbers";
import { slugify, uniqueSlug } from "@/server/domain/slug";
import { checkbox, errorState, text, zodFieldErrors, type ActionState } from "@/server/forms";
import { readUpload, storeUpload, UploadError } from "@/server/storage";

const trainingSchema = z.object({
  title: z.string({ error: "Le titre est obligatoire." }).min(1, "Le titre est obligatoire."),
  slug: z
    .string()
    .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "Lettres minuscules, chiffres et tirets uniquement.")
    .nullable(),
  themeId: z.uuid().nullable(),
  objectives: z.string({ error: "Les objectifs sont obligatoires." }).min(1, "Les objectifs sont obligatoires."),
  prerequisites: z.string().nullable(),
  targetAudience: z.string().nullable(),
  programText: z.string().nullable(),
  durationHours: z
    .number({ error: (issue) => (issue.input === undefined ? "Durée obligatoire." : "Nombre invalide.") })
    .refine((value) => value > 0 && value <= 9999, "Durée invalide."),
  modality: z.enum(["in_person", "remote", "blended"], { error: "Modalité obligatoire." }),
  priceExclTax: z.number({ error: "Prix invalide." }).min(0, "Prix invalide.").nullable(),
  active: z.boolean(),
});

function parseTraining(formData: FormData) {
  return trainingSchema.safeParse({
    title: text(formData, "title"),
    slug: text(formData, "slug"),
    themeId: text(formData, "themeId"),
    objectives: text(formData, "objectives"),
    prerequisites: text(formData, "prerequisites"),
    targetAudience: text(formData, "targetAudience"),
    programText: text(formData, "programText"),
    durationHours: parseFrenchDecimal(text(formData, "durationHours")) ?? undefined,
    modality: text(formData, "modality") ?? undefined,
    priceExclTax: parseFrenchDecimal(text(formData, "priceExclTax")),
    active: checkbox(formData, "active"),
  });
}

async function takenSlugs(base: string, exceptId?: string): Promise<Set<string>> {
  const rows = await db.training.findMany({
    where: { slug: { startsWith: base }, ...(exceptId ? { NOT: { id: exceptId } } : {}) },
    select: { slug: true },
  });
  return new Set(rows.map((row) => row.slug));
}

async function uploadProgram(formData: FormData): Promise<string | undefined> {
  const file = readUpload(formData.get("programPdf"));
  return file ? storeUpload(file, "programmes", "pdf") : undefined;
}

export async function createTraining(_state: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireRole(["admin"]);
  const parsed = parseTraining(formData);
  if (!parsed.success)
    return errorState(formData, "Certains champs sont invalides.", zodFieldErrors(parsed.error.issues));

  const { slug: requestedSlug, ...data } = parsed.data;
  const base = requestedSlug ?? slugify(data.title);
  const slug = uniqueSlug(base, await takenSlugs(base));

  let programPdfPath: string | undefined;
  try {
    programPdfPath = await uploadProgram(formData);
  } catch (error) {
    if (error instanceof UploadError) return errorState(formData, error.message, { programPdf: error.message });
    throw error;
  }

  const training = await db.training.create({ data: { ...data, slug, programPdfPath } });
  await audit(db, { userId: user.id, action: "create", entity: "training", entityId: training.id, after: training });
  redirect(`/admin/formations/${training.id}?cree=1`);
}

export async function updateTraining(_state: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireRole(["admin"]);
  const id = text(formData, "id");
  const existing = id ? await db.training.findUnique({ where: { id } }) : null;
  if (!existing) return errorState(formData, "Formation introuvable.");

  const parsed = parseTraining(formData);
  if (!parsed.success)
    return errorState(formData, "Certains champs sont invalides.", zodFieldErrors(parsed.error.issues));

  const { slug: requestedSlug, ...data } = parsed.data;
  let slug = existing.slug;
  if (requestedSlug && requestedSlug !== existing.slug) {
    if ((await takenSlugs(requestedSlug, existing.id)).has(requestedSlug)) {
      return errorState(formData, "Cet identifiant d'URL est déjà utilisé.", { slug: "Déjà utilisé." });
    }
    slug = requestedSlug;
  }

  let newProgramPath: string | undefined;
  try {
    newProgramPath = await uploadProgram(formData);
  } catch (error) {
    if (error instanceof UploadError) return errorState(formData, error.message, { programPdf: error.message });
    throw error;
  }
  const programUpdate = newProgramPath
    ? { programPdfPath: newProgramPath }
    : checkbox(formData, "removeProgramPdf")
      ? { programPdfPath: null }
      : {};

  const update = { ...data, slug, ...programUpdate };
  await db.training.update({ where: { id: existing.id }, data: update });
  const changes = diff(existing, update);
  if (changes)
    await audit(db, { userId: user.id, action: "update", entity: "training", entityId: existing.id, ...changes });

  refresh();
  return { status: "success", message: "Formation enregistrée." };
}

/** Archive or restore. Archived trainings stay attached to their sessions. */
export async function toggleTrainingActive(formData: FormData): Promise<void> {
  const user = await requireRole(["admin"]);
  const id = text(formData, "id");
  const training = id ? await db.training.findUnique({ where: { id } }) : null;
  if (!training) return;

  await db.training.update({ where: { id: training.id }, data: { active: !training.active } });
  await audit(db, {
    userId: user.id,
    action: training.active ? "archive" : "restore",
    entity: "training",
    entityId: training.id,
    before: { active: training.active },
    after: { active: !training.active },
  });
  refresh();
}

/** Physical deletion is only allowed when no session exists (otherwise archive). */
export async function deleteTraining(formData: FormData): Promise<void> {
  const user = await requireRole(["admin"]);
  const id = text(formData, "id");
  const training = id
    ? await db.training.findUnique({ where: { id }, include: { _count: { select: { sessions: true } } } })
    : null;
  if (!training || training._count.sessions > 0) return;

  await db.training.delete({ where: { id: training.id } });
  await audit(db, {
    userId: user.id,
    action: "delete",
    entity: "training",
    entityId: training.id,
    before: { title: training.title, slug: training.slug },
  });
  redirect("/admin/formations");
}
