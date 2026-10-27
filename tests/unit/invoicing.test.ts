import { describe, expect, it } from "vitest";
import {
  countryCode,
  DEFAULT_VAT_EXEMPTION_MENTION,
  invoiceReadiness,
  invoiceTotal,
  isInvoiceable,
  lineLabel,
  payerOf,
  proposeLine,
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
  it("keeps external enrollments of a closed session only", () => {
    expect(isInvoiceable({ participantType: "external", status: "present" })).toBe(true);
    expect(isInvoiceable({ participantType: "external", status: "absent" })).toBe(true);
    expect(isInvoiceable({ participantType: "external", status: "dropped_out" })).toBe(true);
    expect(isInvoiceable({ participantType: "external", status: "cancelled" })).toBe(false);
    expect(isInvoiceable({ participantType: "external", status: "confirmed" })).toBe(false);
    expect(isInvoiceable({ participantType: "internal", status: "present" })).toBe(false);
  });

  it("bills the billing company, else the participant's company", () => {
    expect(payerOf({ billingCompanyId: "payer", participant: { companyId: "own" } })).toBe("payer");
    expect(payerOf({ billingCompanyId: null, participant: { companyId: "own" } })).toBe("own");
    expect(payerOf({ billingCompanyId: null, participant: { companyId: null } })).toBeNull();
  });

  it("proposes the applied price, and nothing for an absent trainee", () => {
    expect(proposeLine({ status: "present", appliedPrice: 950 })).toEqual({ include: true, amount: 950 });
    expect(proposeLine({ status: "dropped_out", appliedPrice: 950 })).toEqual({ include: true, amount: 950 });
    expect(proposeLine({ status: "absent", appliedPrice: 950 })).toEqual({ include: false, amount: 0 });
    expect(proposeLine({ status: "present", appliedPrice: null })).toEqual({ include: true, amount: 0 });
  });
});

describe("lines submitted by the admin", () => {
  const line = { enrollmentId: "a", include: true, amount: 950, proposed: 950, reason: "" };

  it("accepts the proposal as is", () => {
    expect(validateInvoiceLines([line])).toEqual({
      lines: [{ enrollmentId: "a", amount: 950, proposed: 950, reason: null }],
      errors: [],
    });
  });

  it("requires a reason when the amount differs from the proposal", () => {
    expect(validateInvoiceLines([{ ...line, amount: 475 }]).errors).toHaveLength(1);
    expect(validateInvoiceLines([{ ...line, amount: 475, reason: "Demi-journée suivie" }]).lines).toEqual([
      { enrollmentId: "a", amount: 475, proposed: 950, reason: "Demi-journée suivie" },
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

  it("bills an absent trainee only with a reason (no-show fee)", () => {
    const absent = { enrollmentId: "c", include: true, amount: 300, proposed: 0, reason: "" };
    expect(validateInvoiceLines([absent]).errors).toHaveLength(1);
    expect(validateInvoiceLines([{ ...absent, reason: "Dédit prévu à la convention" }]).lines).toHaveLength(1);
  });

  it("rejects invalid amounts and empty invoices", () => {
    expect(validateInvoiceLines([{ ...line, amount: Number.NaN }]).errors).toHaveLength(1);
    expect(validateInvoiceLines([{ ...line, amount: -5, reason: "x" }]).errors).toHaveLength(1);
    expect(validateInvoiceLines([{ ...line, amount: null }]).errors).toHaveLength(1);
    expect(validateInvoiceLines([{ ...line, include: false, proposed: 0 }]).errors).toEqual([
      "Aucun participant à facturer : cochez au moins une ligne.",
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
    vatRate: "standard_20" as const,
    sessionReference: "FORM-2026-014",
    trainingTitle: "Excel avancé",
    vatExemptionMention: null,
    lines: [{ label: "Ligne", amount: 950 }],
  };

  it("labels each line with the training, the trainee and the session", () => {
    expect(
      lineLabel({
        trainingTitle: "Excel avancé",
        firstName: "Ada",
        lastName: "Lovelace",
        sessionReference: "FORM-2026-014",
        firstSlotAt: new Date("2026-10-20T07:00:00Z"),
      }),
    ).toBe("Formation « Excel avancé » – Ada Lovelace – session FORM-2026-014 du 20/10/2026");
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

  it("prints the exemption mention when the training is exempt from VAT", () => {
    const exempt = toPennylaneInvoice({ ...input, vatRate: "exempt" });
    expect(exempt.invoice_lines[0].vat_rate).toBe("exempt");
    expect(exempt.pdf_invoice_free_text).toBe(DEFAULT_VAT_EXEMPTION_MENTION);
    expect(
      toPennylaneInvoice({ ...input, vatRate: "exempt", vatExemptionMention: "Exonération art. 261" })
        .pdf_invoice_free_text,
    ).toBe("Exonération art. 261");
  });
});
