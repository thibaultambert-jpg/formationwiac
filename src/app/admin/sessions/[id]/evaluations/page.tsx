import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Download } from "lucide-react";
import { ActionButton } from "@/components/forms/action-button";
import { Button } from "@/components/ui/button";
import { db } from "@/lib/db";
import { requireRole } from "@/server/auth/guards";
import { formatDecimal } from "@/server/domain/numbers";
import { EVALUATION_TYPE_LABELS, sessionEvaluations } from "@/server/services/evaluation-summary";
import { sendHotEvaluationAction, sendPositioningAction, sendStakeholderAction } from "../documents/actions";

export const metadata: Metadata = { title: "Évaluations" };

export default async function SessionEvaluationsPage({ params }: PageProps<"/admin/sessions/[id]/evaluations">) {
  await requireRole(["admin"]);
  const { id } = await params;
  const session = await db.trainingSession.findUnique({ where: { id }, select: { id: true, status: true } });
  if (!session) notFound();
  const all = await Promise.all(
    (["positioning", "hot", "cold", "company", "trainer"] as const).map((type) => sessionEvaluations(id, type)),
  );
  // Hot and cold are always shown; the other questionnaires once sent.
  const evaluations = all.filter((item) => item.type === "hot" || item.type === "cold" || item.sent > 0);
  const present = await db.enrollment.count({ where: { sessionId: id, status: "present" } });

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start gap-2">
        {session.status === "completed" ? (
          <>
            <ActionButton
              action={sendHotEvaluationAction}
              hidden={{ sessionId: id, type: "hot" }}
              label="Envoyer l'évaluation à chaud"
              variant="outline"
            />
            <ActionButton
              action={sendHotEvaluationAction}
              hidden={{ sessionId: id, type: "cold" }}
              label="Envoyer l'évaluation à froid"
              variant="outline"
            />
            <ActionButton
              action={sendStakeholderAction}
              hidden={{ sessionId: id }}
              label="Envoyer les questionnaires entreprise et formateur"
              variant="outline"
            />
          </>
        ) : (
          <>
            {session.status !== "cancelled" ? (
              <ActionButton
                action={sendPositioningAction}
                hidden={{ sessionId: id }}
                label="Envoyer le questionnaire de positionnement"
                variant="outline"
              />
            ) : null}
            <p className="text-muted-foreground text-sm">
              Le positionnement part automatiquement avant la session ; l&apos;évaluation à chaud et les questionnaires
              entreprise et formateur à la clôture.
            </p>
          </>
        )}
        <Button asChild variant="outline">
          <a href={`/admin/sessions/${id}/evaluations/export`}>
            <Download aria-hidden="true" />
            Exporter les réponses (CSV)
          </a>
        </Button>
      </div>

      {evaluations.map((evaluation) => (
        <section key={evaluation.type} aria-labelledby={`evaluation-${evaluation.type}`} className="space-y-4">
          <div className="space-y-1">
            <h2 id={`evaluation-${evaluation.type}`} className="text-lg font-semibold">
              {evaluation.type === "hot" || evaluation.type === "cold"
                ? `Évaluation ${EVALUATION_TYPE_LABELS[evaluation.type].toLowerCase()}`
                : `Questionnaire ${EVALUATION_TYPE_LABELS[evaluation.type].toLowerCase()}`}
            </h2>
            <p className="text-muted-foreground text-sm">
              {evaluation.submitted} réponse(s)
              {evaluation.type === "hot" || evaluation.type === "cold"
                ? ` sur ${present} participant(s) présent(s)`
                : ""}{" "}
              · {evaluation.sent} envoi(s)
              {evaluation.averageScore !== null
                ? ` · note globale moyenne ${formatDecimal(evaluation.averageScore)} / 5`
                : ""}
            </p>
          </div>
          {evaluation.submitted === 0 ? (
            <p className="text-sm">Aucune réponse pour le moment.</p>
          ) : (
            <ol className="space-y-4">
              {evaluation.questions.map((question) => {
                const max = Math.max(1, ...question.distribution.map((entry) => entry.count));
                return (
                  <li key={question.questionId} className="space-y-2 rounded-md border p-4">
                    <p className="font-medium">{question.label}</p>
                    <p className="text-muted-foreground text-xs">
                      {question.responses} réponse(s)
                      {question.average !== null ? ` · moyenne ${formatDecimal(question.average)}` : ""}
                    </p>
                    {question.distribution.length > 0 ? (
                      <ul className="space-y-1">
                        {question.distribution.map((entry) => (
                          <li key={entry.value} className="grid grid-cols-[8rem_1fr_2rem] items-center gap-2 text-sm">
                            <span className="truncate">{entry.value}</span>
                            <span className="bg-muted h-3 overflow-hidden rounded">
                              <span
                                className="bg-primary block h-full"
                                style={{ width: `${(entry.count / max) * 100}%` }}
                              />
                            </span>
                            <span className="text-right">{entry.count}</span>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                    {question.verbatims.length > 0 ? (
                      <ul className="list-disc space-y-1 pl-5 text-sm">
                        {question.verbatims.map((verbatim, index) => (
                          <li key={index}>{verbatim}</li>
                        ))}
                      </ul>
                    ) : null}
                  </li>
                );
              })}
            </ol>
          )}
        </section>
      ))}
    </div>
  );
}
