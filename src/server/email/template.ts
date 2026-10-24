// Email template rendering: {{variable}} placeholders, plain text source
// rendered as escaped HTML. Pure functions, unit tested.

export const TEMPLATE_VARIABLES = {
  prenom: "Prénom du destinataire",
  nom: "Nom du destinataire",
  formation: "Titre de la formation",
  reference: "Référence de la session",
  dates: "Dates et horaires des créneaux",
  lieu: "Lieu",
  lien_visio: "Lien visio",
  motif: "Motif (annulation)",
  lien_espace: "Lien vers « Mes formations »",
  lien_emargement: "Lien personnel d'émargement",
  lien_evaluation: "Lien vers le questionnaire d'évaluation",
  inscrits: "Liste des inscrits (email formateur)",
  organisme: "Nom de l'organisme",
  acces: "Accès et informations pratiques de la session",
  a_prevoir: "Matériel ou documents à prévoir",
  entreprise: "Entreprise cliente (convention)",
  reference_convention: "Référence de la convention",
  mention_rgpd: "Mention d'information sur les données personnelles",
  objectifs: "Objectifs de la formation",
  prerequis: "Prérequis",
  duree: "Durée de la formation",
  modalite: "Modalité (présentiel, distanciel…)",
  methodes: "Méthodes pédagogiques",
  modalites_evaluation: "Modalités d'évaluation",
  accessibilite: "Accessibilité et adaptations",
  delai_acces: "Délai d'accès",
  referent_handicap: "Référent handicap",
  referent_pedagogique: "Référent pédagogique",
  referent_administratif: "Référent administratif",
  lien_reglement: "Lien vers le règlement intérieur",
} as const;

export type TemplateVariables = Partial<Record<keyof typeof TEMPLATE_VARIABLES | string, string>>;

const PLACEHOLDER = /\{\{\s*([a-z_]+)\s*\}\}/g;

/** Replaces known placeholders; unknown ones are kept so they can be spotted in previews. */
export function renderTemplate(source: string, variables: TemplateVariables): string {
  return source.replace(PLACEHOLDER, (match, name: string) => {
    const value = variables[name];
    return value === undefined ? match : value;
  });
}

export function unknownPlaceholders(
  source: string,
  allowed: readonly string[] = Object.keys(TEMPLATE_VARIABLES),
): string[] {
  const names = [...source.matchAll(PLACEHOLDER)].map((match) => match[1]);
  return [...new Set(names.filter((name) => !allowed.includes(name)))];
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const URL_PATTERN = /(https?:\/\/[^\s<]+)/g;

/** Plain text (paragraphs separated by blank lines) to minimal, safe HTML. */
export function textToHtml(text: string): string {
  const paragraphs = text
    .trim()
    .split(/\n{2,}/)
    .map((paragraph) =>
      escapeHtml(paragraph)
        .replace(URL_PATTERN, (url) => `<a href="${url}">${url}</a>`)
        .replace(/\n/g, "<br>"),
    )
    .map((paragraph) => `<p style="margin:0 0 1em">${paragraph}</p>`);
  return `<!doctype html><html lang="fr"><body style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.5;color:#1f2937">${paragraphs.join("")}</body></html>`;
}

/** Adds the short GDPR notice at the end of an email unless the template already places it (E2). */
export function withPrivacyNotice(text: string, template: string, notice: string): string {
  return template.includes("mention_rgpd") ? text : `${text}\n\n—\n${notice}`;
}
