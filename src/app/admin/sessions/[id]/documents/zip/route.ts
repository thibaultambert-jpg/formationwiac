import { db } from "@/lib/db";
import { audit } from "@/server/audit";
import { getCurrentUser } from "@/server/auth/guards";
import { buildSessionDossier } from "@/server/services/session-dossier";

// Full dossier of a session in one ZIP (I1), with its index of documents and sends.
export async function GET(_request: Request, { params }: RouteContext<"/admin/sessions/[id]/documents/zip">) {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") return new Response("Accès interdit", { status: 403 });
  const { id } = await params;
  const dossier = await buildSessionDossier(id);
  if (!dossier) return new Response("Session introuvable", { status: 404 });
  await audit(db, {
    userId: user.id,
    action: "export",
    entity: "session",
    entityId: id,
    after: { zip: dossier.entries.length },
  });
  return new Response(new Uint8Array(dossier.zip), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="dossier-${dossier.reference}.zip"`,
      "Cache-Control": "private, no-store",
    },
  });
}
