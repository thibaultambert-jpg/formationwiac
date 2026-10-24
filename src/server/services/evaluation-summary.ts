import "server-only";
import type { EvaluationType } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { formatDateTime } from "@/lib/dates";
import { toCsv } from "@/server/domain/csv";
import { summarize, type AnswerType, type QuestionSummary, type StoredAnswer } from "@/server/domain/evaluations";

export { EVALUATION_TYPE_LABELS } from "@/lib/labels";
import { EVALUATION_TYPE_LABELS } from "@/lib/labels";

export type SessionEvaluations = {
  type: EvaluationType;
  sent: number;
  submitted: number;
  averageScore: number | null;
  questions: QuestionSummary[];
  rows: { participant: string; submittedAt: Date; globalScore: number | null; answers: StoredAnswer[] }[];
};

export async function sessionEvaluations(sessionId: string, type: EvaluationType): Promise<SessionEvaluations> {
  const [evaluations, configured] = await Promise.all([
    db.evaluation.findMany({
      where: { type, enrollment: { sessionId } },
      include: { enrollment: { include: { participant: true } } },
      orderBy: { submittedAt: "asc" },
    }),
    db.evaluationQuestion.findMany({ where: { evaluationType: type }, orderBy: { position: "asc" } }),
  ]);
  const submitted = evaluations.filter((evaluation) => evaluation.submittedAt && Array.isArray(evaluation.answers));
  const answers = submitted.map((evaluation) => evaluation.answers as unknown as StoredAnswer[]);

  // Questions answered but since removed keep their stored label.
  const questions = configured
    .filter(
      (question) => question.active || answers.some((set) => set.some((answer) => answer.questionId === question.id)),
    )
    .map((question) => ({
      id: question.id,
      label: question.label,
      answerType: question.answerType as AnswerType,
      options: (question.options as string[] | null) ?? null,
    }));
  for (const set of answers) {
    for (const answer of set) {
      if (!questions.some((question) => question.id === answer.questionId)) {
        questions.push({ id: answer.questionId, label: answer.label, answerType: answer.answerType, options: null });
      }
    }
  }

  const scores = submitted
    .map((evaluation) => (evaluation.globalScore === null ? null : Number(evaluation.globalScore)))
    .filter((score): score is number => score !== null);
  return {
    type,
    sent: evaluations.filter((evaluation) => evaluation.sentAt).length,
    submitted: submitted.length,
    averageScore: scores.length
      ? Math.round((scores.reduce((sum, score) => sum + score, 0) / scores.length) * 100) / 100
      : null,
    questions: summarize(questions, answers),
    rows: submitted.map((evaluation, index) => ({
      participant: `${evaluation.enrollment.participant.firstName} ${evaluation.enrollment.participant.lastName}`,
      submittedAt: evaluation.submittedAt!,
      globalScore: evaluation.globalScore === null ? null : Number(evaluation.globalScore),
      answers: answers[index],
    })),
  };
}

function answerText(answer: StoredAnswer | undefined): string {
  if (!answer || answer.answer === null) return "";
  return answer.other ? `${answer.answer} (${answer.other})` : String(answer.answer);
}

/** One row per submitted questionnaire, one column per question. */
export function answersCsv(evaluations: SessionEvaluations[]): string {
  const questions = evaluations.flatMap((evaluation) =>
    evaluation.questions.map((question) => ({ type: evaluation.type, ...question })),
  );
  const header = [
    "Type",
    "Participant",
    "Soumis le",
    "Note globale",
    ...questions.map((question) => `${EVALUATION_TYPE_LABELS[question.type]} - ${question.label}`),
  ];
  const rows = evaluations.flatMap((evaluation) =>
    evaluation.rows.map((row) => [
      EVALUATION_TYPE_LABELS[evaluation.type],
      row.participant,
      formatDateTime(row.submittedAt),
      row.globalScore?.toString().replace(".", ","),
      ...questions.map((question) =>
        question.type === evaluation.type
          ? answerText(row.answers.find((answer) => answer.questionId === question.questionId))
          : "",
      ),
    ]),
  );
  return toCsv(header, rows);
}

/** Per-question synthesis: averages, distribution and verbatims. */
export function summaryCsv(evaluations: SessionEvaluations[]): string {
  const rows = evaluations.flatMap((evaluation) =>
    evaluation.questions.map((question) => [
      EVALUATION_TYPE_LABELS[evaluation.type],
      question.label,
      question.responses,
      question.average?.toString().replace(".", ","),
      question.distribution.map((entry) => `${entry.value} : ${entry.count}`).join(" | "),
      question.verbatims.join(" | "),
    ]),
  );
  return toCsv(["Type", "Question", "Réponses", "Moyenne", "Répartition", "Verbatims"], rows);
}
