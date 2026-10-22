import "server-only";
import { cache } from "react";
import { db } from "@/lib/db";
import { SEAT_HOLDING_STATUSES } from "@/server/domain/capacity";

/** Session with what the header and tabs need; cached for the request. */
export const getSessionDetail = cache(async (id: string) => {
  const session = await db.trainingSession.findUnique({
    where: { id },
    include: {
      training: { include: { theme: true } },
      slots: { orderBy: { startsAt: "asc" } },
      trainers: { include: { trainer: true } },
    },
  });
  if (!session) return null;
  const counts = await db.enrollment.groupBy({ by: ["status"], where: { sessionId: id }, _count: { _all: true } });
  const count = (statuses: readonly string[]) =>
    counts.filter((row) => statuses.includes(row.status)).reduce((sum, row) => sum + row._count._all, 0);
  return {
    ...session,
    seats: count(SEAT_HOLDING_STATUSES),
    waitlisted: count(["waitlisted"]),
    cancelled: count(["cancelled"]),
    total: count(["confirmed", "waitlisted", "cancelled", "present", "absent"]),
  };
});

export type SessionDetail = NonNullable<Awaited<ReturnType<typeof getSessionDetail>>>;
