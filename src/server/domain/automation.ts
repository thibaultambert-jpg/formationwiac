// Timing rules of the automatic sends (section 8). They are written as
// "is it due now?" checks so that the scheduled job can run hourly or daily
// and stays idempotent (each send has a dedup key).

import { parisDateTimeToUtc, toParisDateInput } from "@/lib/dates";
import type { TimeRange } from "@/server/domain/slots";

/** Automatic emails are not sent before this Paris time of day. */
export const SEND_FROM_TIME = "06:00";

function shiftDay(dayKey: string, days: number): string {
  const date = new Date(`${dayKey}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function morningOf(dayKey: string): Date {
  return parisDateTimeToUtc(dayKey, SEND_FROM_TIME)!;
}

/** Reminder J-X: from the morning X days before the first slot, until the session starts. */
export function reminderDue(firstSlotStart: Date, daysBefore: number, now: Date): boolean {
  const dueAt = morningOf(shiftDay(toParisDateInput(firstSlotStart), -daysBefore));
  return now >= dueAt && now < firstSlotStart;
}

export type SessionDay = { day: string; firstStart: Date; lastEnd: Date };

/** Paris days of a session with their first start and last end. */
export function sessionDays(slots: readonly TimeRange[]): SessionDay[] {
  const days = new Map<string, SessionDay>();
  for (const slot of slots) {
    const day = toParisDateInput(slot.startsAt);
    const current = days.get(day);
    days.set(day, {
      day,
      firstStart: current && current.firstStart < slot.startsAt ? current.firstStart : slot.startsAt,
      lastEnd: current && current.lastEnd > slot.endsAt ? current.lastEnd : slot.endsAt,
    });
  }
  return [...days.values()].sort((a, b) => a.firstStart.getTime() - b.firstStart.getTime());
}

/** Attendance link of a day: sent on that day, from the morning until its last slot ends. */
export function attendanceLinkDays(slots: readonly TimeRange[], now: Date): SessionDay[] {
  return sessionDays(slots).filter((day) => now >= morningOf(day.day) && now < day.lastEnd);
}

/** A session is closed (completed) once its last slot has ended. */
export function closureDue(lastSlotEnd: Date, now: Date): boolean {
  return now >= lastSlotEnd;
}

export function coldEvaluationDue(lastSlotEnd: Date, days: number, now: Date): boolean {
  const day = shiftDay(toParisDateInput(lastSlotEnd), days);
  return now >= morningOf(day);
}

export function evaluationReminderDue(sentAt: Date, days: number, now: Date): boolean {
  return now.getTime() >= sentAt.getTime() + days * 24 * 3_600_000;
}

/** Participants sign a slot on its day: from 30 minutes before it starts until 23:59 (Paris). */
export function signingWindowOpen(slot: TimeRange, now: Date): boolean {
  const opensAt = new Date(slot.startsAt.getTime() - 30 * 60_000);
  const closesAt = new Date(parisDateTimeToUtc(toParisDateInput(slot.startsAt), "23:59")!.getTime() + 59_999);
  return now >= opensAt && now <= closesAt;
}

/** Rule 8: present when at least one slot is signed, absent otherwise. */
export function presenceAtClosure(signedSlots: number): "present" | "absent" {
  return signedSlots > 0 ? "present" : "absent";
}

/** Entry assessment (D3): sent from the morning N days before the first slot, until the session starts. */
export function positioningDue(firstSlotStart: Date, daysBefore: number, now: Date): boolean {
  return reminderDue(firstSlotStart, daysBefore, now);
}

/** Absence alert of a slot (D6): from 15 minutes after its end, the same Paris day. */
export function absenceAlertDue(slot: TimeRange, now: Date): boolean {
  return now.getTime() >= slot.endsAt.getTime() + 15 * 60_000 && toParisDateInput(now) === toParisDateInput(slot.endsAt);
}
