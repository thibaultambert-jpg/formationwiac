"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { parisDateTimeToUtc } from "@/lib/dates";
import { audit } from "@/server/audit";
import { requireRole } from "@/server/auth/guards";
import { errorState, text, type ActionState } from "@/server/forms";
import { readUpload, storeUpload, UploadError } from "@/server/storage";

const TYPES = ["diploma", "certification", "cv", "subcontracting_contract", "insurance", "other"] as const;

function dateOrNull(value: string | null): Date | null | undefined {
  if (!value) return null;
  return parisDateTimeToUtc(value, "00:00") ?? undefined;
}

/** Adds a supporting document to a trainer (D7, D12). */
export async function addTrainerDocument(_state: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireRole(["admin"]);
  const trainerId = text(formData, "trainerId");
  const type = z.enum(TYPES).safeParse(text(formData, "type"));
  const label = text(formData, "label");
  const issuedAt = dateOrNull(text(formData, "issuedAt"));
  const expiresAt = dateOrNull(text(formData, "expiresAt"));
  if (!trainerId || !(await db.trainer.findUnique({ where: { id: trainerId }, select: { id: true } })))
    return errorState(formData, "Formateur introuvable.");
  if (!type.success) return errorState(formData, "Type invalide.", { type: "Choisissez un type." });
  if (!label) return errorState(formData, "Indiquez un intitulé.", { label: "L'intitulé est obligatoire." });
  if (issuedAt === undefined || expiresAt === undefined)
    return errorState(
      formData,
      "Date invalide.",
      issuedAt === undefined ? { issuedAt: "Date invalide." } : { expiresAt: "Date invalide." },
    );
  const file = readUpload(formData.get("file"));
  if (!file) return errorState(formData, "Choisissez le fichier.", { file: "Fichier obligatoire." });
  try {
    const filePath = await storeUpload(file, `formateurs/${trainerId}`, "document");
    const document = await db.trainerDocument.create({
      data: { trainerId, type: type.data, label, filePath, issuedAt, expiresAt, createdById: actor.id },
    });
    await audit(db, {
      userId: actor.id,
      action: "upload",
      entity: "trainer",
      entityId: trainerId,
      after: { document: document.id, type: type.data, label, expiresAt },
    });
  } catch (error) {
    if (error instanceof UploadError) return errorState(formData, error.message);
    throw error;
  }
  refresh();
  return { status: "success", message: "Justificatif ajouté." };
}

/** Archives a supporting document (kept for the history, D7). */
export async function archiveTrainerDocument(_state: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireRole(["admin"]);
  const id = text(formData, "documentId");
  const document = id ? await db.trainerDocument.findUnique({ where: { id } }) : null;
  if (!document) return errorState(formData, "Justificatif introuvable.");
  await db.trainerDocument.update({ where: { id: document.id }, data: { archivedAt: new Date() } });
  await audit(db, {
    userId: actor.id,
    action: "archive",
    entity: "trainer",
    entityId: document.trainerId,
    after: { document: document.id, label: document.label },
  });
  refresh();
  return { status: "success", message: "Justificatif archivé." };
}
