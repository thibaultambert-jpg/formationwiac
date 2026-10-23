import { TZDate } from "@date-fns/tz";

export const APP_TIME_ZONE = "Europe/Paris";

const dateFormatter = new Intl.DateTimeFormat("fr-FR", {
  timeZone: APP_TIME_ZONE,
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

const timeFormatter = new Intl.DateTimeFormat("fr-FR", {
  timeZone: APP_TIME_ZONE,
  hour: "2-digit",
  minute: "2-digit",
});

const weekdayFormatter = new Intl.DateTimeFormat("fr-FR", { timeZone: APP_TIME_ZONE, weekday: "long" });
const monthFormatter = new Intl.DateTimeFormat("fr-FR", { timeZone: "UTC", month: "long", year: "numeric" });

/** Formats a date as JJ/MM/AAAA in the Europe/Paris time zone. */
export function formatDate(date: Date): string {
  return dateFormatter.format(date);
}

/** Formats a time as HH:MM in the Europe/Paris time zone. */
export function formatTime(date: Date): string {
  return timeFormatter.format(date);
}

/** Formats a date and time as JJ/MM/AAAA HH:MM in the Europe/Paris time zone. */
export function formatDateTime(date: Date): string {
  return `${formatDate(date)} ${formatTime(date)}`;
}

export function formatWeekday(date: Date): string {
  return weekdayFormatter.format(date);
}

/** "novembre 2026" for a given year and month (1-12). */
export function formatMonth(year: number, month: number): string {
  return monthFormatter.format(new Date(Date.UTC(year, month - 1, 1)));
}

/** Formats a time range of a single day: "JJ/MM/AAAA 09:00–12:30". */
export function formatSlot(startsAt: Date, endsAt: Date): string {
  return `${formatDate(startsAt)} ${formatTime(startsAt)}–${formatTime(endsAt)}`;
}

/** Summary of a list of slots: "JJ/MM/AAAA" or "JJ/MM/AAAA → JJ/MM/AAAA". */
export function formatDateRange(dates: Date[]): string {
  if (dates.length === 0) return "Dates à définir";
  const sorted = [...dates].sort((a, b) => a.getTime() - b.getTime());
  const first = formatDate(sorted[0]);
  const last = formatDate(sorted[sorted.length - 1]);
  return first === last ? first : `${first} → ${last}`;
}

const DATE_INPUT = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_INPUT = /^(\d{2}):(\d{2})$/;

/**
 * Converts a wall-clock date ("AAAA-MM-JJ") and time ("HH:MM") in Europe/Paris
 * into an absolute Date. Returns null for invalid input.
 */
export function parisDateTimeToUtc(date: string, time: string): Date | null {
  const d = DATE_INPUT.exec(date);
  const t = TIME_INPUT.exec(time);
  if (!d || !t) return null;
  const [year, month, day, hours, minutes] = [d[1], d[2], d[3], t[1], t[2]].map(Number);
  if (month < 1 || month > 12 || day < 1 || day > 31 || hours > 23 || minutes > 59) return null;
  const result = new TZDate(year, month - 1, day, hours, minutes, 0, APP_TIME_ZONE);
  // Reject overflowing dates such as 31/02.
  if (result.getMonth() !== month - 1 || result.getDate() !== day) return null;
  return new Date(result.getTime());
}

/** End of the given Paris day (23:59:59.999), used for deadlines. */
export function parisEndOfDay(date: string): Date | null {
  const start = parisDateTimeToUtc(date, "23:59");
  return start ? new Date(start.getTime() + 59_999) : null;
}

/** "AAAA-MM-JJ" of the date in Europe/Paris, for <input type="date"> and day keys. */
export function toParisDateInput(date: Date): string {
  const tz = new TZDate(date, APP_TIME_ZONE);
  return `${tz.getFullYear()}-${pad(tz.getMonth() + 1)}-${pad(tz.getDate())}`;
}

/** "HH:MM" of the date in Europe/Paris, for <input type="time">. */
export function toParisTimeInput(date: Date): string {
  const tz = new TZDate(date, APP_TIME_ZONE);
  return `${pad(tz.getHours())}:${pad(tz.getMinutes())}`;
}

/** Year of the date in Europe/Paris. */
export function parisYear(date: Date): number {
  return new TZDate(date, APP_TIME_ZONE).getFullYear();
}

/** Absolute bounds [start, end) of a Paris calendar month (month 1-12). */
export function parisMonthBounds(year: number, month: number): { start: Date; end: Date } {
  const start = new TZDate(year, month - 1, 1, 0, 0, 0, APP_TIME_ZONE);
  const end = new TZDate(year, month, 1, 0, 0, 0, APP_TIME_ZONE);
  return { start: new Date(start.getTime()), end: new Date(end.getTime()) };
}

/**
 * Day keys ("AAAA-MM-JJ") of a month calendar grid starting on Monday,
 * padded with the days of the surrounding months to complete the weeks.
 */
export function monthGridDays(year: number, month: number): { key: string; inMonth: boolean }[] {
  const first = new Date(Date.UTC(year, month - 1, 1));
  const offset = (first.getUTCDay() + 6) % 7; // Monday = 0
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const total = Math.ceil((offset + daysInMonth) / 7) * 7;
  return Array.from({ length: total }, (_, index) => {
    const day = new Date(Date.UTC(year, month - 1, 1 - offset + index));
    return {
      key: `${day.getUTCFullYear()}-${pad(day.getUTCMonth() + 1)}-${pad(day.getUTCDate())}`,
      inMonth: day.getUTCMonth() === month - 1,
    };
  });
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}
