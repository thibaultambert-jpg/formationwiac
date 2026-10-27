// Invoicing of external enrollments through Pennylane (lot 5). A closed
// session is invoiced on what actually happened, to each paying company and,
// under subrogation, to each funder (OPCO): the app proposes the lines of
// each enrollment, the admin adjusts them with a reason, and the invoice is
// created as a draft in Pennylane (numbered and sent from there). CPF, France
// Travail and Region funding are paid through their own platforms.

import { formatDate, toParisDateInput } from "@/lib/dates";
import { normalizeSiret } from "@/server/domain/siret";

export type VatRateValue = "exempt" | "standard_20";

/** Pennylane VAT codes of the invoice lines. */
export const PENNYLANE_VAT_CODES: Record<VatRateValue, string> = {
  exempt: "exempt",
  standard_20: "FR_200",
};

export const VAT_RATE_LABELS: Record<VatRateValue, string> = {
  exempt: "Exonérée de TVA",
  standard_20: "TVA 20 %",
};

/** Default mention when the training is exempt from VAT and the settings define none. */
export const DEFAULT_VAT_EXEMPTION_MENTION =
  "Exonération de TVA – article 261-4-4° a du Code général des impôts (formation professionnelle continue).";

/** Payment term of the invoices, in days. */
export const PAYMENT_TERM_DAYS = 30;

/** Funding types paid through their own platform (EDOF for the CPF, France Travail, the Region): never invoiced here. */
export const OUTSIDE_FUNDING_TYPES = ["cpf", "france_travail", "region"] as const;

export function invoicedOutside(fundingType: string): boolean {
  return (OUTSIDE_FUNDING_TYPES as readonly string[]).includes(fundingType);
}

/**
 * Enrollment statuses of a closed session that can be invoiced: the training
 * of a trainee who attended (or not), and a cancellation fee only for a
 * cancelled enrollment.
 */
export const INVOICEABLE_STATUSES = ["present", "absent", "dropped_out", "cancelled"] as const;

/** Statuses whose training is invoiced (the trainee attended at least partly). */
export const TRAINING_STATUSES = ["present", "dropped_out"] as const;

export function isInvoiceable(enrollment: { participantType: string; status: string; fundingType: string }): boolean {
  return (
    enrollment.participantType === "external" &&
    !invoicedOutside(enrollment.fundingType) &&
    (INVOICEABLE_STATUSES as readonly string[]).includes(enrollment.status)
  );
}

/** Paying company: the billing company, else the participant's own company (same rule as the agreements). */
export function payerOf(enrollment: {
  billingCompanyId: string | null;
  participant: { companyId: string | null };
}): string | null {
  return enrollment.billingCompanyId ?? enrollment.participant.companyId;
}

export type LineKind = "training" | "funded_training" | "cancellation_fee";

export const LINE_KIND_LABELS: Record<LineKind, string> = {
  training: "Formation",
  funded_training: "Formation (prise en charge)",
  cancellation_fee: "Indemnité de dédit",
};

const roundCents = (value: number) => Math.round(value * 100) / 100;

/**
 * Training amount actually due (agreement, article 5: only the hours followed
 * are due): the price prorated to the signed hours, the full price at most.
 */
export function realizedAmount(price: number, signedHours: number, durationHours: number): number {
  if (durationHours <= 0) return roundCents(price);
  return roundCents(price * Math.min(1, signedHours / durationHours));
}

export type ProposalInput = {
  status: string;
  appliedPrice: number | null;
  signedHours: number;
  durationHours: number;
  /** Company paying the training (`payerOf`). */
  companyId: string | null;
  fundingSubrogation: boolean;
  funderId: string | null;
  fundedAmount: number | null;
};

export type ProposedLine = {
  kind: LineKind;
  /** Company or funder the line is invoiced to. */
  payerId: string;
  include: boolean;
  amount: number;
  /** Highest amount allowed (cancellation fee: the part of the price not realized). */
  max?: number;
};

/**
 * Proposed lines of an enrollment:
 * - the realized training, to the company, or under subrogation the funded
 *   part to the funder (OPCO) and the remainder to the company;
 * - a cancellation fee, proposed at 0, always to the company and never to a
 *   funder: it is not a training action and cannot be paid with training funds.
 */
export function proposeLines(input: ProposalInput): ProposedLine[] {
  if (!input.companyId) return [];
  const price = input.appliedPrice ?? 0;
  const lines: ProposedLine[] = [];
  const trains = (TRAINING_STATUSES as readonly string[]).includes(input.status);
  const realized = trains ? realizedAmount(price, input.signedHours, input.durationHours) : 0;

  if (input.status !== "cancelled") {
    let remainder = realized;
    if (input.fundingSubrogation && input.funderId) {
      const funded = roundCents(Math.min(input.fundedAmount ?? realized, realized));
      lines.push({ kind: "funded_training", payerId: input.funderId, include: funded > 0, amount: funded });
      remainder = roundCents(realized - funded);
    }
    lines.push({ kind: "training", payerId: input.companyId, include: remainder > 0, amount: remainder });
  }
  const unrealized = roundCents(price - realized);
  if (unrealized > 0) {
    lines.push({ kind: "cancellation_fee", payerId: input.companyId, include: false, amount: 0, max: unrealized });
  }
  return lines;
}

export type SubmittedLine = {
  enrollmentId: string;
  kind: LineKind;
  include: boolean;
  /** Amount excluding tax, NaN when the input is invalid, null when empty. */
  amount: number | null;
  proposed: number;
  /** Highest amount allowed, if any. */
  max?: number;
  reason: string;
};

export type ValidLine = {
  enrollmentId: string;
  kind: LineKind;
  amount: number;
  proposed: number;
  reason: string | null;
};

/**
 * Checks the lines submitted by the admin: a positive amount for each
 * included line, within its maximum, a reason whenever it differs from the
 * proposal (an excluded line counts as 0), and at least one line.
 */
export function validateInvoiceLines(lines: readonly SubmittedLine[]): { lines: ValidLine[]; errors: string[] } {
  const errors: string[] = [];
  const valid: ValidLine[] = [];
  for (const line of lines) {
    const amount = line.include ? line.amount : 0;
    if (amount === null || Number.isNaN(amount) || amount < 0) {
      errors.push("Saisissez un montant HT positif pour chaque ligne facturée.");
      continue;
    }
    const rounded = roundCents(amount);
    if (line.max !== undefined && rounded > roundCents(line.max)) {
      errors.push("Une indemnité de dédit ne peut pas dépasser la part du prix non réalisée.");
      continue;
    }
    const reason = line.reason.trim();
    if (rounded !== roundCents(line.proposed) && !reason) {
      errors.push("Indiquez un motif pour chaque montant différent du montant proposé.");
      continue;
    }
    if (line.include && rounded > 0) {
      valid.push({
        enrollmentId: line.enrollmentId,
        kind: line.kind,
        amount: rounded,
        proposed: line.proposed,
        reason: reason || null,
      });
    }
  }
  if (errors.length === 0 && valid.length === 0) errors.push("Aucune ligne à facturer : cochez au moins une ligne.");
  return { lines: valid, errors: [...new Set(errors)] };
}

/** VAT of a line: the training's for the training, 20 % for a cancellation fee (not a training action). */
export function lineVatRate(kind: LineKind, trainingVatRate: VatRateValue): VatRateValue {
  return kind === "cancellation_fee" ? "standard_20" : trainingVatRate;
}

export function invoiceTotal(lines: readonly { amount: number }[]): number {
  return roundCents(lines.reduce((sum, line) => sum + line.amount, 0));
}

export type InvoicedCompany = {
  name: string;
  siret: string | null;
  vatNumber: string | null;
  addressLine: string | null;
  postalCode: string | null;
  city: string | null;
  country: string;
  billingEmail: string | null;
  mainContactEmail?: string | null;
};

const COUNTRY_CODES: Record<string, string> = {
  france: "FR",
  belgique: "BE",
  suisse: "CH",
  luxembourg: "LU",
  allemagne: "DE",
  espagne: "ES",
  italie: "IT",
  "pays-bas": "NL",
  "royaume-uni": "GB",
  monaco: "MC",
};

/** ISO 3166 alpha-2 code of a country name typed in French, or null. */
export function countryCode(country: string): string | null {
  const key = country.trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  if (/^[a-z]{2}$/.test(key)) return key.toUpperCase();
  return COUNTRY_CODES[key] ?? null;
}

/** Email the invoice is addressed to: the billing email, else the main contact. */
export function invoiceEmail(company: InvoicedCompany): string | null {
  return company.billingEmail ?? company.mainContactEmail ?? null;
}

/** Blocking gaps before a company can be invoiced (customer record in Pennylane). */
export function invoiceReadiness(company: InvoicedCompany): string[] {
  const missing: string[] = [];
  if (!company.addressLine || !company.postalCode || !company.city) missing.push("l'adresse complète");
  if (!countryCode(company.country)) missing.push("un pays reconnu");
  if (!invoiceEmail(company)) missing.push("l'email de facturation ou un contact principal");
  if (countryCode(company.country) === "FR" && !company.siret) missing.push("le SIRET");
  return missing;
}

export function lineLabel(input: {
  kind: LineKind;
  trainingTitle: string;
  firstName: string;
  lastName: string;
  sessionReference: string;
  firstSlotAt: Date | null;
  fundingAgreementNumber?: string | null;
}): string {
  const date = input.firstSlotAt ? ` du ${formatDate(input.firstSlotAt)}` : "";
  const subject = `« ${input.trainingTitle} » – ${input.firstName} ${input.lastName} – session ${input.sessionReference}${date}`;
  if (input.kind === "cancellation_fee")
    return `Indemnité de dédit (non imputable sur les fonds de la formation professionnelle) – formation ${subject}`;
  const agreement =
    input.kind === "funded_training" && input.fundingAgreementNumber
      ? ` – accord de prise en charge n° ${input.fundingAgreementNumber}`
      : "";
  return `Formation ${subject}${agreement}`;
}

/** Due date of an invoice issued on `issuedAt`. */
export function invoiceDeadline(issuedAt: Date): Date {
  return new Date(issuedAt.getTime() + PAYMENT_TERM_DAYS * 24 * 60 * 60 * 1000);
}

export type PennylaneCustomerPayload = {
  name: string;
  reg_no?: string;
  vat_number?: string;
  emails: string[];
  billing_address: { address: string; postal_code: string; city: string; country_alpha2: string };
  external_reference: string;
};

/** Company customer created in Pennylane; the SIREN is the first 9 digits of the SIRET. */
export function toPennylaneCustomer(companyId: string, company: InvoicedCompany): PennylaneCustomerPayload {
  const email = invoiceEmail(company);
  return {
    name: company.name,
    ...(company.siret ? { reg_no: normalizeSiret(company.siret).slice(0, 9) } : {}),
    ...(company.vatNumber ? { vat_number: company.vatNumber.replace(/\s/g, "").toUpperCase() } : {}),
    emails: email ? [email] : [],
    billing_address: {
      address: company.addressLine ?? "",
      postal_code: company.postalCode ?? "",
      city: company.city ?? "",
      country_alpha2: countryCode(company.country) ?? "FR",
    },
    external_reference: companyId,
  };
}

export type PennylaneInvoicePayload = {
  customer_id: number;
  date: string;
  deadline: string;
  draft: true;
  currency: "EUR";
  label: string;
  external_reference: string;
  pdf_invoice_free_text?: string;
  invoice_lines: {
    label: string;
    quantity: number;
    unit: string;
    raw_currency_unit_price: string;
    vat_rate: string;
  }[];
};

/** Draft customer invoice for Pennylane. The external reference is the invoice id (idempotent retries). */
export function toPennylaneInvoice(input: {
  invoiceId: string;
  customerId: number;
  issuedAt: Date;
  sessionReference: string;
  trainingTitle: string;
  vatExemptionMention: string | null;
  lines: readonly { label: string; amount: number; vatRate: VatRateValue }[];
}): PennylaneInvoicePayload {
  const mention = input.lines.some((line) => line.vatRate === "exempt")
    ? input.vatExemptionMention?.trim() || DEFAULT_VAT_EXEMPTION_MENTION
    : null;
  return {
    customer_id: input.customerId,
    date: toParisDateInput(input.issuedAt),
    deadline: toParisDateInput(invoiceDeadline(input.issuedAt)),
    draft: true,
    currency: "EUR",
    label: `Formation ${input.trainingTitle} – session ${input.sessionReference}`,
    external_reference: input.invoiceId,
    ...(mention ? { pdf_invoice_free_text: mention } : {}),
    invoice_lines: input.lines.map((line) => ({
      label: line.label,
      quantity: 1,
      unit: "participant",
      raw_currency_unit_price: line.amount.toFixed(2),
      vat_rate: PENNYLANE_VAT_CODES[line.vatRate],
    })),
  };
}
