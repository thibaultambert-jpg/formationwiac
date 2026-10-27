// Weekly Slack digest of the trainings open to collaborators: due on Monday
// from noon (Paris), one post per week (the week key is the Monday). Full
// sessions are listed too ("complet"), each with a link to its session card.

import { formatDate, formatWeekday, parisDateTimeToUtc, toParisDateInput } from "@/lib/dates";
import { remainingSeats } from "@/server/domain/capacity";
import { canSelfEnroll, type FrontSession } from "@/server/domain/front-enrollment";

export const DIGEST_TIME = "12:00";
/** A session is confirmed (it will take place) from this number of enrollees. */
export const CONFIRMATION_THRESHOLD = 6;

export type DigestSession = FrontSession & {
  id: string;
  trainingTitle: string;
  trainingSlug: string;
  slotStarts: Date[];
  capacityMax: number;
  occupiedSeats: number;
};

export type DigestItem = DigestSession & { remaining: number };

/** Monday from noon, Paris time. */
export function weeklyDigestDue(now: Date): boolean {
  const day = toParisDateInput(now);
  const isMonday = new Date(`${day}T12:00:00Z`).getUTCDay() === 1;
  return isMonday && now >= parisDateTimeToUtc(day, DIGEST_TIME)!;
}

/** Idempotency key of the digest of the week (Paris date of the day it is due). */
export function digestWeekKey(now: Date): string {
  return toParisDateInput(now);
}

/** Sessions a collaborator can still enroll in (full ones included, for the waitlist), earliest first. */
export function selectDigestSessions(sessions: readonly DigestSession[], now: Date): DigestItem[] {
  return sessions
    .filter((session) => canSelfEnroll(session, now))
    .map((session) => ({ ...session, remaining: remainingSeats(session.occupiedSeats, session.capacityMax) }))
    .sort((a, b) => a.firstSlotStart!.getTime() - b.firstSlotStart!.getTime());
}

/** Slack mrkdwn escaping (only &, < and > are control characters). */
function escape(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** "Mardi 03/11/2026, mercredi 04/11/2026 et lundi 09/11/2026": one entry per Paris day. */
export function formatDigestDays(slotStarts: readonly Date[]): string {
  const days = new Map<string, Date>();
  for (const start of [...slotStarts].sort((a, b) => a.getTime() - b.getTime())) {
    const key = toParisDateInput(start);
    if (!days.has(key)) days.set(key, start);
  }
  const labels = [...days.values()].map((day) => `${formatWeekday(day)} ${formatDate(day)}`);
  if (labels.length === 0) return "dates à définir";
  const text = labels.length === 1 ? labels[0] : `${labels.slice(0, -1).join(", ")} et ${labels[labels.length - 1]}`;
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function statusLine(item: DigestItem): string {
  const seats = item.remaining > 0 ? `${item.remaining} place(s) disponible(s)` : "complet";
  const missing = CONFIRMATION_THRESHOLD - item.occupiedSeats;
  const confirmation =
    missing <= 0
      ? ":white_check_mark: session confirmée"
      : `:hourglass_flowing_sand: encore ${missing} inscrit(s) pour confirmer`;
  return `${item.occupiedSeats} inscrit(s) – ${seats} – ${confirmation}`;
}

export type SlackMessage = { text: string };

/** Incoming webhook payload (mrkdwn), in French; <!here> is shown as @ici. */
export function buildDigestMessage(items: readonly DigestItem[], appUrl: string): SlackMessage {
  const base = appUrl.replace(/\/$/, "");
  const lines = items.map((item) => {
    const link = `${base}/formations/${item.trainingSlug}#session-${item.id}`;
    return `• *<${link}|${escape(item.trainingTitle)}>* – ${formatDigestDays(item.slotStarts)}\n\u2003\u2003${statusLine(item)}`;
  });
  const intro =
    `Hello <!here> :wave: Voici les formations ouvertes à l'inscription. Une session est confirmée dès ` +
    `${CONFIRMATION_THRESHOLD} inscrits : inscrivez-vous et faites passer le mot !`;
  return { text: [intro, "", ...lines].join("\n") };
}
