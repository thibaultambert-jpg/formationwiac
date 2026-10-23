import { afterAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import {
  anonymizeParticipant,
  exportParticipantData,
  participantsPastRetention,
  PrivacyError,
} from "@/server/services/privacy";

const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

afterAll(async () => {
  await db.$disconnect();
});

async function externalWithEnrollment(endsAt: Date) {
  const actor = await db.user.create({
    data: { email: `actor-${stamp}-${Math.random()}@test.example`, role: "admin" },
  });
  const company = await db.company.create({ data: { name: `Privacy ${stamp}` } });
  const participant = await db.participant.create({
    data: {
      type: "external",
      companyId: company.id,
      firstName: "Jeanne",
      lastName: "Secret",
      email: `jeanne-${stamp}-${Math.random()}@test.example`,
      phone: "0600000000",
    },
  });
  await db.company.update({ where: { id: company.id }, data: { mainContactId: participant.id } });
  const training = await db.training.create({
    data: {
      title: "Privacy",
      slug: `privacy-${stamp}-${Math.random().toString(36).slice(2)}`,
      objectives: "x",
      durationHours: 3,
      modality: "remote",
    },
  });
  const session = await db.trainingSession.create({
    data: {
      trainingId: training.id,
      reference: `PRIV-${stamp}-${Math.random().toString(36).slice(2, 8)}`,
      capacityMax: 5,
      status: "completed",
      slots: { create: [{ startsAt: new Date(endsAt.getTime() - 3 * 3_600_000), endsAt }] },
    },
  });
  const enrollment = await db.enrollment.create({
    data: {
      sessionId: session.id,
      participantId: participant.id,
      status: "present",
      source: "back_office",
      participantType: participant.type,
      motivation: "Ma motivation personnelle",
    },
  });
  await db.document.create({
    data: {
      type: "enrollment_confirmation",
      recipientEmail: participant.email,
      enrollmentId: enrollment.id,
      sessionId: session.id,
    },
  });
  await db.auditLog.create({
    data: {
      userId: actor.id,
      action: "create",
      entity: "participant",
      entityId: participant.id,
      after: { email: participant.email },
    },
  });
  return { actor, company, participant, enrollment };
}

describe("GDPR", () => {
  it("exports everything stored about a participant", async () => {
    const { participant } = await externalWithEnrollment(new Date("2026-01-10T12:00:00Z"));
    const data = await exportParticipantData(participant.id);
    expect(data?.participant.email).toBe(participant.email);
    expect(data?.enrollments).toHaveLength(1);
    expect(data?.enrollments[0].documents[0].type).toBe("enrollment_confirmation");
    expect(data?.history).toHaveLength(1);
  });

  it("anonymizes identity and keeps the enrollment as a proof", async () => {
    const { actor, company, participant, enrollment } = await externalWithEnrollment(new Date("2026-01-10T12:00:00Z"));
    await anonymizeParticipant(participant.id, actor.id, "Demande écrite");

    const after = await db.participant.findUniqueOrThrow({ where: { id: participant.id } });
    expect(after).toMatchObject({
      firstName: "Participant",
      lastName: "anonymisé",
      phone: null,
      email: `anonyme+${participant.id}@anonymise.invalid`,
    });
    expect(after.anonymizedAt).not.toBeNull();
    expect((await db.enrollment.findUniqueOrThrow({ where: { id: enrollment.id } })).status).toBe("present");
    expect((await db.enrollment.findUniqueOrThrow({ where: { id: enrollment.id } })).motivation).toBeNull();
    expect((await db.company.findUniqueOrThrow({ where: { id: company.id } })).mainContactId).toBeNull();
    expect((await db.document.findFirstOrThrow({ where: { enrollmentId: enrollment.id } })).recipientEmail).toBeNull();
    const logs = await db.auditLog.findMany({ where: { entity: "participant", entityId: participant.id } });
    expect(JSON.stringify(logs)).not.toContain(participant.email);
    await expect(anonymizeParticipant(participant.id, actor.id, "x")).rejects.toBeInstanceOf(PrivacyError);
  });

  it("lists participants whose last training is past the retention period", async () => {
    const old = await externalWithEnrollment(new Date("2019-03-01T12:00:00Z"));
    const recent = await externalWithEnrollment(new Date("2026-03-01T12:00:00Z"));
    const ids = (await participantsPastRetention(new Date("2026-10-22T00:00:00Z"), 5)).map(
      (participant) => participant.id,
    );
    expect(ids).toContain(old.participant.id);
    expect(ids).not.toContain(recent.participant.id);
  });
});
