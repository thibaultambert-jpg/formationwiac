import { describe, expect, it } from "vitest";
import { DEFAULT_RETENTION } from "@/server/domain/privacy";
import {
  legalBlocks,
  legalNoticeText,
  privacyNoticeText,
  privacyPolicyText,
  type LegalOrganization,
} from "@/server/domain/legal";

const org: LegalOrganization = {
  name: "WiAcademy",
  addressLine: "Tour Franklin",
  postalCode: "92042",
  city: "Paris La Défense",
  siret: "12345678901234",
  activityDeclarationNumber: "11 92 00000 92",
  managerName: "Camille Martin",
  managerTitle: "Directrice",
  contactEmail: "formation@example.fr",
  dpoContact: "dpo@example.fr",
  privacyNotice: null,
  privacyPolicy: null,
  legalNotice: null,
};

describe("legal texts (E2, F1, F2)", () => {
  it("builds the short notice with the DPO contact", () => {
    const notice = privacyNoticeText(org);
    expect(notice).toContain("WiAcademy traite vos données");
    expect(notice).toContain("dpo@example.fr");
    expect(privacyNoticeText({ ...org, dpoContact: null })).toContain("formation@example.fr");
  });

  it("uses the custom texts when set", () => {
    expect(privacyNoticeText({ ...org, privacyNotice: "Texte validé." })).toBe("Texte validé.");
    expect(privacyNoticeText({ ...org, privacyNotice: "  " })).toContain("WiAcademy");
    expect(privacyPolicyText({ ...org, privacyPolicy: "Politique." }, DEFAULT_RETENTION)).toBe("Politique.");
    expect(legalNoticeText({ ...org, legalNotice: "Mentions." })).toBe("Mentions.");
  });

  it("states the retention durations, the rights and the CNIL in the policy", () => {
    const policy = privacyPolicyText(org, { ...DEFAULT_RETENTION, externalYears: 6, technicalMonths: 18 });
    expect(policy).toContain("6 an(s) après la fin de leur dernière formation");
    expect(policy).toContain("18 mois");
    expect(policy).toContain("CNIL");
    expect(policy).toContain("Responsable du traitement");
  });

  it("names the publisher, the publication director and the host in the legal notice", () => {
    const notice = legalNoticeText(org);
    expect(notice).toContain("SIRET : 12345678901234");
    expect(notice).toContain("11 92 00000 92");
    expect(notice).toContain("Camille Martin, Directrice");
    expect(notice).toContain("Vercel");
  });

  it("splits texts into headings and paragraphs", () => {
    expect(legalBlocks("Titre\n\nUn paragraphe.\nSuite.\n\nAutre titre\n\nFin.")).toEqual([
      { kind: "heading", text: "Titre" },
      { kind: "paragraph", text: "Un paragraphe.\nSuite." },
      { kind: "heading", text: "Autre titre" },
      { kind: "paragraph", text: "Fin." },
    ]);
  });
});
