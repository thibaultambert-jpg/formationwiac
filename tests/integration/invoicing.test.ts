import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import { bpfRows } from "@/server/services/bpf";
import { anonymizeParticipant } from "@/server/services/privacy";
import {
  createInvoice,
  detachInvoice,
  InvoiceError,
  loadInvoicingView,
  pushInvoice,
} from "@/server/services/invoicing";

const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

// Pennylane is mocked: every request is recorded and answered by `respond`.
type Call = { method: string; url: string; body: unknown };
let calls: Call[] = [];
let respond: (call: Call) => Response = () => new Response("{}", { status: 500 });

beforeAll(() => {
  const defaults: Record<string, string> = {
    GOOGLE_CLIENT_ID: "test",
    GOOGLE_CLIENT_SECRET: "test",
    ALLOWED_GOOGLE_DOMAIN: "test.example",
    INITIAL_ADMIN_EMAIL: "admin@test.example",
    NEXTAUTH_SECRET: "x".repeat(32),
    APP_URL: "http://localhost:3000",
  };
  for (const [key, value] of Object.entries(defaults)) if (!process.env[key]) vi.stubEnv(key, value);
  vi.stubEnv("PENNYLANE_API_TOKEN", "test-token");
  vi.stubEnv("PENNYLANE_API_URL", "https://pennylane.test/api/external/v2");
  vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
    const call = { method: init.method ?? "GET", url, body: init.body ? JSON.parse(String(init.body)) : null };
    calls.push(call);
    return respond(call);
  });
});

afterEach(() => {
  calls = [];
});

afterAll(async () => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  await db.$disconnect();
});

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

/** Pennylane answering normally, with new ids each time (they are unique in the database). */
let nextId = Number(String(Date.now()).slice(-7)) * 1000;
function pennylaneOk(call: Call): Response {
  if (call.url.endsWith("/company_customers")) return json({ id: ++nextId }, 201);
  if (call.url.endsWith("/customer_invoices"))
    return json({ id: ++nextId, invoice_number: null, public_file_url: "https://pennylane.test/f.pdf" }, 201);
  if (call.url.includes("/customer_invoices?filter=")) return json({ items: [] });
  return json({}, 404);
}

type Funding = {
  fundingType?: "company" | "opco" | "cpf";
  fundingSubrogation?: boolean;
  funderId?: string;
  fundingAgreementNumber?: string;
  fundedAmount?: number;
};

/** Closed session of two 3.5-hour slots: Ada signed both, Bob none. */
async function closedSession(options: { vatRate?: "exempt" | "standard_20" } = {}) {
  const actor = await db.user.create({
    data: { email: `inv-actor-${stamp}-${Math.random()}@test.example`, role: "admin" },
  });
  const company = await db.company.create({
    data: {
      name: `Client facturé ${stamp}`,
      siret: null,
      country: "Belgique",
      addressLine: "1 avenue Louise",
      postalCode: "1050",
      city: "Bruxelles",
      billingEmail: "compta@client.example",
    },
  });
  const training = await db.training.create({
    data: {
      title: `Facturation ${stamp}`,
      slug: `facturation-${stamp}-${Math.random().toString(36).slice(2)}`,
      objectives: "Objectifs",
      durationHours: 7,
      modality: "in_person",
      priceExclTax: 950,
      vatRate: options.vatRate ?? "standard_20",
    },
  });
  const session = await db.trainingSession.create({
    data: {
      trainingId: training.id,
      reference: `FAC-${stamp}-${Math.random().toString(36).slice(2, 6)}`,
      status: "completed",
      capacityMax: 10,
      openToExternal: true,
      slots: {
        create: [
          { startsAt: new Date("2026-10-20T07:00:00Z"), endsAt: new Date("2026-10-20T10:30:00Z") },
          { startsAt: new Date("2026-10-20T11:30:00Z"), endsAt: new Date("2026-10-20T15:00:00Z") },
        ],
      },
    },
    include: { slots: { orderBy: { startsAt: "asc" } } },
  });
  const enroll = async (
    firstName: string,
    status: "present" | "absent" | "dropped_out" | "cancelled",
    signedSlots: number,
    funding: Funding = {},
  ) => {
    const participant = await db.participant.create({
      data: {
        type: "external",
        companyId: company.id,
        firstName,
        lastName: `Client${stamp}`,
        email: `${firstName}-${stamp}-${Math.random()}@test.example`,
      },
    });
    const enrollment = await db.enrollment.create({
      data: {
        sessionId: session.id,
        participantId: participant.id,
        status,
        participantType: "external",
        source: "back_office",
        appliedPrice: 950,
        billingCompanyId: company.id,
        ...funding,
        fundingType: funding.fundingType ?? "company",
      },
    });
    for (const slot of session.slots.slice(0, signedSlots)) {
      await db.attendance.create({
        data: {
          enrollmentId: enrollment.id,
          slotId: slot.id,
          present: true,
          method: "attestation_checkbox",
          signedAt: slot.startsAt,
        },
      });
    }
    return enrollment;
  };
  const present = await enroll("Ada", "present", 2);
  const absent = await enroll("Bob", "absent", 0);
  return { actor, company, training, session, present, absent, enroll };
}

function linesFor(fixture: Awaited<ReturnType<typeof closedSession>>) {
  return [
    { enrollmentId: fixture.present.id, kind: "training" as const, include: true, amount: 950, reason: "" },
    { enrollmentId: fixture.absent.id, kind: "training" as const, include: false, amount: 0, reason: "" },
  ];
}

async function opco() {
  return db.company.create({
    data: {
      name: `OPCO test ${stamp}-${Math.random().toString(36).slice(2, 6)}`,
      // Unique per run (the SIRET is unique); the format is not checked here.
      siret: String(Date.now()).slice(-10) + String(Math.floor(Math.random() * 10_000)).padStart(4, "0"),
      addressLine: "1 rue de l'OPCO",
      postalCode: "75001",
      city: "Paris",
      billingEmail: "factures@opco.example",
    },
  });
}

describe("invoicing view", () => {
  it("groups the lines still to invoice by payer, with the realized training and a cancellation fee", async () => {
    const fixture = await closedSession();
    const view = await loadInvoicingView(fixture.session.id);
    expect(view?.closed).toBe(true);
    expect(view?.payers).toHaveLength(1);
    expect(view?.payers[0].missing).toEqual([]);
    expect(view?.payers[0].lines.map((line) => [line.name.slice(0, 3), line.kind, line.include, line.amount])).toEqual([
      ["Ada", "training", true, 950],
      ["Bob", "training", false, 0],
      ["Bob", "cancellation_fee", false, 0],
    ]);
  });
});

describe("invoice creation", () => {
  it("creates the customer then a draft invoice in Pennylane, once per enrollment", async () => {
    respond = pennylaneOk;
    const fixture = await closedSession({ vatRate: "exempt" });
    const result = await createInvoice({
      sessionId: fixture.session.id,
      companyId: fixture.company.id,
      lines: linesFor(fixture),
      actorId: fixture.actor.id,
    });
    expect(result.ok).toBe(true);

    expect(
      calls.map((call) => `${call.method} ${call.url.replace("https://pennylane.test/api/external/v2", "")}`),
    ).toEqual(["POST /company_customers", "POST /customer_invoices"]);
    expect(calls[0].body).toMatchObject({ name: fixture.company.name, billing_address: { country_alpha2: "BE" } });
    const customerId = nextId - 1;
    expect(calls[1].body).toMatchObject({
      customer_id: customerId,
      draft: true,
      external_reference: result.invoiceId,
      invoice_lines: [{ raw_currency_unit_price: "950.00", vat_rate: "exempt" }],
    });

    const invoice = await db.invoice.findUniqueOrThrow({ where: { id: result.invoiceId }, include: { lines: true } });
    expect(invoice).toMatchObject({ status: "sent", pennylaneInvoiceId: String(nextId), vatRate: "exempt" });
    expect(Number(invoice.totalExclTax)).toBe(950);
    expect(invoice.lines).toHaveLength(1);
    const company = await db.company.findUniqueOrThrow({ where: { id: fixture.company.id } });
    expect(company.pennylaneCustomerId).toBe(String(customerId));

    // The invoiced line leaves the panel and cannot be invoiced twice.
    const view = await loadInvoicingView(fixture.session.id);
    expect(view?.payers[0].lines.map((line) => line.enrollmentId)).toEqual([fixture.absent.id, fixture.absent.id]);
    await expect(
      createInvoice({
        sessionId: fixture.session.id,
        companyId: fixture.company.id,
        lines: [linesFor(fixture)[0]],
        actorId: fixture.actor.id,
      }),
    ).rejects.toThrow(InvoiceError);
  });

  it("refuses an open session, an adjusted amount without reason and an incomplete company", async () => {
    respond = pennylaneOk;
    const fixture = await closedSession();
    const base = { sessionId: fixture.session.id, companyId: fixture.company.id, actorId: fixture.actor.id };

    await expect(createInvoice({ ...base, lines: [{ ...linesFor(fixture)[0], amount: 500 }] })).rejects.toThrow(
      "motif",
    );

    await db.company.update({ where: { id: fixture.company.id }, data: { addressLine: null } });
    await expect(createInvoice({ ...base, lines: linesFor(fixture) })).rejects.toThrow("adresse");
    await db.company.update({ where: { id: fixture.company.id }, data: { addressLine: "1 avenue Louise" } });

    await db.trainingSession.update({ where: { id: fixture.session.id }, data: { status: "published" } });
    await expect(createInvoice({ ...base, lines: linesFor(fixture) })).rejects.toThrow("clôturée");
    expect(calls).toEqual([]);
  });

  it("records a Pennylane failure, then retries without creating a duplicate", async () => {
    const fixture = await closedSession();
    respond = (call) => (call.url.endsWith("/customer_invoices") ? json({ error: "boom" }, 503) : pennylaneOk(call));
    const result = await createInvoice({
      sessionId: fixture.session.id,
      companyId: fixture.company.id,
      lines: linesFor(fixture),
      actorId: fixture.actor.id,
    });
    expect(result.ok).toBe(false);
    const failed = await db.invoice.findUniqueOrThrow({ where: { id: result.invoiceId } });
    expect(failed.status).toBe("failed");
    expect(failed.error).toContain("503");

    // The invoice was in fact created in Pennylane: the retry finds it by its external reference.
    calls = [];
    respond = (call) =>
      call.url.includes("/customer_invoices?filter=") ? json({ items: [{ id: ++nextId }] }) : json({}, 500);
    expect(await pushInvoice(result.invoiceId, fixture.actor.id, { retry: true })).toBe(true);
    expect(calls.map((call) => call.method)).toEqual(["GET"]);
    const sent = await db.invoice.findUniqueOrThrow({ where: { id: result.invoiceId } });
    expect(sent).toMatchObject({ status: "sent", pennylaneInvoiceId: String(nextId), error: null });
  });

  it("detaches an invoice: its enrollments can be invoiced again, nothing is deleted", async () => {
    respond = pennylaneOk;
    const fixture = await closedSession();
    const first = await createInvoice({
      sessionId: fixture.session.id,
      companyId: fixture.company.id,
      lines: linesFor(fixture),
      actorId: fixture.actor.id,
    });
    await expect(detachInvoice(first.invoiceId, " ", fixture.actor.id)).rejects.toThrow(InvoiceError);
    await detachInvoice(first.invoiceId, "Brouillon supprimé dans Pennylane", fixture.actor.id);

    const second = await createInvoice({
      sessionId: fixture.session.id,
      companyId: fixture.company.id,
      lines: linesFor(fixture),
      actorId: fixture.actor.id,
    });
    expect(second.ok).toBe(true);
    const invoices = await db.invoice.findMany({
      where: { sessionId: fixture.session.id },
      orderBy: { createdAt: "asc" },
    });
    expect(invoices.map((invoice) => invoice.status)).toEqual(["detached", "sent"]);
    const audits = await db.auditLog.count({ where: { entity: "invoice", entityId: first.invoiceId } });
    expect(audits).toBe(3);
  });

  it("removes the name of an anonymized trainee from the local invoice lines", async () => {
    respond = pennylaneOk;
    const fixture = await closedSession();
    const result = await createInvoice({
      sessionId: fixture.session.id,
      companyId: fixture.company.id,
      lines: linesFor(fixture),
      actorId: fixture.actor.id,
    });
    await anonymizeParticipant(fixture.present.participantId, fixture.actor.id, "Demande RGPD");
    const line = await db.invoiceLine.findFirstOrThrow({ where: { invoiceId: result.invoiceId } });
    expect(line.label).not.toContain("Ada");
  });

  it("prorates a dropout and bills the cancellation fee on its own line with VAT", async () => {
    respond = pennylaneOk;
    const fixture = await closedSession({ vatRate: "exempt" });
    const carl = await fixture.enroll("Carl", "dropped_out", 1);
    const view = await loadInvoicingView(fixture.session.id);
    const carlLines = view!.payers[0].lines.filter((line) => line.enrollmentId === carl.id);
    expect(carlLines.map((line) => [line.kind, line.amount, line.max])).toEqual([
      ["training", 475, undefined],
      ["cancellation_fee", 0, 475],
    ]);

    const base = { sessionId: fixture.session.id, companyId: fixture.company.id, actorId: fixture.actor.id };
    const training = { enrollmentId: carl.id, kind: "training" as const, include: true, amount: 475, reason: "" };
    const fee = {
      enrollmentId: carl.id,
      kind: "cancellation_fee" as const,
      include: true,
      amount: 600,
      reason: "Dédit",
    };
    await expect(createInvoice({ ...base, lines: [training, fee] })).rejects.toThrow("dédit");

    const result = await createInvoice({ ...base, lines: [training, { ...fee, amount: 300 }] });
    expect(result.ok).toBe(true);
    expect((calls.at(-1)?.body as { invoice_lines: { vat_rate: string; label: string }[] }).invoice_lines).toEqual([
      expect.objectContaining({ vat_rate: "exempt", raw_currency_unit_price: "475.00" }),
      expect.objectContaining({
        vat_rate: "FR_200",
        raw_currency_unit_price: "300.00",
        label: expect.stringContaining("Indemnité de dédit"),
      }),
    ]);
  });

  it("invoices the funded part to the OPCO and the remainder to the company, never a fee to the OPCO", async () => {
    respond = pennylaneOk;
    const fixture = await closedSession();
    const funder = await opco();
    const dana = await fixture.enroll("Dana", "dropped_out", 1, {
      fundingType: "opco",
      fundingSubrogation: true,
      funderId: funder.id,
      fundingAgreementNumber: "PEC-2026-77",
      fundedAmount: 400,
    });
    const view = await loadInvoicingView(fixture.session.id);
    expect(view!.payers.map((payer) => [payer.company.id, payer.funder])).toEqual([
      [funder.id, true],
      [fixture.company.id, false],
    ]);
    const forDana = (payerId: string) =>
      view!.payers
        .find((payer) => payer.company.id === payerId)!
        .lines.filter((line) => line.enrollmentId === dana.id)
        .map((line) => [line.kind, line.amount]);
    expect(forDana(funder.id)).toEqual([["funded_training", 400]]);
    expect(forDana(fixture.company.id)).toEqual([
      ["training", 75],
      ["cancellation_fee", 0],
    ]);

    // A cancellation fee is never invoiced to the funder.
    await expect(
      createInvoice({
        sessionId: fixture.session.id,
        companyId: funder.id,
        actorId: fixture.actor.id,
        lines: [{ enrollmentId: dana.id, kind: "cancellation_fee", include: true, amount: 100, reason: "Dédit" }],
      }),
    ).rejects.toThrow("plus facturable");

    const toOpco = await createInvoice({
      sessionId: fixture.session.id,
      companyId: funder.id,
      actorId: fixture.actor.id,
      lines: [{ enrollmentId: dana.id, kind: "funded_training", include: true, amount: 400, reason: "" }],
    });
    expect(toOpco.ok).toBe(true);
    expect((calls.at(-1)?.body as { invoice_lines: { label: string }[] }).invoice_lines[0].label).toContain(
      "accord de prise en charge n° PEC-2026-77",
    );
    const toCompany = await createInvoice({
      sessionId: fixture.session.id,
      companyId: fixture.company.id,
      actorId: fixture.actor.id,
      lines: [{ enrollmentId: dana.id, kind: "training", include: true, amount: 75, reason: "" }],
    });
    expect(toCompany.ok).toBe(true);

    // The BPF splits the invoiced revenue between the OPCO and the company.
    const row = (await bpfRows(2026)).find((item) => item.enrollmentId === dana.id);
    expect(row?.revenue).toBe(475);
    expect(row?.revenueShares).toEqual([
      { fundingType: "opco", amount: 400 },
      { fundingType: "company", amount: 75 },
    ]);
  });

  it("leaves CPF enrollments out of Pennylane", async () => {
    const fixture = await closedSession();
    const eve = await fixture.enroll("Eve", "present", 2, { fundingType: "cpf" });
    const view = await loadInvoicingView(fixture.session.id);
    expect(view!.outside.map((item) => item.fundingType)).toEqual(["cpf"]);
    expect(view!.payers.flatMap((payer) => payer.lines).some((line) => line.enrollmentId === eve.id)).toBe(false);
  });
});
