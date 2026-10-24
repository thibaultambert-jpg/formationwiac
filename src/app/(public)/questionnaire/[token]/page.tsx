import type { Metadata } from "next";
import { EvaluationForm } from "@/components/evaluation-form";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { db } from "@/lib/db";
import { formatDateRange } from "@/lib/dates";
import { activeQuestions } from "@/server/services/evaluation-questions";
import { resolveToken } from "@/server/tokens";

export const metadata: Metadata = { title: "Questionnaire", robots: { index: false } };

// Company or trainer questionnaire of a session (D9), through a personal link.
export default async function StakeholderQuestionnairePage({ params }: PageProps<"/questionnaire/[token]">) {
  const { token } = await params;
  const record = await resolveToken(token, ["stakeholder_evaluation"]);
  const evaluation = record?.stakeholderEvaluationId
    ? await db.stakeholderEvaluation.findUnique({
        where: { id: record.stakeholderEvaluationId },
        include: {
          company: { select: { name: true } },
          session: { include: { training: true, slots: { select: { startsAt: true } } } },
        },
      })
    : null;
  if (!evaluation || (evaluation.type !== "company" && evaluation.type !== "trainer")) {
    return (
      <Alert variant="destructive">
        <AlertDescription>Ce lien n&apos;est pas ou plus valide.</AlertDescription>
      </Alert>
    );
  }
  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold">
          {evaluation.type === "company" ? "Votre avis sur la formation de vos collaborateurs" : "Bilan de la session"}
        </h1>
        <p className="text-muted-foreground">
          {evaluation.session.training.title} · {formatDateRange(evaluation.session.slots.map((slot) => slot.startsAt))}
          {evaluation.company ? ` · ${evaluation.company.name}` : ""}
        </p>
      </div>
      {evaluation.submittedAt ? (
        <Alert variant="success">
          <AlertDescription>Merci pour vos réponses ! Votre questionnaire est bien enregistré.</AlertDescription>
        </Alert>
      ) : (
        <EvaluationForm token={token} questions={await activeQuestions(evaluation.type)} stakeholder />
      )}
    </div>
  );
}
