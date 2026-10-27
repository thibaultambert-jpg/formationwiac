import "server-only";
import { db } from "@/lib/db";
import { getEnv } from "@/lib/env";
import { audit } from "@/server/audit";
import { SEAT_HOLDING_STATUSES } from "@/server/domain/capacity";
import { buildDigestMessage, digestWeekKey, selectDigestSessions, weeklyDigestDue } from "@/server/domain/slack-digest";
import { visibleSessionWhere } from "@/server/services/front";
import { postToSlack } from "@/server/slack";

/**
 * Weekly Slack digest of the sessions open to collaborators (free seats or full).
 * Due on Monday from noon; the audit log keeps one post per week, so the
 * scheduled job can run several times that day. Returns the number of posts.
 */
export async function sendWeeklySlackDigest(now: Date): Promise<number> {
  if (!weeklyDigestDue(now)) return 0;
  const week = digestWeekKey(now);
  const alreadySent = await db.auditLog.findFirst({
    where: { action: "slack_digest", entity: "slack", entityId: week },
    select: { id: true },
  });
  if (alreadySent) return 0;

  const sessions = await db.trainingSession.findMany({
    where: visibleSessionWhere(now),
    include: {
      training: { select: { title: true, slug: true, active: true } },
      slots: { orderBy: { startsAt: "asc" }, select: { startsAt: true } },
      _count: { select: { enrollments: { where: { status: { in: [...SEAT_HOLDING_STATUSES] } } } } },
    },
  });
  const items = selectDigestSessions(
    sessions
      .filter((session) => session.training.active)
      .map((session) => ({
        id: session.id,
        status: session.status,
        openToInternal: session.openToInternal,
        registrationDeadline: session.registrationDeadline,
        firstSlotStart: session.slots[0]?.startsAt ?? null,
        trainingTitle: session.training.title,
        trainingSlug: session.training.slug,
        slotStarts: session.slots.map((slot) => slot.startsAt),
        capacityMax: session.capacityMax,
        occupiedSeats: session._count.enrollments,
      })),
    now,
  );
  if (items.length === 0) return 0;

  if (!(await postToSlack(buildDigestMessage(items, getEnv().APP_URL)))) return 0;
  await audit(db, {
    userId: null,
    action: "slack_digest",
    entity: "slack",
    entityId: week,
    after: { sessions: items.map((item) => ({ id: item.id, remaining: item.remaining })) },
  });
  return 1;
}
