import { getCurrentUser } from "@/server/auth/guards";
import { parisMonthBounds } from "@/lib/dates";
import { csvResponse, requestFilters } from "@/server/csv-response";
import { answersCsv, periodEvaluations } from "@/server/services/evaluation-summary";
import { readYear } from "../year";

// Consolidated questionnaires of a year, every session (D9).
export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") return new Response("Accès interdit", { status: 403 });
  const params = requestFilters(request);
  const year = readYear(params);
  const from = parisMonthBounds(year, 1).start;
  const to = parisMonthBounds(year + 1, 1).start;
  const evaluations = await Promise.all(
    (["positioning", "hot", "cold", "company", "trainer"] as const).map((type) => periodEvaluations(type, from, to)),
  );
  return csvResponse(answersCsv(evaluations), `questionnaires-${year}`, {
    userId: user.id,
    entity: "settings",
    entityId: "questionnaires",
    filters: params,
    rows: evaluations.reduce((sum, item) => sum + item.rows.length, 0),
  });
}
