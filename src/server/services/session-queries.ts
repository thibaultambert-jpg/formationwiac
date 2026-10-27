import "server-only";
import type { Prisma, SessionStatus } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { parisDateTimeToUtc } from "@/lib/dates";
import { SESSION_STATUS_LABELS } from "@/lib/labels";
import { SEAT_HOLDING_STATUSES } from "@/server/domain/capacity";

export type SessionFilters = {
  trainingId: string;
  trainerId: string;
  status: string;
  from: string;
  to: string;
  /** "a-facturer": closed sessions with external enrollments not invoiced yet. */
  invoicing: string;
};

/**
 * Priced external trainee who attended (present or dropped out) and is not on
 * an active invoice. Absent trainees are left out: billing them is decided on
 * the invoice of their company.
 */
export const TO_INVOICE_ENROLLMENT_WHERE = {
  participantType: "external",
  status: { in: ["present", "dropped_out"] },
  appliedPrice: { gt: 0 },
  invoiceLines: { none: { active: true } },
} satisfies Prisma.EnrollmentWhereInput;

/** Closed sessions with at least one enrollment to invoice (dashboard, sessions list filter). */
export const TO_INVOICE_WHERE = {
  status: "completed",
  enrollments: { some: TO_INVOICE_ENROLLMENT_WHERE },
} satisfies Prisma.TrainingSessionWhereInput;

export function readSessionFilters(params: Record<string, string | string[] | undefined>): SessionFilters {
  const get = (key: string) => (typeof params[key] === "string" ? (params[key] as string).trim() : "");
  return {
    trainingId: get("formation"),
    trainerId: get("formateur"),
    status: get("statut"),
    from: get("du"),
    to: get("au"),
    invoicing: get("facturation"),
  };
}

export function sessionFiltersToQuery(filters: SessionFilters): Record<string, string> {
  const query: Record<string, string> = {};
  if (filters.trainingId) query.formation = filters.trainingId;
  if (filters.trainerId) query.formateur = filters.trainerId;
  if (filters.status) query.statut = filters.status;
  if (filters.from) query.du = filters.from;
  if (filters.to) query.au = filters.to;
  if (filters.invoicing) query.facturation = filters.invoicing;
  return query;
}

/** Sessions matching the filters; the period keeps sessions having a slot in it. */
export function sessionWhere(
  filters: SessionFilters,
  period?: { start: Date; end: Date },
): Prisma.TrainingSessionWhereInput {
  const from = filters.from ? parisDateTimeToUtc(filters.from, "00:00") : null;
  const toStart = filters.to ? parisDateTimeToUtc(filters.to, "00:00") : null;
  const to = toStart ? new Date(toStart.getTime() + 24 * 3_600_000) : null;
  const slotConditions: Prisma.SessionSlotWhereInput[] = [];
  if (from) slotConditions.push({ endsAt: { gt: from } });
  if (to) slotConditions.push({ startsAt: { lt: to } });
  if (period) slotConditions.push({ startsAt: { lt: period.end }, endsAt: { gt: period.start } });

  return {
    ...(filters.trainingId ? { trainingId: filters.trainingId } : {}),
    ...(filters.trainerId ? { trainers: { some: { trainerId: filters.trainerId } } } : {}),
    ...(filters.status in SESSION_STATUS_LABELS ? { status: filters.status as SessionStatus } : {}),
    ...(slotConditions.length > 0 ? { slots: { some: { AND: slotConditions } } } : {}),
    ...(filters.invoicing === "a-facturer" ? { AND: [TO_INVOICE_WHERE] } : {}),
  };
}

export const sessionListInclude = {
  training: { select: { id: true, title: true } },
  slots: { orderBy: { startsAt: "asc" } },
  trainers: { include: { trainer: { select: { firstName: true, lastName: true } } } },
  _count: {
    select: {
      enrollments: { where: { status: { in: [...SEAT_HOLDING_STATUSES] } } },
    },
  },
} satisfies Prisma.TrainingSessionInclude;

export type SessionListItem = Prisma.TrainingSessionGetPayload<{ include: typeof sessionListInclude }>;

export async function listSessions(filters: SessionFilters): Promise<SessionListItem[]> {
  const sessions = await db.trainingSession.findMany({
    where: sessionWhere(filters),
    include: sessionListInclude,
    take: 500,
  });
  const first = (session: SessionListItem) => session.slots[0]?.startsAt.getTime() ?? Number.MAX_SAFE_INTEGER;
  return sessions.sort((a, b) => first(a) - first(b));
}

export async function waitlistCounts(sessionIds: string[]): Promise<Map<string, number>> {
  const rows = await db.enrollment.groupBy({
    by: ["sessionId"],
    where: { sessionId: { in: sessionIds }, status: "waitlisted" },
    _count: { _all: true },
  });
  return new Map(rows.map((row) => [row.sessionId, row._count._all]));
}
