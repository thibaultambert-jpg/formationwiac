import { describe, expect, it } from "vitest";
import { parseCsv, toCsv } from "@/server/domain/csv";
import {
  formatImportErrors,
  IMPORT_TEMPLATES,
  parseCompanyImport,
  parseDateCell,
  parseSessionImport,
  parseSlotsCell,
  parseTrainerImport,
  parseYesNo,
} from "@/server/domain/csv-import";
import { parseImportRows } from "@/server/domain/participant-import";

describe("cell parsers", () => {
  it("reads yes/no answers with a default for empty cells", () => {
    expect(parseYesNo("Oui", false)).toBe(true);
    expect(parseYesNo("NON", true)).toBe(false);
    expect(parseYesNo("", true)).toBe(true);
    expect(parseYesNo("peut-être", true)).toBeUndefined();
  });

  it("reads French and ISO dates", () => {
    expect(parseDateCell("5/11/2026")).toBe("2026-11-05");
    expect(parseDateCell("2026-11-05")).toBe("2026-11-05");
    expect(parseDateCell("11-05-2026")).toBeNull();
  });

  it("reads several slots in one cell", () => {
    expect(parseSlotsCell("12/11/2026 09:00-12:30 | 12/11/2026 13h30 - 17h00")).toEqual({
      slots: [
        { date: "2026-11-12", start: "09:00", end: "12:30" },
        { date: "2026-11-12", start: "13:30", end: "17:00" },
      ],
      invalid: [],
    });
    expect(parseSlotsCell("demain matin").invalid).toEqual(["demain matin"]);
  });

  it("sorts the errors by line", () => {
    expect(
      formatImportErrors([
        { line: 4, message: "b" },
        { line: 2, message: "a" },
      ]),
    ).toBe("ligne 2 (a) ; ligne 4 (b)");
  });
});

describe("parseTrainerImport", () => {
  it("maps headers, defaults and specialties", () => {
    const { rows, errors } = parseTrainerImport([
      ["Prénom", "Nom", "E-mail", "Spécialités", "Type", "Actif"],
      ["Claire", "Durand", "Claire@Ext.fr", "Management, RH, Management", "", ""],
      ["Paul", "Martin", "paul@corp.fr", "", "Interne", "non"],
      ["", "Sans", "pas-un-email", "", "freelance", "peut-être"],
      ["Bis", "Durand", "claire@ext.fr", "", "", ""],
    ]);
    expect(rows).toEqual([
      {
        line: 2,
        type: "external",
        firstName: "Claire",
        lastName: "Durand",
        email: "claire@ext.fr",
        phone: null,
        company: null,
        specialties: ["Management", "RH"],
        active: true,
      },
      expect.objectContaining({ line: 3, type: "internal", active: false }),
    ]);
    expect(errors).toEqual([
      { line: 4, message: "type invalide (interne ou externe), prénom manquant, email invalide, actif : oui ou non" },
      { line: 5, message: "email en double dans le fichier" },
    ]);
  });
});

describe("parseCompanyImport", () => {
  it("validates SIRET and billing email and detects duplicates", () => {
    const { rows, errors } = parseCompanyImport([
      ["Raison sociale", "SIRET", "Ville", "Email facturation"],
      ["ACME", "732 829 320 00074", "Paris", "Compta@acme.fr"],
      ["ACME bis", "73282932000074", "", ""],
      ["Beta", "123", "", "pas-un-email"],
      ["", "", "", ""],
      ["Gamma", "", "", ""],
      ["gamma", "", "", ""],
    ]);
    expect(rows.map((row) => [row.name, row.siret, row.billingEmail])).toEqual([
      ["ACME", "73282932000074", "compta@acme.fr"],
      ["Gamma", null, null],
    ]);
    expect(errors.map((error) => error.line)).toEqual([3, 4, 5, 7]);
  });

  it("reports the missing name column", () => {
    expect(parseCompanyImport([["siret", "ville"]]).errors[0].message).toContain("raison_sociale");
  });
});

describe("parseSessionImport", () => {
  it("reads one session per line", () => {
    const { rows, errors } = parseSessionImport([
      ["formation", "creneaux", "capacite_max", "lieu", "date_limite", "externes", "formateurs"],
      [
        "Management agile",
        "12/11/2026 09:00-12:30|13/11/2026 09:00-12:30",
        "12",
        "Paris",
        "05/11/2026",
        "oui",
        "a@x.fr, B@x.fr",
      ],
      ["", "12/11/2026", "douze", "", "32/13/2026", "bof", "pas-un-email"],
    ]);
    expect(rows).toEqual([
      {
        line: 2,
        training: "Management agile",
        slots: [
          { date: "2026-11-12", start: "09:00", end: "12:30" },
          { date: "2026-11-13", start: "09:00", end: "12:30" },
        ],
        capacityMax: "12",
        capacityMin: null,
        location: "Paris",
        videoLink: null,
        registrationDeadline: "2026-11-05",
        openToInternal: true,
        openToExternal: true,
        qualiopiScope: false,
        trainerEmails: ["a@x.fr", "b@x.fr"],
        accessInfo: null,
        internalNotes: null,
      },
    ]);
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toContain("formation manquante");
    expect(errors[0].message).toContain("créneau illisible");
    expect(errors[0].message).toContain("capacité maximale invalide");
    expect(errors[0].message).toContain("externes : oui ou non");
    expect(errors[0].message).toContain("email de formateur invalide");
  });
});

describe("import templates", () => {
  it("are read back without errors by their own parser", () => {
    const parsers = {
      sessions: parseSessionImport,
      formateurs: parseTrainerImport,
      entreprises: parseCompanyImport,
      inscrits: parseImportRows,
    };
    for (const [key, template] of Object.entries(IMPORT_TEMPLATES)) {
      const result = parsers[key as keyof typeof parsers](parseCsv(toCsv(template.header, template.rows)));
      expect(result.errors, key).toEqual([]);
      expect(result.rows, key).toHaveLength(template.rows.length);
    }
  });
});
