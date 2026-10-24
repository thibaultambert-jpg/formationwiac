import { db } from "@/lib/db";
import { LEARNING_RESULT_LABELS } from "@/lib/labels";
import { assessAsTrainer } from "@/app/(public)/actions";
import { LearningAssessmentForm } from "./learning-assessment-form";

/**
 * Learning assessment by the trainer (D5): one result and comment per trainee,
 * from the trainer link or "Mes sessions". `auth` is the trainer token or the
 * session id (signed-in trainer), checked again by the action.
 */
export async function LearningAssessmentPanel({
  sessionId,
  auth,
}: {
  sessionId: string;
  auth: { token: string } | { sessionId: string };
}) {
  const enrollments = await db.enrollment.findMany({
    where: { sessionId, status: { in: ["confirmed", "present", "absent", "dropped_out"] } },
    select: {
      id: true,
      learningResult: true,
      learningComment: true,
      participant: { select: { firstName: true, lastName: true } },
    },
    orderBy: [{ participant: { lastName: "asc" } }, { participant: { firstName: "asc" } }],
  });
  if (enrollments.length === 0) return null;
  const options = Object.entries(LEARNING_RESULT_LABELS).map(([value, label]) => ({ value, label }));

  return (
    <section aria-labelledby="learning-title" className="space-y-3">
      <h2 id="learning-title" className="text-lg font-semibold">
        Évaluation des acquis
      </h2>
      <p className="text-muted-foreground text-sm">
        Indiquez pour chaque stagiaire si les objectifs sont acquis. Le résultat et le commentaire figurent sur son
        attestation de fin de formation.
      </p>
      <ul className="divide-y rounded-xl border">
        {enrollments.map((enrollment) => (
          <li key={enrollment.id} className="p-3">
            <LearningAssessmentForm
              action={assessAsTrainer}
              hidden={{ ...auth, enrollmentId: enrollment.id }}
              name={`${enrollment.participant.firstName} ${enrollment.participant.lastName}`}
              options={options}
              result={enrollment.learningResult}
              comment={enrollment.learningComment}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}
