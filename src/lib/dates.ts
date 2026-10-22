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
