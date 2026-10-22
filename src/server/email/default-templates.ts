// Default email templates, inserted by the seed and editable in the settings.
// Pure module: also imported by prisma/seed.ts.
import type { DocumentType } from "@/generated/prisma/enums";

export const DEFAULT_EMAIL_TEMPLATES: { key: DocumentType; subject: string; body: string }[] = [
  {
    key: "enrollment_confirmation",
    subject: "Confirmation d'inscription : {{formation}}",
    body: "Bonjour {{prenom}},\n\nVotre inscription à la formation « {{formation}} » est confirmée.\n\nDates : {{dates}}\nLieu : {{lieu}}\nLien visio : {{lien_visio}}\n\nVous trouverez en pièce jointe un fichier à ajouter à votre agenda.\n\nÀ bientôt,",
  },
  {
    key: "waitlist_notice",
    subject: "Liste d'attente : {{formation}}",
    body: "Bonjour {{prenom}},\n\nLa session de la formation « {{formation}} » ({{dates}}) est complète. Vous êtes inscrit(e) en liste d'attente et serez prévenu(e) par email si une place se libère.\n\nÀ bientôt,",
  },
  {
    key: "waitlist_promotion",
    subject: "Une place s'est libérée : {{formation}}",
    body: "Bonjour {{prenom}},\n\nUne place s'est libérée : votre inscription à la formation « {{formation}} » est désormais confirmée.\n\nDates : {{dates}}\nLieu : {{lieu}}\nLien visio : {{lien_visio}}\n\nÀ bientôt,",
  },
  {
    key: "convocation",
    subject: "Convocation : {{formation}}",
    body: "Bonjour {{prenom}},\n\nVeuillez trouver ci-joint votre convocation à la formation « {{formation}} » ainsi que son programme.\n\nDates : {{dates}}\nLieu : {{lieu}}\nLien visio : {{lien_visio}}\n\nÀ bientôt,",
  },
  {
    key: "reminder",
    subject: "Rappel : {{formation}} approche",
    body: "Bonjour {{prenom}},\n\nNous vous rappelons que la formation « {{formation}} » aura lieu prochainement.\n\nDates : {{dates}}\nLieu : {{lieu}}\nLien visio : {{lien_visio}}\n\nÀ bientôt,",
  },
  {
    key: "attendance_link",
    subject: "Émargement : {{formation}}",
    body: "Bonjour {{prenom}},\n\nLa formation « {{formation}} » commence. Merci de signer la feuille d'émargement à l'aide de votre lien personnel :\n\n{{lien_emargement}}\n\nMerci,",
  },
  {
    key: "trainer_attendance_link",
    subject: "Émargement et liste des inscrits : {{formation}}",
    body: "Bonjour {{prenom}},\n\nLa formation « {{formation}} » ({{reference}}) que vous animez commence.\n\nInscrits :\n{{inscrits}}\n\nVotre lien personnel pour signer chaque demi-journée :\n{{lien_emargement}}\n\nMerci,",
  },
  {
    key: "evaluation_request",
    subject: "Votre avis sur la formation {{formation}}",
    body: "Bonjour {{prenom}},\n\nMerci d'avoir participé à la formation « {{formation}} ». Pouvez-vous prendre quelques minutes pour nous donner votre avis ?\n\n{{lien_evaluation}}\n\nMerci,",
  },
  {
    key: "evaluation_reminder",
    subject: "Rappel : votre avis sur la formation {{formation}}",
    body: "Bonjour {{prenom}},\n\nVous n'avez pas encore répondu au questionnaire de la formation « {{formation}} ». Votre avis nous est précieux :\n\n{{lien_evaluation}}\n\nMerci,",
  },
  {
    key: "certificate",
    subject: "Attestation de fin de formation : {{formation}}",
    body: "Bonjour {{prenom}},\n\nVeuillez trouver ci-joint votre attestation de fin de formation « {{formation}} ».\n\nCordialement,",
  },
  {
    key: "session_cancellation",
    subject: "Annulation : {{formation}}",
    body: "Bonjour {{prenom}},\n\nNous sommes au regret de vous informer que la session de la formation « {{formation}} » est annulée.\n\nDates prévues :\n{{dates}}\n\nMotif : {{motif}}\n\nNous vous prions de nous excuser pour ce désagrément.\n\nCordialement,",
  },
];

/** Email types sent automatically from lot 3; the others arrive with lot 4. */
export const ACTIVE_EMAIL_TYPES: readonly DocumentType[] = [
  "enrollment_confirmation",
  "waitlist_notice",
  "waitlist_promotion",
  "session_cancellation",
  "convocation",
  "reminder",
  "attendance_link",
  "trainer_attendance_link",
  "evaluation_request",
  "evaluation_reminder",
  "certificate",
];

export const EMAIL_TYPE_LABELS: Record<string, string> = {
  enrollment_confirmation: "Inscription confirmée",
  waitlist_notice: "Placement en liste d'attente",
  waitlist_promotion: "Place libérée (sortie de liste d'attente)",
  session_cancellation: "Annulation de session",
  convocation: "Convocation",
  reminder: "Rappel avant la session",
  attendance_link: "Lien d'émargement",
  trainer_attendance_link: "Lien d'émargement du formateur",
  evaluation_request: "Évaluation",
  evaluation_reminder: "Relance d'évaluation",
  certificate: "Attestation de fin de formation",
};

/** Document types that are emails (the others are generated PDF files). */
export const EMAIL_DOCUMENT_TYPES: DocumentType[] = [
  "enrollment_confirmation",
  "waitlist_notice",
  "waitlist_promotion",
  "reminder",
  "attendance_link",
  "trainer_attendance_link",
  "evaluation_request",
  "evaluation_reminder",
  "session_cancellation",
];
