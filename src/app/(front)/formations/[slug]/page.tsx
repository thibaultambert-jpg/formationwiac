import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarCheck, Download } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { db } from "@/lib/db";
import { formatDateTime } from "@/lib/dates";
import { MODALITY_LABELS } from "@/lib/labels";
import { requireUser } from "@/server/auth/guards";
import { canSelfEnroll, canSelfUnenroll } from "@/server/domain/front-enrollment";
import { formatDecimal } from "@/server/domain/numbers";
import { trainingForFront } from "@/server/services/front";
import { placeLabel, slotLabels } from "@/server/services/session-labels";
import { EnrollDialog, UnenrollDialog } from "./enroll-dialog";

export async function generateMetadata({ params }: PageProps<"/formations/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const training = await db.training.findFirst({ where: { slug }, select: { title: true } });
  return { title: training?.title ?? "Formation" };
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="text-lg font-semibold">{title}</h2>
      <div className="text-sm leading-relaxed whitespace-pre-line">{children}</div>
    </section>
  );
}

export default async function TrainingPage({ params }: PageProps<"/formations/[slug]">) {
  const user = await requireUser();
  const { slug } = await params;
  const now = new Date();
  const training = await trainingForFront(slug, user.id, now);
  if (!training) notFound();

  const waitlistPositions = new Map<string, number>();
  for (const session of training.sessions) {
    const mine = session.myEnrollment;
    if (mine?.status === "waitlisted") {
      const ahead = await db.enrollment.count({
        where: { sessionId: session.id, status: "waitlisted", enrolledAt: { lt: mine.enrolledAt } },
      });
      waitlistPositions.set(session.id, ahead + 1);
    }
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_22rem]">
      <article className="space-y-6">
        <div className="space-y-3">
          <Link href="/" className="text-muted-foreground text-sm hover:underline">
            ← Catalogue
          </Link>
          <div className="flex flex-wrap gap-2">
            {training.theme ? <Badge variant="secondary">{training.theme.name}</Badge> : null}
            <Badge variant="outline">{MODALITY_LABELS[training.modality]}</Badge>
            <Badge variant="outline">{formatDecimal(training.durationHours)} heures</Badge>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">{training.title}</h1>
        </div>
        <Section title="Objectifs pédagogiques">{training.objectives}</Section>
        {training.prerequisites ? <Section title="Prérequis">{training.prerequisites}</Section> : null}
        {training.targetAudience ? <Section title="Public visé">{training.targetAudience}</Section> : null}
        {training.programText ? <Section title="Programme">{training.programText}</Section> : null}
        {training.programPdfPath ? (
          <Button asChild variant="outline">
            <a
              href={`/fichiers/${training.programPdfPath}?nom=${encodeURIComponent(`Programme - ${training.title}.pdf`)}`}
            >
              <Download aria-hidden="true" />
              Télécharger le programme (PDF)
            </a>
          </Button>
        ) : null}
      </article>

      <aside aria-labelledby="sessions-title" className="space-y-3">
        <h2 id="sessions-title" className="text-lg font-semibold">
          Prochaines sessions
        </h2>
        {training.sessions.length === 0 ? (
          <p className="text-muted-foreground text-sm">Aucune session ouverte pour le moment.</p>
        ) : (
          <ul className="space-y-3">
            {training.sessions.map((session) => {
              const state = { ...session, firstSlotStart: session.slots[0]?.startsAt ?? null };
              const mine = session.myEnrollment;
              const active = mine && (mine.status === "confirmed" || mine.status === "waitlisted");
              const labels = slotLabels(session.slots);
              return (
                <li key={session.id} className="bg-card space-y-3 rounded-xl border p-4 shadow-sm">
                  <ul className="space-y-0.5 text-sm font-medium">
                    {labels.map((label) => (
                      <li key={label}>{label}</li>
                    ))}
                  </ul>
                  <p className="text-muted-foreground text-sm">{placeLabel(session)}</p>
                  {session.trainers.length > 0 ? (
                    <p className="text-muted-foreground text-sm">
                      Avec{" "}
                      {session.trainers.map((link) => `${link.trainer.firstName} ${link.trainer.lastName}`).join(", ")}
                    </p>
                  ) : null}
                  <p className="text-sm">
                    {session.remaining > 0
                      ? `${session.remaining} place${session.remaining > 1 ? "s" : ""} restante${session.remaining > 1 ? "s" : ""}`
                      : "Complet : liste d'attente"}
                    {session.registrationDeadline ? (
                      <span className="text-muted-foreground block text-xs">
                        Inscription jusqu&apos;au {formatDateTime(session.registrationDeadline)}
                      </span>
                    ) : null}
                  </p>
                  {active ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant={mine.status === "confirmed" ? "success" : "warning"}>
                        {mine.status === "confirmed"
                          ? "Vous êtes inscrit(e)"
                          : `Liste d'attente, position ${waitlistPositions.get(session.id) ?? "?"}`}
                      </Badge>
                      {mine.status === "confirmed" ? (
                        <Button asChild variant="ghost" size="sm">
                          <a href={`/mes-formations/agenda/${mine.id}`}>
                            <CalendarCheck aria-hidden="true" />
                            Ajouter à l&apos;agenda
                          </a>
                        </Button>
                      ) : null}
                      {canSelfUnenroll(mine.status, state, now) ? (
                        <UnenrollDialog enrollmentId={mine.id} title={training.title} />
                      ) : null}
                    </div>
                  ) : canSelfEnroll(state, now) ? null : (
                    <p className="text-muted-foreground text-sm">Inscriptions closes.</p>
                  )}
                  <EnrollDialog
                    showTrigger={!active && canSelfEnroll(state, now)}
                    session={{
                      id: session.id,
                      title: training.title,
                      slots: labels,
                      place: placeLabel(session),
                      full: session.remaining === 0,
                    }}
                  />
                </li>
              );
            })}
          </ul>
        )}
      </aside>
    </div>
  );
}
