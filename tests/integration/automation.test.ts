import { afterAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { runScheduledTasks } from "@/server/services/automation";

const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
const paris = (iso: string) => new Date(iso); // ISO strings below carry the Paris offset (+01:00 in January)

afterAll(async () => {
  await db.$disconnect();
});

async function fixture() {
  const training = await db.training.create({
    data: {
      title: `Auto ${stamp}`,
      slug: `auto-${stamp}`,
      objectives: "Objectifs",
      durationHours: 7,
      modality: "in_person",
    },
  });
  const trainer = await db.trainer.create({
    data: { type: "external", firstName: "Tom", lastName: "Formateur", email: `tom-${stamp}@test.example` },
  });
  const session = await db.trainingSession.create({
    data: {
      trainingId: training.id,
      reference: `AUTO-${stamp}`,
      status: "published",
      capacityMax: 5,
      location: "Salle",
      slots: {
        create: [
          { startsAt: paris("2031-01-14T09:00:00+01:00"), endsAt: paris("2031-01-14T12:30:00+01:00") },
          { startsAt: paris("2031-01-14T13:30:00+01:00"), endsAt: paris("2031-01-14T17:00:00+01:00") },
        ],
      },
      trainers: { create: [{ trainerId: trainer.id }] },
    },
    include: { slots: { orderBy: { startsAt: "asc" } } },
  });
  const company = await db.company.create({ data: { name: `Auto ${stamp}` } });
  const [present, absent] = await Promise.all(
    ["present", "absent"].map((name) =>
      db.participant.create({
        data: {
          type: "external",
          companyId: company.id,
          firstName: name,
          lastName: "Auto",
          email: `${name}-${stamp}@test.example`,
        },
      }),
    ),
  );
  const enrollments = await Promise.all(
    [present, absent].map((participant) =>
      db.enrollment.create({
        data: { sessionId: session.id, participantId: participant.id, status: "confirmed", source: "back_office" },
      }),
    ),
  );
  return { session, enrollments };
}

async function sends(sessionId: string, type: string) {
  return db.document.count({ where: { sessionId, type: type as never, error: null } });
}

describe("scheduled tasks", () => {
  it("sends each automatic email once, closes the session and follows up evaluations", async () => {
    const { session, enrollments } = await fixture();

    // J-3 reminder, idempotent.
    await runScheduledTasks(paris("2031-01-11T06:30:00+01:00"));
    await runScheduledTasks(paris("2031-01-11T08:30:00+01:00"));
    expect(await sends(session.id, "reminder")).toBe(3); // 2 participants + 1 trainer

    // Attendance links on the morning of the day, idempotent.
    await runScheduledTasks(paris("2031-01-14T05:00:00+01:00"));
    expect(await sends(session.id, "attendance_link")).toBe(0);
    await runScheduledTasks(paris("2031-01-14T07:00:00+01:00"));
    await runScheduledTasks(paris("2031-01-14T11:00:00+01:00"));
    expect(await sends(session.id, "attendance_link")).toBe(2);
    expect(await sends(session.id, "trainer_attendance_link")).toBe(1);

    // One participant signed the morning.
    await db.attendance.create({
      data: { enrollmentId: enrollments[0].id, slotId: session.slots[0].id, present: true, signedAt: new Date() },
    });

    // Closure after the last slot: presence, certificate and hot evaluation for the present one.
    await runScheduledTasks(paris("2031-01-14T17:30:00+01:00"));
    await runScheduledTasks(paris("2031-01-14T18:30:00+01:00"));
    expect((await db.trainingSession.findUniqueOrThrow({ where: { id: session.id } })).status).toBe("completed");
    const statuses = await db.enrollment.findMany({
      where: { sessionId: session.id },
      orderBy: { participant: { firstName: "desc" } },
    });
    expect(statuses.map((enrollment) => enrollment.status)).toEqual(["present", "absent"]);
    expect(await sends(session.id, "certificate")).toBe(2); // the PDF document + its email
    expect(
      await db.document.count({
        where: { sessionId: session.id, type: "certificate", filePath: { endsWith: ".pdf" } },
      }),
    ).toBe(1);
    expect(await sends(session.id, "evaluation_request")).toBe(1);

    // Reminder 5 days later when not answered, then cold evaluation at J+60.
    await runScheduledTasks(paris("2031-01-20T07:00:00+01:00"));
    await runScheduledTasks(paris("2031-01-21T07:00:00+01:00"));
    expect(await sends(session.id, "evaluation_reminder")).toBe(1);
    await runScheduledTasks(paris("2031-03-15T07:00:00+01:00"));
    await runScheduledTasks(paris("2031-03-16T07:00:00+01:00"));
    expect(await sends(session.id, "evaluation_request")).toBe(2);
    expect(await db.evaluation.count({ where: { enrollmentId: enrollments[0].id } })).toBe(2);
  }, 60_000);
});
