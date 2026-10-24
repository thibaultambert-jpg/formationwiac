import "server-only";
import type { DocumentType, EvaluationType } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { formatSlot, formatWeekday, toParisDateInput } from "@/lib/dates";
import { getEnv } from "@/lib/env";
import { audit } from "@/server/audit";
import { attended, linkWindow, sha256, slotAttendance } from "@/server/domain/attendance-proof";
import { presenceAtClosure } from "@/server/domain/automation";
import {
  inQualiopiScope,
  isPublicFunding,
  missingOrganizationIdentifiers,
  qualiopiExternal,
  type FundingTypeValue,
} from "@/server/domain/compliance";
import { DEFAULT_EMAIL_TEMPLATES } from "@/server/email/default-templates";
import type { MailAttachment } from "@/server/email/mime";
import { sessionVariables } from "@/server/email/notifications";
import { sendEmail } from "@/server/email/send";
import { renderTemplate, withPrivacyNotice } from "@/server/email/template";
import { loadSessionDocuments, type SessionDocuments } from "@/server/pdf/data";
import {
  renderAttendanceSheet,
  renderCertificate,
  renderCompletionCertificate,
  renderConvocation,
} from "@/server/pdf/documents";
import { readStoredFile, storeBuffer } from "@/server/storage";
import { attendanceMargins } from "@/server/services/attendance";
import { issueToken } from "@/server/tokens";

const DAY = 24 * 3_600_000;
const EVALUATION_LINK_DAYS = 30;

export type SendReport = {
  sent: number;
  skipped: number;
  failed: number;
  /** Certificates held until the learning assessment is recorded (D5). */
  held?: number;
};

/** Business rule violation of a manual send, shown to the user as is. */
export class DocumentError extends Error {}

/** Documents sent to external trainees must show the SIRET and the NDA (B1). */
function identifiersError(documents: SessionDocuments): string | null {
  const missing = missingOrganizationIdentifiers(documents.organization);
  return missing.length === 0
    ? null
    : `Renseignez le ${missing.join(" et le ")} dans Paramètres › Organisme avant d'envoyer des documents aux participants externes.`;
}
const emptyReport = (): SendReport => ({ sent: 0, skipped: 0, failed: 0 });

function count(report: SendReport, result: { ok: boolean; skipped?: boolean }) {
  if (result.skipped) report.skipped++;
  else if (result.ok) report.sent++;
  else report.failed++;
}

function appUrl(path: string): string {
  return `${getEnv().APP_URL.replace(/\/$/, "")}${path}`;
}

async function template(key: DocumentType) {
  return (
    (await db.emailTemplate.findUnique({ where: { key } })) ?? DEFAULT_EMAIL_TEMPLATES.find((item) => item.key === key)!
  );
}

function safeName(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function pdfFilename(
  kind: string,
  documents: SessionDocuments,
  enrollment?: SessionDocuments["session"]["enrollments"][number],
): string {
  const person = enrollment ? `-${enrollment.participant.lastName}-${enrollment.participant.firstName}` : "";
  return `${safeName(`${kind}-${documents.session.reference}${person}`)}.pdf`;
}

/** Stores a generated PDF and traces it in `documents`. */
async function storePdf(type: DocumentType, buffer: Buffer, sessionId: string, enrollmentId: string | null) {
  const filePath = await storeBuffer(`documents/${sessionId}`, "pdf", buffer, "application/pdf");
  return db.document.create({
    data: { type, sessionId, enrollmentId, filePath, generatedAt: new Date(), sha256: sha256(buffer) },
  });
}

/** Trainees who receive a certificate of completion (B6): externals and publicly funded enrollments. */
export function needsCompletionCertificate(enrollment: { participantType: string; fundingType: FundingTypeValue }) {
  return enrollment.participantType === "external" || isPublicFunding(enrollment.fundingType);
}

async function requireDocuments(sessionId: string): Promise<SessionDocuments> {
  const documents = await loadSessionDocuments(sessionId);
  if (!documents) throw new Error(`Session ${sessionId} not found`);
  return documents;
}

function activeEnrollments(documents: SessionDocuments, statuses: readonly string[]) {
  return documents.session.enrollments.filter(
    (enrollment) => statuses.includes(enrollment.status) && !enrollment.participant.anonymizedAt,
  );
}

/** Convocation PDF + program PDF to every confirmed participant (manual BO action). */
export async function sendConvocations(sessionId: string, actorId: string): Promise<SendReport> {
  const documents = await requireDocuments(sessionId);
  const report = emptyReport();
  const mail = await template("convocation");
  const common = await sessionVariables(documents.session);
  const program = documents.session.training.programPdfPath
    ? await readStoredFile(documents.session.training.programPdfPath)
    : null;

  const recipients = activeEnrollments(documents, ["confirmed"]);
  const blocked = identifiersError(documents);
  if (blocked && recipients.some((enrollment) => enrollment.participantType === "external"))
    throw new DocumentError(blocked);
  for (const enrollment of recipients) {
    const pdf = await renderConvocation(documents, enrollment);
    await storePdf("convocation", pdf, sessionId, enrollment.id);
    const attachments: MailAttachment[] = [
      { filename: pdfFilename("convocation", documents, enrollment), contentType: "application/pdf", content: pdf },
    ];
    if (program)
      attachments.push({
        filename: `programme-${safeName(documents.session.training.title)}.pdf`,
        contentType: "application/pdf",
        content: program.body,
        trace: { kind: "program", version: documents.session.training.programPdfPath ?? undefined },
      });
    const variables = { ...common, prenom: enrollment.participant.firstName, nom: enrollment.participant.lastName };
    count(
      report,
      await sendEmail({
        type: "convocation",
        to: enrollment.participant.email,
        subject: renderTemplate(mail.subject, variables),
        text: withPrivacyNotice(renderTemplate(mail.body, variables), mail.body, common.mention_rgpd!),
        attachments,
        sessionId,
        enrollmentId: enrollment.id,
      }),
    );
  }
  await audit(db, {
    userId: actorId,
    action: "send",
    entity: "session",
    entityId: sessionId,
    after: { type: "convocation", ...report },
  });
  return report;
}

/**
 * Personal attendance links: to confirmed participants and to the trainers
 * (with the list of enrollees). `day` is the Paris day for automatic sends,
 * used as dedup key; manual sends are never deduplicated.
 */
export async function sendAttendanceLinks(
  sessionId: string,
  options: { day?: string; actorId?: string | null } = {},
): Promise<SendReport> {
  const documents = await requireDocuments(sessionId);
  const { session } = documents;
  const report = emptyReport();
  const lastEnd = session.slots.at(-1)?.endsAt ?? new Date();
  const expiresAt = new Date(lastEnd.getTime() + DAY);
  const common = await sessionVariables(session);
  const participantMail = await template("attendance_link");
  const trainerMail = await template("trainer_attendance_link");
  const enrollments = activeEnrollments(documents, ["confirmed", "present"]);

  // One single-use link per slot, valid only around that slot (C2): the slots of
  // the day for automatic sends, the slots not over yet for manual sends.
  const margins = await attendanceMargins();
  const now = new Date();
  const slots = session.slots.filter((slot) =>
    options.day
      ? toParisDateInput(slot.startsAt) === options.day
      : linkWindow(slot, margins).expiresAt.getTime() > now.getTime(),
  );
  if (slots.length === 0) return report;

  for (const enrollment of enrollments) {
    const lines: string[] = [];
    for (const slot of slots) {
      const window = linkWindow(slot, margins);
      const token = await issueToken(db, {
        purpose: "attendance",
        enrollmentId: enrollment.id,
        slotId: slot.id,
        validFrom: window.validFrom,
        expiresAt: window.expiresAt,
      });
      lines.push(
        `- ${formatWeekday(slot.startsAt)} ${formatSlot(slot.startsAt, slot.endsAt)} : ${appUrl(`/emargement/${token}`)}`,
      );
    }
    const variables = {
      ...common,
      prenom: enrollment.participant.firstName,
      nom: enrollment.participant.lastName,
      lien_emargement: lines.join("\n"),
    };
    count(
      report,
      await sendEmail({
        type: "attendance_link",
        to: enrollment.participant.email,
        subject: renderTemplate(participantMail.subject, variables),
        text: renderTemplate(participantMail.body, variables),
        sessionId,
        enrollmentId: enrollment.id,
        dedupKey: options.day ? `attendance_link:${enrollment.id}:${options.day}` : undefined,
      }),
    );
  }

  const list = enrollments
    .map(
      (enrollment) =>
        `- ${enrollment.participant.firstName} ${enrollment.participant.lastName}${enrollment.participant.company ? ` (${enrollment.participant.company.name})` : ""}`,
    )
    .join("\n");
  for (const { trainer } of session.trainers) {
    const token = await issueToken(db, { purpose: "trainer_attendance", sessionId, trainerId: trainer.id, expiresAt });
    const variables = {
      ...common,
      prenom: trainer.firstName,
      nom: trainer.lastName,
      inscrits: list || "Aucun inscrit",
      lien_emargement: appUrl(`/emargement/formateur/${token}`),
    };
    count(
      report,
      await sendEmail({
        type: "trainer_attendance_link",
        to: trainer.email,
        subject: renderTemplate(trainerMail.subject, variables),
        text: renderTemplate(trainerMail.body, variables),
        sessionId,
        dedupKey: options.day ? `trainer_attendance_link:${sessionId}:${trainer.id}:${options.day}` : undefined,
      }),
    );
  }
  if (options.actorId !== undefined) {
    await audit(db, {
      userId: options.actorId,
      action: "send",
      entity: "session",
      entityId: sessionId,
      after: { type: "attendance_link", day: options.day ?? null, ...report },
    });
  }
  return report;
}

/** Hot or cold evaluation request to present participants who have not answered yet. */
export async function sendEvaluationRequests(
  sessionId: string,
  type: EvaluationType,
  options: { automatic: boolean; actorId: string | null },
): Promise<SendReport> {
  const documents = await requireDocuments(sessionId);
  const report = emptyReport();
  const mail = await template("evaluation_request");
  const common = await sessionVariables(documents.session);
  for (const enrollment of activeEnrollments(documents, ["present"])) {
    const evaluation = await db.evaluation.upsert({
      where: { enrollmentId_type: { enrollmentId: enrollment.id, type } },
      update: {},
      create: { enrollmentId: enrollment.id, type },
    });
    if (evaluation.submittedAt) {
      report.skipped++;
      continue;
    }
    const token = await issueToken(db, {
      purpose: type === "hot" ? "hot_evaluation" : "cold_evaluation",
      enrollmentId: enrollment.id,
      expiresAt: new Date(Date.now() + EVALUATION_LINK_DAYS * DAY),
    });
    const variables = {
      ...common,
      prenom: enrollment.participant.firstName,
      nom: enrollment.participant.lastName,
      lien_evaluation: appUrl(`/evaluation/${token}`),
    };
    const result = await sendEmail({
      type: "evaluation_request",
      to: enrollment.participant.email,
      subject: renderTemplate(mail.subject, variables) + (type === "cold" ? " (à froid)" : ""),
      text: renderTemplate(mail.body, variables),
      sessionId,
      enrollmentId: enrollment.id,
      dedupKey: options.automatic ? `evaluation:${type}:${enrollment.id}` : undefined,
    });
    count(report, result);
    if (result.ok)
      await db.evaluation.update({ where: { id: evaluation.id }, data: { sentAt: evaluation.sentAt ?? new Date() } });
  }
  if (!options.automatic) {
    await audit(db, {
      userId: options.actorId,
      action: "send",
      entity: "session",
      entityId: sessionId,
      after: { type: `evaluation_${type}`, ...report },
    });
  }
  return report;
}

/** Certificate PDF to every present participant (automatic at closure, or from the BO). */
export async function sendCertificates(
  sessionId: string,
  options: { automatic: boolean; actorId: string | null },
): Promise<SendReport> {
  const documents = await requireDocuments(sessionId);
  const report = emptyReport();
  const mail = await template("certificate");
  const common = await sessionVariables(documents.session);
  const blocked = identifiersError(documents);
  const recipients = activeEnrollments(documents, ["present"]);
  if (blocked && !options.automatic && recipients.some((enrollment) => enrollment.participantType === "external"))
    throw new DocumentError(blocked);
  const inScope = inQualiopiScope(documents.session, documents.session.enrollments);
  for (const enrollment of recipients) {
    // Automatic send: external certificates wait until the identifiers are set
    // (no dedup key is claimed, so the next run sends them).
    if (blocked && enrollment.participantType === "external") {
      report.failed++;
      continue;
    }
    // Externals of the Qualiopi scope: the certificate carries the learning
    // assessment, so it waits until it is recorded (D5); retried by the job.
    if (qualiopiExternal(enrollment.participantType, inScope) && !enrollment.learningResult) {
      report.held = (report.held ?? 0) + 1;
      continue;
    }
    const dedupKey = options.automatic ? `certificate:${enrollment.id}` : undefined;
    if (dedupKey && (await db.document.findUnique({ where: { dedupKey } }))) {
      report.skipped++;
      continue;
    }
    const pdf = await renderCertificate(documents, enrollment);
    await storePdf("certificate", pdf, sessionId, enrollment.id);
    const attachments: MailAttachment[] = [
      { filename: pdfFilename("attestation", documents, enrollment), contentType: "application/pdf", content: pdf },
    ];
    if (needsCompletionCertificate(enrollment)) {
      const completion = await renderCompletionCertificate(documents, enrollment);
      await storePdf("completion_certificate", completion, sessionId, enrollment.id);
      attachments.push({
        filename: pdfFilename("certificat-realisation", documents, enrollment),
        contentType: "application/pdf",
        content: completion,
        trace: { kind: "completion_certificate" },
      });
    }
    const variables = { ...common, prenom: enrollment.participant.firstName, nom: enrollment.participant.lastName };
    count(
      report,
      await sendEmail({
        type: "certificate",
        to: enrollment.participant.email,
        subject: renderTemplate(mail.subject, variables),
        text: renderTemplate(mail.body, variables),
        attachments,
        sessionId,
        enrollmentId: enrollment.id,
        dedupKey,
      }),
    );
  }
  if (!options.automatic) {
    await audit(db, {
      userId: options.actorId,
      action: "send",
      entity: "session",
      entityId: sessionId,
      after: { type: "certificate", ...report },
    });
  }
  return report;
}

/**
 * Closes a session after its last slot (rule 7): status completed, then each
 * confirmed enrollment becomes present or absent (rule 8). Certificates and
 * the hot evaluation are sent to the present participants.
 */
export async function closeSession(sessionId: string, actorId: string | null) {
  const session = await db.trainingSession.findUniqueOrThrow({
    where: { id: sessionId },
    include: {
      slots: true,
      enrollments: { where: { status: "confirmed" }, include: { attendances: true, corrections: true } },
    },
  });
  if (session.status !== "published" && session.status !== "full" && session.status !== "draft") return null;

  await db.$transaction(async (tx) => {
    await tx.trainingSession.update({ where: { id: sessionId }, data: { status: "completed" } });
    for (const enrollment of session.enrollments) {
      const attendedSlots = session.slots.filter((slot) =>
        attended(
          slotAttendance({
            attendance: enrollment.attendances.find((item) => item.slotId === slot.id) ?? null,
            corrections: enrollment.corrections.filter((item) => item.slotId === slot.id),
          }).state,
        ),
      ).length;
      const status = presenceAtClosure(attendedSlots);
      await tx.enrollment.update({ where: { id: enrollment.id }, data: { status } });
      await audit(tx, {
        userId: actorId,
        action: "status_change",
        entity: "enrollment",
        entityId: enrollment.id,
        before: { status: "confirmed" },
        after: { status, closure: true },
      });
    }
    await audit(tx, {
      userId: actorId,
      action: "status_change",
      entity: "session",
      entityId: sessionId,
      before: { status: session.status },
      after: { status: "completed" },
    });
  });
  await freezeAttendanceSheet(sessionId);
  const certificates = await sendCertificates(sessionId, { automatic: true, actorId });
  const evaluations = await sendEvaluationRequests(sessionId, "hot", { automatic: true, actorId });
  return { certificates, evaluations };
}

/**
 * Freezes the final attendance sheet of a closed session (C7, I2): the PDF is
 * stored with its SHA-256 and served as is. A later signature or correction
 * stores a new version; previous versions are kept.
 */
export async function freezeAttendanceSheet(sessionId: string) {
  const documents = await requireDocuments(sessionId);
  const pdf = await renderAttendanceSheet(documents, { final: true });
  const filePath = await storeBuffer(`documents/${sessionId}`, "pdf", pdf, "application/pdf");
  return db.document.create({
    data: { type: "attendance_sheet", sessionId, filePath, generatedAt: new Date(), sha256: sha256(pdf) },
  });
}

/** Attendance sheet: the frozen final version once the session is closed, a provisional one before. */
export async function attendanceSheet(sessionId: string) {
  const documents = await requireDocuments(sessionId);
  if (documents.session.status === "completed") {
    const frozen = await db.document.findFirst({
      where: { sessionId, type: "attendance_sheet", sha256: { not: null }, filePath: { not: null } },
      orderBy: { createdAt: "desc" },
    });
    const file = frozen?.filePath ? await readStoredFile(frozen.filePath) : null;
    if (file) return { documents, pdf: file.body, sha256: frozen!.sha256, final: true };
    const created = await freezeAttendanceSheet(sessionId);
    const stored = await readStoredFile(created.filePath!);
    return { documents, pdf: stored!.body, sha256: created.sha256, final: true };
  }
  const pdf = await renderAttendanceSheet(documents, { final: false });
  return { documents, pdf, sha256: sha256(pdf), final: false };
}
