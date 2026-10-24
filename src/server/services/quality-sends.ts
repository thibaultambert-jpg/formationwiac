import "server-only";
import { db } from "@/lib/db";
import { formatSlot, formatWeekday } from "@/lib/dates";
import { getEnv } from "@/lib/env";
import { audit } from "@/server/audit";
import { absenceAlertDue } from "@/server/domain/automation";
import { slotAttendance } from "@/server/domain/attendance-proof";
import { DEFAULT_EMAIL_TEMPLATES } from "@/server/email/default-templates";
import { sessionVariables } from "@/server/email/notifications";
import { sendEmail } from "@/server/email/send";
import { renderTemplate } from "@/server/email/template";
import { issueToken } from "@/server/tokens";
import type { DocumentType } from "@/generated/prisma/client";

const DAY = 24 * 3_600_000;
const LINK_DAYS = 30;

export type QualitySendReport = { sent: number; skipped: number; failed: number };

const emptyReport = (): QualitySendReport => ({ sent: 0, skipped: 0, failed: 0 });

function count(report: QualitySendReport, result: { ok: boolean; skipped?: boolean }) {
  if (result.skipped) report.skipped++;
  else if (result.ok) report.sent++;
  else report.failed++;
}

async function template(key: DocumentType) {
  return (
    (await db.emailTemplate.findUnique({ where: { key } })) ?? DEFAULT_EMAIL_TEMPLATES.find((item) => item.key === key)!
  );
}

function link(path: string): string {
  return `${getEnv().APP_URL.replace(/\/$/, "")}${path}`;
}

const sessionInclude = {
  training: true,
  slots: { orderBy: { startsAt: "asc" as const } },
} as const;

/**
 * Entry assessment (D3): questionnaire sent to the trainees before the
 * session, unless already answered or replaced by an uploaded test.
 */
export async function sendPositioningRequests(
  sessionId: string,
  options: { automatic: boolean; actorId: string | null },
): Promise<QualitySendReport> {
  const report = emptyReport();
  const session = await db.trainingSession.findUnique({
    where: { id: sessionId },
    include: {
      ...sessionInclude,
      enrollments: {
        where: { status: { in: ["confirmed", "pending_agreement"] } },
        include: { participant: true, evaluations: { where: { type: "positioning" } } },
      },
    },
  });
  if (!session || session.status === "cancelled" || session.slots.length === 0) return report;
  const questions = await db.evaluationQuestion.count({ where: { evaluationType: "positioning", active: true } });
  if (questions === 0) return report;
  const mail = await template("positioning_request");
  const common = await sessionVariables(session);
  for (const enrollment of session.enrollments) {
    if (enrollment.participant.anonymizedAt) continue;
    if (enrollment.positioningPath || enrollment.evaluations[0]?.submittedAt) {
      report.skipped++;
      continue;
    }
    const evaluation = await db.evaluation.upsert({
      where: { enrollmentId_type: { enrollmentId: enrollment.id, type: "positioning" } },
      update: {},
      create: { enrollmentId: enrollment.id, type: "positioning" },
    });
    const token = await issueToken(db, {
      purpose: "positioning",
      enrollmentId: enrollment.id,
      expiresAt: session.slots.at(-1)!.endsAt,
    });
    const variables = {
      ...common,
      prenom: enrollment.participant.firstName,
      nom: enrollment.participant.lastName,
      lien_evaluation: link(`/evaluation/${token}`),
    };
    const result = await sendEmail({
      type: "positioning_request",
      to: enrollment.participant.email,
      subject: renderTemplate(mail.subject, variables),
      text: renderTemplate(mail.body, variables),
      sessionId,
      enrollmentId: enrollment.id,
      dedupKey: options.automatic ? `positioning:${enrollment.id}` : undefined,
    });
    count(report, result);
    if (result.ok)
      await db.evaluation.update({ where: { id: evaluation.id }, data: { sentAt: evaluation.sentAt ?? new Date() } });
  }
  if (!options.automatic && report.sent + report.failed > 0) {
    await audit(db, {
      userId: options.actorId,
      action: "send",
      entity: "session",
      entityId: sessionId,
      after: { type: "positioning_request", ...report },
    });
  }
  return report;
}

/**
 * Company and trainer questionnaires at the end of a session (D9): one to the
 * main contact of each company of the external trainees, one to each trainer.
 */
export async function sendStakeholderEvaluations(
  sessionId: string,
  options: { automatic: boolean; actorId: string | null },
): Promise<QualitySendReport> {
  const report = emptyReport();
  const session = await db.trainingSession.findUnique({
    where: { id: sessionId },
    include: {
      ...sessionInclude,
      trainers: { include: { trainer: true } },
      enrollments: {
        where: { status: { in: ["present", "dropped_out"] }, participantType: "external" },
        include: { participant: { include: { company: { include: { mainContact: true } } } } },
      },
    },
  });
  if (!session || session.status !== "completed") return report;
  const mail = await template("stakeholder_evaluation_request");
  const common = await sessionVariables(session);

  const targets: {
    type: "company" | "trainer";
    subjectId: string;
    email: string;
    firstName: string;
    lastName: string;
  }[] = [];
  const companies = new Map<string, NonNullable<(typeof session.enrollments)[number]["participant"]["company"]>>();
  for (const enrollment of session.enrollments) {
    const company = enrollment.participant.company;
    if (company) companies.set(company.id, company);
  }
  for (const company of companies.values()) {
    const contact = company.mainContact;
    if (!contact || contact.anonymizedAt) {
      report.skipped++;
      continue;
    }
    targets.push({
      type: "company",
      subjectId: company.id,
      email: contact.email,
      firstName: contact.firstName,
      lastName: contact.lastName,
    });
  }
  for (const { trainer } of session.trainers) {
    targets.push({
      type: "trainer",
      subjectId: trainer.id,
      email: trainer.email,
      firstName: trainer.firstName,
      lastName: trainer.lastName,
    });
  }
  if (targets.length === 0) return report;

  for (const target of targets) {
    const questions = await db.evaluationQuestion.count({ where: { evaluationType: target.type, active: true } });
    if (questions === 0) {
      report.skipped++;
      continue;
    }
    const evaluation = await db.stakeholderEvaluation.upsert({
      where: { sessionId_type_subjectId: { sessionId, type: target.type, subjectId: target.subjectId } },
      update: {},
      create: {
        sessionId,
        type: target.type,
        subjectId: target.subjectId,
        ...(target.type === "company" ? { companyId: target.subjectId } : { trainerId: target.subjectId }),
        recipientEmail: target.email,
      },
    });
    if (evaluation.submittedAt) {
      report.skipped++;
      continue;
    }
    const token = await issueToken(db, {
      purpose: "stakeholder_evaluation",
      stakeholderEvaluationId: evaluation.id,
      sessionId,
      expiresAt: new Date(Date.now() + LINK_DAYS * DAY),
    });
    const variables = {
      ...common,
      prenom: target.firstName,
      nom: target.lastName,
      lien_evaluation: link(`/questionnaire/${token}`),
    };
    const result = await sendEmail({
      type: "stakeholder_evaluation_request",
      to: target.email,
      subject: renderTemplate(mail.subject, variables),
      text: renderTemplate(mail.body, variables),
      sessionId,
      dedupKey: options.automatic ? `stakeholder:${evaluation.id}` : undefined,
    });
    count(report, result);
    if (result.ok)
      await db.stakeholderEvaluation.update({
        where: { id: evaluation.id },
        data: { sentAt: evaluation.sentAt ?? new Date() },
      });
  }
  if (!options.automatic) {
    await audit(db, {
      userId: options.actorId,
      action: "send",
      entity: "session",
      entityId: sessionId,
      after: { type: "stakeholder_evaluation_request", ...report },
    });
  }
  return report;
}

/**
 * Absence alerts (D6): for each slot of the day ended without a signature or
 * a declaration for some trainees, one email to the pedagogical referent
 * (settings alert address, else the contact address), once per slot.
 */
export async function sendAbsenceAlerts(now: Date): Promise<number> {
  const settings = await db.organizationSettings.findUnique({
    where: { id: 1 },
    select: { alertEmail: true, contactEmail: true },
  });
  const to = settings?.alertEmail ?? settings?.contactEmail;
  if (!to) return 0;
  const since = new Date(now.getTime() - DAY);
  const slots = await db.sessionSlot.findMany({
    where: {
      endsAt: { gte: since, lte: now },
      session: { status: { in: ["published", "full", "completed"] } },
    },
    include: {
      session: {
        include: {
          ...sessionInclude,
          enrollments: {
            where: { status: { in: ["confirmed", "present"] } },
            include: { participant: true, attendances: true, corrections: true },
          },
        },
      },
    },
  });
  const mail = await template("absence_alert");
  let sent = 0;
  for (const slot of slots) {
    if (!absenceAlertDue(slot, now)) continue;
    const missing = slot.session.enrollments.filter(
      (enrollment) =>
        slotAttendance({
          attendance: enrollment.attendances.find((item) => item.slotId === slot.id) ?? null,
          corrections: enrollment.corrections.filter((item) => item.slotId === slot.id),
        }).state === "unknown",
    );
    if (missing.length === 0) continue;
    const variables = {
      ...(await sessionVariables(slot.session)),
      creneau: `${formatWeekday(slot.startsAt)} ${formatSlot(slot.startsAt, slot.endsAt)}`,
      inscrits: missing.map((item) => `- ${item.participant.firstName} ${item.participant.lastName}`).join("\n"),
    };
    const result = await sendEmail({
      type: "absence_alert",
      to,
      subject: renderTemplate(mail.subject, variables),
      text: renderTemplate(mail.body, variables),
      sessionId: slot.sessionId,
      dedupKey: `absence-alert:${slot.id}`,
    });
    if (result.ok) sent++;
  }
  return sent;
}
