import { db } from "@/lib/db";
import { getCurrentUser } from "@/server/auth/guards";
import { loadSessionDocuments } from "@/server/pdf/data";
import { renderCertificate } from "@/server/pdf/documents";
import { pdfFilename } from "@/server/services/session-documents";

// Certificate of one of the current user's completed trainings.
export async function GET(_request: Request, { params }: RouteContext<"/mes-formations/attestation/[id]">) {
  const user = await getCurrentUser();
  if (!user) return new Response("Non authentifié", { status: 401 });
  const { id } = await params;
  const enrollment = await db.enrollment.findUnique({ where: { id }, include: { participant: true, session: true } });
  if (
    !enrollment ||
    enrollment.participant.userId !== user.id ||
    enrollment.status !== "present" ||
    enrollment.session.status !== "completed"
  ) {
    return new Response("Attestation indisponible", { status: 404 });
  }
  const documents = await loadSessionDocuments(enrollment.sessionId);
  const target = documents?.session.enrollments.find((item) => item.id === enrollment.id);
  if (!documents || !target) return new Response("Attestation indisponible", { status: 404 });
  const pdf = await renderCertificate(documents, target);
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${pdfFilename("attestation", documents, target)}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
