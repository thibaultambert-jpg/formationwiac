import { db } from "@/lib/db";
import { formatDate } from "@/lib/dates";
import { IMPROVEMENT_SOURCE_LABELS, IMPROVEMENT_STATUS_LABELS } from "@/lib/labels";
import { getCurrentUser } from "@/server/auth/guards";
import { toCsv } from "@/server/domain/csv";
import { csvResponse, requestFilters } from "@/server/csv-response";
import { improvementFilters } from "../../data";

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") return new Response("Accès interdit", { status: 403 });
  const params = requestFilters(request);
  const actions = await db.improvementAction.findMany({
    where: improvementFilters(params).where,
    include: { complaint: { select: { subject: true } } },
    orderBy: { createdAt: "asc" },
  });
  const csv = toCsv(
    [
      "Créée le",
      "Source",
      "Réclamation",
      "Constat",
      "Action",
      "Responsable",
      "Échéance",
      "Statut",
      "Résultat",
      "Clôturée le",
    ],
    actions.map((item) => [
      formatDate(item.createdAt),
      IMPROVEMENT_SOURCE_LABELS[item.source],
      item.complaint?.subject,
      item.origin,
      item.action,
      item.owner,
      item.dueDate ? formatDate(item.dueDate) : "",
      IMPROVEMENT_STATUS_LABELS[item.status],
      item.result,
      item.closedAt ? formatDate(item.closedAt) : "",
    ]),
  );
  return csvResponse(csv, "amelioration-continue", {
    userId: user.id,
    entity: "improvement_action",
    entityId: "list",
    filters: params,
    rows: actions.length,
  });
}
