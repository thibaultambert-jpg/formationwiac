import { describe, expect, it } from "vitest";
import {
  canSelfEnroll,
  canSelfUnenroll,
  frontChangesAllowed,
  isVisibleOnFront,
} from "@/server/domain/front-enrollment";

const now = new Date("2026-10-22T10:00:00Z");
const future = new Date("2026-11-10T08:00:00Z");
const base = { status: "published" as const, openToInternal: true, registrationDeadline: null, firstSlotStart: future };

describe("front visibility (rule 6)", () => {
  it("shows published and full sessions open to collaborators that have not started", () => {
    expect(isVisibleOnFront(base, now)).toBe(true);
    expect(isVisibleOnFront({ ...base, status: "full" }, now)).toBe(true);
  });

  it("hides drafts, cancelled, closed to internals and started sessions", () => {
    expect(isVisibleOnFront({ ...base, status: "draft" }, now)).toBe(false);
    expect(isVisibleOnFront({ ...base, status: "cancelled" }, now)).toBe(false);
    expect(isVisibleOnFront({ ...base, openToInternal: false }, now)).toBe(false);
    expect(isVisibleOnFront({ ...base, firstSlotStart: new Date("2026-10-22T09:00:00Z") }, now)).toBe(false);
  });
});

describe("deadline (rule 5)", () => {
  it("allows changes until the deadline, inclusive", () => {
    expect(
      frontChangesAllowed({ registrationDeadline: new Date("2026-10-22T10:00:00Z"), firstSlotStart: future }, now),
    ).toBe(true);
    expect(
      frontChangesAllowed({ registrationDeadline: new Date("2026-10-22T09:59:59Z"), firstSlotStart: future }, now),
    ).toBe(false);
  });

  it("without deadline, allows changes until the session starts", () => {
    expect(frontChangesAllowed({ registrationDeadline: null, firstSlotStart: future }, now)).toBe(true);
    expect(frontChangesAllowed({ registrationDeadline: null, firstSlotStart: now }, now)).toBe(false);
  });

  it("combines visibility and deadline for self enrollment", () => {
    expect(canSelfEnroll(base, now)).toBe(true);
    expect(canSelfEnroll({ ...base, registrationDeadline: new Date("2026-10-01T00:00:00Z") }, now)).toBe(false);
  });
});

describe("self unenrollment", () => {
  it("is possible for confirmed or waitlisted enrollments before the deadline", () => {
    expect(canSelfUnenroll("confirmed", base, now)).toBe(true);
    expect(canSelfUnenroll("waitlisted", base, now)).toBe(true);
    expect(canSelfUnenroll("cancelled", base, now)).toBe(false);
    expect(canSelfUnenroll("confirmed", { ...base, status: "cancelled" }, now)).toBe(false);
    expect(canSelfUnenroll("confirmed", { ...base, registrationDeadline: new Date("2026-10-01T00:00:00Z") }, now)).toBe(
      false,
    );
  });
});
