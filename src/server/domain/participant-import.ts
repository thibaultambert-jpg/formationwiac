import { z } from "zod";
import { mapColumns, normalizeHeader, type ColumnSpec, type ImportError } from "@/server/domain/csv-import";
import { isValidSiret, normalizeSiret } from "@/server/domain/siret";

// CSV import of participants into a session (BO, "Inscrits" tab): external
// contacts with their company, or collaborators (internal) found by email.

const IMPORT_COLUMNS = {
  type: { aliases: ["type de participant"] },
  entreprise: { aliases: ["societe", "raison sociale"] },
  siret: { aliases: [] },
  prenom: { aliases: [], required: true },
  nom: { aliases: ["nom de famille"], required: true },
  email: { aliases: ["e-mail", "mail", "courriel"], required: true },
  fonction: { aliases: ["poste"] },
  telephone: { aliases: ["tel", "portable"] },
} satisfies Record<string, ColumnSpec>;

export type ImportRow = {
  line: number;
  type: "internal" | "external";
  companyName: string;
  siret: string | null;
  firstName: string;
  lastName: string;
  email: string;
  jobTitle: string | null;
  phone: string | null;
};

export type { ImportError };

const emailSchema = z.email();

/** "interne"/"externe"; without a type, a row with a company is external and one without is internal. */
function participantType(value: string, companyName: string): "internal" | "external" | undefined {
  const normalized = normalizeHeader(value);
  if (normalized === "") return companyName ? "external" : "internal";
  if (normalized.startsWith("int") || normalized === "collaborateur") return "internal";
  if (normalized.startsWith("ext")) return "external";
  return undefined;
}

export function parseImportRows(rows: string[][]): { rows: ImportRow[]; errors: ImportError[] } {
  if (rows.length === 0) return { rows: [], errors: [{ line: 1, message: "Le fichier est vide." }] };
  const columns = mapColumns(rows[0], IMPORT_COLUMNS);
  if (!columns.ok) return { rows: [], errors: [columns.error] };
  const { get } = columns;

  const result: ImportRow[] = [];
  const errors: ImportError[] = [];
  const seenEmails = new Set<string>();

  rows.slice(1).forEach((cells, offset) => {
    const line = offset + 2;
    const email = get(cells, "email").toLowerCase();
    const companyName = get(cells, "entreprise");
    const type = participantType(get(cells, "type"), companyName);
    const firstName = get(cells, "prenom");
    const lastName = get(cells, "nom");
    const rawSiret = get(cells, "siret");
    const siret = rawSiret ? normalizeSiret(rawSiret) : null;

    const problems: string[] = [];
    if (!type) problems.push("type invalide (interne ou externe)");
    if (type === "external" && !companyName) problems.push("entreprise manquante");
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
      type: type!,
      companyName,
      siret,
      firstName,
      lastName,
      email,
      jobTitle: get(cells, "fonction") || null,
      phone: get(cells, "telephone") || null,
    });
  });

  return { rows: result, errors };
}
