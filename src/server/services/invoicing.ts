import "server-only";
import { db } from "@/lib/db";
import { audit } from "@/server/audit";
import { signedHours, slotAttendance } from "@/server/domain/attendance-proof";
import {
  INVOICEABLE_STATUSES,
  type SubmittedLine,
  invoiceReadiness,
  invoiceTotal,
  lineLabel,
  payerOf,
  proposeLine,
  toPennylaneCustomer,
  toPennylaneInvoice,
  validateInvoiceLines,
} from "@/server/domain/invoicing";
import {
  createCompanyCustomer,
  createCustomerInvoice,
  findInvoiceByReference,
  pennylaneMode,
} from "@/server/pennylane";

/** Business rule violation, shown to the user as is. */
export class InvoiceError extends Error {}

const companyInclude = { mainContact: { select: { email: true } } } as const;

function invoicedCompany(company: {
  name: string;
  siret: string | null;
  vatNumber: string | null;
  addressLine: string | null;
  postalCode: string | null;
  city: string | null;
  country: string;
  billingEmail: string | null;
  mainContact: { email: string } | null;
}) {
  return { ...company, mainContactEmail: company.mainContact?.email ?? null };
}

/**
 * Invoicing panel of a session: for each paying company, the external
 * enrollments not yet on an active invoice with their proposed amount, the
 * gaps blocking the customer record, and the invoices already created.
 */
export async function loadInvoicingView(sessionId: string) {
  const session = await db.trainingSession.findUnique({
    where: { id: sessionId },
    include: {
      training: true,
      slots: { orderBy: { startsAt: "asc" } },
      enrollments: {
        where: { participantType: "external", status: { in: [...INVOICEABLE_STATUSES] } },
        include: {
          participant: { include: { company: { include: companyInclude } } },
          billingCompany: { include: companyInclude },
          attendances: true,
          corrections: true,
          invoiceLines: { where: { active: true }, select: { id: true } },
        },
        orderBy: [{ participant: { lastName: "asc" } }, { participant: { firstName: "asc" } }],
      },
      invoices: {
        include: { company: true, lines: { include: { enrollment: { include: { participant: true } } } } },
        orderBy: { createdAt: "desc" },
      },
    },
  });
  if (!session) return null;

  type SessionEnrollment = (typeof session.enrollments)[number];
  type Company = NonNullable<SessionEnrollment["billingCompany"]>;
  const slots = session.slots;
  const payers = new Map<string, { company: Company; lines: ReturnType<typeof toLine>[] }>();
  const withoutCompany: string[] = [];

  function toLine(enrollment: SessionEnrollment) {
    const hours = signedHours(
      slots.map((slot) => ({
        startsAt: slot.startsAt,
        endsAt: slot.endsAt,
        attendance: slotAttendance({
          attendance: enrollment.attendances.find((item) => item.slotId === slot.id) ?? null,
          corrections: enrollment.corrections.filter((item) => item.slotId === slot.id),
        }),
      })),
    );
    const appliedPrice = enrollment.appliedPrice === null ? null : Number(enrollment.appliedPrice);
    return {
      enrollmentId: enrollment.id,
      name: `${enrollment.participant.firstName} ${enrollment.participant.lastName}`,
      status: enrollment.status,
      signedHours: hours,
      appliedPrice,
      proposal: proposeLine({ status: enrollment.status, appliedPrice }),
    };
  }

  for (const enrollment of session.enrollments) {
    if (enrollment.invoiceLines.length > 0) continue;
    const payerId = payerOf(enrollment);
    const company = enrollment.billingCompany ?? enrollment.participant.company;
    if (!payerId || !company) {
      withoutCompany.push(`${enrollment.participant.firstName} ${enrollment.participant.lastName}`);
      continue;
    }
    if (!payers.has(payerId)) payers.set(payerId, { company, lines: [] });
    payers.get(payerId)!.lines.push(toLine(enrollment));
  }

  return {
    session,
    durationHours: Number(session.training.durationHours),
    closed: session.status === "completed",
    pennylane: pennylaneMode(),
    payers: [...payers.values()]
      .map(({ company, lines }) => ({ company, missing: invoiceReadiness(invoicedCompany(company)), lines }))
      .sort((a, b) => a.company.name.localeCompare(b.company.name, "fr")),
    withoutCompany,
    invoices: session.invoices,
  };
}

export type InvoicingView = NonNullable<Awaited<ReturnType<typeof loadInvoicingView>>>;

/**
 * Creates the invoice of a closed session for one paying company: the
 * invoice and its lines are recorded first (the session row is locked and
 * the partial unique index forbids invoicing an enrollment twice), then the
 * draft is pushed to Pennylane by `pushInvoice()`.
 */
export async function createInvoice(input: {
  sessionId: string;
  companyId: string;
  lines: readonly SubmittedLine[];
  actorId: string;
}): Promise<{ invoiceId: string; ok: boolean }> {
  if (pennylaneMode() === "none")
    throw new InvoiceError("Pennylane n'est pas configuré : renseignez PENNYLANE_API_TOKEN.");
  // The proposed amounts are recomputed: a reason is required for every adjustment.
  const current = await db.enrollment.findMany({
    where: { id: { in: input.lines.map((line) => line.enrollmentId) } },
    select: { id: true, status: true, appliedPrice: true },
  });
  const { lines, errors } = validateInvoiceLines(
    input.lines.map((line) => {
      const enrollment = current.find((item) => item.id === line.enrollmentId);
      const appliedPrice = enrollment?.appliedPrice == null ? null : Number(enrollment.appliedPrice);
      return { ...line, proposed: enrollment ? proposeLine({ status: enrollment.status, appliedPrice }).amount : 0 };
    }),
  );
  if (errors.length > 0) throw new InvoiceError(errors.join(" "));

  const invoiceId = await db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM sessions WHERE id = ${input.sessionId}::uuid FOR UPDATE`;
    const session = await tx.trainingSession.findUniqueOrThrow({
      where: { id: input.sessionId },
      include: { training: true, slots: { orderBy: { startsAt: "asc" }, take: 1 } },
    });
    if (session.status !== "completed") throw new InvoiceError("La session doit être clôturée avant d'être facturée.");

    const company = await tx.company.findUniqueOrThrow({ where: { id: input.companyId }, include: companyInclude });
    const missing = invoiceReadiness(invoicedCompany(company));
    if (missing.length > 0)
      throw new InvoiceError(`Complétez la fiche de l'entreprise avant de facturer : ${missing.join(", ")}.`);

    const enrollments = await tx.enrollment.findMany({
      where: {
        id: { in: lines.map((line) => line.enrollmentId) },
        sessionId: input.sessionId,
        participantType: "external",
        status: { in: [...INVOICEABLE_STATUSES] },
      },
      include: { participant: true, invoiceLines: { where: { active: true }, select: { id: true } } },
    });
    for (const line of lines) {
      const enrollment = enrollments.find((item) => item.id === line.enrollmentId);
      if (!enrollment || payerOf(enrollment) !== input.companyId)
        throw new InvoiceError("Un participant ne peut pas être facturé à cette entreprise. Rechargez la page.");
      if (enrollment.invoiceLines.length > 0)
        throw new InvoiceError(
          `${enrollment.participant.firstName} ${enrollment.participant.lastName} est déjà facturé(e).`,
        );
    }

    const total = invoiceTotal(lines);
    const invoice = await tx.invoice.create({
      data: {
        sessionId: input.sessionId,
        companyId: input.companyId,
        vatRate: session.training.vatRate,
        totalExclTax: total,
        createdById: input.actorId,
        lines: {
          create: lines.map((line) => {
            const participant = enrollments.find((item) => item.id === line.enrollmentId)!.participant;
            return {
              enrollmentId: line.enrollmentId,
              label: lineLabel({
                trainingTitle: session.training.title,
                firstName: participant.firstName,
                lastName: participant.lastName,
                sessionReference: session.reference,
                firstSlotAt: session.slots[0]?.startsAt ?? null,
              }),
              unitPriceExclTax: line.amount,
              proposedPrice: line.proposed,
              adjustmentReason: line.reason,
            };
          }),
        },
      },
    });
    await audit(tx, {
      userId: input.actorId,
      action: "create",
      entity: "invoice",
      entityId: invoice.id,
      after: { sessionId: input.sessionId, companyId: input.companyId, totalExclTax: total, lines },
    });
    return invoice.id;
  });

  return { invoiceId, ok: await pushInvoice(invoiceId, input.actorId) };
}

/**
 * Pushes a pending or failed invoice to Pennylane as a draft: the customer is
 * created on the first invoice of the company. Never throws: the error is
 * recorded on the invoice. A retry first looks for an invoice already created
 * with the same external reference, so that it never creates a duplicate.
 */
export async function pushInvoice(
  invoiceId: string,
  actorId: string | null,
  options: { retry?: boolean } = {},
): Promise<boolean> {
  const invoice = await db.invoice.findUniqueOrThrow({
    where: { id: invoiceId },
    include: {
      company: { include: companyInclude },
      session: { include: { training: true } },
      lines: { orderBy: { createdAt: "asc" } },
    },
  });
  if (invoice.status !== "pending" && invoice.status !== "failed") return invoice.status === "sent";

  try {
    let created = options.retry ? await findInvoiceByReference(invoice.id) : null;
    if (!created) {
      let customerId = invoice.company.pennylaneCustomerId;
      if (!customerId) {
        customerId = await createCompanyCustomer(
          toPennylaneCustomer(invoice.companyId, invoicedCompany(invoice.company)),
        );
        await db.company.update({ where: { id: invoice.companyId }, data: { pennylaneCustomerId: customerId } });
        await audit(db, {
          userId: actorId,
          action: "update",
          entity: "company",
          entityId: invoice.companyId,
          after: { pennylaneCustomerId: customerId },
        });
      }
      const settings = await db.organizationSettings.findUnique({
        where: { id: 1 },
        select: { vatExemptionMention: true },
      });
      created = await createCustomerInvoice(
        toPennylaneInvoice({
          invoiceId: invoice.id,
          customerId: Number(customerId) || 0,
          issuedAt: new Date(),
          vatRate: invoice.vatRate,
          sessionReference: invoice.session.reference,
          trainingTitle: invoice.session.training.title,
          vatExemptionMention: settings?.vatExemptionMention ?? null,
          lines: invoice.lines.map((line) => ({ label: line.label, amount: Number(line.unitPriceExclTax) })),
        }),
      );
    }
    await db.invoice.update({
      where: { id: invoice.id },
      data: {
        status: "sent",
        pennylaneInvoiceId: created.id,
        pennylaneUrl: created.url,
        sentAt: new Date(),
        error: null,
      },
    });
    await audit(db, {
      userId: actorId,
      action: "send",
      entity: "invoice",
      entityId: invoice.id,
      after: { pennylaneInvoiceId: created.id },
    });
    return true;
  } catch (error) {
    console.error("Pennylane invoice failed", error);
    await db.invoice.update({
      where: { id: invoice.id },
      data: { status: "failed", error: error instanceof Error ? error.message.slice(0, 500) : "Erreur inconnue" },
    });
    return false;
  }
}

/**
 * Detaches an invoice (draft deleted or credited in Pennylane): its
 * enrollments can be invoiced again. Nothing is deleted.
 */
export async function detachInvoice(invoiceId: string, reason: string, actorId: string): Promise<void> {
  if (!reason.trim()) throw new InvoiceError("Indiquez le motif du détachement.");
  await db.$transaction(async (tx) => {
    const invoice = await tx.invoice.findUniqueOrThrow({ where: { id: invoiceId } });
    if (invoice.status === "detached") throw new InvoiceError("Cette facture est déjà détachée.");
    if (invoice.status === "pending")
      throw new InvoiceError("La facture est en cours d'envoi à Pennylane : réessayez dans un instant.");
    await tx.invoice.update({
      where: { id: invoiceId },
      data: { status: "detached", detachedAt: new Date(), detachReason: reason.trim() },
    });
    await tx.invoiceLine.updateMany({ where: { invoiceId }, data: { active: false } });
    await audit(tx, {
      userId: actorId,
      action: "detach",
      entity: "invoice",
      entityId: invoiceId,
      before: { status: invoice.status },
      after: { status: "detached", reason: reason.trim() },
    });
  });
}
