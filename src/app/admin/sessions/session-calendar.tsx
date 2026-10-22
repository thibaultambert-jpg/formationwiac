import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatMonth, formatTime, monthGridDays, toParisDateInput } from "@/lib/dates";
import { SESSION_STATUS_LABELS } from "@/lib/labels";
import { cn } from "@/lib/utils";
import type { SessionListItem } from "@/server/services/session-queries";

const STATUS_STYLES: Record<string, string> = {
  draft: "border-dashed bg-secondary text-secondary-foreground",
  published: "bg-sky-100 text-sky-950 border-sky-200",
  full: "bg-amber-100 text-amber-950 border-amber-200",
  completed: "bg-emerald-100 text-emerald-950 border-emerald-200",
  cancelled: "bg-muted text-muted-foreground line-through",
};

const WEEKDAYS = ["Lun.", "Mar.", "Mer.", "Jeu.", "Ven.", "Sam.", "Dim."];

export function SessionCalendar({
  year,
  month,
  sessions,
  hrefForMonth,
}: {
  year: number;
  month: number;
  sessions: SessionListItem[];
  hrefForMonth: (year: number, month: number) => string;
}) {
  const days = monthGridDays(year, month);
  const byDay = new Map<string, { session: SessionListItem; start: Date }[]>();
  for (const session of sessions) {
    const seen = new Set<string>();
    for (const slot of session.slots) {
      const key = toParisDateInput(slot.startsAt);
      if (seen.has(key)) continue;
      seen.add(key);
      byDay.set(key, [...(byDay.get(key) ?? []), { session, start: slot.startsAt }]);
    }
  }
  const prev = month === 1 ? [year - 1, 12] : [year, month - 1];
  const next = month === 12 ? [year + 1, 1] : [year, month + 1];
  const today = toParisDateInput(new Date());

  return (
    <section aria-labelledby="calendar-title" className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h2 id="calendar-title" className="text-lg font-semibold capitalize">
          {formatMonth(year, month)}
        </h2>
        <div className="flex gap-1">
          <Button asChild variant="outline" size="icon">
            <Link href={hrefForMonth(prev[0], prev[1])} aria-label="Mois précédent">
              <ChevronLeft aria-hidden="true" />
            </Link>
          </Button>
          <Button asChild variant="outline" size="icon">
            <Link href={hrefForMonth(next[0], next[1])} aria-label="Mois suivant">
              <ChevronRight aria-hidden="true" />
            </Link>
          </Button>
        </div>
      </div>
      <div className="overflow-x-auto">
        <div className="grid min-w-[48rem] grid-cols-7 overflow-hidden rounded-md border">
          {WEEKDAYS.map((day) => (
            <div key={day} className="bg-muted/50 border-b px-2 py-1 text-xs font-medium">
              {day}
            </div>
          ))}
          {days.map((day) => (
            <div
              key={day.key}
              className={cn(
                "min-h-24 border-r border-b p-1 [&:nth-child(7n)]:border-r-0",
                !day.inMonth && "bg-muted/30",
              )}
            >
              <p
                className={cn(
                  "mb-1 text-xs",
                  day.inMonth ? "" : "text-muted-foreground",
                  day.key === today && "text-primary font-bold",
                )}
              >
                {Number(day.key.slice(8))}
              </p>
              <ul className="space-y-1">
                {(byDay.get(day.key) ?? []).map(({ session, start }) => (
                  <li key={session.id}>
                    <Link
                      href={`/admin/sessions/${session.id}`}
                      className={cn(
                        "block truncate rounded border px-1 py-0.5 text-xs hover:underline",
                        STATUS_STYLES[session.status],
                      )}
                      title={`${session.training.title} — ${session.reference} (${SESSION_STATUS_LABELS[session.status]})`}
                    >
                      {formatTime(start)} {session.training.title}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
