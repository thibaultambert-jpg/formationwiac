import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { sessionCompliance } from "@/server/services/compliance";
import { EnrollmentError, updateEnrollment } from "@/server/services/enrollments";
import { indicatorsByTraining } from "@/server/services/indicators";
import { readAdaptationNeed, recordLearningAssessment, recordNeedsAnalysis } from "@/server/services/pedagogy";
import { saveComplaint, saveImprovement } from "@/server/services/quality";
import {
  sendAbsenceAlerts,
  sendPositioningRequests,
  sendStakeholderEvaluations,
} from "@/server/services/quality-sends";
import { sendCertificates } from "@/server/services/session-documents";

const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
let actorId = "";
let previous: { siret: string | null; activityDeclarationNumber: string | null; alertEmail: string | null } | null =
  null;

beforeAll(async () => {
  actorId = (await db.user.create({ data: { email: `quality-${stamp}@test.example`, role: "admin" } })).id;
  const settings = await db.organizationSettings.findUnique({ where: { id: 1 } });
  previous = settings
    ? {
        siret: settings.siret,
        activityDeclarationNumber: settings.activityDeclarationNumber,
        alertEmail: settings.alertEmail,
      }
    : null;
  await db.organizationSettings.upsert({
    where: { id: 1 },
    update: { siret: "12345678901234", activityDeclarationNumber: "11755555575", alertEmail: "referent@test.example" },
    create: {
      id: 1,
      name: "Organisme test",
      siret: "12345678901234",
      activityDeclarationNumber: "11755555575",
      alertEmail: "referent@test.example",
    },
  });
  for (const type of ["positioning", "company", "trainer"] as const) {
    if ((await db.evaluationQuestion.count({ where: { evaluationType: type } })) === 0)
      await db.evaluationQuestion.create({
        data: { evaluationType: type, position: 1, label: `Question ${type}`, answerType: "scale_1_5" },
      });
  }
});

afterAll(async () => {
  if (previous) await db.organizationSettings.update({ where: { id: 1 }, data: previous });
  await db.$disconnect();
});

async function fixture(options: { startsAt: Date; status?: "published" | "completed"; qualiopiScope?: boolean }) {
  const key = `${stamp}-${Math.random().toString(36).slice(2, 8)}`;
  const training = await db.training.create({
    data: { title: `Qualité ${key}`, slug: `qualite-${key}`, objectives: "x", durationHours: 7, modality: "in_person" },
  });
  const trainer = await db.trainer.create({
    data: { type: "external", firstName: "Tom", lastName: "Formateur", email: `tom-${key}@test.example` },
  });
  const contact = await db.participant.create({
    data: { type: "external", firstName: "Chef", lastName: "Contact", email: `chef-${key}@test.example` },
  });
  const company = await db.company.create({ data: { name: `Client ${key}`, mainContactId: contact.id } });
  const session = await db.trainingSession.create({
    data: {
      trainingId: training.id,
      reference: `Q-${key}`,
      status: options.status ?? "published",
      qualiopiScope: options.qualiopiScope ?? false,
      capacityMax: 5,
      slots: {
        create: [
          { startsAt: options.startsAt, endsAt: new Date(options.startsAt.getTime() + 3.5 * 3_600_000) },
          {
            startsAt: new Date(options.startsAt.getTime() + 4.5 * 3_600_000),
            endsAt: new Date(options.startsAt.getTime() + 8 * 3_600_000),
          },
        ],
      },
      trainers: { create: [{ trainerId: trainer.id }] },
    },
    include: { slots: { orderBy: { startsAt: "asc" } } },
  });
  const participant = await db.participant.create({
    data: {
      type: "external",
      companyId: company.id,
      firstName: "Léa",
      lastName: "Stagiaire",
      email: `lea-${key}@test.example`,
    },
  });
  const enrollment = await db.enrollment.create({
    data: {
      sessionId: session.id,
      participantId: participant.id,
      status: options.status === "completed" ? "present" : "confirmed",
      source: "back_office",
      participantType: "external",
      agreementWaivedAt: new Date(),
      agreementWaiverReason: "Test",
    },
  });
  return { session, enrollment, trainer, company };
}

describe("pedagogical follow-up (D2, D5, D8)", () => {
  it("records the needs analysis and the learning assessment, which satisfy the requirements", async () => {
    const { session, enrollment } = await fixture({ startsAt: new Date("2031-05-05T07:00:00Z"), qualiopiScope: true });
    const before = await sessionCompliance(session.id);
    const keys = (row: (typeof before.rows)[number]) =>
      row.requirements.filter((item) => item.blocking && !item.satisfied).map((item) => item.key);
    expect(keys(before.rows[0])).toEqual(expect.arrayContaining(["needs_analysis", "positioning", "learning"]));

    await recordNeedsAnalysis(enrollment.id, { note: "Monter en compétence sur Excel", file: null }, actorId);
    await recordLearningAssessment(
      enrollment.id,
      { result: "partially_acquired", comment: "À consolider", file: null },
      { userId: actorId, label: "Admin" },
    );
    const after = await sessionCompliance(session.id);
    expect(keys(after.rows[0])).not.toContain("needs_analysis");
    expect(keys(after.rows[0])).not.toContain("learning");
  });

  it("logs every read of the adaptation need without its content", async () => {
    const { enrollment } = await fixture({ startsAt: new Date("2031-05-06T07:00:00Z") });
    await db.enrollment.update({ where: { id: enrollment.id }, data: { adaptationNeed: "Salle accessible PMR" } });
    expect(await readAdaptationNeed(enrollment.id, actorId)).toBe("Salle accessible PMR");
    const log = await db.auditLog.findFirstOrThrow({
      where: { entity: "enrollment", entityId: enrollment.id, action: "read_sensitive" },
    });
    expect(JSON.stringify(log)).not.toContain("PMR");
  });
});

describe("dropout (D6)", () => {
  it("requires a reason and a started session", async () => {
    const future = await fixture({ startsAt: new Date("2031-06-01T07:00:00Z") });
    const update = { appliedPrice: null, billingCompanyId: null, cancellationReason: null };
    await expect(
      updateEnrollment(future.enrollment.id, { ...update, status: "dropped_out", dropoutReason: "Maladie" }, actorId),
    ).rejects.toBeInstanceOf(EnrollmentError);

    const started = await fixture({ startsAt: new Date(Date.now() - 2 * 3_600_000) });
    await expect(
      updateEnrollment(started.enrollment.id, { ...update, status: "dropped_out", dropoutReason: " " }, actorId),
    ).rejects.toBeInstanceOf(EnrollmentError);
    await updateEnrollment(
      started.enrollment.id,
      { ...update, status: "dropped_out", dropoutReason: "Mutation" },
      actorId,
    );
    const row = await db.enrollment.findUniqueOrThrow({ where: { id: started.enrollment.id } });
    expect(row).toMatchObject({ status: "dropped_out", dropoutReason: "Mutation" });
    expect(row.droppedOutAt).not.toBeNull();
  });
});

describe("certificates of the Qualiopi scope wait for the learning assessment (D5)", () => {
  it("holds then sends the certificate", async () => {
    const { session, enrollment } = await fixture({
      startsAt: new Date("2025-03-03T07:00:00Z"),
      status: "completed",
      qualiopiScope: true,
    });
    const held = await sendCertificates(session.id, { automatic: true, actorId: null });
    expect(held).toMatchObject({ sent: 0, held: 1 });
    await recordLearningAssessment(
      enrollment.id,
      { result: "acquired", comment: null, file: null },
      { userId: actorId, label: "Admin" },
    );
    expect((await sendCertificates(session.id, { automatic: true, actorId: null })).sent).toBe(1);
  });
});

describe("quality sends (D3, D6, D9)", () => {
  it("sends the positioning questionnaire once", async () => {
    const { session } = await fixture({ startsAt: new Date("2031-07-07T07:00:00Z") });
    expect((await sendPositioningRequests(session.id, { automatic: true, actorId: null })).sent).toBe(1);
    expect((await sendPositioningRequests(session.id, { automatic: true, actorId: null })).sent).toBe(0);
    expect(await db.document.count({ where: { sessionId: session.id, type: "positioning_request" } })).toBe(1);
  });

  it("alerts the referent once per unsigned slot", async () => {
    const startsAt = new Date(Date.now() - 6 * 3_600_000);
    const { session } = await fixture({ startsAt });
    const now = new Date(session.slots[0].endsAt.getTime() + 20 * 60_000);
    expect(await sendAbsenceAlerts(now)).toBeGreaterThanOrEqual(1);
    await sendAbsenceAlerts(now);
    expect(
      await db.document.count({
        where: { sessionId: session.id, type: "absence_alert", recipientEmail: "referent@test.example" },
      }),
    ).toBe(1);
  });

  it("sends the company and trainer questionnaires after the closure", async () => {
    const { session, company, trainer } = await fixture({
      startsAt: new Date("2025-04-07T07:00:00Z"),
      status: "completed",
    });
    const report = await sendStakeholderEvaluations(session.id, { automatic: true, actorId: null });
    expect(report.sent).toBe(2);
    const evaluations = await db.stakeholderEvaluation.findMany({ where: { sessionId: session.id } });
    expect(evaluations.map((item) => item.subjectId).sort()).toEqual([company.id, trainer.id].sort());
    expect((await sendStakeholderEvaluations(session.id, { automatic: true, actorId: null })).sent).toBe(0);
  });
});

describe("quality registers and indicators (D1, D10, D11)", () => {
  it("records complaints and improvements with their closing dates", async () => {
    const complaint = await saveComplaint(
      null,
      {
        receivedAt: new Date(),
        complainant: "Client",
        channel: "Email",
        sessionId: null,
        subject: `Retard ${stamp}`,
        description: "Formateur en retard",
        treatment: null,
        response: null,
        status: "open",
      },
      actorId,
    );
    const closed = await saveComplaint(
      complaint.id,
      { ...complaint, status: "closed", response: "Excuses et rappel au formateur" },
      actorId,
    );
    expect(closed.closedAt).not.toBeNull();
    const action = await saveImprovement(
      null,
      {
        source: "complaint",
        complaintId: complaint.id,
        origin: null,
        action: "Rappel des horaires aux formateurs",
        owner: "Responsable pédagogique",
        dueDate: null,
        status: "done",
        result: null,
      },
      actorId,
    );
    expect(action.closedAt).not.toBeNull();
    expect(await db.auditLog.count({ where: { entity: "complaint", entityId: complaint.id } })).toBe(2);
  });

  it("computes the indicators of a training", async () => {
    const { session, enrollment } = await fixture({ startsAt: new Date("2034-02-06T08:00:00Z"), status: "completed" });
    await db.attendance.create({
      data: {
        enrollmentId: enrollment.id,
        slotId: session.slots[0].id,
        present: true,
        method: "participant_link",
        signedAt: session.slots[0].startsAt,
      },
    });
    const row = (await indicatorsByTraining(2034)).find((item) => item.trainingId === session.trainingId);
    expect(row).toMatchObject({ trainees: 1, sessions: 1, attendanceRate: 50, dropoutRate: 0 });
  });
});
