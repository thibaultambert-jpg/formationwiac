import { db } from "@/lib/db";
import { formatDate } from "@/lib/dates";
import { COMPLAINT_STATUS_LABELS } from "@/lib/labels";
import { getCurrentUser } from "@/server/auth/guards";
import { toCsv } from "@/server/domain/csv";
import { csvResponse, requestFilters } from "@/server/csv-response";
import { complaintFilters } from "../../data";

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") return new Response("Accès interdit", { status: 403 });
  const params = requestFilters(request);
  const complaints = await db.complaint.findMany({
    where: complaintFilters(params).where,
    include: { session: { select: { reference: true } }, improvements: { select: { action: true } } },
    orderBy: { receivedAt: "asc" },
  });
  const csv = toCsv(
    [
      "Reçue le",
      "Émetteur",
      "Canal",
      "Session",
      "Objet",
      "Description",
      "Traitement",
      "Réponse",
      "Statut",
      "Clôturée le",
      "Actions d'amélioration",
    ],
    complaints.map((complaint) => [
      formatDate(complaint.receivedAt),
      complaint.complainant,
      complaint.channel,
      complaint.session?.reference,
      complaint.subject,
      complaint.description,
      complaint.treatment,
      complaint.response,
      COMPLAINT_STATUS_LABELS[complaint.status],
      complaint.closedAt ? formatDate(complaint.closedAt) : "",
      complaint.improvements.map((item) => item.action).join(" | "),
    ]),
  );
  return csvResponse(csv, "reclamations", {
    userId: user.id,
    entity: "complaint",
    entityId: "list",
    filters: params,
    rows: complaints.length,
  });
}
