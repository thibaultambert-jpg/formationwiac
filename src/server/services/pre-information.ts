import "server-only";
import { db } from "@/lib/db";
import { MODALITY_LABELS } from "@/lib/labels";
import { audit } from "@/server/audit";
import { inQualiopiScope, preInformationRequired } from "@/server/domain/compliance";
import { DEFAULT_EMAIL_TEMPLATES } from "@/server/email/default-templates";
import type { MailAttachment } from "@/server/email/mime";
import { sessionVariables } from "@/server/email/notifications";
import { sendEmail } from "@/server/email/send";
import { renderTemplate, withPrivacyNotice, type TemplateVariables } from "@/server/email/template";
import { currentRegulation } from "@/server/services/legal";
import { readStoredFile } from "@/server/storage";

export type PreInformationReport = { sent: number; skipped: number; failed: number };

const RECIPIENT_STATUSES = ["confirmed", "pending_agreement"] as const;

function hours(value: { toString(): string }): string {
  return `${value.toString().replace(".", ",")} h`;
}

function safeName(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .toLowerCase();
}

/**
 * Prior information of the trainee (B3): full description of the training,
 * contacts, program and internal regulations in force attached. Each send is
 * traced in `documents` with the fingerprint and version of the attachments.
 *
 * Automatic sends (at enrollment and by the scheduled job) only go to the
 * trainees for whom it is required, once (dedup key); a manual send goes to
 * every trainee who has not received it yet, or to the given enrollments.
 */
export async function sendPreTrainingInformation(
  sessionId: string,
  options: { automatic?: boolean; actorId?: string | null; enrollmentIds?: string[] } = {},
): Promise<PreInformationReport> {
  const report: PreInformationReport = { sent: 0, skipped: 0, failed: 0 };
  const session = await db.trainingSession.findUnique({
    where: { id: sessionId },
    include: {
      training: true,
      slots: { orderBy: { startsAt: "asc" }, select: { id: true, startsAt: true, endsAt: true } },
      enrollments: {
        where: {
          status: { in: [...RECIPIENT_STATUSES] },
          ...(options.enrollmentIds ? { id: { in: options.enrollmentIds } } : {}),
        },
        include: {
          participant: true,
          documents: { where: { type: "pre_training_information", sentAt: { not: null } }, select: { id: true } },
        },
      },
    },
  });
  if (!session || session.status === "cancelled") return report;

  const inScope = inQualiopiScope(session, session.enrollments);
  const recipients = session.enrollments.filter((enrollment) => {
    if (enrollment.participant.anonymizedAt) return false;
    if (options.enrollmentIds) return true;
    if (enrollment.documents.length > 0) return false;
    return !options.automatic || preInformationRequired(enrollment.participantType, inScope);
  });
  if (recipients.length === 0) return report;

  const mail =
    (await db.emailTemplate.findUnique({ where: { key: "pre_training_information" } })) ??
    DEFAULT_EMAIL_TEMPLATES.find((item) => item.key === "pre_training_information")!;
  const training = session.training;
  const common: TemplateVariables = {
    ...(await sessionVariables(session)),
    objectifs: training.objectives,
    prerequis: training.prerequisites ?? "Aucun",
    duree: hours(training.durationHours),
    modalite: MODALITY_LABELS[training.modality],
    methodes: training.teachingMethods ?? "—",
    modalites_evaluation: training.evaluationMethods ?? "—",
    accessibilite: training.accessibility ?? "—",
    delai_acces: training.accessDelay ?? "—",
  };

  const attachments: MailAttachment[] = [];
  const program = training.programPdfPath ? await readStoredFile(training.programPdfPath) : null;
  if (program) {
    attachments.push({
      filename: `programme-${safeName(training.title)}.pdf`,
      contentType: "application/pdf",
      content: program.body,
      trace: { kind: "program", version: training.programPdfPath! },
    });
  }
  const regulation = await currentRegulation();
  const regulationFile = regulation ? await readStoredFile(regulation.filePath) : null;
  if (regulation && regulationFile) {
    attachments.push({
      filename: `reglement-interieur-v${regulation.version}.pdf`,
      contentType: "application/pdf",
      content: regulationFile.body,
      trace: { kind: "internal_regulation", version: String(regulation.version) },
    });
  }

  for (const enrollment of recipients) {
    const variables = { ...common, prenom: enrollment.participant.firstName, nom: enrollment.participant.lastName };
    const result = await sendEmail({
      type: "pre_training_information",
      to: enrollment.participant.email,
      subject: renderTemplate(mail.subject, variables),
      text: withPrivacyNotice(renderTemplate(mail.body, variables), mail.body, common.mention_rgpd!),
      attachments,
      sessionId,
      enrollmentId: enrollment.id,
      dedupKey: options.automatic ? `pre-information:${enrollment.id}` : undefined,
    });
    if (result.skipped) report.skipped++;
    else if (result.ok) report.sent++;
    else report.failed++;
  }
  if (report.sent + report.failed > 0) {
    await audit(db, {
      userId: options.actorId ?? null,
      action: "send",
      entity: "session",
      entityId: sessionId,
      after: { type: "pre_training_information", ...report, regulationVersion: regulation?.version ?? null },
    });
  }
  return report;
}

/** Automatic prior information right after an enrollment (B3); waitlisted trainees receive it once promoted. */
export async function sendPreInformationAfterEnrollment(enrollmentId: string): Promise<void> {
  const enrollment = await db.enrollment.findUnique({ where: { id: enrollmentId }, select: { sessionId: true } });
  if (enrollment) await sendPreTrainingInformation(enrollment.sessionId, { automatic: true });
}
