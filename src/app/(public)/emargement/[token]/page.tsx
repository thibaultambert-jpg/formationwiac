import type { Metadata } from "next";
import { CheckCircle2 } from "lucide-react";
import { SignDialog } from "@/components/attendance/sign-dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { db } from "@/lib/db";
import { formatDateTime, formatSlot, formatWeekday } from "@/lib/dates";
import { resolveAttendanceLink } from "@/server/tokens";
import { signWithLink } from "../../actions";

export const metadata: Metadata = { title: "Émargement", robots: { index: false } };

function Invalid() {
  return (
    <Alert variant="destructive">
      <AlertDescription>
        Ce lien d&apos;émargement n&apos;est pas ou plus valide. Contactez votre formateur ou le service formation.
      </AlertDescription>
    </Alert>
  );
}

/**
 * Personal attendance page of one slot (C2, C8): only the trainee's own name
 * and slot are shown; invalid, expired and unknown links share one message.
 */
export default async function AttendancePage({ params }: PageProps<"/emargement/[token]">) {
  const { token } = await params;
  const link = await resolveAttendanceLink(token);
  if (link.status === "invalid") return <Invalid />;
  if (link.status === "not_yet") {
    return (
      <Alert>
        <AlertDescription>
          Ce lien d&apos;émargement sera utilisable à partir du {formatDateTime(link.validFrom)}.
        </AlertDescription>
      </Alert>
    );
  }

  const enrollment = await db.enrollment.findUnique({
    where: { id: link.record.enrollmentId! },
    include: { participant: true, session: { include: { training: true } } },
  });
  const slot = await db.sessionSlot.findUnique({ where: { id: link.record.slotId! } });
  if (!enrollment || !slot || !["confirmed", "present", "absent"].includes(enrollment.status)) return <Invalid />;
  const attendance = await db.attendance.findUnique({
    where: { enrollmentId_slotId: { enrollmentId: enrollment.id, slotId: slot.id } },
  });
  const slotLabel = `${formatWeekday(slot.startsAt)} ${formatSlot(slot.startsAt, slot.endsAt)}`;

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold">Émargement</h1>
        <p className="text-muted-foreground">
          {enrollment.session.training.title} · {enrollment.participant.firstName} {enrollment.participant.lastName}
        </p>
      </div>
      <div className="bg-card flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4">
        <span className="font-medium">{slotLabel}</span>
        {attendance || link.status === "used" ? (
          <span className="flex items-center gap-1 text-sm text-emerald-800">
            <CheckCircle2 aria-hidden="true" className="size-4" />
            {attendance?.signedAt
              ? `Présence enregistrée le ${formatDateTime(attendance.signedAt)}`
              : "Présence enregistrée"}
          </span>
        ) : (
          <SignDialog
            action={signWithLink}
            hidden={{ token }}
            buttonLabel="Signer"
            title="Signer ma présence"
            description={`${enrollment.session.training.title} · ${slotLabel}`}
            allowAttestation
          />
        )}
      </div>
      <p className="text-muted-foreground text-sm">
        Ce lien personnel ne sert qu&apos;à cette demi-journée et ne peut être utilisé qu&apos;une fois. L&apos;heure de
        signature est enregistrée par le serveur (heure de Paris).
      </p>
    </div>
  );
}
