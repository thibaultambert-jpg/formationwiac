"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { parisDateTimeToUtc } from "@/lib/dates";
import { requireRole } from "@/server/auth/guards";
import { errorState, text, zodFieldErrors, type ActionState } from "@/server/forms";
import { saveComplaint, saveImprovement } from "@/server/services/quality";

const parisDate = (message: string) =>
  z.string({ error: message }).transform((value, context) => {
    const date = parisDateTimeToUtc(value, "00:00");
    if (!date) context.addIssue({ code: "custom", message });
    return date ?? new Date(0);
  });

const complaintSchema = z.object({
  receivedAt: parisDate("Date de réception invalide."),
  complainant: z.string({ error: "L'émetteur est obligatoire." }).min(1, "L'émetteur est obligatoire."),
  channel: z.string().nullable(),
  sessionId: z.uuid().nullable(),
  subject: z.string({ error: "L'objet est obligatoire." }).min(1, "L'objet est obligatoire."),
  description: z.string({ error: "La description est obligatoire." }).min(1, "La description est obligatoire."),
  treatment: z.string().nullable(),
  response: z.string().nullable(),
  status: z.enum(["open", "in_progress", "closed"]),
});

export async function saveComplaintAction(_state: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireRole(["admin"]);
  const id = text(formData, "id");
  const parsed = complaintSchema.safeParse(
    Object.fromEntries(Object.keys(complaintSchema.shape).map((key) => [key, text(formData, key)])),
  );
  if (!parsed.success)
    return errorState(formData, "Certains champs sont invalides.", zodFieldErrors(parsed.error.issues));
  if (parsed.data.status === "closed" && !parsed.data.response)
    return errorState(formData, "Indiquez la réponse apportée avant de clôturer.", {
      response: "La réponse est obligatoire pour clôturer.",
    });
  const saved = await saveComplaint(id, parsed.data, actor.id);
  if (!id) redirect(`/admin/qualite/reclamations/${saved.id}?cree=1`);
  refresh();
  return { status: "success", message: "Réclamation enregistrée." };
}

const improvementSchema = z.object({
  source: z.enum(["complaint", "evaluation", "audit", "other"]),
  complaintId: z.uuid().nullable(),
  origin: z.string().nullable(),
  action: z.string({ error: "L'action est obligatoire." }).min(1, "L'action est obligatoire."),
  owner: z.string().nullable(),
  dueDate: parisDate("Échéance invalide.").nullable(),
  status: z.enum(["planned", "in_progress", "done", "abandoned"]),
  result: z.string().nullable(),
});

export async function saveImprovementAction(_state: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireRole(["admin"]);
  const id = text(formData, "id");
  const parsed = improvementSchema.safeParse(
    Object.fromEntries(Object.keys(improvementSchema.shape).map((key) => [key, text(formData, key)])),
  );
  if (!parsed.success)
    return errorState(formData, "Certains champs sont invalides.", zodFieldErrors(parsed.error.issues));
  if (parsed.data.source === "complaint" && !parsed.data.complaintId)
    return errorState(formData, "Choisissez la réclamation d'origine.", { complaintId: "Réclamation obligatoire." });
  await saveImprovement(id, parsed.data, actor.id);
  refresh();
  return { status: "success", message: id ? "Action mise à jour." : "Action d'amélioration ajoutée." };
}
