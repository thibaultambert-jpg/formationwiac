import type { Metadata } from "next";
import { CheckCircle2 } from "lucide-react";
import { SignDialog } from "@/components/attendance/sign-dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { db } from "@/lib/db";
import { formatDateTime } from "@/lib/dates";
import { signingWindowOpen } from "@/server/domain/automation";
import { slotLabels } from "@/server/services/session-labels";
import { resolveToken } from "@/server/tokens";
import { signWithLink } from "../../actions";

export const metadata: Metadata = { title: "Émargement", robots: { index: false } };

export default async function AttendancePage({ params }: PageProps<"/emargement/[token]">) {
  const { token } = await params;
  const record = await resolveToken(token, ["attendance"]);
  const enrollment = record?.enrollmentId
    ? await db.enrollment.findUnique({
        where: { id: record.enrollmentId },
        include: {
          participant: true,
          attendances: true,
          session: { include: { training: true, slots: { orderBy: { startsAt: "asc" } } } },
        },
      })
    : null;
  if (!enrollment || enrollment.status === "cancelled" || enrollment.status === "waitlisted") {
    return (
      <Alert variant="destructive">
        <AlertDescription>
          Ce lien d&apos;émargement n&apos;est pas ou plus valide. Contactez votre formateur ou le service formation.
        </AlertDescription>
      </Alert>
    );
  }

  const now = new Date();
  const labels = slotLabels(enrollment.session.slots);
  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold">Émargement</h1>
        <p className="text-muted-foreground">
          {enrollment.session.training.title} · {enrollment.participant.firstName} {enrollment.participant.lastName}
        </p>
      </div>
      <p className="text-sm">Signez chaque demi-journée le jour même, à partir de 30 minutes avant son début.</p>
      <ul className="space-y-3">
        {enrollment.session.slots.map((slot, index) => {
          const attendance = enrollment.attendances.find((item) => item.slotId === slot.id);
          const open = signingWindowOpen(slot, now);
          return (
            <li
              key={slot.id}
              className="bg-card flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4"
            >
              <span className="font-medium">{labels[index]}</span>
              {attendance?.signaturePath || attendance?.present ? (
                <span className="flex items-center gap-1 text-sm text-emerald-800">
                  <CheckCircle2 aria-hidden="true" className="size-4" />
                  {attendance.signedAt ? `Signé le ${formatDateTime(attendance.signedAt)}` : "Présence enregistrée"}
                </span>
              ) : open ? (
                <SignDialog
                  action={signWithLink}
                  hidden={{ token, slotId: slot.id }}
                  buttonLabel="Signer"
                  title="Signer ma présence"
                  description={`${enrollment.session.training.title} · ${labels[index]}`}
                />
              ) : (
                <Badge variant="secondary">{slot.startsAt > now ? "À venir" : "Clos"}</Badge>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
