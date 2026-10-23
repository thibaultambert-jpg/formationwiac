import "server-only";
import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { audit } from "@/server/audit";
import { isValidSiret, normalizeSiret } from "@/server/domain/siret";
import { text } from "@/server/forms";

type DbClient = Prisma.TransactionClient | typeof db;

export const companySchema = z.object({
  name: z.string({ error: "Raison sociale obligatoire." }).min(1, "Raison sociale obligatoire."),
  siret: z
    .string()
    .nullable()
    .refine((value) => !value || isValidSiret(value), "SIRET invalide (14 chiffres).")
    .transform((value) => (value ? normalizeSiret(value) : null)),
  addressLine: z.string().nullable(),
  postalCode: z.string().nullable(),
  city: z.string().nullable(),
  billingEmail: z.email("Adresse email invalide.").nullable(),
  hubspotCompanyId: z.string().nullable(),
});

export type CompanyInput = z.infer<typeof companySchema>;

/** Reads company fields, optionally prefixed (e.g. "company." in combined forms). */
export function parseCompany(formData: FormData, prefix = "") {
  return companySchema.safeParse({
    name: text(formData, `${prefix}name`),
    siret: text(formData, `${prefix}siret`),
    addressLine: text(formData, `${prefix}addressLine`),
    postalCode: text(formData, `${prefix}postalCode`),
    city: text(formData, `${prefix}city`),
    billingEmail: text(formData, `${prefix}billingEmail`)?.toLowerCase() ?? null,
    hubspotCompanyId: text(formData, `${prefix}hubspotCompanyId`),
  });
}

export const participantSchema = z.object({
  firstName: z.string({ error: "Prénom obligatoire." }).min(1, "Prénom obligatoire."),
  lastName: z.string({ error: "Nom obligatoire." }).min(1, "Nom obligatoire."),
  email: z.email("Adresse email invalide."),
  jobTitle: z.string().nullable(),
  phone: z.string().nullable(),
});

export type ParticipantInput = z.infer<typeof participantSchema>;

export function parseParticipant(formData: FormData, prefix = "") {
  return participantSchema.safeParse({
    firstName: text(formData, `${prefix}firstName`),
    lastName: text(formData, `${prefix}lastName`),
    email: text(formData, `${prefix}email`)?.toLowerCase(),
    jobTitle: text(formData, `${prefix}jobTitle`),
    phone: text(formData, `${prefix}phone`),
  });
}

/** Active company with this SIRET, following merges. */
export async function findCompanyBySiret(client: DbClient, siret: string) {
  const company = await client.company.findUnique({ where: { siret } });
  if (!company) return null;
  if (company.mergedIntoId) return client.company.findUnique({ where: { id: company.mergedIntoId } });
  return company;
}

export async function findCompanyByName(client: DbClient, name: string) {
  return client.company.findFirst({
    where: { name: { equals: name.trim(), mode: "insensitive" }, mergedIntoId: null, archivedAt: null },
  });
}

export async function findParticipantByEmail(client: DbClient, email: string) {
  return client.participant.findUnique({ where: { email: email.toLowerCase() }, include: { company: true } });
}

export async function createCompany(client: DbClient, input: CompanyInput, actorId: string) {
  const company = await client.company.create({ data: input });
  await audit(client, { userId: actorId, action: "create", entity: "company", entityId: company.id, after: company });
  return company;
}

export async function createExternalParticipant(
  client: DbClient,
  input: ParticipantInput,
  companyId: string,
  actorId: string,
) {
  const participant = await client.participant.create({
    data: { ...input, email: input.email.toLowerCase(), type: "external", companyId },
  });
  await audit(client, {
    userId: actorId,
    action: "create",
    entity: "participant",
    entityId: participant.id,
    after: participant,
  });
  // The first contact of a company becomes its main contact.
  const company = await client.company.findUnique({ where: { id: companyId }, select: { mainContactId: true } });
  if (company && !company.mainContactId) {
    await client.company.update({ where: { id: companyId }, data: { mainContactId: participant.id } });
  }
  return participant;
}

/** Internal participant record of a Google account, created on first enrollment. */
export async function ensureInternalParticipant(client: DbClient, userId: string, actorId: string) {
  const existing = await client.participant.findUnique({ where: { userId } });
  if (existing) return existing;
  const user = await client.user.findUniqueOrThrow({ where: { id: userId } });
  const byEmail = await client.participant.findUnique({ where: { email: user.email } });
  if (byEmail) {
    return client.participant.update({
      where: { id: byEmail.id },
      data: { userId, type: "internal", companyId: null },
    });
  }
  const participant = await client.participant.create({
    data: {
      type: "internal",
      userId,
      email: user.email,
      firstName: user.firstName ?? user.email.split("@")[0],
      lastName: user.lastName ?? "",
    },
  });
  await audit(client, {
    userId: actorId,
    action: "create",
    entity: "participant",
    entityId: participant.id,
    after: participant,
  });
  return participant;
}

/** Moves contacts and billed enrollments of `duplicateId` into `targetId`, then archives the duplicate. */
export async function mergeCompanies(targetId: string, duplicateId: string, actorId: string) {
  if (targetId === duplicateId) throw new Error("Cannot merge a company into itself");
  return db.$transaction(async (tx) => {
    const [target, duplicate] = await Promise.all([
      tx.company.findUniqueOrThrow({ where: { id: targetId } }),
      tx.company.findUniqueOrThrow({ where: { id: duplicateId } }),
    ]);
    const participants = await tx.participant.updateMany({
      where: { companyId: duplicateId },
      data: { companyId: targetId },
    });
    const enrollments = await tx.enrollment.updateMany({
      where: { billingCompanyId: duplicateId },
      data: { billingCompanyId: targetId },
    });
    // Fill the target's missing fields with the duplicate's values.
    const fill: Prisma.CompanyUncheckedUpdateInput = {};
    for (const key of ["addressLine", "postalCode", "city", "billingEmail"] as const) {
      if (!target[key] && duplicate[key]) fill[key] = duplicate[key];
    }
    const siret = !target.siret && duplicate.siret ? duplicate.siret : null;
    const hubspot = !target.hubspotCompanyId && duplicate.hubspotCompanyId ? duplicate.hubspotCompanyId : null;
    const mainContactId = !target.mainContactId && duplicate.mainContactId ? duplicate.mainContactId : null;

    // Unique values must leave the duplicate before being set on the target.
    await tx.company.update({
      where: { id: duplicateId },
      data: {
        mergedIntoId: targetId,
        archivedAt: new Date(),
        mainContactId: null,
        ...(siret ? { siret: null } : {}),
        ...(hubspot ? { hubspotCompanyId: null } : {}),
      },
    });
    await tx.company.update({
      where: { id: targetId },
      data: {
        ...fill,
        ...(siret ? { siret } : {}),
        ...(hubspot ? { hubspotCompanyId: hubspot } : {}),
        ...(mainContactId ? { mainContactId } : {}),
      },
    });
    await audit(tx, {
      userId: actorId,
      action: "merge",
      entity: "company",
      entityId: targetId,
      before: { duplicateId, duplicateName: duplicate.name },
      after: { movedParticipants: participants.count, movedEnrollments: enrollments.count },
    });
    return { participants: participants.count, enrollments: enrollments.count };
  });
}
