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
