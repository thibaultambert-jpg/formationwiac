import type { Metadata } from "next";
import { Button } from "@/components/ui/button";
import { db } from "@/lib/db";
import { formatDateTime } from "@/lib/dates";
import { requireRole } from "@/server/auth/guards";
import { EVALUATION_TYPE_LABELS } from "@/server/services/evaluation-summary";
import { deleteQuestion } from "./actions";
import { DelaysForm, QuestionForm, RunAutomationForm } from "./forms";

export const metadata: Metadata = { title: "Évaluations et rappels" };

export default async function EvaluationSettingsPage() {
  await requireRole(["admin"]);
  const [settings, questions, lastRun] = await Promise.all([
    db.organizationSettings.findUnique({ where: { id: 1 } }),
    db.evaluationQuestion.findMany({ orderBy: [{ evaluationType: "asc" }, { position: "asc" }] }),
    db.auditLog.findFirst({ where: { entity: "settings", entityId: "automation" }, orderBy: { createdAt: "desc" } }),
  ]);

  return (
    <div className="space-y-10">
      <section aria-labelledby="delays-title" className="space-y-3">
        <h2 id="delays-title" className="text-lg font-semibold">
          Délais des envois automatiques
        </h2>
        <DelaysForm
          settings={{
            reminderDaysBefore: settings?.reminderDaysBefore ?? 3,
            coldEvaluationDays: settings?.coldEvaluationDays ?? 60,
            evaluationReminderDays: settings?.evaluationReminderDays ?? 5,
          }}
        />
      </section>

      <section aria-labelledby="automation-title" className="space-y-3">
        <h2 id="automation-title" className="text-lg font-semibold">
          Tâches automatiques
        </h2>
        <p className="text-muted-foreground text-sm">
          Rappels J-X, liens d&apos;émargement le matin de chaque journée, clôture des sessions terminées (présences,
          attestations, évaluation à chaud), évaluation à froid, relances et durée de conservation. Elles
          s&apos;exécutent chaque jour via Vercel Cron ; une même tâche n&apos;envoie jamais deux fois le même email.
          {lastRun ? ` Dernière exécution ayant produit un résultat : ${formatDateTime(lastRun.createdAt)}.` : ""}
        </p>
        <RunAutomationForm />
      </section>

      {(["hot", "cold"] as const).map((type) => (
        <section key={type} aria-labelledby={`questions-${type}`} className="space-y-3">
          <h2 id={`questions-${type}`} className="text-lg font-semibold">
            Questionnaire {EVALUATION_TYPE_LABELS[type].toLowerCase()}
          </h2>
          <p className="text-muted-foreground text-sm">
            Les réponses conservent le libellé de la question au moment de la réponse : modifier ou supprimer une
            question ne change pas les réponses passées.
          </p>
          <ul className="divide-y rounded-md border">
            {questions
              .filter((question) => question.evaluationType === type)
              .map((question) => (
                <li key={question.id} className="space-y-2 p-4">
                  <QuestionForm
                    evaluationType={type}
                    question={{ ...question, options: (question.options as string[] | null) ?? [] }}
                  />
                  <form action={deleteQuestion}>
                    <input type="hidden" name="id" value={question.id} />
                    <Button type="submit" variant="ghost" size="sm" className="text-destructive">
                      Supprimer
                    </Button>
                  </form>
                </li>
              ))}
          </ul>
          <div className="rounded-md border border-dashed p-4">
            <QuestionForm evaluationType={type} />
          </div>
        </section>
      ))}
    </div>
  );
}
