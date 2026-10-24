// Idempotent seed: default settings, themes, email templates and the
// provisional evaluation questionnaires (appendix of the specification).
// Existing rows are left untouched so that edits made in the settings screen
// are never overwritten.
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, type EvaluationType, type QuestionAnswerType } from "../src/generated/prisma/client";
import { DEFAULT_EMAIL_TEMPLATES } from "../src/server/email/default-templates";

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
  positioning: [
    { label: "Comment évaluez-vous votre niveau actuel sur le sujet de la formation ?", answerType: "scale_1_5" },
    {
      label: "Avez-vous déjà suivi une formation sur ce thème ?",
      answerType: "single_choice",
      options: ["Oui", "Non"],
    },
    {
      label: "Utilisez-vous déjà ces compétences dans votre travail ?",
      answerType: "single_choice",
      options: ["Régulièrement", "Ponctuellement", "Jamais"],
    },
    { label: "Qu'attendez-vous de cette formation ?", answerType: "text" },
  ],
  company: [
    {
      label: "Globalement, êtes-vous satisfait de la formation suivie par vos collaborateurs ?",
      answerType: "scale_1_5",
    },
    {
      label: "La formation a-t-elle répondu au besoin exprimé ?",
      answerType: "single_choice",
      options: ["Oui", "Partiellement", "Non"],
    },
    { label: "Comment évaluez-vous l'organisation (échanges, convention, documents) ?", answerType: "scale_1_5" },
    { label: "Remarques ou besoins complémentaires ?", answerType: "text" },
  ],
  trainer: [
    {
      label: "Le niveau du groupe correspondait-il aux prérequis ?",
      answerType: "single_choice",
      options: ["Oui", "Partiellement", "Non"],
    },
    { label: "Les conditions matérielles et logistiques étaient-elles satisfaisantes ?", answerType: "scale_1_5" },
    {
      label: "Les objectifs ont-ils été atteints par le groupe ?",
      answerType: "single_choice",
      options: ["Oui", "Partiellement", "Non"],
    },
    { label: "Remarques et suggestions d'amélioration", answerType: "text" },
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

  for (const template of DEFAULT_EMAIL_TEMPLATES) {
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
