import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { toParisDateInput, toParisTimeInput } from "@/lib/dates";
import { requireRole } from "@/server/auth/guards";
import { updateSession } from "../../actions";
import { sessionFormOptions } from "../../form-data";
import { getSessionDetail } from "../../session-data";
import { SessionForm } from "../../session-form";

export const metadata: Metadata = { title: "Modifier la session" };

export default async function EditSessionPage({ params, searchParams }: PageProps<"/admin/sessions/[id]/modifier">) {
  await requireRole(["admin"]);
  const { id } = await params;
  const { duplique } = await searchParams;
  const session = await getSessionDetail(id);
  if (!session) notFound();
  if (session.status === "cancelled" || session.status === "completed") redirect(`/admin/sessions/${session.id}`);

  const trainerIds = session.trainers.map((link) => link.trainerId);
  const options = await sessionFormOptions({ trainingId: session.trainingId, trainerIds });

  return (
    <div className="space-y-6">
      {duplique ? (
        <Alert variant="warning">
          <AlertDescription>
            Session dupliquée en brouillon ({session.reference}) avec les mêmes créneaux : pensez à modifier les dates.
          </AlertDescription>
        </Alert>
      ) : null}
      <SessionForm
        action={updateSession}
        trainings={options.trainings}
        trainers={options.trainers}
        session={{
          ...session,
          registrationDeadline: session.registrationDeadline ? toParisDateInput(session.registrationDeadline) : null,
          trainerIds,
          slots: session.slots.map((slot) => ({
            key: slot.id,
            id: slot.id,
            date: toParisDateInput(slot.startsAt),
            start: toParisTimeInput(slot.startsAt),
            end: toParisTimeInput(slot.endsAt),
          })),
        }}
      />
    </div>
  );
}
