import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarCheck, Download } from "lucide-react";
import { FrontHero } from "@/components/layout/front-hero";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { db } from "@/lib/db";
import { formatDate, formatDateTime } from "@/lib/dates";
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

/** Numbered section, as on the wiacademy.fr training pages ("01 Objectif"). */
function Section({ number, title, children }: { number: number; title: string; children: React.ReactNode }) {
  return (
    <section className="grid gap-3 border-b pb-8 last:border-b-0 md:grid-cols-[10rem_1fr] md:gap-8">
      <div>
        <p className="text-brand-teal-ink text-xs font-bold">{String(number).padStart(2, "0")}</p>
        <h2 className="text-lg font-bold">{title}</h2>
      </div>
      <div className="space-y-3 text-sm leading-relaxed">{children}</div>
    </section>
  );
}

function InfoCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-muted rounded-xl border p-4">
      <p className="text-primary mb-2 text-xs font-bold tracking-wider uppercase">{title}</p>
      <div className="text-foreground/85 whitespace-pre-line">{children}</div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="border-white/30 pr-6 sm:border-r sm:last:border-r-0">
      <dt className="text-[0.6875rem] font-semibold tracking-wider text-white/75 uppercase">{label}</dt>
      <dd className="text-sm font-bold">{value}</dd>
    </div>
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

  const settings = await db.organizationSettings.findUnique({
    where: { id: 1 },
    select: { disabilityReferentName: true, disabilityReferentEmail: true, disabilityReferentPhone: true },
  });
  const referent = [
    settings?.disabilityReferentName,
    settings?.disabilityReferentEmail,
    settings?.disabilityReferentPhone,
  ]
    .filter(Boolean)
    .join("\n");
  const nextSession = training.sessions[0]?.slots[0]?.startsAt;
  let sectionNumber = 0;

  return (
    <>
      <FrontHero
        title={training.title}
        before={
          <div className="flex flex-wrap items-center gap-4">
            <Link href="/" className="text-sm text-white/80 underline-offset-4 hover:text-white hover:underline">
              ← Catalogue
            </Link>
            {training.theme ? (
              <Badge className="border-transparent bg-[#fcd3f0] text-[0.6875rem] font-semibold tracking-wider text-[#8a1466] uppercase">
                {training.theme.name}
              </Badge>
            ) : null}
          </div>
        }
      >
        <dl className="flex flex-wrap gap-x-6 gap-y-3 pt-2">
          <Stat label="Durée" value={`${formatDecimal(training.durationHours)} heures`} />
          <Stat label="Modalité" value={MODALITY_LABELS[training.modality]} />
          <Stat label="Sessions ouvertes" value={training.sessions.length} />
          {nextSession ? <Stat label="Prochaine session" value={formatDate(nextSession)} /> : null}
        </dl>
      </FrontHero>
      <div className="grid gap-10 lg:grid-cols-[1fr_22rem]">
        <article className="space-y-8">
          <Section number={++sectionNumber} title="Objectifs">
            <p className="border-brand-teal border-l-2 pl-4 text-base font-medium whitespace-pre-line">
              {training.objectives}
            </p>
          </Section>
          {training.targetAudience || training.prerequisites ? (
            <Section number={++sectionNumber} title="Pour qui">
              <div className="grid gap-3 sm:grid-cols-2">
                {training.targetAudience ? <InfoCard title="Public visé">{training.targetAudience}</InfoCard> : null}
                {training.prerequisites ? <InfoCard title="Prérequis">{training.prerequisites}</InfoCard> : null}
              </div>
            </Section>
          ) : null}
          {training.programText || training.programPdfPath ? (
            <Section number={++sectionNumber} title="Programme">
              {training.programText ? <p className="whitespace-pre-line">{training.programText}</p> : null}
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
            </Section>
          ) : null}
          {training.teachingMethods || training.evaluationMethods || training.accessDelay ? (
            <Section number={++sectionNumber} title="Déroulement">
              <div className="grid gap-3 sm:grid-cols-2">
                {training.teachingMethods ? (
                  <InfoCard title="Méthodes pédagogiques">{training.teachingMethods}</InfoCard>
                ) : null}
                {training.evaluationMethods ? (
                  <InfoCard title="Modalités d'évaluation">{training.evaluationMethods}</InfoCard>
                ) : null}
                {training.accessDelay ? <InfoCard title="Délai d'accès">{training.accessDelay}</InfoCard> : null}
              </div>
            </Section>
          ) : null}
          <Section number={++sectionNumber} title="Accessibilité">
            <div className="grid gap-3 sm:grid-cols-2">
              <InfoCard title="Situation de handicap">
                {training.accessibility ??
                  "Nos formations sont accessibles aux personnes en situation de handicap : contactez le référent handicap pour étudier les aménagements nécessaires."}
              </InfoCard>
              {referent ? <InfoCard title="Référent handicap">{referent}</InfoCard> : null}
            </div>
          </Section>
        </article>

        <aside aria-labelledby="sessions-title" className="space-y-3 lg:sticky lg:top-4 lg:self-start">
          <h2 id="sessions-title" className="text-lg font-bold">
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
                  <li
                    key={session.id}
                    id={`session-${session.id}`}
                    className="bg-card border-t-primary scroll-mt-24 space-y-3 rounded-xl border border-t-4 p-5 shadow-sm"
                  >
                    <ul className="space-y-0.5 text-sm font-medium">
                      {labels.map((label) => (
                        <li key={label}>{label}</li>
                      ))}
                    </ul>
                    <p className="text-muted-foreground text-sm">{placeLabel(session)}</p>
                    {session.trainers.length > 0 ? (
                      <p className="text-muted-foreground text-sm">
                        Avec{" "}
                        {session.trainers
                          .map((link) => `${link.trainer.firstName} ${link.trainer.lastName}`)
                          .join(", ")}
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
    </>
  );
}
