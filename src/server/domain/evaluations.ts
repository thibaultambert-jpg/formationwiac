// Evaluation answers and synthesis (appendix). Answers are stored with a copy
// of the question label so that later edits of the questionnaire do not alter
// past answers.

export type AnswerType = "scale_1_5" | "scale_0_10" | "single_choice" | "choice_with_other" | "text";

export type Question = {
  id: string;
  label: string;
  answerType: AnswerType;
  options: string[] | null;
  required: boolean;
};

export type StoredAnswer = {
  questionId: string;
  label: string;
  answerType: AnswerType;
  answer: string | number | null;
  other?: string | null;
};

export type ValidationResult = { ok: true; answers: StoredAnswer[] } | { ok: false; errors: Record<string, string> };

/** Validates raw form values (one entry per question id, plus `<id>.other`). */
export function validateAnswers(questions: readonly Question[], values: Record<string, string>): ValidationResult {
  const errors: Record<string, string> = {};
  const answers: StoredAnswer[] = [];
  for (const question of questions) {
    const raw = (values[question.id] ?? "").trim();
    if (!raw) {
      if (question.required) errors[question.id] = "Réponse obligatoire.";
      answers.push({ questionId: question.id, label: question.label, answerType: question.answerType, answer: null });
      continue;
    }
    if (question.answerType === "scale_1_5" || question.answerType === "scale_0_10") {
      const value = Number(raw);
      const [min, max] = question.answerType === "scale_1_5" ? [1, 5] : [0, 10];
      if (!Number.isInteger(value) || value < min || value > max) {
        errors[question.id] = `Choisissez une note de ${min} à ${max}.`;
        continue;
      }
      answers.push({ questionId: question.id, label: question.label, answerType: question.answerType, answer: value });
      continue;
    }
    if (question.answerType === "single_choice" || question.answerType === "choice_with_other") {
      if (!(question.options ?? []).includes(raw)) {
        errors[question.id] = "Choisissez une des réponses proposées.";
        continue;
      }
      const other = (values[`${question.id}.other`] ?? "").trim() || null;
      answers.push({
        questionId: question.id,
        label: question.label,
        answerType: question.answerType,
        answer: raw,
        other: question.answerType === "choice_with_other" ? other : null,
      });
      continue;
    }
    answers.push({
      questionId: question.id,
      label: question.label,
      answerType: question.answerType,
      answer: raw.slice(0, 5000),
    });
  }
  return Object.keys(errors).length > 0 ? { ok: false, errors } : { ok: true, answers };
}

/** Global score: average of the 1-5 scale answers, rounded to 2 decimals. */
export function globalScore(answers: readonly StoredAnswer[]): number | null {
  const scores = answers
    .filter((answer) => answer.answerType === "scale_1_5" && typeof answer.answer === "number")
    .map((answer) => answer.answer as number);
  if (scores.length === 0) return null;
  return Math.round((scores.reduce((sum, score) => sum + score, 0) / scores.length) * 100) / 100;
}

export type QuestionSummary = {
  questionId: string;
  label: string;
  answerType: AnswerType;
  responses: number;
  average: number | null;
  distribution: { value: string; count: number }[];
  verbatims: string[];
};

/** Per-question synthesis of a set of submitted evaluations. */
export function summarize(
  questions: readonly Pick<Question, "id" | "label" | "answerType" | "options">[],
  submissions: readonly StoredAnswer[][],
): QuestionSummary[] {
  return questions.map((question) => {
    const answers = submissions
      .map((submission) => submission.find((answer) => answer.questionId === question.id))
      .filter((answer): answer is StoredAnswer => Boolean(answer) && answer!.answer !== null);
    const numeric = answers
      .map((answer) => answer.answer)
      .filter((value): value is number => typeof value === "number");
    const counts = new Map<string, number>();
    if (question.answerType !== "text") {
      const values =
        question.answerType === "scale_1_5"
          ? ["1", "2", "3", "4", "5"]
          : question.answerType === "scale_0_10"
            ? Array.from({ length: 11 }, (_, index) => String(index))
            : (question.options ?? []);
      for (const value of values) counts.set(value, 0);
      for (const answer of answers) counts.set(String(answer.answer), (counts.get(String(answer.answer)) ?? 0) + 1);
    }
    return {
      questionId: question.id,
      label: question.label,
      answerType: question.answerType,
      responses: answers.length,
      average: numeric.length
        ? Math.round((numeric.reduce((sum, value) => sum + value, 0) / numeric.length) * 100) / 100
        : null,
      distribution: [...counts.entries()].map(([value, count]) => ({ value, count })),
      verbatims: [
        ...answers.filter((answer) => answer.answerType === "text").map((answer) => String(answer.answer)),
        ...answers.filter((answer) => answer.other).map((answer) => `${answer.answer} : ${answer.other}`),
      ],
    };
  });
}
