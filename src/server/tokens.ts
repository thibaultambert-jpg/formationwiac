import "server-only";
import { createHash, randomBytes } from "node:crypto";
import type { Prisma, TokenPurpose } from "@/generated/prisma/client";
import { db } from "@/lib/db";

type DbClient = Prisma.TransactionClient | typeof db;

// Unguessable links usable without login (section 10): 256-bit random token,
// only its SHA-256 hash is stored, limited lifetime, revocable.

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function issueToken(
  client: DbClient,
  data: {
    purpose: TokenPurpose;
    expiresAt: Date;
    validFrom?: Date;
    enrollmentId?: string;
    sessionId?: string;
    trainerId?: string;
    slotId?: string;
    stakeholderEvaluationId?: string;
  },
): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  await client.accessToken.create({ data: { ...data, tokenHash: hashToken(token) } });
  return token;
}

/** Valid (not expired, not revoked) token of the expected purpose, or null. */
export async function resolveToken(token: string, purposes: readonly TokenPurpose[]) {
  if (!/^[A-Za-z0-9_-]{40,60}$/.test(token)) return null;
  const record = await db.accessToken.findUnique({ where: { tokenHash: hashToken(token) } });
  if (!record || !purposes.includes(record.purpose) || record.revokedAt || record.expiresAt < new Date()) return null;
  await db.accessToken.update({ where: { id: record.id }, data: { lastUsedAt: new Date() } });
  return record;
}

export type AttendanceLink =
  | { status: "invalid" }
  | { status: "not_yet"; validFrom: Date }
  | { status: "used"; record: NonNullable<Awaited<ReturnType<typeof findToken>>> }
  | { status: "ok"; record: NonNullable<Awaited<ReturnType<typeof findToken>>> };

async function findToken(token: string) {
  if (!/^[A-Za-z0-9_-]{40,60}$/.test(token)) return null;
  return db.accessToken.findUnique({ where: { tokenHash: hashToken(token) } });
}

/**
 * Per-slot participant attendance link (C2): valid only in its window and used
 * once. Unknown, expired, revoked and legacy (session-wide) links are all
 * "invalid", so that the page reveals nothing about them.
 */
export async function resolveAttendanceLink(token: string, now = new Date()): Promise<AttendanceLink> {
  const record = await findToken(token);
  if (!record || record.purpose !== "attendance" || !record.slotId || !record.enrollmentId || record.revokedAt)
    return { status: "invalid" };
  if (record.consumedAt) return { status: "used", record };
  if (record.expiresAt < now) return { status: "invalid" };
  if (record.validFrom && record.validFrom > now) return { status: "not_yet", validFrom: record.validFrom };
  return { status: "ok", record };
}
