import { randomUUID } from "node:crypto";

// RFC 2822 / MIME message builder for the Gmail API (raw messages).

export type MailAttachment = { filename: string; contentType: string; content: Buffer | string };

export type MailMessage = {
  from: { name?: string; email: string };
  to: string;
  subject: string;
  text: string;
  html: string;
  attachments?: MailAttachment[];
};

/** RFC 2047 encoded-word for non-ASCII header values. */
export function encodeHeader(value: string): string {
  if (/^[\x20-\x7e]*$/.test(value)) return value;
  return `=?UTF-8?B?${Buffer.from(value, "utf8").toString("base64")}?=`;
}

function base64Lines(content: Buffer | string): string {
  const encoded = Buffer.from(content).toString("base64");
  return encoded.replace(/.{1,76}/g, "$&\r\n").trimEnd();
}

function formatAddress(address: { name?: string; email: string }): string {
  return address.name ? `${encodeHeader(address.name.replace(/"/g, ""))} <${address.email}>` : address.email;
}

export function buildMime(message: MailMessage, options: { boundary?: string; date?: Date } = {}): string {
  const boundary = options.boundary ?? `mixed_${randomUUID()}`;
  const alternative = `alt_${boundary}`;
  const headers = [
    `From: ${formatAddress(message.from)}`,
    `To: ${message.to}`,
    `Subject: ${encodeHeader(message.subject)}`,
    `Date: ${(options.date ?? new Date()).toUTCString()}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
  ];
  const parts = [
    `--${boundary}`,
    `Content-Type: multipart/alternative; boundary="${alternative}"`,
    "",
    `--${alternative}`,
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    base64Lines(message.text),
    `--${alternative}`,
    "Content-Type: text/html; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    base64Lines(message.html),
    `--${alternative}--`,
  ];
  for (const attachment of message.attachments ?? []) {
    parts.push(
      `--${boundary}`,
      `Content-Type: ${attachment.contentType}; name="${encodeHeader(attachment.filename)}"`,
      `Content-Disposition: attachment; filename="${encodeHeader(attachment.filename)}"`,
      "Content-Transfer-Encoding: base64",
      "",
      base64Lines(attachment.content),
    );
  }
  parts.push(`--${boundary}--`, "");
  return [...headers, "", ...parts].join("\r\n");
}

export function base64Url(value: string | Buffer): string {
  return Buffer.from(value).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
