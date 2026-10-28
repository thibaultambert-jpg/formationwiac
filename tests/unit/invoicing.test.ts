import { describe, expect, it } from "vitest";
import {
  countryCode,
  DEFAULT_VAT_EXEMPTION_MENTION,
  invoiceReadiness,
  invoiceTotal,
  invoicedOutside,
  isInvoiceable,
  lineLabel,
  lineVatRate,
  payerOf,
  proposeLines,
  realizedAmount,
  toPennylaneCustomer,
  toPennylaneInvoice,
  validateInvoiceLines,
} from "@/server/domain/invoicing";

const company = {
  name: "Client SA",
  siret: "732 829 320 00074",
  vatNumber: "fr 40 732829320",
  addressLine: "1 rue de la Paix",
  postalCode: "75002",
  city: "Paris",
  country: "France",
  billingEmail: "compta@client.example",
  mainContactEmail: null,
};

describe("invoiceable enrollments", () => {
  it("keeps external enrollments of a closed session invoiced through Pennylane", () => {
    const external = { participantType: "external", fundingType: "company" };
    expect(isInvoiceable({ ...external, status: "present" })).toBe(true);
    expect(isInvoiceable({ ...external, status: "absent" })).toBe(true);
    expect(isInvoiceable({ ...external, status: "dropped_out" })).toBe(true);
    expect(isInvoiceable({ ...external, status: "cancelled" })).toBe(true);
    expect(isInvoiceable({ ...external, status: "confirmed" })).toBe(false);
    expect(isInvoiceable({ ...external, participantType: "internal", status: "present" })).toBe(false);
  });

  it("leaves CPF, France Travail and Region funding to their own platforms", () => {
    expect(invoicedOutside("cpf")).toBe(true);
    expect(invoicedOutside("france_travail")).toBe(true);
    expect(invoicedOutside("region")).toBe(true);
    expect(invoicedOutside("opco")).toBe(false);
    expect(invoicedOutside("company")).toBe(false);
    expect(isInvoiceable({ participantType: "external", fundingType: "cpf", status: "present" })).toBe(false);
  });

  it("bills the billing company, else the participant's company", () => {
    expect(payerOf({ billingCompanyId: "payer", participant: { companyId: "own" } })).toBe("payer");
    expect(payerOf({ billingCompanyId: null, participant: { companyId: "own" } })).toBe("own");
    expect(payerOf({ billingCompanyId: null, participant: { companyId: null } })).toBeNull();
  });
});

describe("proposed lines", () => {
  const base = {
    status: "present",
    appliedPrice: 1400,
    signedHours: 14,
    durationHours: 14,
    companyId: "company",
    fundingSubrogation: false,
    funderId: null,
    fundedAmount: null,
  };

  it("prorates the training to the signed hours (agreement, article 5)", () => {
    expect(realizedAmount(1400, 14, 14)).toBe(1400);
    expect(realizedAmount(1400, 7, 14)).toBe(700);
    expect(realizedAmount(1000, 3.5, 7.5)).toBe(466.67);
    expect(realizedAmount(1400, 16, 14)).toBe(1400);
  });

  it("invoices the realized training to the company, and offers a cancellation fee for the rest", () => {
    expect(proposeLines(base)).toEqual([{ kind: "training", payerId: "company", include: true, amount: 1400 }]);
    expect(proposeLines({ ...base, status: "dropped_out", signedHours: 7 })).toEqual([
      { kind: "training", payerId: "company", include: true, amount: 700 },
      { kind: "cancellation_fee", payerId: "company", include: false, amount: 0, max: 700 },
    ]);
  });

  it("proposes nothing for an absent trainee, but allows a cancellation fee", () => {
    expect(proposeLines({ ...base, status: "absent", signedHours: 0 })).toEqual([
      { kind: "training", payerId: "company", include: false, amount: 0 },
      { kind: "cancellation_fee", payerId: "company", include: false, amount: 0, max: 1400 },
    ]);
    expect(proposeLines({ ...base, status: "cancelled", signedHours: 0 })).toEqual([
      { kind: "cancellation_fee", payerId: "company", include: false, amount: 0, max: 1400 },
    ]);
  });

  it("splits a subrogated training between the funder and the company", () => {
    const subrogated = { ...base, fundingSubrogation: true, funderId: "opco", fundedAmount: 1000 };
    expect(proposeLines(subrogated)).toEqual([
      { kind: "funded_training", payerId: "opco", include: true, amount: 1000 },
      { kind: "training", payerId: "company", include: true, amount: 400 },
    ]);
    // Without a funded amount the funder takes the whole realized training.
    expect(proposeLines({ ...subrogated, fundedAmount: null })).toEqual([
      { kind: "funded_training", payerId: "opco", include: true, amount: 1400 },
      { kind: "training", payerId: "company", include: false, amount: 0 },
    ]);
    // The funder never pays more than what was realized; a cancellation fee goes to the company.
    expect(proposeLines({ ...subrogated, status: "dropped_out", signedHours: 7 })).toEqual([
      { kind: "funded_training", payerId: "opco", include: true, amount: 700 },
      { kind: "training", payerId: "company", include: false, amount: 0 },
      { kind: "cancellation_fee", payerId: "company", include: false, amount: 0, max: 700 },
    ]);
  });

  it("needs a paying company", () => {
    expect(proposeLines({ ...base, companyId: null })).toEqual([]);
  });

  it("applies 20 % VAT to a cancellation fee, the training's VAT otherwise", () => {
    expect(lineVatRate("cancellation_fee", "exempt")).toBe("standard_20");
    expect(lineVatRate("training", "exempt")).toBe("exempt");
    expect(lineVatRate("funded_training", "standard_20")).toBe("standard_20");
  });
});

describe("lines submitted by the admin", () => {
  const line = { enrollmentId: "a", kind: "training" as const, include: true, amount: 950, proposed: 950, reason: "" };

  it("accepts the proposal as is", () => {
    expect(validateInvoiceLines([line])).toEqual({
      lines: [{ enrollmentId: "a", kind: "training", amount: 950, proposed: 950, reason: null }],
      errors: [],
    });
  });

  it("requires a reason when the amount differs from the proposal", () => {
    expect(validateInvoiceLines([{ ...line, amount: 475 }]).errors).toHaveLength(1);
    expect(validateInvoiceLines([{ ...line, amount: 475, reason: "Demi-journée suivie" }]).lines).toEqual([
      { enrollmentId: "a", kind: "training", amount: 475, proposed: 950, reason: "Demi-journée suivie" },
    ]);
  });

  it("treats an unchecked line as 0 and requires a reason to drop a proposed amount", () => {
    expect(
      validateInvoiceLines([
        { ...line, include: false },
        { ...line, enrollmentId: "b" },
      ]).errors,
    ).toHaveLength(1);
    const dropped = validateInvoiceLines([
      { ...line, include: false, reason: "Geste commercial" },
      { ...line, enrollmentId: "b" },
    ]);
    expect(dropped.errors).toEqual([]);
    expect(dropped.lines.map((item) => item.enrollmentId)).toEqual(["b"]);
  });

  it("bills a cancellation fee with a reason, within the unrealized part of the price", () => {
    const fee = { ...line, kind: "cancellation_fee" as const, amount: 300, proposed: 0, max: 700 };
    expect(validateInvoiceLines([fee]).errors).toHaveLength(1);
    expect(validateInvoiceLines([{ ...fee, reason: "Dédit prévu à la convention" }]).lines).toHaveLength(1);
    expect(validateInvoiceLines([{ ...fee, amount: 800, reason: "Dédit" }]).errors).toEqual([
      "Une indemnité de dédit ne peut pas dépasser la part du prix non réalisée.",
    ]);
  });

  it("rejects invalid amounts and empty invoices", () => {
    expect(validateInvoiceLines([{ ...line, amount: Number.NaN }]).errors).toHaveLength(1);
    expect(validateInvoiceLines([{ ...line, amount: -5, reason: "x" }]).errors).toHaveLength(1);
    expect(validateInvoiceLines([{ ...line, amount: null }]).errors).toHaveLength(1);
    expect(validateInvoiceLines([{ ...line, include: false, proposed: 0 }]).errors).toEqual([
      "Aucune ligne à facturer : cochez au moins une ligne.",
    ]);
  });

  it("sums the lines to the cent", () => {
    expect(invoiceTotal([{ amount: 0.1 }, { amount: 0.2 }])).toBe(0.3);
  });
});

describe("customer record", () => {
  it("is ready with an address, an email and a SIRET in France", () => {
    expect(invoiceReadiness(company)).toEqual([]);
    expect(
      invoiceReadiness({ ...company, addressLine: null, billingEmail: null, mainContactEmail: null, siret: null }),
    ).toEqual(["l'adresse complète", "l'email de facturation ou un contact principal", "le SIRET"]);
    expect(invoiceReadiness({ ...company, billingEmail: null, mainContactEmail: "contact@client.example" })).toEqual(
      [],
    );
  });

  it("does not require a SIRET abroad but a known country", () => {
    expect(invoiceReadiness({ ...company, country: "Belgique", siret: null })).toEqual([]);
    expect(invoiceReadiness({ ...company, country: "Atlantide" })).toEqual(["un pays reconnu"]);
  });

  it("maps French country names to ISO codes", () => {
    expect(countryCode("France")).toBe("FR");
    expect(countryCode(" pays-bas ")).toBe("NL");
    expect(countryCode("ch")).toBe("CH");
    expect(countryCode("Atlantide")).toBeNull();
  });

  it("sends the SIREN, the normalized VAT number and the billing address", () => {
    expect(toPennylaneCustomer("company-id", company)).toEqual({
      name: "Client SA",
      reg_no: "732829320",
      vat_number: "FR40732829320",
      emails: ["compta@client.example"],
      billing_address: { address: "1 rue de la Paix", postal_code: "75002", city: "Paris", country_alpha2: "FR" },
      external_reference: "company-id",
    });
  });
});

describe("Pennylane invoice", () => {
  const input = {
    invoiceId: "invoice-id",
    customerId: 42,
    issuedAt: new Date("2026-10-27T10:00:00Z"),
    sessionReference: "FORM-2026-014",
    trainingTitle: "Excel avancé",
    vatExemptionMention: null,
    lines: [{ label: "Ligne", amount: 950, vatRate: "standard_20" as const }],
  };
  const label = {
    trainingTitle: "Excel avancé",
    firstName: "Ada",
    lastName: "Lovelace",
    sessionReference: "FORM-2026-014",
    firstSlotAt: new Date("2026-10-20T07:00:00Z"),
  };

  it("labels each line with the training, the trainee and the session", () => {
    expect(lineLabel({ ...label, kind: "training" })).toBe(
      "Formation « Excel avancé » – Ada Lovelace – session FORM-2026-014 du 20/10/2026",
    );
    expect(lineLabel({ ...label, kind: "funded_training", fundingAgreementNumber: "OPCO-42" })).toBe(
      "Formation « Excel avancé » – Ada Lovelace – session FORM-2026-014 du 20/10/2026 – accord de prise en charge n° OPCO-42",
    );
    expect(lineLabel({ ...label, kind: "cancellation_fee" })).toBe(
      "Indemnité de dédit (non imputable sur les fonds de la formation professionnelle) – formation « Excel avancé » – Ada Lovelace – session FORM-2026-014 du 20/10/2026",
    );
  });

  it("is a draft in euros, due in 30 days, with the invoice id as external reference", () => {
    const payload = toPennylaneInvoice(input);
    expect(payload).toMatchObject({
      customer_id: 42,
      date: "2026-10-27",
      deadline: "2026-11-26",
      draft: true,
      currency: "EUR",
      external_reference: "invoice-id",
    });
    expect(payload.invoice_lines).toEqual([
      { label: "Ligne", quantity: 1, unit: "participant", raw_currency_unit_price: "950.00", vat_rate: "FR_200" },
    ]);
    expect(payload.pdf_invoice_free_text).toBeUndefined();
  });

  it("sets the VAT per line and prints the exemption mention when a line is exempt", () => {
    const mixed = toPennylaneInvoice({
      ...input,
      lines: [
        { label: "Formation", amount: 700, vatRate: "exempt" },
        { label: "Dédit", amount: 300, vatRate: "standard_20" },
      ],
    });
    expect(mixed.invoice_lines.map((line) => line.vat_rate)).toEqual(["exempt", "FR_200"]);
    expect(mixed.pdf_invoice_free_text).toBe(DEFAULT_VAT_EXEMPTION_MENTION);
    expect(
      toPennylaneInvoice({
        ...input,
        vatExemptionMention: "Exonération art. 261",
        lines: [{ label: "Formation", amount: 700, vatRate: "exempt" }],
      }).pdf_invoice_free_text,
    ).toBe("Exonération art. 261");
  });
});
