import { describe, expect, it } from "vitest";
import { holdsSeat } from "@/server/domain/capacity";
import {
  agreementSatisfied,
  conventionReference,
  defaultFunding,
  inQualiopiScope,
  isPublicFunding,
  missingOrganizationIdentifiers,
  requirementsFor,
  seatStatus,
} from "@/server/domain/compliance";

describe("Qualiopi scope (A2)", () => {
  it("treats OPCO, CPF, France Travail and Region as public or pooled funds", () => {
    expect(["opco", "cpf", "france_travail", "region"].every((value) => isPublicFunding(value as never))).toBe(true);
    expect(isPublicFunding("company")).toBe(false);
    expect(isPublicFunding("none")).toBe(false);
  });

  it("is in scope when flagged or when an active enrollment uses public funds", () => {
    expect(inQualiopiScope({ qualiopiScope: true }, [])).toBe(true);
    expect(inQualiopiScope({ qualiopiScope: false }, [{ fundingType: "company", status: "confirmed" }])).toBe(false);
    expect(inQualiopiScope({ qualiopiScope: false }, [{ fundingType: "opco", status: "confirmed" }])).toBe(true);
    expect(inQualiopiScope({ qualiopiScope: false }, [{ fundingType: "cpf", status: "cancelled" }])).toBe(false);
  });

  it("defaults the funding to the client company for externals", () => {
    expect(defaultFunding("external")).toBe("company");
    expect(defaultFunding("internal")).toBe("none");
  });
});

describe("training agreement (B2)", () => {
  it("is not needed for internal trainees", () => {
    expect(agreementSatisfied({ participantType: "internal", conventionSigned: false, agreementWaived: false })).toBe(
      true,
    );
  });

  it("needs a signed agreement or a waiver for externals", () => {
    const external = { participantType: "external" as const };
    expect(agreementSatisfied({ ...external, conventionSigned: false, agreementWaived: false })).toBe(false);
    expect(agreementSatisfied({ ...external, conventionSigned: true, agreementWaived: false })).toBe(true);
    expect(agreementSatisfied({ ...external, conventionSigned: false, agreementWaived: true })).toBe(true);
  });

  it("holds the seat while the agreement is pending", () => {
    expect(seatStatus(false)).toBe("pending_agreement");
    expect(seatStatus(true)).toBe("confirmed");
    expect(holdsSeat("pending_agreement")).toBe(true);
  });

  it("formats agreement references", () => {
    expect(conventionReference(2026, 7)).toBe("CONV-2026-007");
  });
});

describe("conditional requirements (A3)", () => {
  it("makes the agreement blocking for externals", () => {
    const [agreement] = requirementsFor({
      participantType: "external",
      inScope: false,
      conventionSigned: false,
      agreementWaived: false,
      preInformationSent: false,
      needsAnalysisDone: false,
      positioningDone: false,
      learningAssessed: false,
    });
    expect(agreement).toMatchObject({ key: "agreement", blocking: true, satisfied: false });
  });

  it("has no agreement requirement for internal trainees", () => {
    const keys = requirementsFor({
      participantType: "internal",
      inScope: true,
      conventionSigned: false,
      agreementWaived: false,
      preInformationSent: false,
      needsAnalysisDone: false,
      positioningDone: false,
      learningAssessed: false,
    }).map((requirement) => requirement.key);
    expect(keys).not.toContain("agreement");
  });

  it("requires the prior information, blocking for externals and in scope only (B3)", () => {
    const input = {
      conventionSigned: true,
      agreementWaived: false,
      preInformationSent: false,
      needsAnalysisDone: false,
      positioningDone: false,
      learningAssessed: false,
    };
    const find = (participantType: "internal" | "external", inScope: boolean, sent = false) =>
      requirementsFor({ ...input, participantType, inScope, preInformationSent: sent }).find(
        (requirement) => requirement.key === "pre_information",
      );
    expect(find("external", false)).toMatchObject({ blocking: true, satisfied: false });
    expect(find("internal", true)).toMatchObject({ blocking: true });
    expect(find("internal", false)).toMatchObject({ blocking: false });
    expect(find("external", false, true)).toMatchObject({ satisfied: true });
  });
});

describe("pedagogical requirements (D2, D3, D5)", () => {
  const base = {
    conventionSigned: true,
    agreementWaived: false,
    preInformationSent: true,
    needsAnalysisDone: false,
    positioningDone: false,
    learningAssessed: false,
  };
  const find = (participantType: "internal" | "external", inScope: boolean, key: string) =>
    requirementsFor({ ...base, participantType, inScope }).find((requirement) => requirement.key === key);

  it("makes the needs analysis blocking like the other obligations", () => {
    expect(find("external", false, "needs_analysis")).toMatchObject({ blocking: true, satisfied: false });
    expect(find("internal", false, "needs_analysis")).toMatchObject({ blocking: false });
  });

  it("makes positioning and learning assessment blocking for externals of the Qualiopi scope only", () => {
    expect(find("external", true, "positioning")).toMatchObject({ blocking: true });
    expect(find("external", true, "learning")).toMatchObject({ blocking: true });
    expect(find("external", false, "positioning")).toMatchObject({ blocking: false });
    expect(find("internal", true, "learning")).toMatchObject({ blocking: false });
  });
});

describe("organization identifiers (B1)", () => {
  it("lists the missing SIRET and activity declaration number", () => {
    expect(missingOrganizationIdentifiers({ siret: null, activityDeclarationNumber: " " })).toEqual([
      "SIRET",
      "numéro de déclaration d'activité",
    ]);
    expect(
      missingOrganizationIdentifiers({ siret: "12345678901234", activityDeclarationNumber: "11755555555" }),
    ).toEqual([]);
  });
});
