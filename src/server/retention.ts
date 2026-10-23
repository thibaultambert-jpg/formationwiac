import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";

/**
 * Runs the GDPR retention purge in a transaction where the append-only
 * attendance tables accept UPDATE and DELETE (database triggers check
 * `app.retention_purge`, set for this transaction only). Nothing else may
 * rewrite attendance records.
 */
export async function withRetentionPurge<T>(work: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.retention_purge', 'on', true)`;
    return work(tx);
  });
}
