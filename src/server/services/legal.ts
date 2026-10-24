import "server-only";
import { db } from "@/lib/db";
import { audit } from "@/server/audit";
import { sha256 } from "@/server/domain/attendance-proof";
import { EMPTY_LEGAL, type LegalOrganization } from "@/server/domain/legal";
import { storeUpload } from "@/server/storage";

export async function legalOrganization(): Promise<LegalOrganization> {
  return (await db.organizationSettings.findUnique({ where: { id: 1 } })) ?? EMPTY_LEGAL;
}

/** Internal regulations in force at the given date (latest version already effective). */
export async function currentRegulation(now = new Date()) {
  return db.internalRegulation.findFirst({
    where: { effectiveFrom: { lte: now } },
    orderBy: [{ effectiveFrom: "desc" }, { version: "desc" }],
  });
}

/** Adds a version of the internal regulations (F3): versions are never replaced. */
export async function addRegulationVersion(file: File, effectiveFrom: Date, actorId: string) {
  const body = Buffer.from(await file.arrayBuffer());
  const filePath = await storeUpload(file, "reglement-interieur", "pdf");
  const created = await db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('internal_regulations'))`;
    const last = await tx.internalRegulation.findFirst({ orderBy: { version: "desc" }, select: { version: true } });
    return tx.internalRegulation.create({
      data: { version: (last?.version ?? 0) + 1, effectiveFrom, filePath, sha256: sha256(body), createdById: actorId },
    });
  });
  await audit(db, {
    userId: actorId,
    action: "create",
    entity: "internal_regulation",
    entityId: created.id,
    after: { version: created.version, effectiveFrom, sha256: created.sha256 },
  });
  return created;
}
