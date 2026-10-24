import { db } from "@/lib/db";
import { toParisDateInput } from "@/lib/dates";
import { audit } from "@/server/audit";
import { getCurrentUser } from "@/server/auth/guards";
import { exportParticipantArchive } from "@/server/services/privacy";

// Right of access (GDPR, E6): ZIP with the JSON of everything stored about the
// participant, their audit history and the files about them.
export async function GET(_request: Request, { params }: RouteContext<"/admin/entreprises/participants/[id]/export">) {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") return new Response("Accès interdit", { status: 403 });
  const { id } = await params;
  const archive = await exportParticipantArchive(id);
  if (!archive) return new Response("Participant introuvable", { status: 404 });

  await audit(db, {
    userId: user.id,
    action: "export",
    entity: "participant",
    entityId: id,
    after: { files: archive.entries.length },
  });
  const filename =
    `donnees-${archive.data.participant.lastName}-${archive.data.participant.firstName}-${toParisDateInput(new Date())}.zip`
      .normalize("NFD")
      .replace(/[^\w.-]+/g, "-");
  return new Response(new Uint8Array(archive.zip), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
