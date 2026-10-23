import { readFile } from "node:fs/promises";
import path from "node:path";
import { parseEml } from "../../src/server/email/eml";
import { withDb } from "./db";

/** Text of the latest email of a type sent to a recipient (local outbox). */
export async function lastEmailText(recipient: string, type: string): Promise<string | null> {
  const row = await withDb(async (client) => {
    const result = await client.query<{ file_path: string | null }>(
      `SELECT file_path FROM documents WHERE recipient_email = $1 AND type = $2 AND file_path IS NOT NULL ORDER BY created_at DESC LIMIT 1`,
      [recipient, type],
    );
    return result.rows[0];
  });
  if (!row?.file_path) return null;
  const raw = await readFile(path.join(process.cwd(), ".storage", row.file_path), "utf8");
  return parseEml(raw).text;
}

export function firstLink(text: string | null, pathPrefix: string): string | null {
  const match = text?.match(new RegExp(`https?://[^\\s]+${pathPrefix}[A-Za-z0-9_-]+`));
  return match ? new URL(match[0]).pathname : null;
}
