// Capacity, waitlist and automatic session status rules (section 9, rules 1, 2 and 7).

export type EnrollmentStatusValue = "confirmed" | "waitlisted" | "cancelled" | "present" | "absent";
export type SessionStatusValue = "draft" | "published" | "full" | "completed" | "cancelled";

/** Statuses that hold a seat in the session. */
export const SEAT_HOLDING_STATUSES: readonly EnrollmentStatusValue[] = ["confirmed", "present", "absent"];

export function holdsSeat(status: EnrollmentStatusValue): boolean {
  return SEAT_HOLDING_STATUSES.includes(status);
}

/** A new enrollment is confirmed while seats remain, otherwise waitlisted. */
export function statusForNewEnrollment(occupiedSeats: number, capacityMax: number): "confirmed" | "waitlisted" {
  return occupiedSeats < capacityMax ? "confirmed" : "waitlisted";
}

export function remainingSeats(occupiedSeats: number, capacityMax: number): number {
  return Math.max(0, capacityMax - occupiedSeats);
}

/** Waitlisted enrollments to promote, first come first served, to fill free seats. */
export function enrollmentsToPromote<T extends { enrolledAt: Date }>(
  waitlisted: readonly T[],
  occupiedSeats: number,
  capacityMax: number,
): T[] {
  const free = remainingSeats(occupiedSeats, capacityMax);
  if (free === 0) return [];
  return [...waitlisted].sort((a, b) => a.enrolledAt.getTime() - b.enrolledAt.getTime()).slice(0, free);
}

/**
 * Published sessions become full at capacity and go back to published when a
 * seat frees up. Other statuses are never changed automatically here.
 */
export function automaticSessionStatus(
  current: SessionStatusValue,
  occupiedSeats: number,
  capacityMax: number,
): SessionStatusValue {
  if (current === "published" && occupiedSeats >= capacityMax) return "full";
  if (current === "full" && occupiedSeats < capacityMax) return "published";
  return current;
}
