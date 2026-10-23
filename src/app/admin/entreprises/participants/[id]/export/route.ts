import { db } from "@/lib/db";
import { toParisDateInput } from "@/lib/dates";
import { audit } from "@/server/audit";
import { getCurrentUser } from "@/server/auth/guards";
import { exportParticipantData } from "@/server/services/privacy";

// Right of access (GDPR): JSON export of everything stored about a participant.
export async function GET(_request: Request, { params }: RouteContext<"/admin/entreprises/participants/[id]/export">) {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") return new Response("Accès interdit", { status: 403 });
  const { id } = await params;
  const data = await exportParticipantData(id);
  if (!data) return new Response("Participant introuvable", { status: 404 });

  await audit(db, { userId: user.id, action: "export", entity: "participant", entityId: id });
  const filename =
    `donnees-${data.participant.lastName}-${data.participant.firstName}-${toParisDateInput(new Date())}.json`
      .normalize("NFD")
      .replace(/[^\w.-]+/g, "-");
  return new Response(JSON.stringify(data, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
