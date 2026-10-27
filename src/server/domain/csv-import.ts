import { z } from "zod";
import { isValidSiret, normalizeSiret } from "@/server/domain/siret";

// CSV imports of the back office (sessions, trainers, companies, enrollees):
// column mapping, cell parsing and the downloadable templates. Pure functions,
// the database checks are made by the server actions.

export type ImportError = { line: number; message: string };

/** Lowercase, without accents, "_" and "." read as spaces: "Prénom" and "prenom" are the same column. */
export function normalizeHeader(value: string): string {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[_.]/g, " ").replace(/\s+/g, " ").trim();
}

export type ColumnSpec = { aliases: readonly string[]; required?: boolean };

type ColumnReader<K extends string> = (cells: string[], column: K) => string;

/**
 * Maps the header row onto the expected columns. Returns a cell reader, or an
 * error naming the missing required columns.
 */
export function mapColumns<K extends string>(
  header: readonly string[],
  specs: Record<K, ColumnSpec>,
): { ok: true; get: ColumnReader<K> } | { ok: false; error: ImportError } {
  const aliases = new Map<string, K>();
  for (const [key, spec] of Object.entries(specs) as [K, ColumnSpec][]) {
    for (const alias of [key, ...spec.aliases]) aliases.set(normalizeHeader(alias), key);
  }
  const indexes = new Map<K, number>();
  header.forEach((cell, index) => {
    const column = aliases.get(normalizeHeader(cell));
    if (column && !indexes.has(column)) indexes.set(column, index);
  });
  const missing = (Object.entries(specs) as [K, ColumnSpec][])
    .filter(([key, spec]) => spec.required && !indexes.has(key))
    .map(([key]) => key);
  if (missing.length > 0) {
    return { ok: false, error: { line: 1, message: `Colonnes obligatoires manquantes : ${missing.join(", ")}.` } };
  }
  return {
    ok: true,
    get: (cells, column) => {
      const index = indexes.get(column);
      return index === undefined ? "" : (cells[index] ?? "").trim();
    },
  };
}

const TRUE_VALUES = new Set(["oui", "o", "yes", "y", "vrai", "true", "1", "x"]);
const FALSE_VALUES = new Set(["non", "n", "no", "faux", "false", "0"]);

/** "oui"/"non" (and common variants); empty cell → default; anything else → undefined (invalid). */
export function parseYesNo(value: string, fallback: boolean): boolean | undefined {
  const normalized = normalizeHeader(value);
  if (normalized === "") return fallback;
  if (TRUE_VALUES.has(normalized)) return true;
  if (FALSE_VALUES.has(normalized)) return false;
  return undefined;
}

const FRENCH_DATE = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/;
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** "JJ/MM/AAAA" (or "AAAA-MM-JJ") → "AAAA-MM-JJ", or null. Calendar overflow is checked later. */
export function parseDateCell(value: string): string | null {
  const french = FRENCH_DATE.exec(value.trim());
  if (french) return `${french[3]}-${french[2].padStart(2, "0")}-${french[1].padStart(2, "0")}`;
  return ISO_DATE.test(value.trim()) ? value.trim() : null;
}

function parseTimeCell(value: string): string | null {
  const match = /^(\d{1,2})[:hH](\d{2})$/.exec(value.trim());
  return match ? `${match[1].padStart(2, "0")}:${match[2]}` : null;
}

export type SlotCell = { date: string; start: string; end: string };

/**
 * Slots of a session in one cell: "12/11/2026 09:00-12:30 | 12/11/2026 13:30-17:00".
 * Slots are separated by "|", ";" in a quoted cell, or a line break.
 */
export function parseSlotsCell(value: string): { slots: SlotCell[]; invalid: string[] } {
  const slots: SlotCell[] = [];
  const invalid: string[] = [];
  for (const part of value.split(/[|\n;]/).map((item) => item.trim())) {
    if (!part) continue;
    const match = /^(\S+)\s+(\S+)\s*(?:-|–|à)\s*(\S+)$/.exec(part);
    const date = match ? parseDateCell(match[1]) : null;
    const start = match ? parseTimeCell(match[2]) : null;
    const end = match ? parseTimeCell(match[3]) : null;
    if (date && start && end) slots.push({ date, start, end });
    else invalid.push(part);
  }
  return { slots, invalid };
}

/** Several values in one cell, separated by "," "|" or line breaks. */
export function splitList(value: string): string[] {
  return [
    ...new Set(
      value
        .split(/[,|\n]/)
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  ];
}

const emailSchema = z.email();

function isEmail(value: string): boolean {
  return emailSchema.safeParse(value).success;
}

function emptyFile(): ImportError[] {
  return [{ line: 1, message: "Le fichier est vide." }];
}

// ───────────── Trainers ─────────────

const TRAINER_COLUMNS = {
  type: { aliases: ["type de formateur"] },
  prenom: { aliases: [], required: true },
  nom: { aliases: ["nom de famille"], required: true },
  email: { aliases: ["e-mail", "mail", "courriel"], required: true },
  telephone: { aliases: ["tel", "portable"] },
  societe: { aliases: ["entreprise", "organisme"] },
  specialites: { aliases: ["specialite", "domaines"] },
  actif: { aliases: [] },
} satisfies Record<string, ColumnSpec>;

export type TrainerImportRow = {
  line: number;
  type: "internal" | "external";
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  company: string | null;
  specialties: string[];
  active: boolean;
};

function parseTrainerType(value: string): "internal" | "external" | undefined {
  const normalized = normalizeHeader(value);
  if (normalized === "" || normalized.startsWith("ext")) return "external";
  if (normalized.startsWith("int")) return "internal";
  return undefined;
}

export function parseTrainerImport(rows: string[][]): { rows: TrainerImportRow[]; errors: ImportError[] } {
  if (rows.length === 0) return { rows: [], errors: emptyFile() };
  const columns = mapColumns(rows[0], TRAINER_COLUMNS);
  if (!columns.ok) return { rows: [], errors: [columns.error] };
  const { get } = columns;

  const result: TrainerImportRow[] = [];
  const errors: ImportError[] = [];
  const seen = new Set<string>();
  rows.slice(1).forEach((cells, offset) => {
    const line = offset + 2;
    const email = get(cells, "email").toLowerCase();
    const type = parseTrainerType(get(cells, "type"));
    const active = parseYesNo(get(cells, "actif"), true);
    const problems: string[] = [];
    if (!type) problems.push("type invalide (interne ou externe)");
    if (!get(cells, "prenom")) problems.push("prénom manquant");
    if (!get(cells, "nom")) problems.push("nom manquant");
    if (!isEmail(email)) problems.push("email invalide");
    else if (seen.has(email)) problems.push("email en double dans le fichier");
    if (active === undefined) problems.push("actif : oui ou non");
    if (problems.length > 0) {
      errors.push({ line, message: problems.join(", ") });
      return;
    }
    seen.add(email);
    result.push({
      line,
      type: type!,
      firstName: get(cells, "prenom"),
      lastName: get(cells, "nom"),
      email,
      phone: get(cells, "telephone") || null,
      company: get(cells, "societe") || null,
      specialties: splitList(get(cells, "specialites")),
      active: active!,
    });
  });
  return { rows: result, errors };
}

// ───────────── Companies ─────────────

const COMPANY_COLUMNS = {
  raison_sociale: { aliases: ["entreprise", "societe", "nom", "raison sociale"], required: true },
  siret: { aliases: [] },
  adresse: { aliases: ["adresse postale", "rue"] },
  code_postal: { aliases: ["cp"] },
  ville: { aliases: ["commune"] },
  email_facturation: { aliases: ["email de facturation", "facturation"] },
} satisfies Record<string, ColumnSpec>;

export type CompanyImportRow = {
  line: number;
  name: string;
  siret: string | null;
  addressLine: string | null;
  postalCode: string | null;
  city: string | null;
  billingEmail: string | null;
};

export function parseCompanyImport(rows: string[][]): { rows: CompanyImportRow[]; errors: ImportError[] } {
  if (rows.length === 0) return { rows: [], errors: emptyFile() };
  const columns = mapColumns(rows[0], COMPANY_COLUMNS);
  if (!columns.ok) return { rows: [], errors: [columns.error] };
  const { get } = columns;

  const result: CompanyImportRow[] = [];
  const errors: ImportError[] = [];
  const seenSirets = new Set<string>();
  const seenNames = new Set<string>();
  rows.slice(1).forEach((cells, offset) => {
    const line = offset + 2;
    const name = get(cells, "raison_sociale");
    const rawSiret = get(cells, "siret");
    const siret = rawSiret ? normalizeSiret(rawSiret) : null;
    const billingEmail = get(cells, "email_facturation").toLowerCase() || null;
    const problems: string[] = [];
    if (!name) problems.push("raison sociale manquante");
    if (siret && !isValidSiret(siret)) problems.push("SIRET invalide");
    if (billingEmail && !isEmail(billingEmail)) problems.push("email de facturation invalide");
    if (siret && seenSirets.has(siret)) problems.push("SIRET en double dans le fichier");
    else if (!siret && name && seenNames.has(name.toLowerCase())) problems.push("entreprise en double dans le fichier");
    if (problems.length > 0) {
      errors.push({ line, message: problems.join(", ") });
      return;
    }
    if (siret) seenSirets.add(siret);
    seenNames.add(name.toLowerCase());
    result.push({
      line,
      name,
      siret,
      addressLine: get(cells, "adresse") || null,
      postalCode: get(cells, "code_postal") || null,
      city: get(cells, "ville") || null,
      billingEmail,
    });
  });
  return { rows: result, errors };
}

// ───────────── Sessions ─────────────

const SESSION_COLUMNS = {
  formation: { aliases: ["intitule", "titre", "formation slug"], required: true },
  creneaux: { aliases: ["creneau", "dates", "horaires"], required: true },
  capacite_max: { aliases: ["capacite", "places", "capacite maximale"], required: true },
  capacite_min: { aliases: ["capacite minimale", "minimum"] },
  lieu: { aliases: ["adresse"] },
  lien_visio: { aliases: ["visio", "lien"] },
  date_limite: { aliases: ["date limite d'inscription", "date limite inscription", "cloture"] },
  internes: { aliases: ["ouverte aux internes", "collaborateurs"] },
  externes: { aliases: ["ouverte aux externes"] },
  qualiopi: { aliases: ["perimetre qualiopi"] },
  formateurs: { aliases: ["formateur", "emails formateurs"] },
  infos_acces: { aliases: ["informations d'acces", "acces"] },
  notes_internes: { aliases: ["notes"] },
} satisfies Record<string, ColumnSpec>;

export type SessionImportRow = {
  line: number;
  training: string;
  slots: SlotCell[];
  capacityMax: string;
  capacityMin: string | null;
  location: string | null;
  videoLink: string | null;
  /** "AAAA-MM-JJ" */
  registrationDeadline: string | null;
  openToInternal: boolean;
  openToExternal: boolean;
  qualiopiScope: boolean;
  trainerEmails: string[];
  accessInfo: string | null;
  internalNotes: string | null;
};

export function parseSessionImport(rows: string[][]): { rows: SessionImportRow[]; errors: ImportError[] } {
  if (rows.length === 0) return { rows: [], errors: emptyFile() };
  const columns = mapColumns(rows[0], SESSION_COLUMNS);
  if (!columns.ok) return { rows: [], errors: [columns.error] };
  const { get } = columns;

  const result: SessionImportRow[] = [];
  const errors: ImportError[] = [];
  rows.slice(1).forEach((cells, offset) => {
    const line = offset + 2;
    const problems: string[] = [];
    const training = get(cells, "formation");
    if (!training) problems.push("formation manquante");

    const { slots, invalid } = parseSlotsCell(get(cells, "creneaux"));
    if (invalid.length > 0) problems.push(`créneau illisible « ${invalid[0]} » (JJ/MM/AAAA HH:MM-HH:MM)`);
    else if (slots.length === 0) problems.push("créneaux manquants");

    const capacityMax = get(cells, "capacite_max");
    if (!/^\d+$/.test(capacityMax)) problems.push("capacité maximale invalide");
    const capacityMin = get(cells, "capacite_min") || null;
    if (capacityMin && !/^\d+$/.test(capacityMin)) problems.push("capacité minimale invalide");

    const deadlineCell = get(cells, "date_limite");
    const registrationDeadline = deadlineCell ? parseDateCell(deadlineCell) : null;
    if (deadlineCell && !registrationDeadline) problems.push("date limite invalide (JJ/MM/AAAA)");

    const openToInternal = parseYesNo(get(cells, "internes"), true);
    const openToExternal = parseYesNo(get(cells, "externes"), false);
    const qualiopiScope = parseYesNo(get(cells, "qualiopi"), false);
    if (openToInternal === undefined) problems.push("internes : oui ou non");
    if (openToExternal === undefined) problems.push("externes : oui ou non");
    if (qualiopiScope === undefined) problems.push("qualiopi : oui ou non");

    const trainerEmails = splitList(get(cells, "formateurs")).map((email) => email.toLowerCase());
    const badEmail = trainerEmails.find((email) => !isEmail(email));
    if (badEmail) problems.push(`email de formateur invalide « ${badEmail} »`);

    if (problems.length > 0) {
      errors.push({ line, message: problems.join(", ") });
      return;
    }
    result.push({
      line,
      training,
      slots,
      capacityMax,
      capacityMin,
      location: get(cells, "lieu") || null,
      videoLink: get(cells, "lien_visio") || null,
      registrationDeadline,
      openToInternal: openToInternal!,
      openToExternal: openToExternal!,
      qualiopiScope: qualiopiScope!,
      trainerEmails,
      accessInfo: get(cells, "infos_acces") || null,
      internalNotes: get(cells, "notes_internes") || null,
    });
  });
  return { rows: result, errors };
}

// ───────────── Report and templates ─────────────

/** "ligne 3 (prénom manquant) ; ligne 7 (…)" for the result message. */
export function formatImportErrors(errors: readonly ImportError[]): string {
  return [...errors]
    .sort((a, b) => a.line - b.line)
    .map((error) => `ligne ${error.line} (${error.message})`)
    .join(" ; ");
}

export const IMPORT_TEMPLATES = {
  sessions: {
    filename: "modele-import-sessions",
    header: [
      "formation",
      "creneaux",
      "capacite_max",
      "capacite_min",
      "lieu",
      "lien_visio",
      "date_limite",
      "internes",
      "externes",
      "qualiopi",
      "formateurs",
      "infos_acces",
      "notes_internes",
    ],
    rows: [
      [
        "Intitulé exact de la formation",
        "12/11/2026 09:00-12:30 | 12/11/2026 13:30-17:00",
        "12",
        "4",
        "Paris - Tour Franklin",
        "",
        "05/11/2026",
        "oui",
        "non",
        "non",
        "formateur@exemple.fr",
        "Accueil au 12e étage",
        "",
      ],
      [
        "Intitulé exact de la formation",
        "03/12/2026 14:00-17:30",
        "20",
        "",
        "",
        "https://meet.google.com/abc-defg-hij",
        "",
        "oui",
        "oui",
        "oui",
        "",
        "",
        "Session à distance",
      ],
    ],
  },
  formateurs: {
    filename: "modele-import-formateurs",
    header: ["type", "prenom", "nom", "email", "telephone", "societe", "specialites", "actif"],
    rows: [
      [
        "externe",
        "Claire",
        "Durand",
        "claire.durand@exemple.fr",
        "0601020304",
        "Durand Conseil",
        "Management, RH",
        "oui",
      ],
      ["interne", "Paul", "Martin", "collaborateur@votre-domaine.fr", "", "", "Cybersécurité", "oui"],
    ],
  },
  entreprises: {
    filename: "modele-import-entreprises",
    header: ["raison_sociale", "siret", "adresse", "code_postal", "ville", "email_facturation"],
    rows: [
      ["ACME Industrie", "73282932000074", "10 rue de la Paix", "75002", "Paris", "facturation@acme.example"],
      ["Beta Services", "", "", "", "Lyon", ""],
    ],
  },
  inscrits: {
    filename: "modele-import-inscrits",
    header: ["type", "entreprise", "siret", "prenom", "nom", "email", "fonction", "telephone"],
    rows: [
      [
        "externe",
        "ACME Industrie",
        "73282932000074",
        "Jeanne",
        "Martin",
        "jeanne.martin@acme.example",
        "Responsable RH",
        "0601020304",
      ],
      ["interne", "", "", "Paul", "Martin", "collaborateur@votre-domaine.fr", "", ""],
    ],
  },
} as const satisfies Record<
  string,
  { filename: string; header: readonly string[]; rows: readonly (readonly string[])[] }
>;

export type ImportTemplateKey = keyof typeof IMPORT_TEMPLATES;
