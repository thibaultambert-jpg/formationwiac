import { getCurrentUser } from "@/server/auth/guards";
import { toCsv } from "@/server/domain/csv";
import { formatDecimal } from "@/server/domain/numbers";
import { csvResponse, requestFilters } from "@/server/csv-response";
import { indicatorsByTraining } from "@/server/services/indicators";
import { readYear } from "../year";

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") return new Response("Accès interdit", { status: 403 });
  const params = requestFilters(request);
  const year = readYear(params);
  const rows = await indicatorsByTraining(year);
  const value = (number: number | null) => (number === null ? "" : formatDecimal(number));
  const csv = toCsv(
    [
      "Formation",
      "Sessions",
      "Stagiaires",
      "Satisfaction",
      "Assiduité (%)",
      "Abandon (%)",
      "Absence (%)",
      "Réponse (%)",
      "Acquis (%)",
    ],
    rows.map((row) => [
      row.title,
      row.sessions,
      row.trainees,
      value(row.satisfaction),
      value(row.attendanceRate),
      value(row.dropoutRate),
      value(row.absenceRate),
      value(row.responseRate),
      value(row.learningRate),
    ]),
  );
  return csvResponse(csv, `indicateurs-${year}`, {
    userId: user.id,
    entity: "settings",
    entityId: "indicators",
    filters: params,
    rows: rows.length,
  });
}
