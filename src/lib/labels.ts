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
  dropped_out: "Abandon",
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
  dropped_out: "destructive",
};

export const LEARNING_RESULT_LABELS = {
  acquired: "Acquis",
  partially_acquired: "Partiellement acquis",
  not_acquired: "Non acquis",
} as const;

export const TRAINER_DOCUMENT_TYPE_LABELS = {
  diploma: "Diplôme",
  certification: "Certification ou attestation",
  cv: "CV",
  subcontracting_contract: "Contrat de sous-traitance",
  insurance: "Assurance",
  other: "Autre",
} as const;

export const COMPLAINT_STATUS_LABELS = {
  open: "Ouverte",
  in_progress: "En cours de traitement",
  closed: "Clôturée",
} as const;

export const COMPLAINT_STATUS_TONES: Record<keyof typeof COMPLAINT_STATUS_LABELS, BadgeTone> = {
  open: "destructive",
  in_progress: "warning",
  closed: "success",
};

export const IMPROVEMENT_SOURCE_LABELS = {
  complaint: "Réclamation",
  evaluation: "Questionnaire",
  audit: "Audit",
  other: "Autre",
} as const;

export const IMPROVEMENT_STATUS_LABELS = {
  planned: "Prévue",
  in_progress: "En cours",
  done: "Réalisée",
  abandoned: "Abandonnée",
} as const;

export const IMPROVEMENT_STATUS_TONES: Record<keyof typeof IMPROVEMENT_STATUS_LABELS, BadgeTone> = {
  planned: "secondary",
  in_progress: "warning",
  done: "success",
  abandoned: "secondary",
};

export const EVALUATION_TYPE_LABELS = {
  hot: "À chaud",
  cold: "À froid",
  positioning: "Positionnement",
  company: "Entreprise cliente",
  trainer: "Formateur",
} as const;

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
  export: "Export",
  purge: "Purge",
  automation: "Tâches automatiques",
  send: "Envoi",
  sign: "Émargement",
  download: "Téléchargement",
  legal_hold: "Conservation légale",
  legal_hold_release: "Levée de conservation légale",
  waive_agreement: "Dérogation",
  learning_assessment: "Évaluation des acquis",
  read_sensitive: "Consultation d'une donnée restreinte",
  update_sensitive: "Modification d'une donnée restreinte",
  rollback_copy: "Copie avant retour arrière",
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
  bpf: "BPF",
  file: "Fichier",
  internal_regulation: "Règlement intérieur",
  convention: "Convention",
  complaint: "Réclamation",
  improvement_action: "Action d'amélioration",
  trainer_document: "Justificatif formateur",
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

export const INVOICE_STATUS_LABELS = {
  pending: "Envoi en cours",
  sent: "Brouillon créé dans Pennylane",
  failed: "Échec de l'envoi",
  detached: "Détachée",
} as const;

export const INVOICE_STATUS_TONES: Record<keyof typeof INVOICE_STATUS_LABELS, BadgeTone> = {
  pending: "info",
  sent: "success",
  failed: "destructive",
  detached: "secondary",
};

export const ATTENDANCE_STATE_LABELS = {
  present: "Présent(e)",
  absent: "Absent(e)",
  late: "Retard",
  left_early: "Départ anticipé",
  unknown: "Non signé",
} as const;

export const SIGNATURE_METHOD_LABELS: Record<string, string> = {
  participant_link: "lien personnel",
  trainer_device: "appareil du formateur",
  attestation_checkbox: "attestation (case à cocher)",
};
