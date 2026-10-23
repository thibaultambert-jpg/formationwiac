import { afterAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { withRetentionPurge } from "@/server/retention";
import { AttendanceError, recordCorrection, signParticipant } from "@/server/services/attendance";
import { issueToken, resolveAttendanceLink } from "@/server/tokens";

const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
// A 1x1 PNG, as sent by the signature pad.
const PNG = `data:image/png;base64,${Buffer.concat([
  Buffer.from("89504e470d0a1a0a", "hex"),
  Buffer.alloc(120, 1),
]).toString("base64")}`;

afterAll(async () => {
  await db.$disconnect();
});

async function fixture() {
  const training = await db.training.create({
    data: {
      title: `Emargement ${stamp}`,
      slug: `emargement-${stamp}-${Math.random()}`,
      objectives: "x",
      durationHours: 3.5,
      modality: "in_person",
    },
  });
  const now = Date.now();
  const session = await db.trainingSession.create({
    data: {
      trainingId: training.id,
      reference: `EM-${stamp}-${Math.random().toString(36).slice(2, 6)}`,
      status: "published",
      capacityMax: 5,
      location: "Salle",
      slots: { create: [{ startsAt: new Date(now - 10 * 60_000), endsAt: new Date(now + 3 * 3_600_000) }] },
    },
    include: { slots: true },
  });
  const participant = await db.participant.create({
    data: {
      type: "internal",
      firstName: "Eva",
      lastName: "Signe",
      email: `eva-${stamp}-${Math.random()}@test.example`,
    },
  });
  const enrollment = await db.enrollment.create({
    data: {
      sessionId: session.id,
      participantId: participant.id,
      status: "confirmed",
      source: "back_office",
      participantType: "internal",
    },
  });
  return { session, slot: session.slots[0], enrollment };
}

describe("probative attendance against the database", () => {
  it("signs once with a single-use per-slot link and fingerprints the record", async () => {
    const { slot, enrollment } = await fixture();
    const token = await issueToken(db, {
      purpose: "attendance",
      enrollmentId: enrollment.id,
      slotId: slot.id,
      validFrom: new Date(slot.startsAt.getTime() - 30 * 60_000),
      expiresAt: new Date(slot.endsAt.getTime() + 60 * 60_000),
    });
    const link = await resolveAttendanceLink(token);
    expect(link.status).toBe("ok");
    if (link.status !== "ok") return;

    const attendance = await signParticipant({
      enrollmentId: enrollment.id,
      slotId: slot.id,
      method: "participant_link",
      signature: PNG,
      tokenId: link.record.id,
      actorId: null,
      ipAddress: "203.0.113.7",
      userAgent: "Vitest",
    });
    expect(attendance.recordHash).toMatch(/^[0-9a-f]{64}$/);
    expect(attendance.signatureSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(attendance).toMatchObject({ tokenId: link.record.id, userAgent: "Vitest", ipAddress: "203.0.113.7" });
    expect((await resolveAttendanceLink(token)).status).toBe("used");
    await expect(
      signParticipant({
        enrollmentId: enrollment.id,
        slotId: slot.id,
        method: "participant_link",
        signature: PNG,
        tokenId: link.record.id,
        actorId: null,
        ipAddress: null,
        userAgent: null,
      }),
    ).rejects.toBeInstanceOf(AttendanceError);
  });

  it("refuses links outside their window", async () => {
    const { slot, enrollment } = await fixture();
    const future = await issueToken(db, {
      purpose: "attendance",
      enrollmentId: enrollment.id,
      slotId: slot.id,
      validFrom: new Date(Date.now() + 3_600_000),
      expiresAt: new Date(Date.now() + 7_200_000),
    });
    expect((await resolveAttendanceLink(future)).status).toBe("not_yet");
    const expired = await issueToken(db, {
      purpose: "attendance",
      enrollmentId: enrollment.id,
      slotId: slot.id,
      expiresAt: new Date(Date.now() - 1000),
    });
    expect((await resolveAttendanceLink(expired)).status).toBe("invalid");
    // Legacy session-wide links (no slot) are not accepted any more.
    const legacy = await issueToken(db, {
      purpose: "attendance",
      enrollmentId: enrollment.id,
      expiresAt: new Date(Date.now() + 3_600_000),
    });
    expect((await resolveAttendanceLink(legacy)).status).toBe("invalid");
  });

  it("forbids any UPDATE or DELETE of attendance records, except in the retention purge (C5)", async () => {
    const { slot, enrollment } = await fixture();
    const attendance = await signParticipant({
      enrollmentId: enrollment.id,
      slotId: slot.id,
      method: "trainer_device",
      signature: PNG,
      tokenId: null,
      actorId: null,
      ipAddress: null,
      userAgent: null,
    });
    await expect(db.attendance.update({ where: { id: attendance.id }, data: { present: false } })).rejects.toThrow();
    await expect(db.attendance.delete({ where: { id: attendance.id } })).rejects.toThrow();
    await expect(
      db.$executeRaw`UPDATE attendances SET signed_at = now() WHERE id = ${attendance.id}::uuid`,
    ).rejects.toThrow(/ni modifiés ni supprimés/);

    await withRetentionPurge((tx) =>
      tx.attendance.update({ where: { id: attendance.id }, data: { ipAddress: null, userAgent: null } }),
    );
    // The flag is local to the purge transaction.
    await expect(db.attendance.update({ where: { id: attendance.id }, data: { present: false } })).rejects.toThrow();
  });

  it("appends corrections with their reason; the latest one decides", async () => {
    const { slot, enrollment } = await fixture();
    await expect(
      recordCorrection({
        enrollmentId: enrollment.id,
        slotId: slot.id,
        state: "absent",
        eventAt: null,
        reason: " ",
        authorUserId: null,
        authorTrainerId: null,
      }),
    ).rejects.toBeInstanceOf(AttendanceError);
    await recordCorrection({
      enrollmentId: enrollment.id,
      slotId: slot.id,
      state: "absent",
      eventAt: null,
      reason: "Malade",
      authorUserId: null,
      authorTrainerId: null,
    });
    await recordCorrection({
      enrollmentId: enrollment.id,
      slotId: slot.id,
      state: "late",
      eventAt: new Date(),
      reason: "Arrivé finalement",
      authorUserId: null,
      authorTrainerId: null,
    });
    const corrections = await db.attendanceCorrection.findMany({ where: { enrollmentId: enrollment.id } });
    expect(corrections.map((item) => item.state).sort()).toEqual(["absent", "late"]);
    expect(corrections.every((item) => /^[0-9a-f]{64}$/.test(item.recordHash))).toBe(true);
    await expect(
      db.attendanceCorrection.update({ where: { id: corrections[0].id }, data: { reason: "x" } }),
    ).rejects.toThrow();
  });
});
