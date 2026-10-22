import type { Metadata } from "next";
import { LiveAttendance } from "@/components/attendance/live-attendance";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { db } from "@/lib/db";
import { resolveTrainerAccess } from "@/server/services/trainer-access";

export const metadata: Metadata = { title: "Émargement formateur", robots: { index: false } };

export default async function TrainerAttendancePage({ params }: PageProps<"/emargement/formateur/[token]">) {
  const { token } = await params;
  const access = await resolveTrainerAccess({ token });
  if (!access) {
    return (
      <Alert variant="destructive">
        <AlertDescription>Ce lien n&apos;est pas ou plus valide. Contactez le service formation.</AlertDescription>
      </Alert>
    );
  }
  const [session, trainer] = await Promise.all([
    db.trainingSession.findUniqueOrThrow({ where: { id: access.sessionId }, include: { training: true } }),
    db.trainer.findUniqueOrThrow({ where: { id: access.trainerId } }),
  ]);
  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold">Émargement de la session</h1>
        <p className="text-muted-foreground">
          {session.training.title} · {session.reference} · {trainer.firstName} {trainer.lastName}
        </p>
      </div>
      <LiveAttendance sessionId={access.sessionId} trainerId={access.trainerId} auth={{ token }} />
    </div>
  );
}
