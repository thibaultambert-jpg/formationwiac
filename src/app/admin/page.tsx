import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState } from "@/components/layout/empty-state";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { db } from "@/lib/db";
import { formatDate, formatDateRange } from "@/lib/dates";
import { SESSION_STATUS_LABELS, SESSION_STATUS_TONES } from "@/lib/labels";
import { requireRole } from "@/server/auth/guards";
import { SEAT_HOLDING_STATUSES } from "@/server/domain/capacity";

export const metadata: Metadata = { title: "Tableau de bord" };

const DAY = 24 * 3_600_000;

function FillBar({ seats, capacity, min }: { seats: number; capacity: number; min: number | null }) {
  const rate = Math.min(100, Math.round((seats / capacity) * 100));
  const low = min !== null && seats < min;
  return (
    <div className="flex items-center gap-2">
      <span className="bg-muted h-2 w-24 overflow-hidden rounded" aria-hidden="true">
        <span className={low ? "block h-full bg-amber-500" : "bg-primary block h-full"} style={{ width: `${rate}%` }} />
      </span>
      <span className="text-sm whitespace-nowrap">
        {seats}/{capacity} ({rate} %)
      </span>
    </div>
  );
}

export default async function AdminDashboardPage() {
  await requireRole(["admin"]);
  const now = new Date();
  const in30 = new Date(now.getTime() + 30 * DAY);
  const in10 = new Date(now.getTime() + 10 * DAY);

  const [upcoming, completed, failedEmails] = await Promise.all([
    db.trainingSession.findMany({
      where: { status: { in: ["draft", "published", "full"] }, slots: { some: { startsAt: { gte: now, lt: in30 } } } },
      include: {
        training: { select: { title: true } },
        slots: { orderBy: { startsAt: "asc" }, select: { startsAt: true } },
        _count: { select: { enrollments: { where: { status: { in: [...SEAT_HOLDING_STATUSES] } } } } },
      },
    }),
    db.trainingSession.findMany({
      where: { status: "completed", slots: { some: { endsAt: { gte: new Date(now.getTime() - 90 * DAY) } } } },
      include: {
        training: { select: { title: true } },
        slots: { orderBy: { startsAt: "asc" }, include: { _count: { select: { trainerSignatures: true } } } },
        trainers: { select: { trainerId: true } },
        enrollments: {
          where: { status: { in: ["present", "absent"] } },
          include: { attendances: { where: { present: true } } },
        },
      },
    }),
    db.document.count({ where: { error: { not: null }, createdAt: { gte: new Date(now.getTime() - 7 * DAY) } } }),
  ]);
  upcoming.sort((a, b) => a.slots[0].startsAt.getTime() - b.slots[0].startsAt.getTime());

  // Sessions starting within 10 days below their minimum capacity.
  const underMin = upcoming.filter(
    (session) =>
      session.capacityMin !== null &&
      session.slots[0].startsAt < in10 &&
      session._count.enrollments < session.capacityMin,
  );

  // Missing participant and trainer signatures of completed sessions (last 90 days).
  const unsigned = completed
    .map((session) => {
      const missingParticipants = session.enrollments.reduce(
        (sum, enrollment) => sum + (session.slots.length - enrollment.attendances.length),
        0,
      );
      const missingTrainers = session.slots.reduce(
        (sum, slot) => sum + Math.max(0, session.trainers.length - slot._count.trainerSignatures),
        0,
      );
      return { session, missingParticipants, missingTrainers };
    })
    .filter((row) => row.missingParticipants + row.missingTrainers > 0)
    .sort(
      (a, b) => (b.session.slots.at(-1)?.startsAt.getTime() ?? 0) - (a.session.slots.at(-1)?.startsAt.getTime() ?? 0),
    );

  return (
    <>
      <PageHeader
        title="Tableau de bord"
        description="Sessions à venir, points d'attention et émargements à compléter."
      />
      {failedEmails > 0 ? (
        <p className="mb-6 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">
          {failedEmails} email(s) en échec ces 7 derniers jours.{" "}
          <Link href="/admin/parametres/emails" className="underline underline-offset-4">
            Voir les envois
          </Link>
        </p>
      ) : null}

      <div className="grid gap-8 xl:grid-cols-[2fr_1fr]">
        <section aria-labelledby="upcoming-title" className="space-y-3">
          <h2 id="upcoming-title" className="text-lg font-semibold">
            Sessions des 30 prochains jours ({upcoming.length})
          </h2>
          {upcoming.length === 0 ? (
            <EmptyState>Aucune session prévue dans les 30 prochains jours.</EmptyState>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Début</TableHead>
                  <TableHead>Formation</TableHead>
                  <TableHead>Remplissage</TableHead>
                  <TableHead>Statut</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {upcoming.map((session) => (
                  <TableRow key={session.id}>
                    <TableCell className="whitespace-nowrap">{formatDate(session.slots[0].startsAt)}</TableCell>
                    <TableCell>
                      <Link href={`/admin/sessions/${session.id}`} className="font-medium hover:underline">
                        {session.training.title}
                      </Link>
                      <span className="text-muted-foreground block text-xs">{session.reference}</span>
                    </TableCell>
                    <TableCell>
                      <FillBar
                        seats={session._count.enrollments}
                        capacity={session.capacityMax}
                        min={session.capacityMin}
                      />
                    </TableCell>
                    <TableCell>
                      <Badge variant={SESSION_STATUS_TONES[session.status]}>
                        {SESSION_STATUS_LABELS[session.status]}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </section>

        <div className="space-y-8">
          <section aria-labelledby="min-title" className="space-y-3">
            <h2 id="min-title" className="text-lg font-semibold">
              Sous la capacité minimale à J-10 ({underMin.length})
            </h2>
            {underMin.length === 0 ? (
              <p className="text-muted-foreground text-sm">Aucune session concernée.</p>
            ) : (
              <ul className="divide-y rounded-md border">
                {underMin.map((session) => (
                  <li key={session.id} className="p-3 text-sm">
                    <Link href={`/admin/sessions/${session.id}/inscrits`} className="font-medium hover:underline">
                      {session.training.title}
                    </Link>
                    <span className="text-muted-foreground block">
                      {formatDate(session.slots[0].startsAt)} · {session._count.enrollments} inscrit(s) pour un minimum
                      de {session.capacityMin}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section aria-labelledby="unsigned-title" className="space-y-3">
            <h2 id="unsigned-title" className="text-lg font-semibold">
              Émargements non signés ({unsigned.length})
            </h2>
            {unsigned.length === 0 ? (
              <p className="text-muted-foreground text-sm">Toutes les sessions terminées sont émargées.</p>
            ) : (
              <ul className="divide-y rounded-md border">
                {unsigned.map(({ session, missingParticipants, missingTrainers }) => (
                  <li key={session.id} className="p-3 text-sm">
                    <Link href={`/admin/sessions/${session.id}/emargement`} className="font-medium hover:underline">
                      {session.training.title}
                    </Link>
                    <span className="text-muted-foreground block">
                      {formatDateRange(session.slots.map((slot) => slot.startsAt))} · {missingParticipants} signature(s)
                      participant
                      {missingTrainers ? `, ${missingTrainers} signature(s) formateur` : ""} manquante(s)
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </>
  );
}
