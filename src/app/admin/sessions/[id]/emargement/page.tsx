import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CheckCircle2, Download } from "lucide-react";
import { ActionButton } from "@/components/forms/action-button";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { db } from "@/lib/db";
import { formatDate, formatTime } from "@/lib/dates";
import { requireRole } from "@/server/auth/guards";
import { sendAttendanceLinksAction, setAttendanceAction } from "../documents/actions";

export const metadata: Metadata = { title: "Émargement" };

const METHOD_LABELS: Record<string, string> = {
  participant_link: "lien personnel",
  trainer_device: "appareil du formateur",
};

export default async function SessionAttendancePage({ params }: PageProps<"/admin/sessions/[id]/emargement">) {
  await requireRole(["admin"]);
  const { id } = await params;
  const session = await db.trainingSession.findUnique({
    where: { id },
    include: {
      slots: { orderBy: { startsAt: "asc" }, include: { trainerSignatures: true } },
      trainers: { include: { trainer: true } },
      enrollments: {
        where: { status: { in: ["confirmed", "present", "absent"] } },
        include: { participant: true, attendances: true },
        orderBy: { participant: { lastName: "asc" } },
      },
    },
  });
  if (!session) notFound();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start gap-2">
        {session.status !== "cancelled" ? (
          <ActionButton
            action={sendAttendanceLinksAction}
            hidden={{ sessionId: session.id }}
            label="Envoyer le lien d'émargement"
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
        Les liens sont aussi envoyés automatiquement le matin de chaque journée de formation. Les corrections faites ici
        sont tracées dans l&apos;historique.
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
            {session.enrollments.map((enrollment) => (
              <TableRow key={enrollment.id}>
                <TableCell className="font-medium">
                  {enrollment.participant.firstName} {enrollment.participant.lastName}
                </TableCell>
                {session.slots.map((slot) => {
                  const attendance = enrollment.attendances.find((item) => item.slotId === slot.id);
                  return (
                    <TableCell key={slot.id} className="text-center text-xs">
                      {attendance?.present ? (
                        <span className="inline-flex flex-col items-center text-emerald-800">
                          <CheckCircle2 aria-hidden="true" className="size-4" />
                          {attendance.signedAt
                            ? `${formatTime(attendance.signedAt)} · ${METHOD_LABELS[attendance.method ?? ""] ?? ""}`
                            : "Présent (BO)"}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">{attendance ? "Absent" : "—"}</span>
                      )}
                      <form action={setAttendanceAction} className="mt-1">
                        <input type="hidden" name="enrollmentId" value={enrollment.id} />
                        <input type="hidden" name="slotId" value={slot.id} />
                        <input type="hidden" name="present" value={attendance?.present ? "0" : "1"} />
                        <button type="submit" className="text-primary underline-offset-4 hover:underline">
                          {attendance?.present ? "Marquer absent" : "Marquer présent"}
                        </button>
                      </form>
                    </TableCell>
                  );
                })}
              </TableRow>
            ))}
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
