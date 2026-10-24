import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { LiveAttendance } from "@/components/attendance/live-attendance";
import { LearningAssessmentPanel } from "@/components/pedagogy/learning-assessment-panel";
import { db } from "@/lib/db";
import { requireRole } from "@/server/auth/guards";
import { resolveTrainerAccess } from "@/server/services/trainer-access";

export const metadata: Metadata = { title: "Émargement en direct" };

export default async function MySessionPage({ params }: PageProps<"/mes-sessions/[id]">) {
  await requireRole(["trainer", "admin"]);
  const { id } = await params;
  const access = await resolveTrainerAccess({ sessionId: id });
  if (!access) notFound();
  const session = await db.trainingSession.findUniqueOrThrow({ where: { id }, include: { training: true } });

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <Link href="/mes-sessions" className="text-muted-foreground text-sm hover:underline">
          ← Mes sessions
        </Link>
        <h1 className="text-2xl font-semibold">{session.training.title}</h1>
        <p className="text-muted-foreground">
          {session.reference} · Faites signer les participants sur cet appareil et signez chaque demi-journée.
        </p>
      </div>
      <LiveAttendance
        sessionId={access.sessionId}
        trainerId={access.trainerId}
        auth={{ sessionId: access.sessionId }}
      />
      <LearningAssessmentPanel sessionId={access.sessionId} auth={{ sessionId: access.sessionId }} />
    </div>
  );
}
