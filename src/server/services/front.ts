import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { parisMonthBounds } from "@/lib/dates";
import { SEAT_HOLDING_STATUSES } from "@/server/domain/capacity";

/** Prisma filter matching isVisibleOnFront(): published/full, open to internals, not started. */
export function visibleSessionWhere(now: Date): Prisma.TrainingSessionWhereInput {
  return {
    status: { in: ["published", "full"] },
    openToInternal: true,
    slots: { some: {}, none: { startsAt: { lte: now } } },
  };
}

export type CatalogFilters = { q: string; theme: string; modality: string; month: string };

export async function listCatalog(filters: CatalogFilters, now: Date) {
  const monthMatch = /^(\d{4})-(\d{2})$/.exec(filters.month);
  const month = monthMatch ? parisMonthBounds(Number(monthMatch[1]), Number(monthMatch[2])) : null;
  const sessionWhere: Prisma.TrainingSessionWhereInput = {
    ...visibleSessionWhere(now),
    ...(month ? { AND: [{ slots: { some: { startsAt: { gte: month.start, lt: month.end } } } }] } : {}),
  };

  const trainings = await db.training.findMany({
    where: {
      active: true,
      sessions: { some: sessionWhere },
      ...(filters.theme ? { themeId: filters.theme } : {}),
      ...(["in_person", "remote", "blended"].includes(filters.modality)
        ? { modality: filters.modality as "in_person" | "remote" | "blended" }
        : {}),
      ...(filters.q
        ? {
            OR: [
              { title: { contains: filters.q, mode: "insensitive" } },
              { objectives: { contains: filters.q, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    include: {
      theme: true,
      sessions: {
        where: sessionWhere,
        include: {
          slots: { orderBy: { startsAt: "asc" }, take: 1, select: { startsAt: true } },
          _count: { select: { enrollments: { where: { status: { in: [...SEAT_HOLDING_STATUSES] } } } } },
        },
      },
    },
  });

  return trainings
    .map((training) => {
      const sessions = training.sessions
        .map((session) => ({
          id: session.id,
          firstSlot: session.slots[0]?.startsAt ?? null,
          remaining: Math.max(0, session.capacityMax - session._count.enrollments),
        }))
        .sort((a, b) => (a.firstSlot?.getTime() ?? 0) - (b.firstSlot?.getTime() ?? 0));
      return { ...training, upcoming: sessions };
    })
    .sort((a, b) => (a.upcoming[0]?.firstSlot?.getTime() ?? 0) - (b.upcoming[0]?.firstSlot?.getTime() ?? 0));
}

export async function trainingForFront(slug: string, userId: string, now: Date) {
  const training = await db.training.findFirst({
    where: { slug, active: true },
    include: {
      theme: true,
      sessions: {
        where: visibleSessionWhere(now),
        include: {
          slots: { orderBy: { startsAt: "asc" } },
          trainers: { include: { trainer: { select: { firstName: true, lastName: true } } } },
          _count: { select: { enrollments: { where: { status: { in: [...SEAT_HOLDING_STATUSES] } } } } },
        },
      },
    },
  });
  if (!training) return null;

  const participant = await db.participant.findUnique({ where: { userId } });
  const enrollments = participant
    ? await db.enrollment.findMany({
        where: { participantId: participant.id, sessionId: { in: training.sessions.map((session) => session.id) } },
      })
    : [];
  const bySession = new Map(enrollments.map((enrollment) => [enrollment.sessionId, enrollment]));

  const sessions = training.sessions
    .map((session) => ({
      ...session,
      remaining: Math.max(0, session.capacityMax - session._count.enrollments),
      myEnrollment: bySession.get(session.id) ?? null,
    }))
    .sort((a, b) => a.slots[0].startsAt.getTime() - b.slots[0].startsAt.getTime());
  return { ...training, sessions };
}
