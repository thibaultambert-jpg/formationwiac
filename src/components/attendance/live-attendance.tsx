import { CheckCircle2 } from "lucide-react";
import { SignDialog } from "@/components/attendance/sign-dialog";
import { Badge } from "@/components/ui/badge";
import { db } from "@/lib/db";
import { formatTime } from "@/lib/dates";
import { signingWindowOpen } from "@/server/domain/automation";
import { slotLabels } from "@/server/services/session-labels";
import { signAsTrainer, signOnTrainerDevice } from "@/app/(public)/actions";

/**
 * Live attendance for a trainer (personal link or "Mes sessions"): trainer
 * signature per slot and participants signing on the trainer's device.
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
  const session = await db.trainingSession.findUniqueOrThrow({
    where: { id: sessionId },
    include: {
      training: true,
      slots: { orderBy: { startsAt: "asc" }, include: { trainerSignatures: { where: { trainerId } } } },
      enrollments: {
        where: { status: { in: ["confirmed", "present", "absent"] } },
        include: { participant: { include: { company: true } }, attendances: true },
        orderBy: { participant: { lastName: "asc" } },
      },
    },
  });
  const now = new Date();
  const labels = slotLabels(session.slots);

  return (
    <div className="space-y-6">
      {session.slots.map((slot, index) => {
        const open = signingWindowOpen(slot, now);
        const signed = slot.trainerSignatures.length > 0;
        const signedCount = session.enrollments.filter((enrollment) =>
          enrollment.attendances.some((a) => a.slotId === slot.id && a.present),
        ).length;
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
                const attendance = enrollment.attendances.find((item) => item.slotId === slot.id);
                const name = `${enrollment.participant.firstName} ${enrollment.participant.lastName}`;
                return (
                  <li key={enrollment.id} className="flex flex-wrap items-center justify-between gap-2 p-2 text-sm">
                    <span>
                      {name}
                      {enrollment.participant.company ? (
                        <span className="text-muted-foreground"> · {enrollment.participant.company.name}</span>
                      ) : null}
                    </span>
                    {attendance?.present ? (
                      <span className="flex items-center gap-1 text-emerald-800">
                        <CheckCircle2 aria-hidden="true" className="size-4" />
                        {attendance.signedAt ? `Signé à ${formatTime(attendance.signedAt)}` : "Présent"}
                      </span>
                    ) : open ? (
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
