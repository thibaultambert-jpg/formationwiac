// Training-organization obligations (compliance audit, sections A and B).
// Obligations are blocking for external trainees and for sessions in the
// Qualiopi scope; for internal trainees they are only recommended (A3).

export type ParticipantTypeValue = "internal" | "external";
export type FundingTypeValue = "none" | "company" | "opco" | "cpf" | "france_travail" | "region" | "other";

/** Public or pooled funds: the session falls into the Qualiopi scope (A2). */
export const PUBLIC_FUNDING_TYPES: readonly FundingTypeValue[] = ["opco", "cpf", "france_travail", "region"];

export function isPublicFunding(funding: FundingTypeValue): boolean {
  return PUBLIC_FUNDING_TYPES.includes(funding);
}

/** A session is in the Qualiopi scope when flagged so or when one enrollment uses public or pooled funds. */
export function inQualiopiScope(
  session: { qualiopiScope: boolean },
  enrollments: readonly { fundingType: FundingTypeValue; status: string }[],
): boolean {
  return (
    session.qualiopiScope ||
    enrollments.some((enrollment) => enrollment.status !== "cancelled" && isPublicFunding(enrollment.fundingType))
  );
}

/** Default funding of a new enrollment. */
export function defaultFunding(participantType: ParticipantTypeValue): FundingTypeValue {
  return participantType === "external" ? "company" : "none";
}

/** An external enrollment needs a signed agreement or an admin waiver before being confirmed (B2). */
export function agreementSatisfied(enrollment: {
  participantType: ParticipantTypeValue;
  conventionSigned: boolean;
  agreementWaived: boolean;
}): boolean {
  return enrollment.participantType === "internal" || enrollment.conventionSigned || enrollment.agreementWaived;
}

/**
 * Status of an enrollment that takes a seat: confirmed, or pending its
 * agreement for an external trainee without a signed agreement or waiver.
 */
export function seatStatus(agreementOk: boolean): "confirmed" | "pending_agreement" {
  return agreementOk ? "confirmed" : "pending_agreement";
}

export type Requirement = {
  key: string;
  label: string;
  /** Blocking obligation, or a recommendation only (internal trainees outside the Qualiopi scope). */
  blocking: boolean;
  satisfied: boolean;
};

export type RequirementInput = {
  participantType: ParticipantTypeValue;
  inScope: boolean;
  conventionSigned: boolean;
  agreementWaived: boolean;
  /** The prior information email (B3) was sent. */
  preInformationSent: boolean;
  /** Needs analysis recorded: motivation, note or document (D2). */
  needsAnalysisDone: boolean;
  /** Entry assessment answered or uploaded (D3). */
  positioningDone: boolean;
  /** Learning assessment recorded (D5). */
  learningAssessed: boolean;
};

/** Prior information is due for every trainee; blocking for externals and in the Qualiopi scope (B3). */
export function preInformationRequired(participantType: ParticipantTypeValue, inScope: boolean): boolean {
  return participantType === "external" || inScope;
}

/** Entry assessment and learning assessment are blocking for externals of the Qualiopi scope only (D3, D5). */
export function qualiopiExternal(participantType: ParticipantTypeValue, inScope: boolean): boolean {
  return participantType === "external" && inScope;
}

/** Obligations of one enrollment, used by the session compliance panel and the closure. */
export function requirementsFor(input: RequirementInput): Requirement[] {
  const external = input.participantType === "external";
  const blocking = preInformationRequired(input.participantType, input.inScope);
  const requirements: Requirement[] = [];
  if (external) {
    requirements.push({
      key: "agreement",
      label: "Convention de formation signée (ou dérogation)",
      blocking: true,
      satisfied: input.conventionSigned || input.agreementWaived,
    });
  }
  requirements.push({
    key: "pre_information",
    label: "Information préalable envoyée (programme, règlement intérieur, contacts)",
    blocking: true,
    satisfied: input.preInformationSent,
  });
  requirements.push({
    key: "needs_analysis",
    label: "Analyse du besoin (motivation, recueil ou document)",
    blocking: true,
    satisfied: input.needsAnalysisDone,
  });
  const strict = qualiopiExternal(input.participantType, input.inScope);
  return [
    ...requirements.map((requirement) => ({ ...requirement, blocking: requirement.blocking && blocking })),
    {
      key: "positioning",
      label: "Positionnement à l'entrée (questionnaire ou test)",
      blocking: strict,
      satisfied: input.positioningDone,
    },
    {
      key: "learning",
      label: "Évaluation des acquis",
      blocking: strict,
      satisfied: input.learningAssessed,
    },
  ];
}

/** Documents sent to external trainees must show the SIRET and the activity declaration number (B1). */
export function missingOrganizationIdentifiers(organization: {
  siret: string | null;
  activityDeclarationNumber: string | null;
}): string[] {
  const missing: string[] = [];
  if (!organization.siret?.trim()) missing.push("SIRET");
  if (!organization.activityDeclarationNumber?.trim()) missing.push("numéro de déclaration d'activité");
  return missing;
}

/** Nature of the training action, printed on agreements and certificates (B5). */
export const ACTION_NATURE = "action de formation (article L6313-1, 1° du Code du travail)";

/** Convention reference, e.g. CONV-2026-007. */
export function conventionReference(year: number, sequence: number): string {
  return `CONV-${year}-${String(sequence).padStart(3, "0")}`;
}
