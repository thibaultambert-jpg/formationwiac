import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState } from "@/components/layout/empty-state";
import { FrontHero } from "@/components/layout/front-hero";
import { Badge } from "@/components/ui/badge";
import { db } from "@/lib/db";
import { formatDateRange } from "@/lib/dates";
import { SESSION_STATUS_LABELS, SESSION_STATUS_TONES } from "@/lib/labels";
import { requireRole } from "@/server/auth/guards";
import { placeLabel } from "@/server/services/session-labels";

export const metadata: Metadata = { title: "Mes sessions" };

function daysAgo(days: number): Date {
  return new Date(Date.now() - days * 24 * 3_600_000);
}

export default async function MySessionsPage() {
  const user = await requireRole(["trainer", "admin"]);
  const trainer = await db.trainer.findUnique({ where: { userId: user.id } });
  const since = daysAgo(30);
  const sessions = trainer
    ? await db.trainingSession.findMany({
        where: {
          status: { not: "cancelled" },
          trainers: { some: { trainerId: trainer.id } },
          slots: { some: { endsAt: { gte: since } } },
        },
        include: {
          training: true,
          slots: { orderBy: { startsAt: "asc" } },
          _count: { select: { enrollments: { where: { status: { in: ["confirmed", "present", "absent"] } } } } },
        },
      })
    : [];
  sessions.sort((a, b) => (a.slots[0]?.startsAt.getTime() ?? 0) - (b.slots[0]?.startsAt.getTime() ?? 0));

  return (
    <>
      <FrontHero
        eyebrow="Formateur"
        title="Mes sessions"
        description="Les sessions que vous animez, la liste des inscrits et l'émargement en direct."
      />
      {!trainer ? (
        <EmptyState>Votre compte n&apos;est lié à aucune fiche formateur.</EmptyState>
      ) : sessions.length === 0 ? (
        <EmptyState>Aucune session à venir ou récente.</EmptyState>
      ) : (
        <ul className="space-y-3">
          {sessions.map((session) => (
            <li key={session.id}>
              <Link
                href={`/mes-sessions/${session.id}`}
                className="bg-card hover:border-primary block space-y-1 rounded-xl border p-4 shadow-sm"
              >
                <span className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-semibold">{session.training.title}</span>
                  <Badge variant={SESSION_STATUS_TONES[session.status]}>{SESSION_STATUS_LABELS[session.status]}</Badge>
                </span>
                <span className="text-muted-foreground block text-sm">
                  {session.reference} · {formatDateRange(session.slots.map((slot) => slot.startsAt))} ·{" "}
                  {placeLabel({ location: session.location, videoLink: null })}
                </span>
                <span className="block text-sm">{session._count.enrollments} inscrit(s)</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
