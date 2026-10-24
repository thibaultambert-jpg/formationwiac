import { describe, expect, it } from "vitest";
import { absenceAlertDue, positioningDue } from "@/server/domain/automation";

const at = (iso: string) => new Date(iso);

describe("quality automation (D3, D6)", () => {
  it("sends the entry assessment from the morning N days before the session", () => {
    const start = at("2026-11-16T08:00:00Z"); // Monday 9:00 Paris
    expect(positioningDue(start, 7, at("2026-11-09T04:59:00Z"))).toBe(false);
    expect(positioningDue(start, 7, at("2026-11-09T05:00:00Z"))).toBe(true);
    expect(positioningDue(start, 7, at("2026-11-16T08:00:00Z"))).toBe(false);
  });

  it("alerts on unsigned slots 15 minutes after their end, the same day only", () => {
    const slot = { startsAt: at("2026-11-16T08:00:00Z"), endsAt: at("2026-11-16T11:30:00Z") };
    expect(absenceAlertDue(slot, at("2026-11-16T11:40:00Z"))).toBe(false);
    expect(absenceAlertDue(slot, at("2026-11-16T11:45:00Z"))).toBe(true);
    expect(absenceAlertDue(slot, at("2026-11-16T22:30:00Z"))).toBe(true); // 23:30 Paris
    expect(absenceAlertDue(slot, at("2026-11-17T07:00:00Z"))).toBe(false);
  });
});
