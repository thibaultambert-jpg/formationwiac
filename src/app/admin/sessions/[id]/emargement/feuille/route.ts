import { db } from "@/lib/db";
import { audit } from "@/server/audit";
import { getCurrentUser } from "@/server/auth/guards";
import { attendanceSheet, pdfFilename } from "@/server/services/session-documents";

export async function GET(_request: Request, { params }: RouteContext<"/admin/sessions/[id]/emargement/feuille">) {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") return new Response("Accès interdit", { status: 403 });
  const { id } = await params;
  const { documents, pdf } = await attendanceSheet(id);
  await audit(db, { userId: user.id, action: "export", entity: "session", entityId: id, after: { pdf: "emargement" } });
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${pdfFilename("emargement", documents)}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
