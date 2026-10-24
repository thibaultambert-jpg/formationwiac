import "server-only";
import { zipSync } from "fflate";
import { db } from "@/lib/db";
import { formatDateTime } from "@/lib/dates";
import { toCsv } from "@/server/domain/csv";
import { addUnique, attachmentSummary, INDEX_HEADER, safeFileName } from "@/server/domain/dossier";
import { EMAIL_TYPE_LABELS } from "@/server/email/default-templates";
import { renderCertificate } from "@/server/pdf/documents";
import { answersCsv, sessionEvaluations, summaryCsv } from "@/server/services/evaluation-summary";
import { attendanceSheet, pdfFilename } from "@/server/services/session-documents";
import { readStoredFile } from "@/server/storage";

const PDF_FOLDERS: Record<string, { folder: string; label: string }> = {
  convocation: { folder: "convocations", label: "Convocation" },
  certificate: { folder: "attestations", label: "Attestation" },
  completion_certificate: { folder: "certificats-realisation", label: "Certificat de réalisation" },
};

function typeLabel(type: string): string {
  return PDF_FOLDERS[type]?.label ?? EMAIL_TYPE_LABELS[type] ?? type;
}

async function addStored(files: Record<string, Uint8Array>, path: string, storagePath: string | null) {
  if (!storagePath) return null;
  const file = await readStoredFile(storagePath);
  return file ? addUnique(files, path, new Uint8Array(file.body)) : null;
}

/**
 * Full dossier of a session (I1): attendance sheet (frozen copy once closed),
 * program, agreements, documents as sent (convocations, certificates,
 * certificates of completion), pedagogical files, emails kept in the outbox,
 * evaluations and an index of every document and send with its fingerprints.
 */
export async function buildSessionDossier(sessionId: string) {
  const session = await db.trainingSession.findUnique({
    where: { id: sessionId },
    include: {
      training: true,
      conventions: { include: { company: { select: { name: true } } }, orderBy: { createdAt: "asc" } },
      enrollments: { include: { participant: true }, orderBy: { enrolledAt: "asc" } },
    },
  });
  if (!session) return null;
  const files: Record<string, Uint8Array> = {};
  const location = new Map<string, string>();

  // The final sheet is the frozen copy once the session is closed (I2).
  const { documents, pdf } = await attendanceSheet(sessionId);
  const sheetPath = addUnique(files, `emargement/${pdfFilename("emargement", documents)}`, new Uint8Array(pdf));

  await addStored(
    files,
    `programme/${safeFileName(`programme-${session.training.title}`)}.pdf`,
    session.training.programPdfPath,
  );

  for (const convention of session.conventions) {
    const base = `conventions/${safeFileName(`${convention.reference}-${convention.company.name}`)}`;
    await addStored(files, `${base}.pdf`, convention.generatedPath);
    await addStored(files, `${base}-signee.pdf`, convention.signedPath);
  }

  const people = new Map(
    session.enrollments.map((enrollment) => [
      enrollment.id,
      safeFileName(`${enrollment.participant.lastName}-${enrollment.participant.firstName}`),
    ]),
  );
  const stored = await db.document.findMany({ where: { sessionId }, orderBy: { createdAt: "asc" } });
  // Documents as sent: the latest PDF of each kind per trainee; every email kept in the outbox.
  const seen = new Set<string>();
  for (const document of [...stored].reverse()) {
    if (document.type === "attendance_sheet") {
      location.set(document.id, sheetPath);
      continue;
    }
    if (!document.filePath) continue;
    if (PDF_FOLDERS[document.type]) {
      const key = `${document.type}:${document.enrollmentId}`;
      if (seen.has(key)) continue;
      seen.add(key);
    }
    const person = document.enrollmentId ? people.get(document.enrollmentId) : null;
    const pdfFolder = PDF_FOLDERS[document.type];
    const path = pdfFolder
      ? `${pdfFolder.folder}/${safeFileName(`${document.type}-${person ?? session.reference}`)}.pdf`
      : `envois/${safeFileName(`${formatDateTime(document.createdAt)}-${document.type}-${person ?? "session"}`)}.eml`;
    if (pdfFolder && !document.filePath.endsWith(".pdf")) continue;
    const added = await addStored(files, path, document.filePath);
    if (added) location.set(document.id, added);
  }

  // Certificates of present trainees that were never stored (sessions closed before archiving).
  for (const enrollment of documents.session.enrollments.filter((item) => item.status === "present")) {
    const has = stored.some(
      (document) =>
        document.type === "certificate" &&
        document.enrollmentId === enrollment.id &&
        document.filePath?.endsWith(".pdf"),
    );
    if (!has)
      addUnique(
        files,
        `attestations/${pdfFilename("attestation", documents, enrollment)}`,
        new Uint8Array(await renderCertificate(documents, enrollment)),
      );
  }

  for (const enrollment of session.enrollments) {
    const person = people.get(enrollment.id)!;
    await addStored(
      files,
      `pedagogie/${person}-analyse-du-besoin${extension(enrollment.needsAnalysisPath)}`,
      enrollment.needsAnalysisPath,
    );
    await addStored(
      files,
      `pedagogie/${person}-positionnement${extension(enrollment.positioningPath)}`,
      enrollment.positioningPath,
    );
    await addStored(
      files,
      `pedagogie/${person}-evaluation-des-acquis${extension(enrollment.learningFilePath)}`,
      enrollment.learningFilePath,
    );
  }

  const evaluations = await Promise.all(
    (["positioning", "hot", "cold", "company", "trainer"] as const).map((type) => sessionEvaluations(sessionId, type)),
  );
  files["evaluations/reponses.csv"] = new TextEncoder().encode(answersCsv(evaluations));
  files["evaluations/synthese.csv"] = new TextEncoder().encode(summaryCsv(evaluations));

  const index = toCsv(
    INDEX_HEADER,
    stored.map((document) => [
      formatDateTime(document.createdAt),
      typeLabel(document.type),
      document.recipientEmail,
      document.subject,
      document.sentAt ? formatDateTime(document.sentAt) : "",
      document.gmailMessageId,
      document.error,
      document.sha256,
      attachmentSummary(document.attachments),
      location.get(document.id) ?? "",
    ]),
  );
  files["index.csv"] = new TextEncoder().encode(index);

  return { reference: session.reference, zip: zipSync(files, { level: 6 }), entries: Object.keys(files) };
}

function extension(path: string | null): string {
  const match = path?.match(/\.[a-z0-9]+$/i);
  return match ? match[0] : "";
}
