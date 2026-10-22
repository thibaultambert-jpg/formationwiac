import type { Metadata } from "next";
import Link from "next/link";
import { CalendarCheck, Video } from "lucide-react";
import { EmptyState } from "@/components/layout/empty-state";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { db } from "@/lib/db";
import { formatDateRange, formatDateTime } from "@/lib/dates";
import { requireUser } from "@/server/auth/guards";
import { canSelfUnenroll } from "@/server/domain/front-enrollment";
import { placeLabel, slotLabels } from "@/server/services/session-labels";
import { UnenrollDialog } from "../formations/[slug]/enroll-dialog";

export const metadata: Metadata = { title: "Mes formations" };

const STATUS: Record<string, { label: string; tone: "success" | "warning" | "secondary" | "info" | "destructive" }> = {
  confirmed: { label: "Inscription confirmée", tone: "success" },
  waitlisted: { label: "Liste d'attente", tone: "warning" },
  present: { label: "Présent(e)", tone: "info" },
  absent: { label: "Absent(e)", tone: "destructive" },
};

export default async function MyTrainingsPage() {
  const user = await requireUser();
  const now = new Date();
  const participant = await db.participant.findUnique({ where: { userId: user.id } });
  const enrollments = participant
    ? await db.enrollment.findMany({
        where: { participantId: participant.id, status: { not: "cancelled" } },
        include: { session: { include: { training: true, slots: { orderBy: { startsAt: "asc" } } } } },
      })
    : [];

  const lastEnd = (enrollment: (typeof enrollments)[number]) => enrollment.session.slots.at(-1)?.endsAt ?? new Date(0);
  const upcoming = enrollments
    .filter((enrollment) => lastEnd(enrollment) > now)
    .sort((a, b) => (a.session.slots[0]?.startsAt.getTime() ?? 0) - (b.session.slots[0]?.startsAt.getTime() ?? 0));
  const past = enrollments
    .filter((enrollment) => lastEnd(enrollment) <= now && enrollment.status !== "waitlisted")
    .sort((a, b) => lastEnd(b).getTime() - lastEnd(a).getTime());

  return (
    <>
      <PageHeader title="Mes formations" description="Vos inscriptions à venir et vos formations passées." />

      <section aria-labelledby="upcoming-title" className="mb-10 space-y-3">
        <h2 id="upcoming-title" className="text-lg font-semibold">
          À venir ({upcoming.length})
        </h2>
        {upcoming.length === 0 ? (
          <EmptyState>
            Aucune inscription à venir.{" "}
            <Link href="/" className="text-primary underline underline-offset-4">
              Parcourir le catalogue
            </Link>
          </EmptyState>
        ) : (
          <ul className="space-y-3">
            {upcoming.map((enrollment) => {
              const { session } = enrollment;
              const cancelled = session.status === "cancelled";
              const status = STATUS[enrollment.status] ?? STATUS.confirmed;
              const state = { ...session, firstSlotStart: session.slots[0]?.startsAt ?? null };
              return (
                <li key={enrollment.id} className="bg-card space-y-3 rounded-xl border p-4 shadow-sm">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <Link href={`/formations/${session.training.slug}`} className="font-semibold hover:underline">
                      {session.training.title}
                    </Link>
                    {cancelled ? (
                      <Badge variant="destructive">Session annulée</Badge>
                    ) : (
                      <Badge variant={status.tone}>{status.label}</Badge>
                    )}
                  </div>
                  <ul className="space-y-0.5 text-sm">
                    {slotLabels(session.slots).map((label) => (
                      <li key={label}>{label}</li>
                    ))}
                  </ul>
                  <p className="text-muted-foreground text-sm">
                    {placeLabel({ location: session.location, videoLink: null })}
                  </p>
                  {cancelled && session.cancellationReason ? (
                    <p className="text-sm">Motif : {session.cancellationReason}</p>
                  ) : null}
                  {!cancelled ? (
                    <div className="flex flex-wrap items-center gap-2">
                      {enrollment.status === "confirmed" && session.videoLink ? (
                        <Button asChild variant="outline" size="sm">
                          <a href={session.videoLink} target="_blank" rel="noreferrer">
                            <Video aria-hidden="true" />
                            Lien visio
                          </a>
                        </Button>
                      ) : null}
                      {enrollment.status === "confirmed" ? (
                        <Button asChild variant="outline" size="sm">
                          <a href={`/mes-formations/agenda/${enrollment.id}`}>
                            <CalendarCheck aria-hidden="true" />
                            Ajouter à l&apos;agenda
                          </a>
                        </Button>
                      ) : null}
                      {canSelfUnenroll(enrollment.status, state, now) ? (
                        <UnenrollDialog enrollmentId={enrollment.id} title={session.training.title} />
                      ) : (
                        <span className="text-muted-foreground text-xs">
                          Désinscription en ligne close
                          {session.registrationDeadline
                            ? ` depuis le ${formatDateTime(session.registrationDeadline)}`
                            : ""}{" "}
                          : contactez le service formation.
                        </span>
                      )}
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section aria-labelledby="past-title" className="space-y-3">
        <h2 id="past-title" className="text-lg font-semibold">
          Formations passées ({past.length})
        </h2>
        {past.length === 0 ? (
          <EmptyState>Aucune formation passée.</EmptyState>
        ) : (
          <ul className="divide-y rounded-md border">
            {past.map((enrollment) => (
              <li
                key={enrollment.id}
                className="flex flex-col gap-1 p-3 text-sm sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <p className="font-medium">{enrollment.session.training.title}</p>
                  <p className="text-muted-foreground">
                    {formatDateRange(enrollment.session.slots.map((slot) => slot.startsAt))}
                  </p>
                </div>
                <p className="text-muted-foreground text-xs">Attestation et évaluation disponibles prochainement.</p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
