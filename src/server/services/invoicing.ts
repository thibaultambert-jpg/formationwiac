import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { audit } from "@/server/audit";
import { signedHours, slotAttendance } from "@/server/domain/attendance-proof";
import {
  INVOICEABLE_STATUSES,
  type LineKind,
  type ProposedLine,
  type SubmittedLine,
  invoicedOutside,
  invoiceReadiness,
  invoiceTotal,
  lineLabel,
  lineVatRate,
  payerOf,
  proposeLines,
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

type DbClient = Prisma.TransactionClient | typeof db;

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

/** Closed session with its external enrollments, attendance and active invoice lines. */
async function loadProposalData(client: DbClient, sessionId: string) {
  return client.trainingSession.findUnique({
    where: { id: sessionId },
    include: {
      training: true,
      slots: { orderBy: { startsAt: "asc" } },
      enrollments: {
        where: { participantType: "external", status: { in: [...INVOICEABLE_STATUSES] } },
        include: {
          participant: { include: { company: { include: companyInclude } } },
          billingCompany: { include: companyInclude },
          funder: { include: companyInclude },
          attendances: true,
          corrections: true,
          invoiceLines: { where: { active: true }, select: { kind: true } },
        },
        orderBy: [{ participant: { lastName: "asc" } }, { participant: { firstName: "asc" } }],
      },
    },
  });
}

type ProposalData = NonNullable<Awaited<ReturnType<typeof loadProposalData>>>;
type ProposalEnrollment = ProposalData["enrollments"][number];

/**
 * Lines still to invoice for each enrollment (kinds already on an active
 * invoice are left out), recomputed on the server for every submission.
 */
function enrollmentProposals(session: ProposalData) {
  const durationHours = Number(session.training.durationHours);
  return session.enrollments.map((enrollment) => {
    const hours = signedHours(
      session.slots.map((slot) => ({
        startsAt: slot.startsAt,
        endsAt: slot.endsAt,
        attendance: slotAttendance({
          attendance: enrollment.attendances.find((item) => item.slotId === slot.id) ?? null,
          corrections: enrollment.corrections.filter((item) => item.slotId === slot.id),
        }),
      })),
    );
    const appliedPrice = enrollment.appliedPrice === null ? null : Number(enrollment.appliedPrice);
    const invoiced = new Set<LineKind>(enrollment.invoiceLines.map((line) => line.kind));
    const outside = invoicedOutside(enrollment.fundingType);
    const lines = outside
      ? []
      : proposeLines({
          status: enrollment.status,
          appliedPrice,
          signedHours: hours,
          durationHours,
          companyId: payerOf(enrollment),
          fundingSubrogation: enrollment.fundingSubrogation,
          funderId: enrollment.funderId,
          fundedAmount: enrollment.fundedAmount === null ? null : Number(enrollment.fundedAmount),
        }).filter((line) => !invoiced.has(line.kind));
    return { enrollment, hours, appliedPrice, outside, lines };
  });
}

export type InvoiceFormLine = {
  enrollmentId: string;
  name: string;
  status: ProposalEnrollment["status"];
  signedHours: number;
  appliedPrice: number | null;
  fundingAgreementNumber: string | null;
} & ProposedLine;

/**
 * Invoicing panel of a session: for each payer (company or, under
 * subrogation, funder), the lines still to invoice with their proposed
 * amount and the gaps blocking the customer record; the enrollments invoiced
 * outside Pennylane (CPF, France Travail, Region); the invoices created.
 */
export async function loadInvoicingView(sessionId: string) {
  const [session, invoices] = await Promise.all([
    loadProposalData(db, sessionId),
    db.invoice.findMany({
      where: { sessionId },
      include: { company: true, lines: { include: { enrollment: { include: { participant: true } } } } },
      orderBy: { createdAt: "desc" },
    }),
  ]);
  if (!session) return null;

  type Company = NonNullable<ProposalEnrollment["billingCompany"]>;
  const payers = new Map<string, { company: Company; funder: boolean; lines: InvoiceFormLine[] }>();
  const withoutCompany: string[] = [];
  const outside: { name: string; fundingType: ProposalEnrollment["fundingType"] }[] = [];

  for (const { enrollment, hours, appliedPrice, outside: isOutside, lines } of enrollmentProposals(session)) {
    const name = `${enrollment.participant.firstName} ${enrollment.participant.lastName}`;
    if (isOutside) {
      if (enrollment.status !== "cancelled") outside.push({ name, fundingType: enrollment.fundingType });
      continue;
    }
    const company = enrollment.billingCompany ?? enrollment.participant.company;
    if (!payerOf(enrollment) || !company) {
      withoutCompany.push(name);
      continue;
    }
    for (const line of lines) {
      const funder = line.kind === "funded_training";
      const payerCompany = funder ? enrollment.funder! : company;
      if (!payers.has(line.payerId)) payers.set(line.payerId, { company: payerCompany, funder, lines: [] });
      payers.get(line.payerId)!.lines.push({
        ...line,
        enrollmentId: enrollment.id,
        name,
        status: enrollment.status,
        signedHours: hours,
        appliedPrice,
        fundingAgreementNumber: enrollment.fundingAgreementNumber,
      });
    }
  }

  return {
    session,
    durationHours: Number(session.training.durationHours),
    closed: session.status === "completed",
    pennylane: pennylaneMode(),
    payers: [...payers.values()]
      .map(({ company, funder, lines }) => ({
        company,
        funder,
        missing: invoiceReadiness(invoicedCompany(company)),
        lines,
      }))
      // Funders first: their invoice settles most of the price.
      .sort((a, b) => Number(b.funder) - Number(a.funder) || a.company.name.localeCompare(b.company.name, "fr")),
    withoutCompany,
    outside,
    invoices,
  };
}

export type InvoicingView = NonNullable<Awaited<ReturnType<typeof loadInvoicingView>>>;

/**
 * Creates the invoice of a closed session for one payer (company or funder).
 * Under the session lock, the proposals are recomputed: each submitted line
 * must still be due to this payer, an adjustment needs a reason and a
 * cancellation fee never goes to a funder. The invoice is recorded first (the
 * partial unique index forbids invoicing the same kind of line twice), then
 * the draft is pushed to Pennylane by `pushInvoice()`.
 */
export async function createInvoice(input: {
  sessionId: string;
  companyId: string;
  lines: readonly Omit<SubmittedLine, "proposed" | "max">[];
  actorId: string;
}): Promise<{ invoiceId: string; ok: boolean }> {
  if (pennylaneMode() === "none")
    throw new InvoiceError("Pennylane n'est pas configuré : renseignez PENNYLANE_API_TOKEN.");

  const invoiceId = await db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM sessions WHERE id = ${input.sessionId}::uuid FOR UPDATE`;
    const session = await loadProposalData(tx, input.sessionId);
    if (!session) throw new InvoiceError("Session introuvable.");
    if (session.status !== "completed") throw new InvoiceError("La session doit être clôturée avant d'être facturée.");

    const proposals = enrollmentProposals(session);
    const submitted: SubmittedLine[] = input.lines.map((line) => {
      const proposal = proposals
        .find((item) => item.enrollment.id === line.enrollmentId)
        ?.lines.find((item) => item.kind === line.kind);
      if (!proposal || proposal.payerId !== input.companyId)
        throw new InvoiceError("Une ligne n'est pas ou plus facturable à ce payeur. Rechargez la page.");
      return { ...line, proposed: proposal.amount, max: proposal.max };
    });
    const { lines, errors } = validateInvoiceLines(submitted);
    if (errors.length > 0) throw new InvoiceError(errors.join(" "));

    const company = await tx.company.findUniqueOrThrow({ where: { id: input.companyId }, include: companyInclude });
    const missing = invoiceReadiness(invoicedCompany(company));
    if (missing.length > 0)
      throw new InvoiceError(`Complétez la fiche de ${company.name} avant de facturer : ${missing.join(", ")}.`);

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
            const enrollment = session.enrollments.find((item) => item.id === line.enrollmentId)!;
            return {
              enrollmentId: line.enrollmentId,
              kind: line.kind,
              vatRate: lineVatRate(line.kind, session.training.vatRate),
              label: lineLabel({
                kind: line.kind,
                trainingTitle: session.training.title,
                firstName: enrollment.participant.firstName,
                lastName: enrollment.participant.lastName,
                sessionReference: session.reference,
                firstSlotAt: session.slots[0]?.startsAt ?? null,
                fundingAgreementNumber: enrollment.fundingAgreementNumber,
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
          sessionReference: invoice.session.reference,
          trainingTitle: invoice.session.training.title,
          vatExemptionMention: settings?.vatExemptionMention ?? null,
          lines: invoice.lines.map((line) => ({
            label: line.label,
            amount: Number(line.unitPriceExclTax),
            vatRate: line.vatRate,
          })),
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
