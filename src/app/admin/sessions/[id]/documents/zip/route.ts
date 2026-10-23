import { zipSync } from "fflate";
import { db } from "@/lib/db";
import { audit } from "@/server/audit";
import { getCurrentUser } from "@/server/auth/guards";
import { renderCertificate } from "@/server/pdf/documents";
import { answersCsv, sessionEvaluations, summaryCsv } from "@/server/services/evaluation-summary";
import { attendanceSheet, pdfFilename } from "@/server/services/session-documents";

// Proofs of a session in one ZIP (lot 4 acceptance criterion): signed attendance
// sheet, evaluations (answers and synthesis) and certificates.
export async function GET(_request: Request, { params }: RouteContext<"/admin/sessions/[id]/documents/zip">) {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") return new Response("Accès interdit", { status: 403 });
  const { id } = await params;
  const session = await db.trainingSession.findUnique({ where: { id }, select: { id: true } });
  if (!session) return new Response("Session introuvable", { status: 404 });

  const { documents, pdf } = await attendanceSheet(id);
  const files: Record<string, Uint8Array> = {
    [`emargement/${pdfFilename("emargement", documents)}`]: new Uint8Array(pdf),
  };
  for (const enrollment of documents.session.enrollments.filter((item) => item.status === "present")) {
    files[`attestations/${pdfFilename("attestation", documents, enrollment)}`] = new Uint8Array(
      await renderCertificate(documents, enrollment),
    );
  }
  const evaluations = await Promise.all([sessionEvaluations(id, "hot"), sessionEvaluations(id, "cold")]);
  files["evaluations/reponses.csv"] = new TextEncoder().encode(answersCsv(evaluations));
  files["evaluations/synthese.csv"] = new TextEncoder().encode(summaryCsv(evaluations));

  const zip = zipSync(files, { level: 6 });
  await audit(db, {
    userId: user.id,
    action: "export",
    entity: "session",
    entityId: id,
    after: { zip: Object.keys(files).length },
  });
  return new Response(new Uint8Array(zip), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="preuves-${documents.session.reference}.zip"`,
      "Cache-Control": "private, no-store",
    },
  });
}
