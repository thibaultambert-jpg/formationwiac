// Idempotent seed: default settings, themes, email templates and the
// provisional evaluation questionnaires (appendix of the specification).
// Existing rows are left untouched so that edits made in the settings screen
// are never overwritten.
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import {
  PrismaClient,
  type DocumentType,
  type EvaluationType,
  type QuestionAnswerType,
} from "../src/generated/prisma/client";

const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DIRECT_URL ?? process.env.DATABASE_URL }),
});

const THEMES = [
  "Management",
  "Bureautique et outils numériques",
  "Commercial",
  "Sécurité",
  "Efficacité professionnelle",
];

const EMAIL_TEMPLATES: { key: DocumentType; subject: string; body: string }[] = [
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
    body: "Bonjour {{prenom}},\n\nNous sommes au regret de vous informer que la session de la formation « {{formation}} » prévue le {{dates}} est annulée.\n\nNous vous prions de nous excuser pour ce désagrément.\n\nCordialement,",
  },
];

type QuestionSeed = { label: string; answerType: QuestionAnswerType; options?: string[] };

const QUESTIONS: Record<EvaluationType, QuestionSeed[]> = {
  hot: [
    { label: "Globalement, êtes-vous satisfait de cette formation ?", answerType: "scale_1_5" },
    {
      label: "Les objectifs annoncés ont-ils été atteints ?",
      answerType: "single_choice",
      options: ["Oui", "Partiellement", "Non"],
    },
    { label: "Le contenu correspondait-il à vos attentes et à vos besoins ?", answerType: "scale_1_5" },
    { label: "Comment évaluez-vous la pédagogie et la clarté du formateur ?", answerType: "scale_1_5" },
    {
      label: "Le rythme et la durée étaient-ils adaptés ?",
      answerType: "single_choice",
      options: ["Trop lent", "Adapté", "Trop rapide"],
    },
    {
      label: "Comment évaluez-vous l'organisation (convocation, lieu ou outil visio, supports) ?",
      answerType: "scale_1_5",
    },
    { label: "Vous sentez-vous capable d'appliquer ce que vous avez appris ?", answerType: "scale_1_5" },
    { label: "Recommanderiez-vous cette formation à un collègue ?", answerType: "scale_0_10" },
    { label: "Qu'avez-vous le plus apprécié ?", answerType: "text" },
    { label: "Que faudrait-il améliorer ?", answerType: "text" },
  ],
  cold: [
    {
      label: "Avez-vous mis en pratique ce que vous avez appris ?",
      answerType: "single_choice",
      options: ["Oui, régulièrement", "Ponctuellement", "Pas encore"],
    },
    {
      label: "Si non, qu'est-ce qui vous en a empêché ?",
      answerType: "choice_with_other",
      options: ["Pas d'occasion", "Manque de temps", "Contenu peu adapté", "Autre"],
    },
    { label: "Quel impact la formation a-t-elle eu sur votre travail ?", answerType: "scale_1_5" },
    {
      label: "Avec le recul, les objectifs de la formation sont-ils atteints pour vous ?",
      answerType: "single_choice",
      options: ["Oui", "Partiellement", "Non"],
    },
    {
      label: "Auriez-vous besoin d'un approfondissement ou d'une formation complémentaire ?",
      answerType: "choice_with_other",
      options: ["Non", "Oui (précisez)"],
    },
    { label: "Un exemple concret d'application ou une remarque ?", answerType: "text" },
  ],
};

const OPTIONAL_QUESTION_TYPES: QuestionAnswerType[] = ["text"];

async function main() {
  await db.organizationSettings.upsert({
    where: { id: 1 },
    update: {},
    create: { id: 1, name: "Organisme de formation" },
  });

  for (const [position, name] of THEMES.entries()) {
    await db.theme.upsert({ where: { name }, update: {}, create: { name, position } });
  }

  for (const template of EMAIL_TEMPLATES) {
    await db.emailTemplate.upsert({ where: { key: template.key }, update: {}, create: template });
  }

  for (const [type, questions] of Object.entries(QUESTIONS) as [EvaluationType, QuestionSeed[]][]) {
    const existing = await db.evaluationQuestion.count({ where: { evaluationType: type } });
    if (existing > 0) continue;
    await db.evaluationQuestion.createMany({
      data: questions.map((question, index) => ({
        evaluationType: type,
        position: index + 1,
        label: question.label,
        answerType: question.answerType,
        options: question.options,
        // Free-text answers and the conditional cold question 2 are optional.
        required: !OPTIONAL_QUESTION_TYPES.includes(question.answerType) && !question.label.startsWith("Si non"),
      })),
    });
  }

  console.log("Seed completed.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
