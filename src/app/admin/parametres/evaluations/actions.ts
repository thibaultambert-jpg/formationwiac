"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { audit } from "@/server/audit";
import { requireRole } from "@/server/auth/guards";
import { checkbox, errorState, text, zodFieldErrors, type ActionState } from "@/server/forms";
import { runScheduledTasks } from "@/server/services/automation";

const delaysSchema = z.object({
  reminderDaysBefore: z.number({ error: "Nombre entier attendu." }).int("Nombre entier attendu.").min(0).max(60),
  coldEvaluationDays: z.number({ error: "Nombre entier attendu." }).int("Nombre entier attendu.").min(7).max(365),
  evaluationReminderDays: z.number({ error: "Nombre entier attendu." }).int("Nombre entier attendu.").min(1).max(60),
  attendanceMarginBefore: z.number({ error: "Nombre entier attendu." }).int("Nombre entier attendu.").min(0).max(240),
  attendanceMarginAfter: z.number({ error: "Nombre entier attendu." }).int("Nombre entier attendu.").min(0).max(480),
});

export async function saveDelays(_state: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireRole(["admin"]);
  const parsed = delaysSchema.safeParse({
    reminderDaysBefore: Number(text(formData, "reminderDaysBefore")),
    coldEvaluationDays: Number(text(formData, "coldEvaluationDays")),
    evaluationReminderDays: Number(text(formData, "evaluationReminderDays")),
    attendanceMarginBefore: Number(text(formData, "attendanceMarginBefore")),
    attendanceMarginAfter: Number(text(formData, "attendanceMarginAfter")),
  });
  if (!parsed.success) return errorState(formData, "Délais invalides.", zodFieldErrors(parsed.error.issues));
  const before = await db.organizationSettings.findUnique({ where: { id: 1 } });
  await db.organizationSettings.upsert({
    where: { id: 1 },
    update: parsed.data,
    create: { id: 1, name: "Organisme de formation", ...parsed.data },
  });
  await audit(db, {
    userId: actor.id,
    action: "update",
    entity: "settings",
    entityId: "1",
    before: before
      ? {
          reminderDaysBefore: before.reminderDaysBefore,
          coldEvaluationDays: before.coldEvaluationDays,
          evaluationReminderDays: before.evaluationReminderDays,
          attendanceMarginBefore: before.attendanceMarginBefore,
          attendanceMarginAfter: before.attendanceMarginAfter,
        }
      : null,
    after: parsed.data,
  });
  refresh();
  return { status: "success", message: "Délais enregistrés." };
}

const questionSchema = z
  .object({
    evaluationType: z.enum(["hot", "cold"]),
    label: z.string({ error: "Libellé obligatoire." }).min(1, "Libellé obligatoire."),
    answerType: z.enum(["scale_1_5", "scale_0_10", "single_choice", "choice_with_other", "text"]),
    options: z.array(z.string()),
    position: z.number().int(),
    required: z.boolean(),
    active: z.boolean(),
  })
  .refine((data) => !["single_choice", "choice_with_other"].includes(data.answerType) || data.options.length >= 2, {
    path: ["options"],
    message: "Indiquez au moins deux choix, un par ligne.",
  });

export async function saveQuestion(_state: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireRole(["admin"]);
  const id = text(formData, "id");
  const parsed = questionSchema.safeParse({
    evaluationType: text(formData, "evaluationType"),
    label: text(formData, "label"),
    answerType: text(formData, "answerType"),
    options: (text(formData, "options") ?? "")
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean),
    position: Number(text(formData, "position") ?? "0"),
    required: checkbox(formData, "required"),
    active: id ? checkbox(formData, "active") : true,
  });
  if (!parsed.success) return errorState(formData, "Question invalide.", zodFieldErrors(parsed.error.issues));
  const data = {
    ...parsed.data,
    options: ["single_choice", "choice_with_other"].includes(parsed.data.answerType) ? parsed.data.options : undefined,
  };

  if (id) {
    const before = await db.evaluationQuestion.findUnique({ where: { id } });
    if (!before) return errorState(formData, "Question introuvable.");
    await db.evaluationQuestion.update({ where: { id }, data: { ...data, options: data.options ?? undefined } });
    await audit(db, {
      userId: actor.id,
      action: "update",
      entity: "settings",
      entityId: `question:${id}`,
      before: { label: before.label },
      after: { label: data.label },
    });
  } else {
    const last = await db.evaluationQuestion.aggregate({
      where: { evaluationType: data.evaluationType },
      _max: { position: true },
    });
    const created = await db.evaluationQuestion.create({
      data: { ...data, position: data.position || (last._max.position ?? 0) + 1 },
    });
    await audit(db, {
      userId: actor.id,
      action: "create",
      entity: "settings",
      entityId: `question:${created.id}`,
      after: { label: data.label },
    });
  }
  refresh();
  return { status: "success", message: id ? "Question enregistrée." : "Question ajoutée." };
}

/** Answers keep a copy of the label, so deleting a question never alters past answers. */
export async function deleteQuestion(formData: FormData): Promise<void> {
  const actor = await requireRole(["admin"]);
  const id = text(formData, "id");
  if (!id) return;
  const question = await db.evaluationQuestion.findUnique({ where: { id } });
  if (!question) return;
  await db.evaluationQuestion.delete({ where: { id } });
  await audit(db, {
    userId: actor.id,
    action: "delete",
    entity: "settings",
    entityId: `question:${id}`,
    before: { label: question.label },
  });
  refresh();
}

export async function runAutomationNow(): Promise<ActionState> {
  const actor = await requireRole(["admin"]);
  const report = await runScheduledTasks(new Date(), actor.id);
  refresh();
  const parts = [
    `${report.reminders} rappel(s)`,
    `${report.attendanceLinks} lien(s) d'émargement`,
    `${report.closedSessions} session(s) clôturée(s)`,
    `${report.certificates} attestation(s)`,
    `${report.hotEvaluations + report.coldEvaluations} évaluation(s)`,
    `${report.evaluationReminders} relance(s)`,
    `${report.anonymized} anonymisation(s)`,
  ];
  return report.errors.length
    ? { status: "error", message: `Exécution partielle : ${parts.join(", ")}. Erreurs : ${report.errors.join(" ; ")}` }
    : { status: "success", message: `Tâches exécutées : ${parts.join(", ")}.` };
}
