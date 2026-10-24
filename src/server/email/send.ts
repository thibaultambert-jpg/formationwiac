import "server-only";
import type { DocumentType } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { getEnv } from "@/lib/env";
import { sha256 } from "@/server/domain/attendance-proof";
import { sendWithGmail } from "@/server/email/gmail";
import { buildMime, type MailAttachment } from "@/server/email/mime";
import { textToHtml } from "@/server/email/template";
import { storeBuffer } from "@/server/storage";

export type OutgoingEmail = {
  type: DocumentType;
  to: string;
  subject: string;
  text: string;
  attachments?: MailAttachment[];
  sessionId?: string | null;
  enrollmentId?: string | null;
  /** Idempotency key: a second send with the same key is skipped. */
  dedupKey?: string;
};

export type EmailTransport = "gmail" | "outbox" | "none";

export function emailTransport(): EmailTransport {
  const env = getEnv();
  if (env.GOOGLE_SERVICE_ACCOUNT_KEY && env.GMAIL_SENDER_ADDRESS) return "gmail";
  if (process.env.NODE_ENV !== "production" || process.env.ALLOW_LOCAL_OUTBOX === "1") return "outbox";
  return "none";
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && (error as { code: string }).code === "P2002";
}

/** Name, fingerprint and version of each attachment, kept with the email (B3, D4). */
export function attachmentTrace(attachments: readonly MailAttachment[]) {
  return attachments.map((attachment) => ({
    name: attachment.filename,
    sha256: sha256(attachment.content),
    ...(attachment.trace ? { kind: attachment.trace.kind, version: attachment.trace.version ?? null } : {}),
  }));
}

/**
 * Sends one email and traces it in `documents` (section 8). Never throws:
 * failures are recorded with their error so that enrollments are not blocked.
 * With a dedup key, the document row is claimed before sending, so that two
 * runs of the scheduled job never send the same email twice.
 */
export async function sendEmail(
  email: OutgoingEmail,
): Promise<{ ok: boolean; skipped?: boolean; documentId?: string }> {
  const env = getEnv();
  const base = {
    type: email.type,
    recipientEmail: email.to,
    subject: email.subject,
    sessionId: email.sessionId ?? null,
    enrollmentId: email.enrollmentId ?? null,
    ...(email.attachments?.length ? { attachments: attachmentTrace(email.attachments) } : {}),
  };

  let documentId: string;
  try {
    documentId = (await db.document.create({ data: { ...base, dedupKey: email.dedupKey ?? null } })).id;
  } catch (error) {
    if (email.dedupKey && isUniqueViolation(error)) return { ok: false, skipped: true };
    throw error;
  }

  try {
    const organization = await db.organizationSettings.findUnique({ where: { id: 1 }, select: { name: true } });
    const transport = emailTransport();
    const raw = buildMime({
      from: { name: organization?.name, email: env.GMAIL_SENDER_ADDRESS ?? "formation@localhost" },
      to: email.to,
      subject: email.subject,
      text: email.text,
      html: textToHtml(email.text),
      attachments: email.attachments,
    });

    if (transport === "gmail") {
      const messageId = await sendWithGmail(env.GOOGLE_SERVICE_ACCOUNT_KEY!, env.GMAIL_SENDER_ADDRESS!, raw);
      await db.document.update({ where: { id: documentId }, data: { sentAt: new Date(), gmailMessageId: messageId } });
      return { ok: true, documentId };
    }
    if (transport === "outbox") {
      const filePath = await storeBuffer("boite-envoi", "eml", Buffer.from(raw, "utf8"), "message/rfc822");
      await db.document.update({ where: { id: documentId }, data: { sentAt: new Date(), filePath } });
      return { ok: true, documentId };
    }
    await db.document.update({
      where: { id: documentId },
      data: {
        error: "Envoi impossible : Gmail n'est pas configuré (GOOGLE_SERVICE_ACCOUNT_KEY, GMAIL_SENDER_ADDRESS).",
      },
    });
    return { ok: false, documentId };
  } catch (error) {
    console.error("Email sending failed", error);
    await db.document.update({
      where: { id: documentId },
      data: { error: error instanceof Error ? error.message.slice(0, 500) : "Erreur inconnue" },
    });
    return { ok: false, documentId };
  }
}
