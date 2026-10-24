import "server-only";
import { db } from "@/lib/db";
import { parisMonthBounds } from "@/lib/dates";
import { signedHours, slotAttendance } from "@/server/domain/attendance-proof";
import { trainingIndicators, type IndicatorEnrollment, type TrainingIndicators } from "@/server/domain/indicators";
import { totalHours } from "@/server/domain/slots";

export type TrainingIndicatorRow = { trainingId: string; title: string } & TrainingIndicators;

/**
 * Result indicators per training for the sessions that started in a civil
 * year (Paris time), cancelled sessions excluded (D1).
 */
export async function indicatorsByTraining(year: number): Promise<TrainingIndicatorRow[]> {
  const start = parisMonthBounds(year, 1).start;
  const end = parisMonthBounds(year + 1, 1).start;
  const sessions = await db.trainingSession.findMany({
    where: { status: { not: "cancelled" }, slots: { some: { startsAt: { gte: start, lt: end } } } },
    include: {
      training: { select: { id: true, title: true } },
      slots: { orderBy: { startsAt: "asc" } },
      enrollments: {
        include: {
          attendances: true,
          corrections: true,
          evaluations: { where: { type: "hot" } },
        },
      },
    },
  });
  const groups = new Map<string, { title: string; sessions: number; rows: IndicatorEnrollment[] }>();
  for (const session of sessions) {
    if (session.slots[0].startsAt < start) continue; // counted in the year it started
    const group = groups.get(session.trainingId) ?? { title: session.training.title, sessions: 0, rows: [] };
    group.sessions++;
    for (const enrollment of session.enrollments) {
      const hot = enrollment.evaluations[0];
      group.rows.push({
        status: enrollment.status,
        plannedHours: totalHours(session.slots),
        signedHours: signedHours(
          session.slots.map((slot) => ({
            startsAt: slot.startsAt,
            endsAt: slot.endsAt,
            attendance: slotAttendance({
              attendance: enrollment.attendances.find((item) => item.slotId === slot.id) ?? null,
              corrections: enrollment.corrections.filter((item) => item.slotId === slot.id),
            }),
          })),
        ),
        hotSent: Boolean(hot?.sentAt),
        hotSubmitted: Boolean(hot?.submittedAt),
        hotScore: hot?.globalScore != null ? Number(hot.globalScore) : null,
        learningResult: enrollment.learningResult,
      });
    }
    groups.set(session.trainingId, group);
  }
  return [...groups.entries()]
    .map(([trainingId, group]) => ({
      trainingId,
      title: group.title,
      ...trainingIndicators(group.rows, group.sessions),
    }))
    .sort((a, b) => a.title.localeCompare(b.title, "fr"));
}
