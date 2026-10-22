import { describe, expect, it } from "vitest";
import { detectDelimiter, parseCsv, toCsv } from "@/server/domain/csv";
import { parseImportRows } from "@/server/domain/participant-import";

describe("parseCsv", () => {
  it("parses semicolon files with quotes, BOM and CRLF", () => {
    const rows = parseCsv('﻿nom;commentaire\r\nDupont;"Dit ""bonjour""; puis part"\r\n\r\nMartin;\n');
    expect(rows).toEqual([
      ["nom", "commentaire"],
      ["Dupont", 'Dit "bonjour"; puis part'],
      ["Martin", ""],
    ]);
  });

  it("detects comma-separated files", () => {
    expect(detectDelimiter("a,b,c")).toBe(",");
    expect(parseCsv("a,b\n1,2")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("supports multi-line quoted fields", () => {
    expect(parseCsv('a;b\n"ligne 1\nligne 2";x')).toEqual([
      ["a", "b"],
      ["ligne 1\nligne 2", "x"],
    ]);
  });
});

describe("toCsv", () => {
  it("writes a BOM, semicolons, quotes and neutralizes formulas", () => {
    expect(
      toCsv(
        ["a", "b"],
        [
          ["x;y", "=SUM(A1)"],
          [null, 3],
        ],
      ),
    ).toBe('﻿a;b\r\n"x;y";\'=SUM(A1)\r\n;3\r\n');
  });

  it("round-trips through parseCsv", () => {
    const csv = toCsv(["nom", "note"], [['Le "chef"', "a\nb"]]);
    expect(parseCsv(csv)).toEqual([
      ["nom", "note"],
      ['Le "chef"', "a\nb"],
    ]);
  });
});

describe("parseImportRows", () => {
  it("maps French headers with accents and aliases", () => {
    const { rows, errors } = parseImportRows([
      ["Société", "SIRET", "Prénom", "Nom", "E-mail", "Poste", "Téléphone"],
      ["ACME", "732 829 320 00074", "Jeanne", "Martin", "Jeanne.Martin@acme.fr", "RH", "0601020304"],
    ]);
    expect(errors).toEqual([]);
    expect(rows).toEqual([
      {
        line: 2,
        companyName: "ACME",
        siret: "73282932000074",
        firstName: "Jeanne",
        lastName: "Martin",
        email: "jeanne.martin@acme.fr",
        jobTitle: "RH",
        phone: "0601020304",
      },
    ]);
  });

  it("reports missing required columns", () => {
    const { errors } = parseImportRows([["nom", "email"]]);
    expect(errors[0].message).toContain("entreprise");
    expect(errors[0].message).toContain("prenom");
  });

  it("reports invalid lines with their line number and keeps valid ones", () => {
    const { rows, errors } = parseImportRows([
      ["entreprise", "prenom", "nom", "email", "siret"],
      ["ACME", "A", "B", "a@acme.fr", ""],
      ["ACME", "", "B", "pas-un-email", "123"],
      ["ACME", "C", "D", "A@acme.fr", ""],
    ]);
    expect(rows).toHaveLength(1);
    expect(errors).toEqual([
      { line: 3, message: "prénom manquant, email invalide, SIRET invalide" },
      { line: 4, message: "email en double dans le fichier" },
    ]);
  });
});
