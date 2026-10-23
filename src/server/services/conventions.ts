import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { parisYear } from "@/lib/dates";
import { audit } from "@/server/audit";
import { conventionReference, missingOrganizationIdentifiers } from "@/server/domain/compliance";
import { nextReferenceSequence } from "@/server/domain/reference";
import { DEFAULT_EMAIL_TEMPLATES } from "@/server/email/default-templates";
import { sessionVariables } from "@/server/email/notifications";
import { sendEmail } from "@/server/email/send";
import { renderTemplate } from "@/server/email/template";
import { renderConvention } from "@/server/pdf/convention";
import { loadOrganization } from "@/server/pdf/data";
import { readStoredFile, storeBuffer, storeUpload } from "@/server/storage";
import { confirmConventionEnrollments } from "@/server/services/enrollments";

type Tx = Prisma.TransactionClient;

/** Business rule violation, shown to the user as is. */
export class ConventionError extends Error {}

/** Statuses of the enrollments covered by an agreement (seat holders and waitlist). */
const COVERED_STATUSES = ["pending_agreement", "confirmed", "waitlisted", "present", "absent"] as const;

/** Company covered by an agreement: the billing company, or the participant's own company. */
function enrollmentCompanyId(enrollment: {
  billingCompanyId: string | null;
  participant: { companyId: string | null };
}): string | null {
  return enrollment.billingCompanyId ?? enrollment.participant.companyId;
}

async function allocateConventionReference(tx: Tx, year: number): Promise<string> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('convention_reference'))`;
  const rows = await tx.$queryRaw<{ max: number | null }[]>`
    SELECT max(split_part(reference, '-', 3)::int) AS max
    FROM conventions
    WHERE reference LIKE ${`CONV-${year}-%`} AND split_part(reference, '-', 3) ~ '^[0-9]+$'`;
  return conventionReference(year, nextReferenceSequence(rows[0]?.max ?? null));
}

/** External enrollments of a session grouped by company, with their agreements (BO panel). */
export async function sessionAgreements(sessionId: string) {
  const [enrollments, conventions] = await Promise.all([
    db.enrollment.findMany({
      where: { sessionId, participantType: "external", status: { in: [...COVERED_STATUSES] } },
      include: { participant: { include: { company: true } }, billingCompany: true, convention: true },
      orderBy: { enrolledAt: "asc" },
    }),
    db.convention.findMany({ where: { sessionId }, include: { company: true }, orderBy: { createdAt: "asc" } }),
  ]);
  const companies = new Map<
    string,
    { id: string; name: string; enrollments: typeof enrollments; conventions: typeof conventions }
  >();
  for (const enrollment of enrollments) {
    const companyId = enrollmentCompanyId(enrollment);
    if (!companyId) continue;
    const company = enrollment.billingCompany ?? enrollment.participant.company!;
    if (!companies.has(companyId))
      companies.set(companyId, { id: companyId, name: company.name, enrollments: [], conventions: [] });
    companies.get(companyId)!.enrollments.push(enrollment);
  }
  for (const convention of conventions) {
    if (!companies.has(convention.companyId))
      companies.set(convention.companyId, {
        id: convention.companyId,
        name: convention.company.name,
        enrollments: [],
        conventions: [],
      });
    companies.get(convention.companyId)!.conventions.push(convention);
  }
  return {
    companies: [...companies.values()].sort((a, b) => a.name.localeCompare(b.name, "fr")),
    withoutCompany: enrollments.filter((enrollment) => !enrollmentCompanyId(enrollment)),
  };
}

async function renderAndStore(tx: Tx, conventionId: string): Promise<string> {
  const convention = await tx.convention.findUniqueOrThrow({
    where: { id: conventionId },
    include: {
      company: true,
      session: { include: { training: true, slots: { orderBy: { startsAt: "asc" } } } },
      enrollments: {
        where: { status: { not: "cancelled" } },
        include: { participant: true },
        orderBy: { enrolledAt: "asc" },
      },
    },
  });
  const organization = await loadOrganization();
  const missing = missingOrganizationIdentifiers(organization);
  if (missing.length > 0) {
    throw new ConventionError(
      `Renseignez d'abord le ${missing.join(" et le ")} dans Paramètres › Organisme : ils doivent figurer sur la convention.`,
    );
  }
  const { company, session } = convention;
  const pdf = await renderConvention({
    reference: convention.reference,
    issuedAt: new Date(),
    organization,
    company: {
      name: company.name,
      address: [company.addressLine, [company.postalCode, company.city].filter(Boolean).join(" ")]
        .filter(Boolean)
        .join(", "),
      siret: company.siret,
    },
    training: session.training,
    session,
    trainees: convention.enrollments.map(({ participant }) => participant),
    priceExclTax: convention.priceExclTax === null ? null : Number(convention.priceExclTax),
    financialTerms: convention.financialTerms,
  });
  const path = await storeBuffer(`conventions/${session.id}`, "pdf", pdf, "application/pdf");
  await tx.convention.update({ where: { id: convention.id }, data: { generatedPath: path, generatedAt: new Date() } });
  await tx.document.create({
    data: { type: "convention", sessionId: session.id, filePath: path, generatedAt: new Date() },
  });
  return path;
}

/** Sum of the applied prices of the covered enrollments, or null when none is set. */
async function totalPrice(tx: Tx, conventionId: string): Promise<number | null> {
  const enrollments = await tx.enrollment.findMany({
    where: { conventionId, status: { not: "cancelled" } },
    select: { appliedPrice: true },
  });
  const prices = enrollments.map((enrollment) => enrollment.appliedPrice).filter((price) => price !== null);
  return prices.length === 0 ? null : prices.reduce((sum, price) => sum + Number(price), 0);
}

/** Enrollments of the company in the session that are not covered by an active agreement yet. */
async function uncoveredEnrollments(tx: Tx, sessionId: string, companyId: string) {
  const enrollments = await tx.enrollment.findMany({
    where: {
      sessionId,
      participantType: "external",
      status: { in: [...COVERED_STATUSES] },
      OR: [{ conventionId: null }, { convention: { status: "cancelled" } }],
    },
    include: { participant: true },
  });
  return enrollments.filter((enrollment) => enrollmentCompanyId(enrollment) === companyId);
}

/** Creates the agreement of a company for a session and generates its PDF. */
export async function createConvention(
  input: { sessionId: string; companyId: string; financialTerms: string | null },
  actorId: string,
) {
  return db.$transaction(
    async (tx) => {
      const session = await tx.trainingSession.findUniqueOrThrow({
        where: { id: input.sessionId },
        include: { slots: { orderBy: { startsAt: "asc" }, take: 1 } },
      });
      if (session.status === "cancelled") throw new ConventionError("Cette session est annulée.");
      const enrollments = await uncoveredEnrollments(tx, session.id, input.companyId);
      if (enrollments.length === 0)
        throw new ConventionError(
          "Toutes les inscriptions de cette entreprise sont déjà couvertes par une convention.",
        );

      const reference = await allocateConventionReference(tx, parisYear(session.slots[0]?.startsAt ?? new Date()));
      const convention = await tx.convention.create({
        data: {
          reference,
          sessionId: session.id,
          companyId: input.companyId,
          financialTerms: input.financialTerms,
          createdById: actorId,
        },
      });
      await tx.enrollment.updateMany({
        where: { id: { in: enrollments.map((enrollment) => enrollment.id) } },
        data: { conventionId: convention.id },
      });
      await tx.convention.update({
        where: { id: convention.id },
        data: { priceExclTax: await totalPrice(tx, convention.id) },
      });
      await renderAndStore(tx, convention.id);
      await audit(tx, {
        userId: actorId,
        action: "create",
        entity: "convention",
        entityId: convention.id,
        after: { reference, sessionId: session.id, companyId: input.companyId, enrollments: enrollments.length },
      });
      return convention;
    },
    { timeout: 30_000 },
  );
}

async function editableConvention(tx: Tx, conventionId: string) {
  const convention = await tx.convention.findUniqueOrThrow({ where: { id: conventionId } });
  if (convention.status === "signed")
    throw new ConventionError("Cette convention est signée : elle ne peut plus être modifiée.");
  if (convention.status === "cancelled") throw new ConventionError("Cette convention est annulée.");
  return convention;
}

/**
 * Adds the company's new enrollments to an unsigned agreement, updates its
 * terms and regenerates the PDF (the previous file is kept).
 */
export async function refreshConvention(conventionId: string, financialTerms: string | null, actorId: string) {
  return db.$transaction(
    async (tx) => {
      const convention = await editableConvention(tx, conventionId);
      const added = await uncoveredEnrollments(tx, convention.sessionId, convention.companyId);
      await tx.enrollment.updateMany({
        where: { id: { in: added.map((enrollment) => enrollment.id) } },
        data: { conventionId: convention.id },
      });
      await tx.convention.update({
        where: { id: convention.id },
        data: { financialTerms, priceExclTax: await totalPrice(tx, convention.id) },
      });
      await renderAndStore(tx, convention.id);
      await audit(tx, {
        userId: actorId,
        action: "update",
        entity: "convention",
        entityId: convention.id,
        before: { financialTerms: convention.financialTerms },
        after: { financialTerms, added: added.length },
      });
    },
    { timeout: 30_000 },
  );
}

/** Emails the generated agreement to the company (billing email, else main contact). */
export async function sendConvention(conventionId: string, actorId: string) {
  const convention = await db.convention.findUniqueOrThrow({
    where: { id: conventionId },
    include: { company: { include: { mainContact: true } }, session: { include: { training: true, slots: true } } },
  });
  if (convention.status === "signed" || convention.status === "cancelled")
    throw new ConventionError("Seule une convention en brouillon ou envoyée peut être envoyée.");
  const to = convention.company.billingEmail ?? convention.company.mainContact?.email ?? null;
  if (!to)
    throw new ConventionError(
      "Renseignez l'email de facturation ou le contact principal de l'entreprise pour envoyer la convention.",
    );
  const file = convention.generatedPath ? await readStoredFile(convention.generatedPath) : null;
  if (!file) throw new ConventionError("Le PDF de la convention est introuvable : régénérez-le.");

  const mail =
    (await db.emailTemplate.findUnique({ where: { key: "convention" } })) ??
    DEFAULT_EMAIL_TEMPLATES.find((item) => item.key === "convention")!;
  const variables = {
    ...(await sessionVariables(convention.session)),
    entreprise: convention.company.name,
    reference_convention: convention.reference,
    prenom: convention.company.mainContact?.firstName ?? "",
    nom: convention.company.mainContact?.lastName ?? "",
  };
  const result = await sendEmail({
    type: "convention",
    to,
    subject: renderTemplate(mail.subject, variables),
    text: renderTemplate(mail.body, variables),
    attachments: [
      { filename: `convention-${convention.reference}.pdf`, contentType: "application/pdf", content: file.body },
    ],
    sessionId: convention.sessionId,
  });
  if (!result.ok) throw new ConventionError("L'envoi de la convention a échoué : consultez Paramètres › Emails.");
  await db.convention.update({ where: { id: convention.id }, data: { status: "sent", sentAt: new Date() } });
  await audit(db, {
    userId: actorId,
    action: "send",
    entity: "convention",
    entityId: convention.id,
    after: { to, reference: convention.reference },
  });
}

/**
 * Records the signed agreement (uploaded PDF): the agreement becomes signed and
 * its pending enrollments are confirmed. Returns the confirmed enrollment ids
 * so that the trainees can be notified.
 */
export async function recordSignedConvention(
  conventionId: string,
  input: { file: File; signedAt: Date },
  actorId: string,
): Promise<string[]> {
  const convention = await db.convention.findUniqueOrThrow({ where: { id: conventionId } });
  if (convention.status === "signed") throw new ConventionError("Cette convention est déjà signée.");
  if (convention.status === "cancelled") throw new ConventionError("Cette convention est annulée.");
  const signedPath = await storeUpload(input.file, `conventions/${convention.sessionId}`, "pdf");
  return db.$transaction(async (tx) => {
    await tx.convention.update({
      where: { id: convention.id },
      data: { status: "signed", signedPath, signedAt: input.signedAt },
    });
    const confirmed = await confirmConventionEnrollments(tx, convention.id, actorId);
    await audit(tx, {
      userId: actorId,
      action: "sign",
      entity: "convention",
      entityId: convention.id,
      before: { status: convention.status },
      after: { status: "signed", signedAt: input.signedAt.toISOString(), confirmed: confirmed.length },
    });
    return confirmed;
  });
}

/** Cancels an unsigned agreement: its enrollments are released and need a new agreement. */
export async function cancelConvention(conventionId: string, actorId: string) {
  await db.$transaction(async (tx) => {
    const convention = await editableConvention(tx, conventionId);
    await tx.convention.update({
      where: { id: convention.id },
      data: { status: "cancelled", cancelledAt: new Date() },
    });
    await tx.enrollment.updateMany({ where: { conventionId: convention.id }, data: { conventionId: null } });
    await audit(tx, {
      userId: actorId,
      action: "cancel",
      entity: "convention",
      entityId: convention.id,
      before: { status: convention.status },
      after: { status: "cancelled" },
    });
  });
}
