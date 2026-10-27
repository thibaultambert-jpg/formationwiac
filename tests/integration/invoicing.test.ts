import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
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
      slots: { create: { startsAt: new Date("2026-10-20T07:00:00Z"), endsAt: new Date("2026-10-20T14:00:00Z") } },
    },
  });
  const enroll = async (firstName: string, status: "present" | "absent", participantType = "external" as const) => {
    const participant = await db.participant.create({
      data: {
        type: participantType,
        companyId: company.id,
        firstName,
        lastName: `Client${stamp}`,
        email: `${firstName}-${stamp}-${Math.random()}@test.example`,
      },
    });
    return db.enrollment.create({
      data: {
        sessionId: session.id,
        participantId: participant.id,
        status,
        participantType,
        fundingType: "company",
        source: "back_office",
        appliedPrice: 950,
        billingCompanyId: company.id,
      },
    });
  };
  const present = await enroll("Ada", "present");
  const absent = await enroll("Bob", "absent");
  return { actor, company, training, session, present, absent };
}

function linesFor(fixture: Awaited<ReturnType<typeof closedSession>>) {
  return [
    { enrollmentId: fixture.present.id, include: true, amount: 950, proposed: 950, reason: "" },
    { enrollmentId: fixture.absent.id, include: false, amount: 0, proposed: 0, reason: "" },
  ];
}

describe("invoicing view", () => {
  it("groups the external enrollments of a closed session by paying company with proposed amounts", async () => {
    const fixture = await closedSession();
    const view = await loadInvoicingView(fixture.session.id);
    expect(view?.closed).toBe(true);
    expect(view?.payers).toHaveLength(1);
    expect(view?.payers[0].missing).toEqual([]);
    expect(view?.payers[0].lines.map((line) => [line.status, line.proposal])).toEqual([
      ["present", { include: true, amount: 950 }],
      ["absent", { include: false, amount: 0 }],
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

    // The invoiced enrollment leaves the panel and cannot be invoiced twice.
    const view = await loadInvoicingView(fixture.session.id);
    expect(view?.payers[0].lines.map((line) => line.enrollmentId)).toEqual([fixture.absent.id]);
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
    // A tampered proposal does not bypass the reason.
    await expect(
      createInvoice({ ...base, lines: [{ ...linesFor(fixture)[0], amount: 500, proposed: 500 }] }),
    ).rejects.toThrow("motif");

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
});
