import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Download } from "lucide-react";
import { AuditTrail } from "@/components/layout/audit-trail";
import { PageHeader } from "@/components/layout/page-header";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { db } from "@/lib/db";
import { formatDate, formatDateRange } from "@/lib/dates";
import { ENROLLMENT_STATUS_LABELS, ENROLLMENT_STATUS_TONES, PARTICIPANT_TYPE_LABELS } from "@/lib/labels";
import { displayName, requireRole } from "@/server/auth/guards";
import { AnonymizeDialog } from "../anonymize-dialog";

export const metadata: Metadata = { title: "Participant" };

export default async function ParticipantPage({ params }: PageProps<"/admin/entreprises/participants/[id]">) {
  await requireRole(["admin"]);
  const { id } = await params;
  const participant = await db.participant.findUnique({
    where: { id },
    include: {
      company: true,
      user: true,
      enrollments: {
        include: { session: { include: { training: true, slots: { select: { startsAt: true } } } } },
        orderBy: { enrolledAt: "desc" },
      },
    },
  });
  if (!participant) notFound();

  const logs = await db.auditLog.findMany({
    where: { entity: "participant", entityId: participant.id },
    include: { user: true },
    orderBy: { createdAt: "desc" },
  });
  const name = `${participant.firstName} ${participant.lastName}`;

  return (
    <>
      <PageHeader
        title={name}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <Link href="/admin/entreprises/participants" className="hover:underline">
              ← Tous les participants
            </Link>
            <Badge variant="outline">{PARTICIPANT_TYPE_LABELS[participant.type]}</Badge>
            {participant.anonymizedAt ? (
              <Badge variant="secondary">Anonymisé le {formatDate(participant.anonymizedAt)}</Badge>
            ) : null}
          </span>
        }
        actions={
          participant.anonymizedAt ? null : (
            <>
              <Button asChild variant="outline">
                <a href={`/admin/entreprises/participants/${participant.id}/export`}>
                  <Download aria-hidden="true" />
                  Exporter ses données
                </a>
              </Button>
              <AnonymizeDialog participantId={participant.id} name={name} />
            </>
          )
        }
      />
      {participant.anonymizedAt ? (
        <Alert className="mb-6">
          <AlertDescription>
            Les données d&apos;identité ont été effacées. Les preuves de formation sont conservées sans identité
            jusqu&apos;à la fin de la durée de conservation.
          </AlertDescription>
        </Alert>
      ) : null}

      <dl className="mb-8 grid max-w-2xl grid-cols-[10rem_1fr] gap-x-4 gap-y-2 text-sm">
        <dt className="text-muted-foreground">Email</dt>
        <dd>{participant.anonymizedAt ? "—" : participant.email}</dd>
        <dt className="text-muted-foreground">Fonction</dt>
        <dd>{participant.jobTitle ?? "—"}</dd>
        <dt className="text-muted-foreground">Téléphone</dt>
        <dd>{participant.phone ?? "—"}</dd>
        <dt className="text-muted-foreground">Entreprise</dt>
        <dd>
          {participant.company ? (
            <Link href={`/admin/entreprises/${participant.company.id}`} className="hover:underline">
              {participant.company.name}
            </Link>
          ) : participant.user ? (
            `Collaborateur${participant.user.department ? ` · ${participant.user.department}` : ""}`
          ) : (
            "—"
          )}
        </dd>
        <dt className="text-muted-foreground">Créé le</dt>
        <dd>{formatDate(participant.createdAt)}</dd>
      </dl>

      <section aria-labelledby="participant-enrollments" className="mb-8 space-y-3">
        <h2 id="participant-enrollments" className="text-lg font-semibold">
          Formations ({participant.enrollments.length})
        </h2>
        {participant.enrollments.length === 0 ? (
          <p className="text-muted-foreground text-sm">Aucune inscription.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Formation</TableHead>
                <TableHead>Session</TableHead>
                <TableHead>Dates</TableHead>
                <TableHead>Statut</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {participant.enrollments.map((enrollment) => (
                <TableRow key={enrollment.id}>
                  <TableCell>{enrollment.session.training.title}</TableCell>
                  <TableCell>
                    <Link href={`/admin/sessions/${enrollment.sessionId}/inscrits`} className="hover:underline">
                      {enrollment.session.reference}
                    </Link>
                  </TableCell>
                  <TableCell>{formatDateRange(enrollment.session.slots.map((slot) => slot.startsAt))}</TableCell>
                  <TableCell>
                    <Badge variant={ENROLLMENT_STATUS_TONES[enrollment.status]}>
                      {ENROLLMENT_STATUS_LABELS[enrollment.status]}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>

      <section aria-labelledby="participant-history" className="space-y-3">
        <h2 id="participant-history" className="text-lg font-semibold">
          Historique
        </h2>
        <AuditTrail rows={logs.map((log) => ({ ...log, actor: log.user ? displayName(log.user) : "Système" }))} />
      </section>
    </>
  );
}
