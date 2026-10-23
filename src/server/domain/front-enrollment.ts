// Front (collaborator) enrollment rules: section 7 and rules 3 to 6.

export type FrontSession = {
  status: "draft" | "published" | "full" | "completed" | "cancelled";
  openToInternal: boolean;
  registrationDeadline: Date | null;
  firstSlotStart: Date | null;
};

/** Sessions shown on the front: published or full, open to collaborators, not started yet. */
export function isVisibleOnFront(session: FrontSession, now: Date): boolean {
  return (
    (session.status === "published" || session.status === "full") &&
    session.openToInternal &&
    session.firstSlotStart !== null &&
    session.firstSlotStart > now
  );
}

/**
 * Enrollment and unenrollment are possible on the front until the deadline
 * (inclusive) or, without deadline, until the session starts (rule 5).
 */
export function frontChangesAllowed(
  session: Pick<FrontSession, "registrationDeadline" | "firstSlotStart">,
  now: Date,
): boolean {
  if (!session.firstSlotStart || session.firstSlotStart <= now) return false;
  return session.registrationDeadline ? now <= session.registrationDeadline : true;
}

export function canSelfEnroll(session: FrontSession, now: Date): boolean {
  return isVisibleOnFront(session, now) && frontChangesAllowed(session, now);
}

export function canSelfUnenroll(
  enrollmentStatus: string,
  session: Pick<FrontSession, "status" | "registrationDeadline" | "firstSlotStart">,
  now: Date,
): boolean {
  if (enrollmentStatus !== "confirmed" && enrollmentStatus !== "waitlisted") return false;
  if (session.status === "cancelled" || session.status === "completed") return false;
  return frontChangesAllowed(session, now);
}
