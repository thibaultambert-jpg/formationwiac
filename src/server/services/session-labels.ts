import { formatSlot, formatWeekday } from "@/lib/dates";

export function slotLabels(slots: { startsAt: Date; endsAt: Date }[]): string[] {
  return slots.map((slot) => {
    const day = formatWeekday(slot.startsAt);
    return `${day.charAt(0).toUpperCase()}${day.slice(1)} ${formatSlot(slot.startsAt, slot.endsAt)}`;
  });
}

export function placeLabel(session: { location: string | null; videoLink: string | null }): string {
  if (session.location && session.videoLink) return `${session.location} ou à distance`;
  if (session.location) return session.location;
  return "À distance (lien visio communiqué après l'inscription)";
}
