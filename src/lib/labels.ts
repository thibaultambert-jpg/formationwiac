// French labels for database enums, usable from server and client components.

export const MODALITY_LABELS = {
  in_person: "Présentiel",
  remote: "Distanciel",
  blended: "Mixte",
} as const;

export const SESSION_STATUS_LABELS = {
  draft: "Brouillon",
  published: "Publiée",
  full: "Complète",
  completed: "Terminée",
  cancelled: "Annulée",
} as const;

export const ENROLLMENT_STATUS_LABELS = {
  confirmed: "Confirmée",
  pending_agreement: "En attente de convention",
  waitlisted: "Liste d'attente",
  cancelled: "Annulée",
  present: "Présente",
  absent: "Absente",
} as const;

export const ENROLLMENT_SOURCE_LABELS = {
  front: "Front",
  back_office: "Back-office",
} as const;

export const TRAINER_TYPE_LABELS = {
  internal: "Interne",
  external: "Externe",
} as const;

export const PARTICIPANT_TYPE_LABELS = {
  internal: "Collaborateur",
  external: "Externe",
} as const;

export type BadgeTone = "default" | "secondary" | "outline" | "success" | "warning" | "info" | "destructive";

export const SESSION_STATUS_TONES: Record<keyof typeof SESSION_STATUS_LABELS, BadgeTone> = {
  draft: "secondary",
  published: "info",
  full: "warning",
  completed: "success",
  cancelled: "destructive",
};

export const ENROLLMENT_STATUS_TONES: Record<keyof typeof ENROLLMENT_STATUS_LABELS, BadgeTone> = {
  confirmed: "success",
  pending_agreement: "warning",
  waitlisted: "warning",
  cancelled: "secondary",
  present: "info",
  absent: "destructive",
};

export const AUDIT_ACTION_LABELS: Record<string, string> = {
  create: "Création",
  update: "Modification",
  archive: "Archivage",
  restore: "Réactivation",
  delete: "Suppression",
  publish: "Publication",
  unpublish: "Retour en brouillon",
  cancel: "Annulation",
  status_change: "Changement de statut",
  promote: "Sortie de liste d'attente",
  move: "Déplacement",
  import: "Import",
  merge: "Fusion",
  role_change: "Changement de rôle",
  upload: "Téléversement",
  anonymize: "Anonymisation",
  export: "Export des données",
  purge: "Purge des preuves",
  automation: "Tâches automatiques",
  send: "Envoi",
  sign: "Émargement",
};

export const AUDIT_ENTITY_LABELS: Record<string, string> = {
  user: "Utilisateur",
  theme: "Thème",
  training: "Formation",
  trainer: "Formateur",
  session: "Session",
  company: "Entreprise",
  participant: "Participant",
  enrollment: "Inscription",
  settings: "Paramètres",
};

export const FUNDING_TYPE_LABELS = {
  none: "Plan de formation interne",
  company: "Fonds propres de l'entreprise cliente",
  opco: "OPCO",
  cpf: "CPF",
  france_travail: "France Travail",
  region: "Région",
  other: "Autre",
} as const;

export const CONVENTION_STATUS_LABELS = {
  draft: "Brouillon",
  sent: "Envoyée",
  signed: "Signée",
  cancelled: "Annulée",
} as const;

export const CONVENTION_STATUS_TONES: Record<keyof typeof CONVENTION_STATUS_LABELS, BadgeTone> = {
  draft: "secondary",
  sent: "info",
  signed: "success",
  cancelled: "secondary",
};
