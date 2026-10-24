import "server-only";
import { db } from "@/lib/db";
import { formatDate } from "@/lib/dates";

/** Sessions that a complaint can refer to (most recent first). */
export async function sessionOptions() {
  const sessions = await db.trainingSession.findMany({
    include: {
      training: { select: { title: true } },
      slots: { select: { startsAt: true }, orderBy: { startsAt: "asc" }, take: 1 },
    },
    orderBy: { createdAt: "desc" },
    take: 300,
  });
  return sessions.map((session) => ({
    value: session.id,
    label: `${session.reference} · ${session.training.title}${session.slots[0] ? ` · ${formatDate(session.slots[0].startsAt)}` : ""}`,
  }));
}

export async function complaintOptions() {
  const complaints = await db.complaint.findMany({ orderBy: { receivedAt: "desc" }, take: 300 });
  return complaints.map((complaint) => ({
    value: complaint.id,
    label: `${formatDate(complaint.receivedAt)} · ${complaint.subject}`,
  }));
}

export function complaintFilters(params: Record<string, string | string[] | undefined>) {
  const status = typeof params.statut === "string" ? params.statut : "";
  return {
    status,
    where: ["open", "in_progress", "closed"].includes(status)
      ? { status: status as "open" | "in_progress" | "closed" }
      : {},
  };
}

export function improvementFilters(params: Record<string, string | string[] | undefined>) {
  const status = typeof params.statut === "string" ? params.statut : "";
  return {
    status,
    where: ["planned", "in_progress", "done", "abandoned"].includes(status)
      ? { status: status as "planned" | "in_progress" | "done" | "abandoned" }
      : {},
  };
}
