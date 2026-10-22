"use server";

import { refresh, revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireRole } from "@/server/auth/guards";
import { closureDue } from "@/server/domain/automation";
import { errorState, text, type ActionState } from "@/server/forms";
import { setAttendanceByAdmin } from "@/server/services/attendance";
import {
  closeSession,
  sendAttendanceLinks,
  sendCertificates,
  sendConvocations,
  sendEvaluationRequests,
  type SendReport,
} from "@/server/services/session-documents";

function summary(label: string, report: SendReport): ActionState {
  const parts = [
    `${report.sent} envoyé(s)`,
    report.skipped ? `${report.skipped} ignoré(s)` : null,
    report.failed ? `${report.failed} en échec` : null,
  ].filter(Boolean);
  return { status: report.failed > 0 ? "error" : "success", message: `${label} : ${parts.join(", ")}.` };
}

async function loadSession(formData: FormData) {
  const id = text(formData, "sessionId");
  return id
    ? db.trainingSession.findUnique({ where: { id }, include: { slots: { orderBy: { startsAt: "asc" } } } })
    : null;
}

export async function sendConvocationsAction(_state: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireRole(["admin"]);
  const session = await loadSession(formData);
  if (!session) return errorState(formData, "Session introuvable.");
  if (session.status === "cancelled") return errorState(formData, "Session annulée.");
  const report = await sendConvocations(session.id, actor.id);
  refresh();
  return summary("Convocations", report);
}

export async function sendAttendanceLinksAction(_state: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireRole(["admin"]);
  const session = await loadSession(formData);
  if (!session) return errorState(formData, "Session introuvable.");
  if (session.status === "cancelled") return errorState(formData, "Session annulée.");
  const report = await sendAttendanceLinks(session.id, { actorId: actor.id });
  refresh();
  return summary("Liens d'émargement", report);
}

export async function sendHotEvaluationAction(_state: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireRole(["admin"]);
  const session = await loadSession(formData);
  if (!session) return errorState(formData, "Session introuvable.");
  if (session.status !== "completed")
    return errorState(formData, "L'évaluation est envoyée aux participants présents, une fois la session clôturée.");
  const report = await sendEvaluationRequests(session.id, text(formData, "type") === "cold" ? "cold" : "hot", {
    automatic: false,
    actorId: actor.id,
  });
  refresh();
  return summary("Évaluations", report);
}

export async function sendCertificatesAction(_state: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireRole(["admin"]);
  const session = await loadSession(formData);
  if (!session) return errorState(formData, "Session introuvable.");
  if (session.status !== "completed")
    return errorState(formData, "Les attestations sont générées pour une session clôturée.");
  const report = await sendCertificates(session.id, { automatic: false, actorId: actor.id });
  refresh();
  return summary("Attestations", report);
}

export async function closeSessionAction(_state: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireRole(["admin"]);
  const session = await loadSession(formData);
  if (!session) return errorState(formData, "Session introuvable.");
  const last = session.slots.at(-1);
  if (!last || !closureDue(last.endsAt, new Date()))
    return errorState(formData, "La session peut être clôturée après la fin de son dernier créneau.");
  const result = await closeSession(session.id, actor.id);
  if (!result) return errorState(formData, "Cette session ne peut pas être clôturée.");
  // The button disappears once the session is completed: the result is shown by the page.
  revalidatePath(`/admin/sessions/${session.id}`, "layout");
  redirect(`/admin/sessions/${session.id}?cloture=${result.certificates.sent}-${result.evaluations.sent}`);
}

export async function setAttendanceAction(formData: FormData): Promise<void> {
  const actor = await requireRole(["admin"]);
  const enrollmentId = text(formData, "enrollmentId");
  const slotId = text(formData, "slotId");
  if (!enrollmentId || !slotId) return;
  await setAttendanceByAdmin(enrollmentId, slotId, text(formData, "present") === "1", actor.id);
  refresh();
}
