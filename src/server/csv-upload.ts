import "server-only";
import { parseCsv } from "@/server/domain/csv";
import { formatImportErrors, type ImportError } from "@/server/domain/csv-import";
import { errorState, type ActionState } from "@/server/forms";
import { MAX_UPLOAD_BYTES, readUpload } from "@/server/storage";

/** Reads the "file" field of an import form as CSV rows, or the error to show. */
export async function readCsvUpload(
  formData: FormData,
): Promise<{ ok: true; name: string; rows: string[][] } | { ok: false; state: ActionState }> {
  const file = readUpload(formData.get("file"));
  if (!file)
    return { ok: false, state: errorState(formData, "Sélectionnez un fichier CSV.", { file: "Obligatoire." }) };
  if (file.size > MAX_UPLOAD_BYTES) return { ok: false, state: errorState(formData, "Le fichier dépasse 4 Mo.") };
  return { ok: true, name: file.name, rows: parseCsv(await file.text()) };
}

/** Error shown when no line of the file can be imported. */
export function nothingToImport(formData: FormData, errors: readonly ImportError[]): ActionState {
  return errorState(
    formData,
    errors.length > 0 ? `Aucune ligne importée : ${formatImportErrors(errors)}.` : "Aucune ligne à importer.",
  );
}

/** "Import terminé : 3 formateur(s) créé(s), 1 déjà existant(s). Lignes ignorées : …" */
export function importReport(parts: (string | null | false)[], errors: readonly ImportError[], notes: string[] = []) {
  const ignored = errors.length > 0 ? ` Lignes ignorées : ${formatImportErrors(errors)}.` : "";
  const check = notes.length > 0 ? ` À vérifier : ${notes.join(" ")}` : "";
  return `Import terminé : ${parts.filter(Boolean).join(", ")}.${ignored}${check}`;
}
