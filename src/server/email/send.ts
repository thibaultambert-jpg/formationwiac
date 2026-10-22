import "server-only";
import type { DocumentType } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { getEnv } from "@/lib/env";
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
};

export type EmailTransport = "gmail" | "outbox" | "none";

export function emailTransport(): EmailTransport {
  const env = getEnv();
  if (env.GOOGLE_SERVICE_ACCOUNT_KEY && env.GMAIL_SENDER_ADDRESS) return "gmail";
  if (process.env.NODE_ENV !== "production" || process.env.ALLOW_LOCAL_OUTBOX === "1") return "outbox";
  return "none";
}

/**
 * Sends one email and traces it in `documents` (section 8). Never throws:
 * failures are recorded with their error so that enrollments are not blocked.
 */
export async function sendEmail(email: OutgoingEmail): Promise<{ ok: boolean; documentId: string }> {
  const env = getEnv();
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

  const base = {
    type: email.type,
    recipientEmail: email.to,
    subject: email.subject,
    sessionId: email.sessionId ?? null,
    enrollmentId: email.enrollmentId ?? null,
  };

  try {
    if (transport === "gmail") {
      const messageId = await sendWithGmail(env.GOOGLE_SERVICE_ACCOUNT_KEY!, env.GMAIL_SENDER_ADDRESS!, raw);
      const document = await db.document.create({ data: { ...base, sentAt: new Date(), gmailMessageId: messageId } });
      return { ok: true, documentId: document.id };
    }
    if (transport === "outbox") {
      const filePath = await storeBuffer("boite-envoi", "eml", Buffer.from(raw, "utf8"), "message/rfc822");
      const document = await db.document.create({ data: { ...base, sentAt: new Date(), filePath } });
      return { ok: true, documentId: document.id };
    }
    const document = await db.document.create({
      data: {
        ...base,
        error: "Envoi impossible : Gmail n'est pas configuré (GOOGLE_SERVICE_ACCOUNT_KEY, GMAIL_SENDER_ADDRESS).",
      },
    });
    return { ok: false, documentId: document.id };
  } catch (error) {
    console.error("Email sending failed", error);
    const document = await db.document.create({
      data: { ...base, error: error instanceof Error ? error.message.slice(0, 500) : "Erreur inconnue" },
    });
    return { ok: false, documentId: document.id };
  }
}
