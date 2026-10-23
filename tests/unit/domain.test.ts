import { describe, expect, it } from "vitest";
import {
  automaticSessionStatus,
  enrollmentsToPromote,
  holdsSeat,
  statusForNewEnrollment,
} from "@/server/domain/capacity";
import { formatSessionReference, nextReferenceSequence } from "@/server/domain/reference";
import { canCancel, canDeleteSession, canPublish } from "@/server/domain/session-status";
import { isValidSiret, normalizeSiret } from "@/server/domain/siret";
import { slugify, uniqueSlug } from "@/server/domain/slug";
import { anyOverlap, rangesOverlap, totalHours, validateSlots } from "@/server/domain/slots";
import { roleForTrainerLink } from "@/server/domain/trainer-role";

const at = (iso: string) => new Date(iso);
const range = (start: string, end: string) => ({ startsAt: at(start), endsAt: at(end) });

describe("session reference", () => {
  it("formats FORM-AAAA-NNN", () => {
    expect(formatSessionReference(2026, 14)).toBe("FORM-2026-014");
    expect(formatSessionReference(2026, 1234)).toBe("FORM-2026-1234");
  });

  it("starts at 1 and increments the highest sequence", () => {
    expect(nextReferenceSequence(null)).toBe(1);
    expect(nextReferenceSequence(13)).toBe(14);
  });
});

describe("slots", () => {
  it("detects overlapping ranges but not adjacent ones", () => {
    expect(
      rangesOverlap(range("2026-11-02T08:00Z", "2026-11-02T11:00Z"), range("2026-11-02T10:00Z", "2026-11-02T12:00Z")),
    ).toBe(true);
    expect(
      rangesOverlap(range("2026-11-02T08:00Z", "2026-11-02T11:00Z"), range("2026-11-02T11:00Z", "2026-11-02T12:00Z")),
    ).toBe(false);
  });

  it("detects an overlap between two sessions", () => {
    const a = [range("2026-11-02T08:00Z", "2026-11-02T11:00Z"), range("2026-11-03T08:00Z", "2026-11-03T11:00Z")];
    expect(anyOverlap(a, [range("2026-11-03T10:00Z", "2026-11-03T15:00Z")])).toBe(true);
    expect(anyOverlap(a, [range("2026-11-04T08:00Z", "2026-11-04T11:00Z")])).toBe(false);
  });

  it("requires at least one slot, ending after it starts, without self-overlap", () => {
    expect(validateSlots([])).toHaveLength(1);
    expect(validateSlots([range("2026-11-02T11:00Z", "2026-11-02T08:00Z")])[0].index).toBe(0);
    const errors = validateSlots([
      range("2026-11-02T08:00Z", "2026-11-02T11:00Z"),
      range("2026-11-02T10:00Z", "2026-11-02T12:00Z"),
    ]);
    expect(errors).toEqual([{ index: 1, message: "Ce créneau chevauche le créneau n° 1." }]);
    expect(validateSlots([range("2026-11-02T08:00Z", "2026-11-02T11:00Z")])).toEqual([]);
  });

  it("sums durations", () => {
    expect(
      totalHours([range("2026-11-02T08:00Z", "2026-11-02T11:30Z"), range("2026-11-02T12:30Z", "2026-11-02T16:00Z")]),
    ).toBe(7);
  });
});

describe("capacity rules", () => {
  it("confirms while seats remain, then waitlists", () => {
    expect(statusForNewEnrollment(0, 3)).toBe("confirmed");
    expect(statusForNewEnrollment(2, 3)).toBe("confirmed");
    expect(statusForNewEnrollment(3, 3)).toBe("waitlisted");
    expect(statusForNewEnrollment(5, 3)).toBe("waitlisted");
  });

  it("counts confirmed, present and absent enrollments as seats", () => {
    expect(holdsSeat("confirmed")).toBe(true);
    expect(holdsSeat("present")).toBe(true);
    expect(holdsSeat("waitlisted")).toBe(false);
    expect(holdsSeat("cancelled")).toBe(false);
  });

  it("promotes the earliest waitlisted enrollments to fill free seats", () => {
    const waitlist = [
      { id: "b", enrolledAt: at("2026-10-02T10:00Z") },
      { id: "a", enrolledAt: at("2026-10-01T10:00Z") },
      { id: "c", enrolledAt: at("2026-10-03T10:00Z") },
    ];
    expect(enrollmentsToPromote(waitlist, 2, 3).map((e) => e.id)).toEqual(["a"]);
    expect(enrollmentsToPromote(waitlist, 1, 3).map((e) => e.id)).toEqual(["a", "b"]);
    expect(enrollmentsToPromote(waitlist, 3, 3)).toEqual([]);
  });

  it("switches published and full automatically", () => {
    expect(automaticSessionStatus("published", 3, 3)).toBe("full");
    expect(automaticSessionStatus("full", 2, 3)).toBe("published");
    expect(automaticSessionStatus("draft", 3, 3)).toBe("draft");
    expect(automaticSessionStatus("cancelled", 0, 3)).toBe("cancelled");
  });
});

describe("session status", () => {
  it("allows publishing drafts and cancelling before completion", () => {
    expect(canPublish("draft")).toBe(true);
    expect(canPublish("published")).toBe(false);
    expect(canCancel("full")).toBe(true);
    expect(canCancel("completed")).toBe(false);
    expect(canCancel("cancelled")).toBe(false);
  });

  it("forbids deleting a session with enrollments", () => {
    expect(canDeleteSession(0)).toBe(true);
    expect(canDeleteSession(1)).toBe(false);
  });
});

describe("SIRET", () => {
  it("validates the Luhn checksum", () => {
    expect(isValidSiret("732 829 320 00074")).toBe(true);
    expect(isValidSiret("73282932000075")).toBe(false);
    expect(isValidSiret("1234")).toBe(false);
  });

  it("handles La Poste establishments", () => {
    expect(isValidSiret("35600000049837")).toBe(true);
  });

  it("normalizes separators", () => {
    expect(normalizeSiret("732.829.320-00074")).toBe("73282932000074");
  });
});

describe("slug", () => {
  it("removes accents and punctuation", () => {
    expect(slugify("Prise de parole en public : l'essentiel !")).toBe("prise-de-parole-en-public-lessentiel");
    expect(slugify("Éco-conduite & sécurité")).toBe("eco-conduite-securite");
  });

  it("suffixes taken slugs", () => {
    expect(uniqueSlug("excel", new Set())).toBe("excel");
    expect(uniqueSlug("excel", new Set(["excel", "excel-2"]))).toBe("excel-3");
  });
});

describe("trainer role", () => {
  it("promotes collaborators linked to an internal trainer record", () => {
    expect(roleForTrainerLink("employee", true)).toBe("trainer");
    expect(roleForTrainerLink("trainer", false)).toBe("employee");
  });

  it("never changes administrators", () => {
    expect(roleForTrainerLink("admin", true)).toBe("admin");
    expect(roleForTrainerLink("admin", false)).toBe("admin");
  });
});

describe("French decimals", async () => {
  const { parseFrenchDecimal, formatEuros } = await import("@/server/domain/numbers");

  it("parses spaces and decimal commas", () => {
    expect(parseFrenchDecimal("1 200,50")).toBe(1200.5);
    expect(parseFrenchDecimal("7.5")).toBe(7.5);
    expect(parseFrenchDecimal("")).toBeNull();
    expect(parseFrenchDecimal("abc")).toBeNaN();
  });

  it("formats euros", () => {
    expect(formatEuros(1200.5).replace(/\s/g, " ")).toBe("1 200,50 €");
    expect(formatEuros(null)).toBe("—");
  });
});

describe("GDPR retention", async () => {
  const { anonymizedEmail, isRetentionExpired, retentionCutoff } = await import("@/server/domain/privacy");
  const now = new Date("2026-10-22T10:00:00Z");

  it("computes the cutoff N years back", () => {
    expect(retentionCutoff(now, 5).toISOString()).toBe("2021-10-22T10:00:00.000Z");
  });

  it("expires activity older than the retention period only", () => {
    expect(isRetentionExpired(new Date("2021-10-21T00:00:00Z"), now, 5)).toBe(true);
    expect(isRetentionExpired(new Date("2021-10-23T00:00:00Z"), now, 5)).toBe(false);
  });

  it("builds a non-deliverable unique email", () => {
    expect(anonymizedEmail("abc")).toBe("anonyme+abc@anonymise.invalid");
  });
});
