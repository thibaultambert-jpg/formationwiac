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
  data: { purpose: TokenPurpose; expiresAt: Date; enrollmentId?: string; sessionId?: string; trainerId?: string },
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
