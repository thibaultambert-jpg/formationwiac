import { z } from "zod";
import { isValidSiret, normalizeSiret } from "@/server/domain/siret";

// CSV import of external participants into a session (BO, "Inscrits" tab).

export const IMPORT_COLUMNS = ["entreprise", "siret", "prenom", "nom", "email", "fonction", "telephone"] as const;
type ImportColumn = (typeof IMPORT_COLUMNS)[number];

const HEADER_ALIASES: Record<string, ImportColumn> = {
  entreprise: "entreprise",
  societe: "entreprise",
  "raison sociale": "entreprise",
  siret: "siret",
  prenom: "prenom",
  nom: "nom",
  "nom de famille": "nom",
  email: "email",
  "e-mail": "email",
  mail: "email",
  courriel: "email",
  fonction: "fonction",
  poste: "fonction",
  telephone: "telephone",
  tel: "telephone",
  portable: "telephone",
};

function normalizeHeader(value: string): string {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[_.]/g, " ").trim();
}

export type ImportRow = {
  line: number;
  companyName: string;
  siret: string | null;
  firstName: string;
  lastName: string;
  email: string;
  jobTitle: string | null;
  phone: string | null;
};

export type ImportError = { line: number; message: string };

const emailSchema = z.email();

export function parseImportRows(rows: string[][]): { rows: ImportRow[]; errors: ImportError[] } {
  if (rows.length === 0) return { rows: [], errors: [{ line: 1, message: "Le fichier est vide." }] };

  const indexes = new Map<ImportColumn, number>();
  rows[0].forEach((cell, index) => {
    const column = HEADER_ALIASES[normalizeHeader(cell)];
    if (column && !indexes.has(column)) indexes.set(column, index);
  });

  const missing = (["entreprise", "prenom", "nom", "email"] as const).filter((column) => !indexes.has(column));
  if (missing.length > 0) {
    return {
      rows: [],
      errors: [{ line: 1, message: `Colonnes obligatoires manquantes : ${missing.join(", ")}.` }],
    };
  }

  const result: ImportRow[] = [];
  const errors: ImportError[] = [];
  const seenEmails = new Set<string>();

  rows.slice(1).forEach((cells, offset) => {
    const line = offset + 2;
    const get = (column: ImportColumn) => {
      const index = indexes.get(column);
      return index === undefined ? "" : (cells[index] ?? "").trim();
    };

    const email = get("email").toLowerCase();
    const companyName = get("entreprise");
    const firstName = get("prenom");
    const lastName = get("nom");
    const rawSiret = get("siret");
    const siret = rawSiret ? normalizeSiret(rawSiret) : null;

    const problems: string[] = [];
    if (!companyName) problems.push("entreprise manquante");
    if (!firstName) problems.push("prénom manquant");
    if (!lastName) problems.push("nom manquant");
    if (!emailSchema.safeParse(email).success) problems.push("email invalide");
    if (siret && !isValidSiret(siret)) problems.push("SIRET invalide");
    if (seenEmails.has(email)) problems.push("email en double dans le fichier");

    if (problems.length > 0) {
      errors.push({ line, message: problems.join(", ") });
      return;
    }
    seenEmails.add(email);
    result.push({
      line,
      companyName,
      siret,
      firstName,
      lastName,
      email,
      jobTitle: get("fonction") || null,
      phone: get("telephone") || null,
    });
  });

  return { rows: result, errors };
}
