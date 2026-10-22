import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/server/auth/guards";
import { issueToken } from "@/server/tokens";

// Opens the evaluation questionnaire of one of the current user's trainings.
export async function GET(request: Request, { params }: RouteContext<"/mes-formations/evaluation/[id]">) {
  const user = await getCurrentUser();
  if (!user) return new Response("Non authentifié", { status: 401 });
  const { id } = await params;
  const type = new URL(request.url).searchParams.get("type") === "cold" ? "cold" : "hot";
  const enrollment = await db.enrollment.findUnique({ where: { id }, include: { participant: true } });
  if (!enrollment || enrollment.participant.userId !== user.id || enrollment.status !== "present") {
    return new Response("Évaluation indisponible", { status: 404 });
  }
  const token = await issueToken(db, {
    purpose: type === "hot" ? "hot_evaluation" : "cold_evaluation",
    enrollmentId: enrollment.id,
    expiresAt: new Date(Date.now() + 24 * 3_600_000),
  });
  redirect(`/evaluation/${token}`);
}
