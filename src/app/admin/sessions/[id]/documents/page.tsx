import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { FileArchive } from "lucide-react";
import { ActionButton } from "@/components/forms/action-button";
import { EmailHistory } from "@/components/layout/email-history";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { db } from "@/lib/db";
import { formatDateTime } from "@/lib/dates";
import { requireRole } from "@/server/auth/guards";
import { EMAIL_DOCUMENT_TYPES } from "@/server/email/default-templates";
import {
  sendAttendanceLinksAction,
  sendCertificatesAction,
  sendConvocationsAction,
  sendPreInformationAction,
} from "./actions";

export const metadata: Metadata = { title: "Documents" };

const PDF_LABELS: Record<string, string> = {
  convocation: "Convocation",
  attendance_sheet: "Feuille d'émargement",
  certificate: "Attestation",
  completion_certificate: "Certificat de réalisation",
};

export default async function SessionDocumentsPage({ params }: PageProps<"/admin/sessions/[id]/documents">) {
  await requireRole(["admin"]);
  const { id } = await params;
  const session = await db.trainingSession.findUnique({ where: { id }, select: { id: true, status: true } });
  if (!session) notFound();
  const [emails, pdfs] = await Promise.all([
    db.document.findMany({
      where: { sessionId: id, type: { in: EMAIL_DOCUMENT_TYPES } },
      orderBy: { createdAt: "desc" },
      take: 500,
    }),
    db.document.findMany({
      where: {
        sessionId: id,
        type: { in: ["convocation", "attendance_sheet", "certificate", "completion_certificate"] },
        filePath: { endsWith: ".pdf" },
      },
      include: { enrollment: { include: { participant: true } } },
      orderBy: { createdAt: "desc" },
      take: 500,
    }),
  ]);
  const completed = session.status === "completed";
  const active = session.status !== "cancelled";

  return (
    <div className="space-y-8">
      <section aria-labelledby="bulk-title" className="space-y-3">
        <h2 id="bulk-title" className="text-lg font-semibold">
          Actions groupées
        </h2>
        <div className="flex flex-wrap items-start gap-3">
          {active ? (
            <ActionButton
              action={sendPreInformationAction}
              hidden={{ sessionId: id }}
              label="Envoyer l'information préalable"
              variant="outline"
            />
          ) : null}
          {active ? (
            <ActionButton action={sendConvocationsAction} hidden={{ sessionId: id }} label="Envoyer les convocations" />
          ) : null}
          {active ? (
            <ActionButton
              action={sendAttendanceLinksAction}
              hidden={{ sessionId: id }}
              label="Envoyer le lien d'émargement"
              variant="outline"
            />
          ) : null}
          {completed ? (
            <ActionButton
              action={sendCertificatesAction}
              hidden={{ sessionId: id }}
              label="Générer et envoyer les attestations"
              variant="outline"
            />
          ) : null}
          <Button asChild variant="outline">
            <a href={`/admin/sessions/${id}/documents/zip`}>
              <FileArchive aria-hidden="true" />
              Télécharger le dossier complet (ZIP)
            </a>
          </Button>
        </div>
        <p className="text-muted-foreground text-sm">
          Le dossier complet contient la feuille d&apos;émargement définitive, le programme, les conventions, les
          convocations, attestations et certificats de réalisation tels qu&apos;envoyés, les pièces pédagogiques, les
          évaluations et un index.csv de tous les envois (date, destinataire, identifiant Gmail, empreintes). Les attestations sont envoyées
          automatiquement à la clôture de la session, avec le certificat de réalisation (heures émargées) pour les
          externes et les financements publics. L&apos;information préalable part à l&apos;inscription ; le bouton
          l&apos;envoie aux inscrits qui ne l&apos;ont pas encore reçue.
        </p>
      </section>

      <section aria-labelledby="pdf-title" className="space-y-3">
        <h2 id="pdf-title" className="text-lg font-semibold">
          Documents générés ({pdfs.length})
        </h2>
        {pdfs.length === 0 ? (
          <p className="text-muted-foreground text-sm">Aucun document généré pour le moment.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Document</TableHead>
                <TableHead>Participant</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pdfs.map((pdf) => (
                <TableRow key={pdf.id}>
                  <TableCell>{formatDateTime(pdf.generatedAt ?? pdf.createdAt)}</TableCell>
                  <TableCell>
                    <a
                      href={`/fichiers/${pdf.filePath}`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-primary underline-offset-4 hover:underline"
                    >
                      {PDF_LABELS[pdf.type] ?? pdf.type}
                    </a>
                  </TableCell>
                  <TableCell>
                    {pdf.enrollment
                      ? `${pdf.enrollment.participant.firstName} ${pdf.enrollment.participant.lastName}`
                      : "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>

      <section aria-labelledby="session-emails" className="space-y-3">
        <h2 id="session-emails" className="text-lg font-semibold">
          Emails envoyés ({emails.length})
        </h2>
        <EmailHistory rows={emails} />
      </section>
    </div>
  );
}
