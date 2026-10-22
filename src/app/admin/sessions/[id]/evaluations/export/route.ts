import { db } from "@/lib/db";
import { getCurrentUser } from "@/server/auth/guards";
import { csvResponse } from "@/server/csv-response";
import { answersCsv, sessionEvaluations } from "@/server/services/evaluation-summary";

export async function GET(_request: Request, { params }: RouteContext<"/admin/sessions/[id]/evaluations/export">) {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") return new Response("Accès interdit", { status: 403 });
  const { id } = await params;
  const session = await db.trainingSession.findUnique({ where: { id }, select: { reference: true } });
  if (!session) return new Response("Session introuvable", { status: 404 });
  const evaluations = await Promise.all([sessionEvaluations(id, "hot"), sessionEvaluations(id, "cold")]);
  return csvResponse(answersCsv(evaluations), `evaluations-${session.reference}`);
}
