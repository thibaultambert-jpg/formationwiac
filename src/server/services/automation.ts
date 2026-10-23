import "server-only";
import { db } from "@/lib/db";
import { audit } from "@/server/audit";
import {
  attendanceLinkDays,
  closureDue,
  coldEvaluationDue,
  evaluationReminderDue,
  reminderDue,
} from "@/server/domain/automation";
import { DEFAULT_EMAIL_TEMPLATES } from "@/server/email/default-templates";
import { sessionVariables } from "@/server/email/notifications";
import { sendEmail } from "@/server/email/send";
import { renderTemplate } from "@/server/email/template";
import {
  anonymizeParticipant,
  participantsPastRetention,
  PrivacyError,
  purgeProofFiles,
} from "@/server/services/privacy";
import {
  closeSession,
  sendAttendanceLinks,
  sendCertificates,
  sendEvaluationRequests,
} from "@/server/services/session-documents";
import { issueToken } from "@/server/tokens";
import { getEnv } from "@/lib/env";

export type AutomationReport = {
  reminders: number;
  attendanceLinks: number;
  closedSessions: number;
  certificates: number;
  hotEvaluations: number;
  coldEvaluations: number;
  evaluationReminders: number;
  anonymized: number;
  purgedFiles: number;
  errors: string[];
};

const sessionInclude = {
  training: { select: { title: true } },
  slots: { orderBy: { startsAt: "asc" as const }, select: { id: true, startsAt: true, endsAt: true } },
  trainers: { include: { trainer: true } },
};

async function template(key: "reminder" | "evaluation_reminder") {
  return (
    (await db.emailTemplate.findUnique({ where: { key } })) ?? DEFAULT_EMAIL_TEMPLATES.find((item) => item.key === key)!
  );
}

async function step(report: AutomationReport, name: string, run: () => Promise<void>) {
  try {
    await run();
  } catch (error) {
    console.error(`Automation step failed: ${name}`, error);
    report.errors.push(`${name} : ${error instanceof Error ? error.message : "erreur inconnue"}`);
  }
}

/**
 * Scheduled job (section 8). Every rule is a "due now?" check with a dedup
 * key, so the job can run hourly or daily, and twice without duplicates.
 */
export async function runScheduledTasks(now = new Date(), actorId: string | null = null): Promise<AutomationReport> {
  const report: AutomationReport = {
    reminders: 0,
    attendanceLinks: 0,
    closedSessions: 0,
    certificates: 0,
    hotEvaluations: 0,
    coldEvaluations: 0,
    evaluationReminders: 0,
    anonymized: 0,
    purgedFiles: 0,
    errors: [],
  };
  const settings = await db.organizationSettings.findUnique({ where: { id: 1 } });
  const reminderDays = settings?.reminderDaysBefore ?? 3;
  const coldDays = settings?.coldEvaluationDays ?? 60;
  const evaluationReminderDays = settings?.evaluationReminderDays ?? 5;
  const retentionYears = settings?.dataRetentionYears ?? 5;

  const active = await db.trainingSession.findMany({
    where: { status: { in: ["published", "full"] }, slots: { some: {} } },
    include: sessionInclude,
  });

  // Reminder J-X to confirmed participants and trainers.
  await step(report, "Rappels", async () => {
    const mail = await template("reminder");
    for (const session of active) {
      if (!reminderDue(session.slots[0].startsAt, reminderDays, now)) continue;
      const common = await sessionVariables(session);
      const enrollments = await db.enrollment.findMany({
        where: { sessionId: session.id, status: "confirmed" },
        include: { participant: true },
      });
      const recipients = [
        ...enrollments
          .filter((e) => !e.participant.anonymizedAt)
          .map((e) => ({
            key: `reminder:${e.id}`,
            enrollmentId: e.id,
            email: e.participant.email,
            firstName: e.participant.firstName,
            lastName: e.participant.lastName,
          })),
        ...session.trainers.map(({ trainer }) => ({
          key: `reminder:trainer:${session.id}:${trainer.id}`,
          enrollmentId: null,
          email: trainer.email,
          firstName: trainer.firstName,
          lastName: trainer.lastName,
        })),
      ];
      for (const recipient of recipients) {
        const variables = { ...common, prenom: recipient.firstName, nom: recipient.lastName };
        const result = await sendEmail({
          type: "reminder",
          to: recipient.email,
          subject: renderTemplate(mail.subject, variables),
          text: renderTemplate(mail.body, variables),
          sessionId: session.id,
          enrollmentId: recipient.enrollmentId,
          dedupKey: recipient.key,
        });
        if (result.ok) report.reminders++;
      }
    }
  });

  // Attendance link on each session day.
  await step(report, "Liens d'émargement", async () => {
    for (const session of active) {
      for (const day of attendanceLinkDays(session.slots, now)) {
        report.attendanceLinks += (await sendAttendanceLinks(session.id, { day: day.day })).sent;
      }
    }
  });

  // Closure after the last slot: presence, certificates, hot evaluation.
  await step(report, "Clôture des sessions", async () => {
    for (const session of active) {
      if (!closureDue(session.slots.at(-1)!.endsAt, now)) continue;
      const result = await closeSession(session.id, actorId);
      if (!result) continue;
      report.closedSessions++;
      report.certificates += result.certificates.sent;
      report.hotEvaluations += result.evaluations.sent;
    }
  });

  // Certificates held at closure (missing SIRET or NDA for externals, B1): sent
  // as soon as possible; the dedup keys prevent any double send.
  await step(report, "Attestations en attente", async () => {
    const held = await db.trainingSession.findMany({
      where: {
        status: "completed",
        enrollments: { some: { status: "present", documents: { none: { type: "certificate" } } } },
      },
      select: { id: true },
    });
    for (const session of held) {
      report.certificates += (await sendCertificates(session.id, { automatic: true, actorId })).sent;
    }
  });

  // Cold evaluation at J+N after the end.
  await step(report, "Évaluations à froid", async () => {
    const completed = await db.trainingSession.findMany({
      where: {
        status: "completed",
        enrollments: { some: { status: "present", evaluations: { none: { type: "cold" } } } },
      },
      include: { slots: { orderBy: { startsAt: "asc" }, select: { endsAt: true } } },
    });
    for (const session of completed) {
      const lastEnd = session.slots.at(-1)?.endsAt;
      if (!lastEnd || !coldEvaluationDue(lastEnd, coldDays, now)) continue;
      report.coldEvaluations += (await sendEvaluationRequests(session.id, "cold", { automatic: true, actorId })).sent;
    }
  });

  // Evaluation reminders N days after the request when not answered.
  await step(report, "Relances d'évaluation", async () => {
    const mail = await template("evaluation_reminder");
    const pending = await db.evaluation.findMany({
      where: { submittedAt: null, reminderSentAt: null, sentAt: { not: null } },
      include: { enrollment: { include: { participant: true, session: { include: sessionInclude } } } },
    });
    for (const evaluation of pending) {
      if (
        !evaluationReminderDue(evaluation.sentAt!, evaluationReminderDays, now) ||
        evaluation.enrollment.participant.anonymizedAt
      )
        continue;
      const token = await issueToken(db, {
        purpose: evaluation.type === "hot" ? "hot_evaluation" : "cold_evaluation",
        enrollmentId: evaluation.enrollmentId,
        expiresAt: new Date(now.getTime() + 30 * 24 * 3_600_000),
      });
      const variables = {
        ...(await sessionVariables(evaluation.enrollment.session)),
        prenom: evaluation.enrollment.participant.firstName,
        nom: evaluation.enrollment.participant.lastName,
        lien_evaluation: `${getEnv().APP_URL.replace(/\/$/, "")}/evaluation/${token}`,
      };
      const result = await sendEmail({
        type: "evaluation_reminder",
        to: evaluation.enrollment.participant.email,
        subject: renderTemplate(mail.subject, variables),
        text: renderTemplate(mail.body, variables),
        sessionId: evaluation.enrollment.sessionId,
        enrollmentId: evaluation.enrollmentId,
        dedupKey: `evaluation_reminder:${evaluation.type}:${evaluation.enrollmentId}`,
      });
      if (result.ok) {
        report.evaluationReminders++;
        await db.evaluation.update({ where: { id: evaluation.id }, data: { reminderSentAt: now } });
      }
    }
  });

  // GDPR retention: anonymize and purge proofs past the retention period.
  await step(report, "Durée de conservation", async () => {
    for (const participant of await participantsPastRetention(now, retentionYears)) {
      try {
        await anonymizeParticipant(participant.id, actorId, "Fin de la durée de conservation");
        report.anonymized++;
      } catch (error) {
        if (!(error instanceof PrivacyError)) throw error;
      }
    }
    report.purgedFiles = await purgeProofFiles(now, retentionYears, actorId);
  });

  const changed = Object.entries(report).some(([key, value]) =>
    key === "errors" ? report.errors.length > 0 : value !== 0,
  );
  if (changed || actorId) {
    await audit(db, {
      userId: actorId,
      action: "automation",
      entity: "settings",
      entityId: "automation",
      after: report,
    });
  }
  return report;
}
