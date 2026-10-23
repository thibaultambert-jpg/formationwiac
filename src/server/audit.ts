import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";

type DbClient = Prisma.TransactionClient | typeof db;

export type AuditEntry = {
  userId: string | null;
  action: string;
  entity: string;
  entityId: string;
  before?: unknown;
  after?: unknown;
};

/** Converts Prisma values (Decimal, Date) into plain JSON for the audit log. */
function toJson(value: unknown): Prisma.InputJsonValue | typeof Prisma.DbNull {
  if (value === undefined || value === null) return Prisma.DbNull;
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

export async function audit(client: DbClient, entry: AuditEntry): Promise<void> {
  await client.auditLog.create({
    data: {
      userId: entry.userId,
      action: entry.action,
      entity: entry.entity,
      entityId: entry.entityId,
      before: toJson(entry.before),
      after: toJson(entry.after),
    },
  });
}

/** Comparable form of a value: Decimal, number and Date become strings. */
function comparable(value: unknown): unknown {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "number") return String(value);
  if (typeof value === "object" && value !== null && "toFixed" in value) return String(value);
  return value;
}

/** Keeps only the fields whose value changed, for compact before/after entries. */
export function diff<B extends object, A extends object>(
  before: B,
  after: A,
): { before: Record<string, unknown>; after: Record<string, unknown> } | null {
  const changedBefore: Record<string, unknown> = {};
  const changedAfter: Record<string, unknown> = {};
  const source = before as Record<string, unknown>;
  for (const [key, value] of Object.entries(after)) {
    if (value === undefined) continue;
    if (JSON.stringify(comparable(source[key])) !== JSON.stringify(comparable(value))) {
      changedBefore[key] = source[key];
      changedAfter[key] = value;
    }
  }
  return Object.keys(changedAfter).length > 0 ? { before: changedBefore, after: changedAfter } : null;
}
