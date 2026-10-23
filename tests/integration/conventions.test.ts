import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import {
  cancelConvention,
  ConventionError,
  createConvention,
  recordSignedConvention,
  sessionAgreements,
} from "@/server/services/conventions";
import { EnrollmentError, enrollParticipant, updateEnrollment, waiveAgreement } from "@/server/services/enrollments";
import { createSessionRecord } from "@/server/services/sessions";

const stamp = Date.now();
let previousIdentifiers: { siret: string | null; activityDeclarationNumber: string | null } | null = null;

// A minimal PDF, accepted by the upload validation (content type only).
const SIGNED_PDF = new File([new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34])], "signed.pdf", {
  type: "application/pdf",
});

beforeAll(async () => {
  const settings = await db.organizationSettings.findUnique({ where: { id: 1 } });
  previousIdentifiers = settings
    ? { siret: settings.siret, activityDeclarationNumber: settings.activityDeclarationNumber }
    : null;
  await db.organizationSettings.upsert({
    where: { id: 1 },
    update: { siret: "12345678901234", activityDeclarationNumber: "11755555575" },
    create: { id: 1, name: "Organisme test", siret: "12345678901234", activityDeclarationNumber: "11755555575" },
  });
});

afterAll(async () => {
  if (previousIdentifiers) await db.organizationSettings.update({ where: { id: 1 }, data: previousIdentifiers });
  await db.$disconnect();
});

async function fixture(capacityMax: number, externals: number) {
  const actor = await db.user.create({
    data: { email: `conv-actor-${stamp}-${Math.random()}@test.example`, role: "admin" },
  });
  const company = await db.company.create({ data: { name: `Client ${stamp}`, billingEmail: "achats@client.example" } });
  const training = await db.training.create({
    data: {
      title: `Convention ${stamp}`,
      slug: `convention-${stamp}-${Math.random().toString(36).slice(2)}`,
      objectives: "Objectifs",
      durationHours: 7,
      modality: "in_person",
      priceExclTax: 900,
    },
  });
  const session = await db.$transaction((tx) =>
    createSessionRecord(tx, {
      trainingId: training.id,
      location: "Salle",
      videoLink: null,
      capacityMax,
      capacityMin: null,
      registrationDeadline: null,
      openToInternal: false,
      openToExternal: true,
      qualiopiScope: false,
      accessInfo: "Badge à l'accueil",
      internalNotes: null,
      trainerIds: [],
      slots: [{ id: null, startsAt: new Date("2030-03-10T08:00:00Z"), endsAt: new Date("2030-03-10T11:30:00Z") }],
    }),
  );
  await db.trainingSession.update({ where: { id: session.id }, data: { status: "published" } });
  const enrollments = [];
  for (let index = 0; index < externals; index++) {
    const participant = await db.participant.create({
      data: {
        type: "external",
        companyId: company.id,
        firstName: `Ext${index}`,
        lastName: "Client",
        email: `ext${index}-${stamp}-${Math.random()}@test.example`,
      },
    });
    enrollments.push(
      await db.$transaction((tx) =>
        enrollParticipant(tx, {
          sessionId: session.id,
          participantId: participant.id,
          source: "back_office",
          actorId: actor.id,
        }),
      ),
    );
  }
  return { actor, company, session, enrollments };
}

describe("training agreements against the database", () => {
  it("keeps external enrollments pending until the agreement is signed", async () => {
    const { actor, company, session, enrollments } = await fixture(5, 2);
    expect(enrollments.map((enrollment) => enrollment.status)).toEqual(["pending_agreement", "pending_agreement"]);
    expect(enrollments.every((enrollment) => enrollment.participantType === "external")).toBe(true);
    expect(enrollments.every((enrollment) => enrollment.fundingType === "company")).toBe(true);

    await expect(
      updateEnrollment(
        enrollments[0].id,
        { status: "confirmed", appliedPrice: 900, billingCompanyId: company.id, cancellationReason: null },
        actor.id,
      ),
    ).rejects.toBeInstanceOf(EnrollmentError);

    const convention = await createConvention(
      { sessionId: session.id, companyId: company.id, financialTerms: "30 jours" },
      actor.id,
    );
    expect(convention.reference).toMatch(/^CONV-2030-\d{3}$/);
    const stored = await db.convention.findUniqueOrThrow({ where: { id: convention.id } });
    expect(stored.generatedPath).toMatch(/\.pdf$/);
    expect(Number(stored.priceExclTax)).toBe(1800);

    const confirmed = await recordSignedConvention(convention.id, { file: SIGNED_PDF, signedAt: new Date() }, actor.id);
    expect(confirmed.sort()).toEqual(enrollments.map((enrollment) => enrollment.id).sort());
    const after = await db.enrollment.findMany({ where: { sessionId: session.id } });
    expect(after.every((enrollment) => enrollment.status === "confirmed")).toBe(true);
    const signed = await db.convention.findUniqueOrThrow({ where: { id: convention.id } });
    expect(signed.status).toBe("signed");
    expect(
      await db.auditLog.count({ where: { entity: "convention", entityId: convention.id } }),
    ).toBeGreaterThanOrEqual(2);
  });

  it("refuses a second agreement for already covered enrollments and frees them when cancelled", async () => {
    const { actor, company, session } = await fixture(5, 1);
    const convention = await createConvention(
      { sessionId: session.id, companyId: company.id, financialTerms: null },
      actor.id,
    );
    await expect(
      createConvention({ sessionId: session.id, companyId: company.id, financialTerms: null }, actor.id),
    ).rejects.toBeInstanceOf(ConventionError);
    await cancelConvention(convention.id, actor.id);
    const { companies } = await sessionAgreements(session.id);
    expect(companies[0].enrollments[0].conventionId).toBeNull();
    await expect(
      createConvention({ sessionId: session.id, companyId: company.id, financialTerms: null }, actor.id),
    ).resolves.toBeTruthy();
  });

  it("confirms an enrollment with a traced admin waiver", async () => {
    const { actor, enrollments } = await fixture(5, 1);
    const { confirmed } = await waiveAgreement(enrollments[0].id, "Convention cadre annuelle", actor.id);
    expect(confirmed).toBe(true);
    const enrollment = await db.enrollment.findUniqueOrThrow({ where: { id: enrollments[0].id } });
    expect(enrollment).toMatchObject({ status: "confirmed", agreementWaiverReason: "Convention cadre annuelle" });
    expect(
      await db.auditLog.count({ where: { entityId: enrollment.id, action: "agreement_waiver", userId: actor.id } }),
    ).toBe(1);
  });

  it("promotes a waitlisted external to pending, then confirmed once covered", async () => {
    const { actor, company, session, enrollments } = await fixture(1, 2);
    expect(enrollments.map((enrollment) => enrollment.status)).toEqual(["pending_agreement", "waitlisted"]);
    const convention = await createConvention(
      { sessionId: session.id, companyId: company.id, financialTerms: null },
      actor.id,
    );
    await recordSignedConvention(convention.id, { file: SIGNED_PDF, signedAt: new Date() }, actor.id);
    const { promoted } = await updateEnrollment(
      enrollments[0].id,
      { status: "cancelled", appliedPrice: null, billingCompanyId: company.id, cancellationReason: "test" },
      actor.id,
    );
    expect(promoted).toEqual([enrollments[1].id]);
    const second = await db.enrollment.findUniqueOrThrow({ where: { id: enrollments[1].id } });
    expect(second.status).toBe("confirmed");
  });
});
