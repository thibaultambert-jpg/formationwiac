// Invoicing of external enrollments through Pennylane (lot 5). A closed
// session is invoiced to each paying company on what actually happened: the
// app proposes an amount per participant, the admin adjusts it with a reason,
// and the invoice is created as a draft in Pennylane (numbered and sent from
// there).

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

/** Enrollment statuses of a closed session that can be invoiced. */
export const INVOICEABLE_STATUSES = ["present", "absent", "dropped_out"] as const;

export function isInvoiceable(enrollment: { participantType: string; status: string }): boolean {
  return (
    enrollment.participantType === "external" && (INVOICEABLE_STATUSES as readonly string[]).includes(enrollment.status)
  );
}

/** Paying company: the billing company, else the participant's own company (same rule as the agreements). */
export function payerOf(enrollment: {
  billingCompanyId: string | null;
  participant: { companyId: string | null };
}): string | null {
  return enrollment.billingCompanyId ?? enrollment.participant.companyId;
}

/**
 * Proposed line: the applied price for a present or dropped-out trainee
 * (training started), nothing for a trainee absent from every slot.
 */
export function proposeLine(enrollment: { status: string; appliedPrice: number | null }): {
  include: boolean;
  amount: number;
} {
  if (enrollment.status === "absent") return { include: false, amount: 0 };
  return { include: true, amount: enrollment.appliedPrice ?? 0 };
}

export type SubmittedLine = {
  enrollmentId: string;
  include: boolean;
  /** Amount excluding tax, NaN when the input is invalid, null when empty. */
  amount: number | null;
  proposed: number;
  reason: string;
};

export type ValidLine = { enrollmentId: string; amount: number; proposed: number; reason: string | null };

const roundCents = (value: number) => Math.round(value * 100) / 100;

/**
 * Checks the lines submitted by the admin: a positive amount for each
 * included line, a reason whenever it differs from the proposal (an excluded
 * line counts as 0), and at least one line.
 */
export function validateInvoiceLines(lines: readonly SubmittedLine[]): { lines: ValidLine[]; errors: string[] } {
  const errors: string[] = [];
  const valid: ValidLine[] = [];
  for (const line of lines) {
    const amount = line.include ? line.amount : 0;
    if (amount === null || Number.isNaN(amount) || amount < 0) {
      errors.push("Saisissez un montant HT positif pour chaque participant facturé.");
      continue;
    }
    const rounded = roundCents(amount);
    const reason = line.reason.trim();
    if (rounded !== roundCents(line.proposed) && !reason) {
      errors.push("Indiquez un motif pour chaque montant différent du montant proposé.");
      continue;
    }
    if (line.include && rounded > 0) {
      valid.push({ enrollmentId: line.enrollmentId, amount: rounded, proposed: line.proposed, reason: reason || null });
    }
  }
  if (errors.length === 0 && valid.length === 0)
    errors.push("Aucun participant à facturer : cochez au moins une ligne.");
  return { lines: valid, errors: [...new Set(errors)] };
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
  trainingTitle: string;
  firstName: string;
  lastName: string;
  sessionReference: string;
  firstSlotAt: Date | null;
}): string {
  const date = input.firstSlotAt ? ` du ${formatDate(input.firstSlotAt)}` : "";
  return `Formation « ${input.trainingTitle} » – ${input.firstName} ${input.lastName} – session ${input.sessionReference}${date}`;
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
  vatRate: VatRateValue;
  sessionReference: string;
  trainingTitle: string;
  vatExemptionMention: string | null;
  lines: readonly { label: string; amount: number }[];
}): PennylaneInvoicePayload {
  const mention =
    input.vatRate === "exempt" ? input.vatExemptionMention?.trim() || DEFAULT_VAT_EXEMPTION_MENTION : null;
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
      vat_rate: PENNYLANE_VAT_CODES[input.vatRate],
    })),
  };
}
