// Legal texts (compliance audit E2, F1, F2): each one is editable in the
// settings; until it is, a model built from the organization settings is
// shown. The models are drafts to be validated by the data protection officer.
import type { RetentionPolicy } from "./privacy";

export type LegalOrganization = {
  name: string;
  addressLine: string | null;
  postalCode: string | null;
  city: string | null;
  siret: string | null;
  activityDeclarationNumber: string | null;
  managerName: string | null;
  managerTitle: string | null;
  contactEmail: string | null;
  dpoContact: string | null;
  privacyNotice: string | null;
  privacyPolicy: string | null;
  legalNotice: string | null;
};

export const EMPTY_LEGAL: LegalOrganization = {
  name: "Organisme de formation",
  addressLine: null,
  postalCode: null,
  city: null,
  siret: null,
  activityDeclarationNumber: null,
  managerName: null,
  managerTitle: null,
  contactEmail: null,
  dpoContact: null,
  privacyNotice: null,
  privacyPolicy: null,
  legalNotice: null,
};

function address(org: LegalOrganization): string {
  return [org.addressLine, [org.postalCode, org.city].filter(Boolean).join(" ")].filter(Boolean).join(", ");
}

function contact(org: LegalOrganization): string {
  return org.dpoContact ?? org.contactEmail ?? "le service formation";
}

function filled(value: string | null): string | null {
  return value && value.trim() ? value.trim() : null;
}

/** Short notice: attendance page, public pages, end of the convocation email (E2, C8). */
export function privacyNoticeText(org: LegalOrganization): string {
  return (
    filled(org.privacyNotice) ??
    `${org.name} traite vos données (identité, coordonnées professionnelles, inscriptions, émargements, évaluations) ` +
      `pour organiser vos formations et en conserver les preuves (obligations légales de l'organisme de formation et ` +
      `exécution de la convention). Vous pouvez exercer vos droits d'accès, de rectification, d'effacement, de ` +
      `limitation et d'opposition auprès de ${contact(org)}. Détails : page « Confidentialité ».`
  );
}

/** Full privacy policy published on /confidentialite (F2). */
export function privacyPolicyText(org: LegalOrganization, retention: RetentionPolicy): string {
  const custom = filled(org.privacyPolicy);
  if (custom) return custom;
  const where = address(org);
  return [
    "Responsable du traitement",
    `${org.name}${where ? `, ${where}` : ""}${org.siret ? ` (SIRET ${org.siret})` : ""}. Contact pour vos données : ${contact(org)}.`,
    "Finalités et bases légales",
    [
      "- Organisation des formations (inscriptions, convocations, liste d'attente) : exécution de la convention ou du contrat de travail, intérêt légitime pour les formations internes.",
      "- Preuves de réalisation (émargements, attestations, certificats de réalisation) et bilan pédagogique et financier : obligation légale de l'organisme de formation (Code du travail, articles L6353-1 et suivants, référentiel Qualiopi).",
      "- Évaluations de satisfaction et des acquis : intérêt légitime d'amélioration continue (indicateurs Qualiopi).",
      "- Sécurité de l'émargement électronique (adresse IP, navigateur, horodatage) : intérêt légitime de prouver l'authenticité des signatures.",
    ].join("\n"),
    "Données traitées",
    "Identité, adresse email et téléphone professionnels, fonction, entreprise, inscriptions et financement, signatures d'émargement et leurs traces techniques, réponses aux évaluations. Aucune donnée sensible n'est collectée sans votre accord explicite.",
    "Destinataires",
    "Le service formation, les formateurs de vos sessions (liste des inscrits et émargement), votre employeur ou le financeur pour les documents de la convention, les autorités de contrôle sur demande. Sous-traitants techniques : Vercel (hébergement de l'application), Supabase (base de données et fichiers, Union européenne), Google (authentification et envoi des emails).",
    "Durées de conservation",
    [
      `- Stagiaires externes : ${retention.externalYears} an(s) après la fin de leur dernière formation.`,
      `- Salariés internes : ${retention.internalYears} an(s) après leur départ.`,
      `- Traces techniques des signatures (adresse IP, navigateur) : ${retention.technicalMonths} mois.`,
      `- Liens personnels expirés : ${retention.tokenDays} jour(s) après expiration.`,
      "À l'issue, les données sont anonymisées ou supprimées, sauf conservation légale (contrôle ou litige en cours).",
    ].join("\n"),
    "Vos droits",
    `Vous disposez des droits d'accès, de rectification, d'effacement, de limitation, d'opposition et de portabilité. Écrivez à ${contact(org)}. Les preuves que la loi impose de conserver ne peuvent pas être effacées avant la fin de leur durée ; elles sont alors conservées sans être utilisées à d'autres fins. Vous pouvez introduire une réclamation auprès de la CNIL (www.cnil.fr).`,
  ].join("\n\n");
}

/** Legal notice published on /mentions-legales (F1). */
export function legalNoticeText(org: LegalOrganization): string {
  const custom = filled(org.legalNotice);
  if (custom) return custom;
  const where = address(org);
  return [
    "Éditeur",
    [
      `${org.name}${where ? `, ${where}` : ""}.`,
      org.siret ? `SIRET : ${org.siret}.` : null,
      org.activityDeclarationNumber
        ? `Déclaration d'activité enregistrée sous le numéro ${org.activityDeclarationNumber}. Cet enregistrement ne vaut pas agrément de l'État.`
        : null,
      org.contactEmail ? `Contact : ${org.contactEmail}.` : null,
    ]
      .filter(Boolean)
      .join("\n"),
    "Directeur de la publication",
    org.managerName ? `${org.managerName}${org.managerTitle ? `, ${org.managerTitle}` : ""}.` : "À compléter.",
    "Hébergement",
    "Vercel Inc., 440 N Barranca Ave #4133, Covina, CA 91723, États-Unis (application, région Paris). Supabase Inc. pour la base de données et les fichiers, hébergés dans l'Union européenne.",
    "Données personnelles",
    "Voir la page « Confidentialité ».",
  ].join("\n\n");
}

/**
 * Splits a legal text into blocks for display: a line without final
 * punctuation followed by a paragraph is a heading.
 */
export function legalBlocks(text: string): { kind: "heading" | "paragraph"; text: string }[] {
  return text
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => ({
      kind: !block.includes("\n") && block.length <= 80 && !/[.:;!?)]$/.test(block) ? "heading" : "paragraph",
      text: block,
    }));
}
