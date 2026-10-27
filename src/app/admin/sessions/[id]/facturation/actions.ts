"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRole } from "@/server/auth/guards";
import type { SubmittedLine } from "@/server/domain/invoicing";
import { parseFrenchDecimal } from "@/server/domain/numbers";
import { errorState, text, type ActionState } from "@/server/forms";
import { createInvoice, detachInvoice, InvoiceError, pushInvoice } from "@/server/services/invoicing";

/** The submitted lines disappear from the page once invoiced: the result is shown through a query parameter. */
function done(sessionId: string, result: string): never {
  revalidatePath(`/admin/sessions/${sessionId}`, "layout");
  redirect(`/admin/sessions/${sessionId}/facturation?facture=${result}`);
}

export async function createInvoiceAction(_state: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireRole(["admin"]);
  const sessionId = text(formData, "sessionId");
  const companyId = text(formData, "companyId");
  if (!sessionId || !companyId) return errorState(formData, "Entreprise introuvable.");

  const lines: SubmittedLine[] = formData.getAll("enrollmentId").map((value) => {
    const id = String(value);
    return {
      enrollmentId: id,
      include: formData.get(`include_${id}`) === "on",
      amount: parseFrenchDecimal(text(formData, `amount_${id}`)),
      proposed: Number(text(formData, `proposed_${id}`) ?? 0),
      reason: text(formData, `reason_${id}`) ?? "",
    };
  });

  let result;
  try {
    result = await createInvoice({ sessionId, companyId, lines, actorId: actor.id });
  } catch (error) {
    if (error instanceof InvoiceError) return errorState(formData, error.message);
    throw error;
  }
  done(sessionId, result.ok ? "creee" : "echec");
}

export async function retryInvoiceAction(_state: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireRole(["admin"]);
  const sessionId = text(formData, "sessionId");
  const invoiceId = text(formData, "invoiceId");
  if (!sessionId || !invoiceId) return errorState(formData, "Facture introuvable.");
  const ok = await pushInvoice(invoiceId, actor.id, { retry: true });
  done(sessionId, ok ? "creee" : "echec");
}

export async function detachInvoiceAction(_state: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireRole(["admin"]);
  const sessionId = text(formData, "sessionId");
  const invoiceId = text(formData, "invoiceId");
  if (!sessionId || !invoiceId) return errorState(formData, "Facture introuvable.");
  try {
    await detachInvoice(invoiceId, text(formData, "reason") ?? "", actor.id);
  } catch (error) {
    if (error instanceof InvoiceError) return errorState(formData, error.message, { reason: error.message });
    throw error;
  }
  done(sessionId, "detachee");
}
