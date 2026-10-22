import { afterAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { EnrollmentError, enrollParticipant, updateEnrollment } from "@/server/services/enrollments";
import { allocateReference, createSessionRecord } from "@/server/services/sessions";

const stamp = Date.now();

async function fixture(capacityMax: number, participants: number) {
  const actor = await db.user.create({
    data: { email: `actor-${stamp}-${Math.random()}@test.example`, role: "admin" },
  });
  const company = await db.company.create({ data: { name: `Test ${stamp}` } });
  const training = await db.training.create({
    data: {
      title: `Test ${stamp}`,
      slug: `test-${stamp}-${Math.random().toString(36).slice(2)}`,
      objectives: "x",
      durationHours: 7,
      modality: "in_person",
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
      openToInternal: true,
      openToExternal: true,
      internalNotes: null,
      trainerIds: [],
      slots: [{ id: null, startsAt: new Date("2030-01-10T08:00:00Z"), endsAt: new Date("2030-01-10T11:30:00Z") }],
    }),
  );
  await db.trainingSession.update({ where: { id: session.id }, data: { status: "published" } });
  const people = await Promise.all(
    Array.from({ length: participants }, (_, index) =>
      db.participant.create({
        data: {
          type: "external",
          companyId: company.id,
          firstName: `P${index}`,
          lastName: "Test",
          email: `p${index}-${stamp}-${Math.random()}@test.example`,
        },
      }),
    ),
  );
  return { actor, session, people };
}

afterAll(async () => {
  await db.$disconnect();
});

describe("enrollments against the database", () => {
  it("never overbooks under concurrent enrollments (rule 1)", async () => {
    const { actor, session, people } = await fixture(2, 8);
    const results = await Promise.all(
      people.map((participant) =>
        db.$transaction((tx) =>
          enrollParticipant(tx, {
            sessionId: session.id,
            participantId: participant.id,
            source: "back_office",
            actorId: actor.id,
          }),
        ),
      ),
    );
    expect(results.filter((enrollment) => enrollment.status === "confirmed")).toHaveLength(2);
    expect(results.filter((enrollment) => enrollment.status === "waitlisted")).toHaveLength(6);
    const refreshed = await db.trainingSession.findUniqueOrThrow({ where: { id: session.id } });
    expect(refreshed.status).toBe("full");
  });

  it("promotes the first waitlisted participant when a seat is freed (rule 2)", async () => {
    const { actor, session, people } = await fixture(1, 3);
    const enrollments = [];
    for (const participant of people) {
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
    const { promoted } = await updateEnrollment(
      enrollments[0].id,
      { status: "cancelled", appliedPrice: null, billingCompanyId: null, cancellationReason: "test" },
      actor.id,
    );
    expect(promoted).toEqual([enrollments[1].id]);
    const statuses = await db.enrollment.findMany({ where: { sessionId: session.id }, orderBy: { enrolledAt: "asc" } });
    expect(statuses.map((enrollment) => enrollment.status).sort()).toEqual(["cancelled", "confirmed", "waitlisted"]);
  });

  it("refuses a second enrollment of the same participant (rule 4)", async () => {
    const { actor, session, people } = await fixture(5, 1);
    const enroll = () =>
      db.$transaction((tx) =>
        enrollParticipant(tx, {
          sessionId: session.id,
          participantId: people[0].id,
          source: "back_office",
          actorId: actor.id,
        }),
      );
    await enroll();
    await expect(enroll()).rejects.toBeInstanceOf(EnrollmentError);
  });

  it("refuses externals on a session closed to externals (rule 6)", async () => {
    const { actor, session, people } = await fixture(5, 1);
    await db.trainingSession.update({ where: { id: session.id }, data: { openToExternal: false } });
    await expect(
      db.$transaction((tx) =>
        enrollParticipant(tx, {
          sessionId: session.id,
          participantId: people[0].id,
          source: "back_office",
          actorId: actor.id,
        }),
      ),
    ).rejects.toThrow("n'est pas ouverte aux participants externes");
  });

  it("allocates unique sequential references under concurrency", async () => {
    const year = 2090 + (stamp % 9);
    const references = await Promise.all(
      Array.from({ length: 5 }, () =>
        db.$transaction((tx) =>
          allocateReference(tx, year).then(async (reference) => {
            const training = await tx.training.findFirstOrThrow();
            await tx.trainingSession.create({ data: { trainingId: training.id, reference, capacityMax: 1 } });
            return reference;
          }),
        ),
      ),
    );
    expect(new Set(references).size).toBe(5);
    expect(references.sort()[0]).toMatch(new RegExp(`^FORM-${year}-\\d{3}$`));
  });
});
