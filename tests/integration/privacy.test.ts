import { afterAll, describe, expect, it } from "vitest";
import { unzipSync } from "fflate";
import { db } from "@/lib/db";
import { storeBuffer } from "@/server/storage";
import {
  anonymizeParticipant,
  exportParticipantArchive,
  exportParticipantData,
  participantsPastRetention,
  PrivacyError,
  proofFilesPastRetention,
  purgeTechnicalData,
  setLegalHold,
} from "@/server/services/privacy";
import { DEFAULT_RETENTION } from "@/server/domain/privacy";

const NOW = new Date("2026-10-22T00:00:00Z");
const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

afterAll(async () => {
  await db.$disconnect();
});

async function externalWithEnrollment(endsAt: Date, type: "external" | "internal" = "external") {
  const actor = await db.user.create({
    data: { email: `actor-${stamp}-${Math.random()}@test.example`, role: "admin" },
  });
  const company = await db.company.create({ data: { name: `Privacy ${stamp}` } });
  const participant = await db.participant.create({
    data: {
      type,
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
  return { actor, company, participant, enrollment, session };
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

  it("exports the data and the files as a ZIP (E6)", async () => {
    const { participant, enrollment } = await externalWithEnrollment(new Date("2026-01-10T12:00:00Z"));
    const filePath = await storeBuffer("documents/test", "pdf", Buffer.from("%PDF-1.4 test"), "application/pdf");
    await db.document.create({ data: { type: "certificate", enrollmentId: enrollment.id, filePath } });
    const archive = await exportParticipantArchive(participant.id);
    const files = unzipSync(archive!.zip);
    expect(Object.keys(files)).toContain("donnees.json");
    expect(JSON.parse(new TextDecoder().decode(files["donnees.json"])).participant.email).toBe(participant.email);
    expect(Object.keys(files).some((name) => name.endsWith("/documents/certificate.pdf"))).toBe(true);
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
    const ids = (await participantsPastRetention(NOW, DEFAULT_RETENTION)).map((participant) => participant.id);
    expect(ids).toContain(old.participant.id);
    expect(ids).not.toContain(recent.participant.id);
  });

  it("keeps internals while employed and until the internal period after they leave (E5)", async () => {
    const employed = await externalWithEnrollment(new Date("2019-03-01T12:00:00Z"), "internal");
    const leftLongAgo = await externalWithEnrollment(new Date("2019-03-01T12:00:00Z"), "internal");
    const leftRecently = await externalWithEnrollment(new Date("2019-03-01T12:00:00Z"), "internal");
    for (const [fixture, leftAt] of [
      [leftLongAgo, new Date("2020-01-01T00:00:00Z")],
      [leftRecently, new Date("2024-01-01T00:00:00Z")],
    ] as const) {
      const user = await db.user.create({
        data: { email: `internal-${stamp}-${Math.random()}@test.example`, leftAt, active: false },
      });
      await db.participant.update({ where: { id: fixture.participant.id }, data: { userId: user.id } });
    }
    const ids = (await participantsPastRetention(NOW, DEFAULT_RETENTION)).map((participant) => participant.id);
    expect(ids).not.toContain(employed.participant.id);
    expect(ids).toContain(leftLongAgo.participant.id);
    expect(ids).not.toContain(leftRecently.participant.id);
    const shorter = await participantsPastRetention(NOW, { ...DEFAULT_RETENTION, internalYears: 2 });
    expect(shorter.map((participant) => participant.id)).toContain(leftRecently.participant.id);
  });

  it("never purges under legal hold (E5)", async () => {
    const heldParticipant = await externalWithEnrollment(new Date("2019-03-01T12:00:00Z"));
    const heldSession = await externalWithEnrollment(new Date("2019-03-01T12:00:00Z"));
    await setLegalHold(
      { kind: "participant", id: heldParticipant.participant.id },
      "Contrôle OPCO",
      heldParticipant.actor.id,
    );
    await setLegalHold({ kind: "session", id: heldSession.session.id }, "Litige", heldSession.actor.id);
    const ids = (await participantsPastRetention(NOW, DEFAULT_RETENTION)).map((participant) => participant.id);
    expect(ids).not.toContain(heldParticipant.participant.id);
    expect(ids).not.toContain(heldSession.participant.id);
    await expect(
      anonymizeParticipant(heldParticipant.participant.id, heldParticipant.actor.id, "x"),
    ).rejects.toBeInstanceOf(PrivacyError);
    const log = await db.auditLog.findFirst({
      where: { entity: "session", entityId: heldSession.session.id, action: "legal_hold" },
    });
    expect(log).not.toBeNull();

    await setLegalHold({ kind: "participant", id: heldParticipant.participant.id }, null, heldParticipant.actor.id);
    const released = await participantsPastRetention(NOW, DEFAULT_RETENTION);
    expect(released.map((participant) => participant.id)).toContain(heldParticipant.participant.id);
  });

  it("deletes proof files only once every trainee of the session is anonymized", async () => {
    const { actor, participant, session } = await externalWithEnrollment(new Date("2019-03-01T12:00:00Z"));
    const sheet = await db.document.create({
      data: { type: "attendance_sheet", sessionId: session.id, filePath: `test/${stamp}-sheet.pdf` },
    });
    const before = await proofFilesPastRetention(NOW, DEFAULT_RETENTION);
    expect(before.documents.map((document) => document.id)).not.toContain(sheet.id);
    await anonymizeParticipant(participant.id, actor.id, "Fin de la durée de conservation");
    const after = await proofFilesPastRetention(NOW, DEFAULT_RETENTION);
    expect(after.documents.map((document) => document.id)).toContain(sheet.id);
  });

  it("purges technical traces and expired links after their own periods (E5)", async () => {
    const { enrollment, session } = await externalWithEnrollment(new Date("2025-03-01T12:00:00Z"));
    const slot = await db.sessionSlot.findFirstOrThrow({ where: { sessionId: session.id } });
    const attendance = await db.attendance.create({
      data: {
        enrollmentId: enrollment.id,
        slotId: slot.id,
        present: true,
        method: "participant_link",
        signedAt: new Date("2025-03-01T10:00:00Z"),
        ipAddress: "203.0.113.7",
        userAgent: "Test browser",
        recordHash: "x",
      },
    });
    const expired = await db.accessToken.create({
      data: {
        purpose: "hot_evaluation",
        tokenHash: `hash-${stamp}-${Math.random()}`,
        enrollmentId: enrollment.id,
        expiresAt: new Date("2026-10-01T00:00:00Z"),
      },
    });
    const live = await db.accessToken.create({
      data: {
        purpose: "hot_evaluation",
        tokenHash: `hash-${stamp}-${Math.random()}`,
        enrollmentId: enrollment.id,
        expiresAt: new Date("2026-10-20T00:00:00Z"),
      },
    });
    const counts = await purgeTechnicalData(NOW, DEFAULT_RETENTION, null);
    expect(counts.technical).toBeGreaterThanOrEqual(1);
    const scrubbed = await db.attendance.findUniqueOrThrow({ where: { id: attendance.id } });
    expect(scrubbed).toMatchObject({ ipAddress: null, userAgent: null, recordHash: "x", present: true });
    expect(await db.accessToken.findUnique({ where: { id: expired.id } })).toBeNull();
    expect(await db.accessToken.findUnique({ where: { id: live.id } })).not.toBeNull();
  });
});
