// Full session dossier (compliance audit I1): naming of the ZIP entries and
// index of every document and send. Pure functions, unit tested.

export function safeFileName(value: string): string {
  return (
    value
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^A-Za-z0-9._-]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "")
      .toLowerCase() || "fichier"
  );
}

/** Adds a file to the ZIP under a unique path (a suffix is added on collision). */
export function addUnique(files: Record<string, Uint8Array>, path: string, content: Uint8Array): string {
  let candidate = path;
  const dot = path.lastIndexOf(".");
  const [base, extension] = dot > path.lastIndexOf("/") ? [path.slice(0, dot), path.slice(dot)] : [path, ""];
  for (let index = 2; candidate in files; index++) candidate = `${base}-${index}${extension}`;
  files[candidate] = content;
  return candidate;
}

export type IndexDocument = {
  id: string;
  type: string;
  createdAt: Date;
  sentAt: Date | null;
  recipientEmail: string | null;
  subject: string | null;
  gmailMessageId: string | null;
  error: string | null;
  sha256: string | null;
  attachments: unknown;
};

/** "name (sha256)" of each attachment traced with an email. */
export function attachmentSummary(attachments: unknown): string {
  if (!Array.isArray(attachments)) return "";
  return attachments
    .map((item) => {
      const entry = item as { name?: string; sha256?: string; version?: string | null };
      return `${entry.name ?? "?"}${entry.version ? ` v${entry.version}` : ""} (${entry.sha256 ?? "?"})`;
    })
    .join(" | ");
}

export const INDEX_HEADER = [
  "Date",
  "Type",
  "Destinataire",
  "Objet",
  "Envoyé le",
  "Identifiant Gmail",
  "Erreur",
  "Empreinte SHA-256",
  "Pièces jointes",
  "Fichier dans le dossier",
];
