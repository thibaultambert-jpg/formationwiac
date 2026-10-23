import "server-only";
import type { EvaluationType } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import type { FormQuestion } from "@/components/evaluation-form";

export async function activeQuestions(type: EvaluationType): Promise<FormQuestion[]> {
  const questions = await db.evaluationQuestion.findMany({
    where: { evaluationType: type, active: true },
    orderBy: { position: "asc" },
  });
  return questions.map((question) => ({
    id: question.id,
    label: question.label,
    answerType: question.answerType,
    options: (question.options as string[] | null) ?? null,
    required: question.required,
  }));
}
