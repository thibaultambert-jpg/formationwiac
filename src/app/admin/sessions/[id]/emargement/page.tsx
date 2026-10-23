import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Download } from "lucide-react";
import { AttendanceCell } from "@/components/attendance/attendance-cell";
import { CorrectionDialog } from "@/components/attendance/correction-dialog";
import { ActionButton } from "@/components/forms/action-button";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDate, formatTime } from "@/lib/dates";
import { requireRole } from "@/server/auth/guards";
import { loadAttendanceGrid } from "@/server/services/attendance";
import { correctAttendanceAction, sendAttendanceLinksAction } from "../documents/actions";

export const metadata: Metadata = { title: "Émargement" };

export default async function SessionAttendancePage({ params }: PageProps<"/admin/sessions/[id]/emargement">) {
  await requireRole(["admin"]);
  const { id } = await params;
  const session = await loadAttendanceGrid(id);
  if (!session) notFound();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start gap-2">
        {session.status !== "cancelled" ? (
          <ActionButton
            action={sendAttendanceLinksAction}
            hidden={{ sessionId: session.id }}
            label="Envoyer les liens d'émargement"
          />
        ) : null}
        <Button asChild variant="outline">
          <a href={`/admin/sessions/${session.id}/emargement/feuille`}>
            <Download aria-hidden="true" />
            Feuille d&apos;émargement (PDF)
          </a>
        </Button>
      </div>
      <p className="text-muted-foreground text-sm">
        Chaque participant reçoit un lien personnel par demi-journée, utilisable une seule fois et seulement autour du
        créneau. Les liens partent automatiquement le matin de chaque journée de formation. Les émargements ne sont
        jamais modifiés : une correction s&apos;ajoute avec son motif et son auteur. Heures affichées en heure de Paris.
      </p>
      {session.enrollments.length === 0 ? (
        <p className="text-muted-foreground text-sm">Aucun participant confirmé.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Participant</TableHead>
              {session.slots.map((slot) => (
                <TableHead key={slot.id} className="text-center">
                  {formatDate(slot.startsAt)}
                  <span className="text-muted-foreground block text-xs font-normal">
                    {formatTime(slot.startsAt)}–{formatTime(slot.endsAt)}
                  </span>
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {session.enrollments.map((enrollment) => {
              const name = `${enrollment.participant.firstName} ${enrollment.participant.lastName}`;
              return (
                <TableRow key={enrollment.id}>
                  <TableCell className="font-medium">{name}</TableCell>
                  {enrollment.cells.map((cell) => (
                    <TableCell key={cell.slot.id} className="text-center align-top">
                      <AttendanceCell cell={cell}>
                        {session.status !== "cancelled" ? (
                          <CorrectionDialog
                            action={correctAttendanceAction}
                            hidden={{ enrollmentId: enrollment.id, slotId: cell.slot.id }}
                            participant={name}
                            slotLabel={`${formatDate(cell.slot.startsAt)} ${formatTime(cell.slot.startsAt)}–${formatTime(cell.slot.endsAt)}`}
                          />
                        ) : null}
                      </AttendanceCell>
                    </TableCell>
                  ))}
                </TableRow>
              );
            })}
            {session.trainers.map(({ trainer }) => (
              <TableRow key={trainer.id} className="bg-muted/30">
                <TableCell>
                  Formateur : {trainer.firstName} {trainer.lastName}
                </TableCell>
                {session.slots.map((slot) => {
                  const signature = slot.trainerSignatures.find((item) => item.trainerId === trainer.id);
                  return (
                    <TableCell key={slot.id} className="text-center text-xs">
                      {signature ? (
                        `Signé à ${formatTime(signature.signedAt)}`
                      ) : (
                        <span className="text-muted-foreground">Non signé</span>
                      )}
                    </TableCell>
                  );
                })}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
