export type TimeRange = { startsAt: Date; endsAt: Date };

/** Two ranges overlap when each one starts before the other ends. */
export function rangesOverlap(a: TimeRange, b: TimeRange): boolean {
  return a.startsAt < b.endsAt && b.startsAt < a.endsAt;
}

export function anyOverlap(a: readonly TimeRange[], b: readonly TimeRange[]): boolean {
  return a.some((left) => b.some((right) => rangesOverlap(left, right)));
}

export type SlotValidationError = { index: number; message: string };

/** Slots must be non-empty, end after they start and not overlap each other. */
export function validateSlots(slots: readonly TimeRange[]): SlotValidationError[] {
  if (slots.length === 0) return [{ index: -1, message: "Ajoutez au moins un créneau." }];

  const errors: SlotValidationError[] = [];
  slots.forEach((slot, index) => {
    if (slot.endsAt <= slot.startsAt) {
      errors.push({ index, message: "L'heure de fin doit être postérieure à l'heure de début." });
    }
  });
  if (errors.length > 0) return errors;

  slots.forEach((slot, index) => {
    for (let other = 0; other < index; other++) {
      if (rangesOverlap(slot, slots[other])) {
        errors.push({ index, message: `Ce créneau chevauche le créneau n° ${other + 1}.` });
      }
    }
  });
  return errors;
}

export function sortSlots<T extends TimeRange>(slots: readonly T[]): T[] {
  return [...slots].sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
}

/** Total duration in hours, rounded to the quarter hour. */
export function totalHours(slots: readonly TimeRange[]): number {
  const ms = slots.reduce((sum, slot) => sum + (slot.endsAt.getTime() - slot.startsAt.getTime()), 0);
  return Math.round((ms / 3_600_000) * 4) / 4;
}
