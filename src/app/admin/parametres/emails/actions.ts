"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { audit, diff } from "@/server/audit";
import { requireRole } from "@/server/auth/guards";
import { DEFAULT_EMAIL_TEMPLATES } from "@/server/email/default-templates";
import { unknownPlaceholders } from "@/server/email/template";
import { errorState, formValues, isConfirmed, text, type ActionState } from "@/server/forms";

const keySchema = z.enum(DEFAULT_EMAIL_TEMPLATES.map((template) => template.key) as [string, ...string[]]);

export async function saveEmailTemplate(_state: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireRole(["admin"]);
  const key = keySchema.safeParse(text(formData, "key"));
  const subject = text(formData, "subject");
  const body = text(formData, "body");
  if (!key.success) return errorState(formData, "Modèle inconnu.");
  if (!subject || !body) {
    return errorState(formData, "L'objet et le contenu sont obligatoires.", {
      ...(subject ? {} : { subject: "Obligatoire." }),
      ...(body ? {} : { body: "Obligatoire." }),
    });
  }

  if (!isConfirmed(formData)) {
    const unknown = unknownPlaceholders(`${subject}\n${body}`, [
      "prenom",
      "nom",
      "formation",
      "reference",
      "dates",
      "lieu",
      "lien_visio",
      "motif",
      "lien_espace",
      "organisme",
      "lien_emargement",
      "lien_evaluation",
    ]);
    if (unknown.length > 0) {
      return {
        status: "warning",
        warnings: [
          `Variables inconnues, laissées telles quelles dans l'email : ${unknown.map((name) => `{{${name}}}`).join(", ")}.`,
        ],
        values: formValues(formData),
      };
    }
  }

  const keyValue = key.data as (typeof DEFAULT_EMAIL_TEMPLATES)[number]["key"];
  const existing = await db.emailTemplate.findUnique({ where: { key: keyValue } });
  await db.emailTemplate.upsert({
    where: { key: keyValue },
    update: { subject, body },
    create: { key: keyValue, subject, body },
  });
  const changes = existing ? diff(existing, { subject, body }) : { before: null, after: { subject, body } };
  if (changes) {
    await audit(db, {
      userId: actor.id,
      action: "update",
      entity: "settings",
      entityId: `email:${keyValue}`,
      before: changes.before,
      after: changes.after,
    });
  }
  refresh();
  return { status: "success", message: "Modèle enregistré." };
}

export async function resetEmailTemplate(formData: FormData): Promise<void> {
  const actor = await requireRole(["admin"]);
  const key = keySchema.safeParse(text(formData, "key"));
  if (!key.success) return;
  const fallback = DEFAULT_EMAIL_TEMPLATES.find((template) => template.key === key.data)!;
  await db.emailTemplate.upsert({
    where: { key: fallback.key },
    update: { subject: fallback.subject, body: fallback.body },
    create: fallback,
  });
  await audit(db, {
    userId: actor.id,
    action: "update",
    entity: "settings",
    entityId: `email:${fallback.key}`,
    after: { reset: true },
  });
  refresh();
}
