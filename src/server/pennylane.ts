import "server-only";
import { randomUUID } from "node:crypto";
import { getEnv } from "@/lib/env";
import type { PennylaneCustomerPayload, PennylaneInvoicePayload } from "@/server/domain/invoicing";
import { storeBuffer } from "@/server/storage";

// Pennylane API v2 client (customer invoicing). Without a token, development
// writes the payloads to .storage/pennylane/ instead, like the email outbox.

export type PennylaneMode = "api" | "local" | "none";

export function pennylaneMode(): PennylaneMode {
  if (getEnv().PENNYLANE_API_TOKEN) return "api";
  if (process.env.NODE_ENV !== "production") return "local";
  return "none";
}

export type CreatedInvoice = { id: string; number: string | null; url: string | null };

async function request<T>(method: "GET" | "POST", path: string, body?: unknown): Promise<T> {
  const env = getEnv();
  const response = await fetch(`${env.PENNYLANE_API_URL}${path}`, {
    method,
    headers: {
      authorization: `Bearer ${env.PENNYLANE_API_TOKEN}`,
      accept: "application/json",
      ...(body ? { "content-type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!response.ok) throw new Error(`Pennylane ${method} ${path} failed: ${response.status} ${await response.text()}`);
  return (await response.json()) as T;
}

async function storeLocally(kind: string, payload: unknown): Promise<string> {
  const id = `local-${randomUUID()}`;
  await storeBuffer(
    "pennylane",
    "json",
    Buffer.from(JSON.stringify({ kind, id, payload }, null, 2), "utf8"),
    "application/json",
  );
  return id;
}

type InvoiceResponse = { id: number | string; invoice_number?: string | null; public_file_url?: string | null };

function toCreatedInvoice(invoice: InvoiceResponse): CreatedInvoice {
  return { id: String(invoice.id), number: invoice.invoice_number ?? null, url: invoice.public_file_url ?? null };
}

/** Creates a company customer and returns its Pennylane id. */
export async function createCompanyCustomer(payload: PennylaneCustomerPayload): Promise<string> {
  if (pennylaneMode() === "local") return storeLocally("company_customer", payload);
  const customer = await request<{ id: number | string }>("POST", "/company_customers", payload);
  return String(customer.id);
}

/** Creates a customer invoice (draft) and returns it. */
export async function createCustomerInvoice(payload: PennylaneInvoicePayload): Promise<CreatedInvoice> {
  if (pennylaneMode() === "local")
    return { id: await storeLocally("customer_invoice", payload), number: null, url: null };
  return toCreatedInvoice(await request<InvoiceResponse>("POST", "/customer_invoices", payload));
}

/**
 * Invoice already created with this external reference (a previous attempt
 * that succeeded in Pennylane but failed to be recorded), or null.
 */
export async function findInvoiceByReference(reference: string): Promise<CreatedInvoice | null> {
  if (pennylaneMode() === "local") return null;
  const filter = JSON.stringify([{ field: "external_reference", operator: "eq", value: reference }]);
  const result = await request<{ items?: InvoiceResponse[] }>(
    "GET",
    `/customer_invoices?filter=${encodeURIComponent(filter)}`,
  );
  const invoice = result.items?.[0];
  return invoice ? toCreatedInvoice(invoice) : null;
}
