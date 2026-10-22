import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Download } from "lucide-react";
import { EmptyState } from "@/components/layout/empty-state";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { db } from "@/lib/db";
import { formatDate, formatDateRange } from "@/lib/dates";
import {
  ENROLLMENT_SOURCE_LABELS,
  ENROLLMENT_STATUS_LABELS,
  ENROLLMENT_STATUS_TONES,
  PARTICIPANT_TYPE_LABELS,
} from "@/lib/labels";
import { requireRole } from "@/server/auth/guards";
import { holdsSeat } from "@/server/domain/capacity";
import { decimalInput, formatEuros } from "@/server/domain/numbers";
import { acceptsEnrollments } from "@/server/domain/session-status";
import { getSessionDetail } from "../../session-data";
import {
  AddExternalDialog,
  AddInternalDialog,
  EditEnrollmentDialog,
  ImportCsvDialog,
  MoveEnrollmentDialog,
} from "./enrollment-dialogs";

export const metadata: Metadata = { title: "Inscrits" };

const STATUS_ORDER: Record<string, number> = { confirmed: 0, present: 0, absent: 0, waitlisted: 1, cancelled: 2 };

export default async function EnrollmentsPage({ params }: PageProps<"/admin/sessions/[id]/inscrits">) {
  await requireRole(["admin"]);
  const { id } = await params;
  const session = await getSessionDetail(id);
  if (!session) notFound();

  const [enrollments, targets] = await Promise.all([
    db.enrollment.findMany({
      where: { sessionId: session.id },
      include: { participant: { include: { company: true } }, billingCompany: true },
    }),
    db.trainingSession.findMany({
      where: { id: { not: session.id }, status: { notIn: ["cancelled", "completed"] } },
      include: { training: { select: { title: true } }, slots: { select: { startsAt: true } } },
      take: 200,
    }),
  ]);
  const sorted = enrollments.sort(
    (a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || a.enrolledAt.getTime() - b.enrolledAt.getTime(),
  );
  const moveTargets = targets
    .sort((a, b) => Number(b.trainingId === session.trainingId) - Number(a.trainingId === session.trainingId))
    .map((target) => ({
      id: target.id,
      label: `${target.reference} · ${target.training.title} · ${formatDateRange(target.slots.map((slot) => slot.startsAt))}`,
    }));

  const open = acceptsEnrollments(session.status);
  let waitlistPosition = 0;

  return (
    <div className="space-y-6">
      {!open ? (
        <Alert variant="warning">
          <AlertDescription>
            Cette session est annulée ou terminée : aucune inscription ne peut être ajoutée.
          </AlertDescription>
        </Alert>
      ) : !session.openToExternal ? (
        <Alert>
          <AlertDescription>
            Cette session n&apos;est pas ouverte aux externes : modifiez-la pour pouvoir en inscrire.
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <p className="text-sm">
          <strong>{session.seats}</strong> / {session.capacityMax} places occupées
          {session.capacityMin !== null && session.seats < session.capacityMin ? (
            <span className="text-amber-800"> · minimum de {session.capacityMin} non atteint</span>
          ) : null}
          {session.waitlisted > 0 ? ` · ${session.waitlisted} en liste d'attente` : ""}
          {session.cancelled > 0 ? ` · ${session.cancelled} annulée(s)` : ""}
        </p>
        <div className="flex flex-wrap gap-2">
          {open ? (
            <>
              <AddInternalDialog sessionId={session.id} />
              <AddExternalDialog sessionId={session.id} disabled={!session.openToExternal} />
              <ImportCsvDialog sessionId={session.id} disabled={!session.openToExternal} />
            </>
          ) : null}
          <Button asChild variant="outline">
            <a href={`/admin/sessions/${session.id}/inscrits/export`}>
              <Download aria-hidden="true" />
              Exporter (CSV)
            </a>
          </Button>
        </div>
      </div>

      {sorted.length === 0 ? (
        <EmptyState>Aucun inscrit pour le moment.</EmptyState>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Participant</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Entreprise</TableHead>
              <TableHead>Statut</TableHead>
              <TableHead>Inscription</TableHead>
              <TableHead className="text-right">Prix HT</TableHead>
              <TableHead>
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.map((enrollment) => {
              const { participant } = enrollment;
              const name = `${participant.firstName} ${participant.lastName}`;
              const position = enrollment.status === "waitlisted" ? ++waitlistPosition : null;
              return (
                <TableRow
                  key={enrollment.id}
                  className={enrollment.status === "cancelled" ? "text-muted-foreground" : undefined}
                >
                  <TableCell>
                    <span className="font-medium">{name}</span>
                    <span className="text-muted-foreground block text-xs">{participant.email}</span>
                  </TableCell>
                  <TableCell>{PARTICIPANT_TYPE_LABELS[participant.type]}</TableCell>
                  <TableCell>{participant.company?.name ?? "—"}</TableCell>
                  <TableCell>
                    <Badge variant={ENROLLMENT_STATUS_TONES[enrollment.status]}>
                      {ENROLLMENT_STATUS_LABELS[enrollment.status]}
                      {position ? ` n° ${position}` : ""}
                    </Badge>
                    {enrollment.cancellationReason ? (
                      <span className="block max-w-48 truncate text-xs" title={enrollment.cancellationReason}>
                        {enrollment.cancellationReason}
                      </span>
                    ) : null}
                  </TableCell>
                  <TableCell className="text-xs whitespace-nowrap">
                    {formatDate(enrollment.enrolledAt)}
                    <span className="text-muted-foreground block">{ENROLLMENT_SOURCE_LABELS[enrollment.source]}</span>
                  </TableCell>
                  <TableCell className="text-right">
                    {participant.type === "external" ? formatEuros(enrollment.appliedPrice) : "—"}
                  </TableCell>
                  <TableCell className="text-right whitespace-nowrap">
                    <EditEnrollmentDialog
                      enrollment={{
                        id: enrollment.id,
                        name,
                        status: enrollment.status,
                        external: participant.type === "external",
                        appliedPrice: decimalInput(enrollment.appliedPrice),
                        billingCompany: enrollment.billingCompany
                          ? { id: enrollment.billingCompany.id, label: enrollment.billingCompany.name }
                          : null,
                        cancellationReason: enrollment.cancellationReason,
                      }}
                    />
                    {holdsSeat(enrollment.status) || enrollment.status === "waitlisted" ? (
                      <MoveEnrollmentDialog enrollment={{ id: enrollment.id, name }} targets={moveTargets} />
                    ) : null}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
