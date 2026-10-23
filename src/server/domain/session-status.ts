import type { SessionStatusValue } from "@/server/domain/capacity";

/** Status changes an administrator can trigger by hand. */
export function canPublish(status: SessionStatusValue): boolean {
  return status === "draft";
}

export function canUnpublish(status: SessionStatusValue): boolean {
  return status === "published" || status === "full";
}

/** Cancellation is possible at any time before the session is completed. */
export function canCancel(status: SessionStatusValue): boolean {
  return status !== "completed" && status !== "cancelled";
}

/** Enrollments can be added or changed while the session is neither cancelled nor completed. */
export function acceptsEnrollments(status: SessionStatusValue): boolean {
  return status !== "cancelled" && status !== "completed";
}

/** Only sessions without any enrollment can be physically deleted (rule 9). */
export function canDeleteSession(enrollmentCount: number): boolean {
  return enrollmentCount === 0;
}
