import "server-only";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { getEnv } from "@/lib/env";

// File storage: Supabase Storage (private bucket) when configured, otherwise
// the local `.storage/` directory in development. Paths are stored in the
// database and files are always served through authenticated route handlers.

const LOCAL_ROOT = path.join(process.cwd(), ".storage");

export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024; // Vercel functions accept ~4.5 MB bodies.

export type UploadKind = "pdf" | "document" | "image";

const ALLOWED_TYPES: Record<UploadKind, Record<string, string>> = {
  pdf: { "application/pdf": "pdf" },
  document: {
    "application/pdf": "pdf",
    "application/msword": "doc",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  },
  image: { "image/png": "png", "image/jpeg": "jpg" },
};

const KIND_LABELS: Record<UploadKind, string> = {
  pdf: "PDF",
  document: "PDF ou Word",
  image: "PNG ou JPEG",
};

const CONTENT_TYPES: Record<string, string> = {
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  png: "image/png",
  jpg: "image/jpeg",
};

export class UploadError extends Error {}

function supabaseConfig() {
  const env = getEnv();
  if (env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY) {
    return {
      url: env.SUPABASE_URL.replace(/\/$/, ""),
      key: env.SUPABASE_SERVICE_ROLE_KEY,
      bucket: env.SUPABASE_STORAGE_BUCKET,
    };
  }
  if (process.env.NODE_ENV === "production" && process.env.ALLOW_LOCAL_STORAGE !== "1") {
    throw new Error("Supabase Storage is not configured (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY).");
  }
  return null;
}

function safeLocalPath(storagePath: string): string {
  const resolved = path.resolve(LOCAL_ROOT, storagePath);
  if (!resolved.startsWith(`${LOCAL_ROOT}${path.sep}`)) throw new Error("Invalid storage path");
  return resolved;
}

/** Returns null when no file was selected. */
export function readUpload(value: FormDataEntryValue | null): File | null {
  if (!value || typeof value === "string" || value.size === 0) return null;
  return value;
}

/** Validates and stores an uploaded file under `folder/`, returning its storage path. */
export async function storeUpload(file: File, folder: string, kind: UploadKind): Promise<string> {
  const extension = ALLOWED_TYPES[kind][file.type];
  if (!extension) throw new UploadError(`Format de fichier non accepté : ${KIND_LABELS[kind]} attendu.`);
  if (file.size > MAX_UPLOAD_BYTES) throw new UploadError("Le fichier dépasse la taille maximale de 4 Mo.");

  const storagePath = `${folder}/${randomUUID()}.${extension}`;
  const body = Buffer.from(await file.arrayBuffer());
  const supabase = supabaseConfig();

  if (supabase) {
    const response = await fetch(`${supabase.url}/storage/v1/object/${supabase.bucket}/${storagePath}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${supabase.key}`, "Content-Type": file.type, "x-upsert": "false" },
      body,
    });
    if (!response.ok) throw new Error(`Supabase Storage upload failed: ${response.status} ${await response.text()}`);
  } else {
    const target = safeLocalPath(storagePath);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, body);
  }
  return storagePath;
}

export async function readStoredFile(storagePath: string): Promise<{ body: Buffer; contentType: string } | null> {
  const extension = storagePath.split(".").pop() ?? "";
  const contentType = CONTENT_TYPES[extension] ?? "application/octet-stream";
  const supabase = supabaseConfig();

  if (supabase) {
    const response = await fetch(`${supabase.url}/storage/v1/object/${supabase.bucket}/${storagePath}`, {
      headers: { Authorization: `Bearer ${supabase.key}` },
    });
    if (response.status === 404 || response.status === 400) return null;
    if (!response.ok) throw new Error(`Supabase Storage download failed: ${response.status}`);
    return { body: Buffer.from(await response.arrayBuffer()), contentType };
  }

  try {
    return { body: await readFile(safeLocalPath(storagePath)), contentType };
  } catch {
    return null;
  }
}
