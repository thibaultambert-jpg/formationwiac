import type { Metadata } from "next";
import { EvaluationForm } from "@/components/evaluation-form";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { db } from "@/lib/db";
import { formatDateRange } from "@/lib/dates";
import { activeQuestions } from "@/server/services/evaluation-questions";
import { resolveToken } from "@/server/tokens";

export const metadata: Metadata = { title: "Évaluation", robots: { index: false } };

export default async function EvaluationPage({ params }: PageProps<"/evaluation/[token]">) {
  const { token } = await params;
  const record = await resolveToken(token, ["hot_evaluation", "cold_evaluation"]);
  const enrollment = record?.enrollmentId
    ? await db.enrollment.findUnique({
        where: { id: record.enrollmentId },
        include: {
          participant: true,
          evaluations: true,
          session: { include: { training: true, slots: { select: { startsAt: true } } } },
        },
      })
    : null;
  if (!record || !enrollment) {
    return (
      <Alert variant="destructive">
        <AlertDescription>Ce lien d&apos;évaluation n&apos;est pas ou plus valide.</AlertDescription>
      </Alert>
    );
  }
  const type = record.purpose === "hot_evaluation" ? "hot" : "cold";
  const already = enrollment.evaluations.find((evaluation) => evaluation.type === type)?.submittedAt;

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold">
          {type === "hot" ? "Votre avis sur la formation" : "Quelques semaines après la formation"}
        </h1>
        <p className="text-muted-foreground">
          {enrollment.session.training.title} · {formatDateRange(enrollment.session.slots.map((slot) => slot.startsAt))}
        </p>
      </div>
      {already ? (
        <Alert variant="success">
          <AlertDescription>Merci pour vos réponses ! Votre questionnaire est bien enregistré.</AlertDescription>
        </Alert>
      ) : (
        <EvaluationForm token={token} questions={await activeQuestions(type)} />
      )}
    </div>
  );
}
