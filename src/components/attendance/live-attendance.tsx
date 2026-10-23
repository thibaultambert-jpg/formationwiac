import { CheckCircle2 } from "lucide-react";
import { AttendanceCell } from "@/components/attendance/attendance-cell";
import { CorrectionDialog } from "@/components/attendance/correction-dialog";
import { SignDialog } from "@/components/attendance/sign-dialog";
import { Badge } from "@/components/ui/badge";
import { insideWindow, linkWindow } from "@/server/domain/attendance-proof";
import { signingWindowOpen } from "@/server/domain/automation";
import { attendanceMargins, loadAttendanceGrid } from "@/server/services/attendance";
import { slotLabels } from "@/server/services/session-labels";
import { correctAsTrainer, signAsTrainer, signOnTrainerDevice } from "@/app/(public)/actions";

/**
 * Live attendance for a trainer (personal link or "Mes sessions"): trainer
 * signature per slot, participants signing on the trainer's device, and
 * absences, lateness or early departures declared with a reason (C3).
 */
export async function LiveAttendance({
  sessionId,
  trainerId,
  auth,
}: {
  sessionId: string;
  trainerId: string;
  auth: Record<string, string>;
}) {
  const session = await loadAttendanceGrid(sessionId);
  if (!session) return null;
  const margins = await attendanceMargins();
  const now = new Date();
  const labels = slotLabels(session.slots);

  return (
    <div className="space-y-6">
      {session.slots.map((slot, index) => {
        // Trainer signature: on the slot's day; participants on this device: only during the slot window.
        const open = signingWindowOpen(slot, now);
        const deviceOpen = insideWindow(linkWindow(slot, margins), now);
        const signed = slot.trainerSignatures.some((signature) => signature.trainerId === trainerId);
        const signedCount = session.enrollments.filter((enrollment) => enrollment.cells[index].view.signed).length;
        return (
          <section
            key={slot.id}
            aria-labelledby={`slot-${slot.id}`}
            className="bg-card space-y-3 rounded-xl border p-4"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 id={`slot-${slot.id}`} className="font-semibold">
                {labels[index]}
              </h2>
              <Badge variant={open ? "success" : "secondary"}>{open ? "Émargement ouvert" : "Émargement fermé"}</Badge>
            </div>
            <p className="text-muted-foreground text-sm">
              {signedCount} / {session.enrollments.length} participant(s) ont signé.
            </p>
            <ul className="divide-y rounded-md border">
              {session.enrollments.map((enrollment) => {
                const cell = enrollment.cells[index];
                const name = `${enrollment.participant.firstName} ${enrollment.participant.lastName}`;
                return (
                  <li key={enrollment.id} className="flex flex-wrap items-center justify-between gap-2 p-2 text-sm">
                    <span>
                      {name}
                      {enrollment.participant.company ? (
                        <span className="text-muted-foreground"> · {enrollment.participant.company.name}</span>
                      ) : null}
                    </span>
                    <span className="flex flex-wrap items-center gap-2">
                      {cell.view.signed || cell.view.corrected ? (
                        <AttendanceCell cell={cell} />
                      ) : deviceOpen ? (
                        <SignDialog
                          action={signOnTrainerDevice}
                          hidden={{ ...auth, enrollmentId: enrollment.id, slotId: slot.id }}
                          buttonLabel="Faire signer"
                          title={`Signature de ${name}`}
                          description={`Créneau ${labels[index]}. Le participant signe sur cet appareil.`}
                        />
                      ) : (
                        <span className="text-muted-foreground">Non signé</span>
                      )}
                      {open || deviceOpen ? (
                        <CorrectionDialog
                          action={correctAsTrainer}
                          hidden={{ ...auth, enrollmentId: enrollment.id, slotId: slot.id }}
                          participant={name}
                          slotLabel={labels[index]}
                          states={["absent", "late", "left_early"]}
                        />
                      ) : null}
                    </span>
                  </li>
                );
              })}
            </ul>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="font-medium">Votre signature :</span>
              {signed ? (
                <span className="flex items-center gap-1 text-emerald-800">
                  <CheckCircle2 aria-hidden="true" className="size-4" />
                  Signée
                </span>
              ) : open ? (
                <SignDialog
                  action={signAsTrainer}
                  hidden={{ ...auth, slotId: slot.id }}
                  buttonLabel="Signer en tant que formateur"
                  title="Signature du formateur"
                  description={`Créneau ${labels[index]}.`}
                />
              ) : (
                <span className="text-muted-foreground">Non signée</span>
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}
