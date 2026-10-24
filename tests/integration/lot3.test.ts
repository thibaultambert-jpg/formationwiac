import { afterAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { bpfSummary } from "@/server/domain/bpf";
import { csvResponse } from "@/server/csv-response";
import { addRegulationVersion, currentRegulation } from "@/server/services/legal";
import { bpfRows } from "@/server/services/bpf";
import { sendPreTrainingInformation } from "@/server/services/pre-information";
import { sessionCompliance } from "@/server/services/compliance";

const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

afterAll(async () => {
  await db.$disconnect();
});

async function fixture(startsAt: Date) {
  const training = await db.training.create({
    data: {
      title: `Lot3 ${stamp}`,
      slug: `lot3-${stamp}-${Math.random().toString(36).slice(2)}`,
      objectives: "Savoir faire",
      durationHours: 7,
      modality: "remote",
      teachingMethods: "Ateliers",
    },
  });
  const session = await db.trainingSession.create({
    data: {
      trainingId: training.id,
      reference: `L3-${stamp}-${Math.random().toString(36).slice(2, 6)}`,
      status: "published",
      capacityMax: 5,
      slots: {
        create: [
          { startsAt, endsAt: new Date(startsAt.getTime() + 3.5 * 3_600_000) },
          {
            startsAt: new Date(startsAt.getTime() + 4.5 * 3_600_000),
            endsAt: new Date(startsAt.getTime() + 8 * 3_600_000),
          },
        ],
      },
    },
    include: { slots: { orderBy: { startsAt: "asc" } } },
  });
  const enrollments = [];
  for (const [index, type] of (["external", "internal"] as const).entries()) {
    const participant = await db.participant.create({
      data: {
        type,
        firstName: `P${index}`,
        lastName: "Lot3",
        email: `p${index}-${stamp}-${Math.random()}@test.example`,
      },
    });
    enrollments.push(
      await db.enrollment.create({
        data: {
          sessionId: session.id,
          participantId: participant.id,
          status: "present",
          source: "back_office",
          participantType: type,
          fundingType: type === "external" ? "opco" : "none",
          appliedPrice: type === "external" ? 1200 : null,
        },
      }),
    );
  }
  return { session, enrollments };
}

describe("prior information (B3)", () => {
  it("sends the information with the regulations in force and satisfies the requirement", async () => {
    const pdf = new File([Buffer.from(`%PDF-1.4 règlement ${stamp}`)], "reglement.pdf", { type: "application/pdf" });
    const actor = await db.user.create({ data: { email: `actor-${stamp}@test.example`, role: "admin" } });
    const version = await addRegulationVersion(pdf, new Date("2020-01-01T00:00:00Z"), actor.id);
    expect((await currentRegulation())?.id).toBe(version.id);

    const { session, enrollments } = await fixture(new Date("2032-03-01T08:00:00Z"));
    // Out of the Qualiopi scope (company funds), agreement waived: only the prior information is missing.
    await db.enrollment.updateMany({
      where: { sessionId: session.id },
      data: { status: "confirmed", agreementWaivedAt: new Date(), agreementWaiverReason: "Test" },
    });
    await db.enrollment.update({ where: { id: enrollments[0].id }, data: { fundingType: "company" } });
    const before = await sessionCompliance(session.id);
    const missing = (keys: typeof before) =>
      keys.rows.flatMap((row) =>
        row.requirements.filter((item) => item.blocking && !item.satisfied).map((item) => item.key),
      );
    expect(missing(before)).toEqual(["pre_information", "needs_analysis"]); // the external only

    // Automatic: only where required (the external), once.
    expect((await sendPreTrainingInformation(session.id, { automatic: true })).sent).toBe(1);
    expect((await sendPreTrainingInformation(session.id, { automatic: true })).sent).toBe(0);
    const document = await db.document.findFirstOrThrow({
      where: { enrollmentId: enrollments[0].id, type: "pre_training_information" },
    });
    expect(document.attachments).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "internal_regulation",
          version: String(version.version),
          sha256: version.sha256,
        }),
      ]),
    );
    expect(missing(await sessionCompliance(session.id))).toEqual(["needs_analysis"]);

    // Manual: everyone who has not received it yet.
    expect((await sendPreTrainingInformation(session.id, { actorId: actor.id })).sent).toBe(1);
  });
});

describe("BPF (B7)", () => {
  it("counts the signed hours of the year and the price", async () => {
    const { session, enrollments } = await fixture(new Date("2033-05-10T07:00:00Z"));
    await db.attendance.create({
      data: {
        enrollmentId: enrollments[0].id,
        slotId: session.slots[0].id,
        present: true,
        method: "participant_link",
        signedAt: session.slots[0].startsAt,
      },
    });
    // Admin mark without signature: not counted.
    await db.attendance.create({
      data: { enrollmentId: enrollments[1].id, slotId: session.slots[0].id, present: true },
    });
    const rows = (await bpfRows(2033)).filter((row) => row.session === session.reference);
    expect(rows.find((row) => row.enrollmentId === enrollments[0].id)).toMatchObject({ hours: 3.5, revenue: 1200 });
    expect(rows.find((row) => row.enrollmentId === enrollments[1].id)).toMatchObject({ hours: 0 });
    const summary = bpfSummary(rows, true);
    expect(summary.total).toMatchObject({ trainees: 1, hours: 3.5, revenue: 1200 });
    expect(await bpfRows(2032).then((list) => list.some((row) => row.session === session.reference))).toBe(false);
  });
});

describe("export audit (G2)", () => {
  it("writes every CSV export to the audit log with its filters", async () => {
    const actor = await db.user.create({ data: { email: `export-${stamp}@test.example`, role: "admin" } });
    const response = await csvResponse("a;b\n", "test", {
      userId: actor.id,
      entity: "session",
      entityId: "list",
      filters: { statut: "published" },
      rows: 1,
    });
    expect(response.headers.get("Content-Type")).toContain("text/csv");
    const log = await db.auditLog.findFirstOrThrow({ where: { userId: actor.id, action: "export" } });
    expect(log.after).toMatchObject({ rows: 1, filters: { statut: "published" } });
  });
});
