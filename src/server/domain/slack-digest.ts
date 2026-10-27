// Weekly Slack digest of the trainings open to collaborators: due on Monday
// from noon (Paris), one post per week (the week key is the Monday).

import { formatDate, formatDateRange, parisDateTimeToUtc, toParisDateInput } from "@/lib/dates";
import { MODALITY_LABELS } from "@/lib/labels";
import { remainingSeats } from "@/server/domain/capacity";
import { canSelfEnroll, type FrontSession } from "@/server/domain/front-enrollment";

export const DIGEST_TIME = "12:00";
/** Slack accepts 50 blocks per message: header, intro, footer and one block per session. */
export const DIGEST_MAX_SESSIONS = 40;

export type DigestSession = FrontSession & {
  id: string;
  trainingTitle: string;
  trainingSlug: string;
  modality: keyof typeof MODALITY_LABELS;
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

/** Sessions a collaborator can still enroll in, with at least one free seat, earliest first. */
export function selectDigestSessions(sessions: readonly DigestSession[], now: Date): DigestItem[] {
  return sessions
    .filter((session) => canSelfEnroll(session, now))
    .map((session) => ({ ...session, remaining: remainingSeats(session.occupiedSeats, session.capacityMax) }))
    .filter((session) => session.remaining > 0)
    .sort((a, b) => a.firstSlotStart!.getTime() - b.firstSlotStart!.getTime());
}

/** Slack mrkdwn escaping (only &, < and > are control characters). */
function escape(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function seatsLabel(remaining: number): string {
  return remaining === 1 ? "1 place restante" : `${remaining} places restantes`;
}

export type SlackMessage = { text: string; blocks: Record<string, unknown>[] };

/** Incoming webhook payload, in French, with a plain-text fallback for notifications. */
export function buildDigestMessage(items: readonly DigestItem[], appUrl: string): SlackMessage {
  const base = appUrl.replace(/\/$/, "");
  const shown = items.slice(0, DIGEST_MAX_SESSIONS);
  const intro =
    items.length === 1
      ? "1 session a encore des places disponibles :"
      : `${items.length} sessions ont encore des places disponibles :`;
  const sessionBlocks = shown.map((item) => {
    const lines = [
      `*<${base}/formations/${item.trainingSlug}|${escape(item.trainingTitle)}>*`,
      `📅 ${formatDateRange(item.slotStarts)} · ${MODALITY_LABELS[item.modality]} · *${seatsLabel(item.remaining)}*`,
    ];
    if (item.registrationDeadline) lines.push(`⏳ Inscription jusqu'au ${formatDate(item.registrationDeadline)}`);
    return { type: "section", text: { type: "mrkdwn", text: lines.join("\n") } };
  });
  const more = items.length - shown.length;
  const footer = `${more > 0 ? `… et ${more} autre${more > 1 ? "s" : ""}. ` : ""}<${base}/formations|Voir tout le catalogue et s'inscrire>`;
  return {
    text: `Formations ouvertes : ${intro}`,
    blocks: [
      { type: "header", text: { type: "plain_text", text: "📚 Formations ouvertes aux inscriptions", emoji: true } },
      { type: "section", text: { type: "mrkdwn", text: intro } },
      ...sessionBlocks,
      { type: "context", elements: [{ type: "mrkdwn", text: footer }] },
    ],
  };
}
