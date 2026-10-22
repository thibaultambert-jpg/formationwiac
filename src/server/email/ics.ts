// iCalendar (RFC 5545) file with one event per slot, for "Ajouter à l'agenda".

export type IcsEvent = {
  uid: string;
  startsAt: Date;
  endsAt: Date;
  summary: string;
  location?: string | null;
  description?: string | null;
  url?: string | null;
};

function formatUtc(date: Date): string {
  return date
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}/, "");
}

function escapeText(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/;/g, "\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

/** Folds lines longer than 75 octets, as required by the RFC. */
function fold(line: string): string {
  const bytes = Buffer.from(line, "utf8");
  if (bytes.length <= 75) return line;
  const parts: string[] = [];
  let current = "";
  for (const char of line) {
    const limit = parts.length === 0 ? 75 : 74;
    if (Buffer.byteLength(current + char, "utf8") > limit) {
      parts.push(current);
      current = char;
    } else {
      current += char;
    }
  }
  parts.push(current);
  return parts.join("\r\n ");
}

export function buildIcs(
  events: readonly IcsEvent[],
  options: { method?: "PUBLISH" | "CANCEL"; now?: Date } = {},
): string {
  const stamp = formatUtc(options.now ?? new Date());
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//formationwiac//Formations//FR",
    "CALSCALE:GREGORIAN",
    `METHOD:${options.method ?? "PUBLISH"}`,
  ];
  for (const event of events) {
    lines.push(
      "BEGIN:VEVENT",
      `UID:${event.uid}`,
      `DTSTAMP:${stamp}`,
      `DTSTART:${formatUtc(event.startsAt)}`,
      `DTEND:${formatUtc(event.endsAt)}`,
      `SUMMARY:${escapeText(event.summary)}`,
    );
    if (event.location) lines.push(`LOCATION:${escapeText(event.location)}`);
    if (event.description) lines.push(`DESCRIPTION:${escapeText(event.description)}`);
    if (event.url) lines.push(`URL:${event.url}`);
    if (options.method === "CANCEL") lines.push("STATUS:CANCELLED");
    lines.push("END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return `${lines.map(fold).join("\r\n")}\r\n`;
}
