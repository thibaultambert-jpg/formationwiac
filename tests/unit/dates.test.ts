import { describe, expect, it } from "vitest";
import { formatDate, formatDateTime, formatTime } from "@/lib/dates";

describe("dates", () => {
  it("formats dates as JJ/MM/AAAA in Europe/Paris", () => {
    // 23:30 UTC on 31/12 is already 01/01 in Paris (UTC+1 in winter).
    expect(formatDate(new Date("2026-12-31T23:30:00Z"))).toBe("01/01/2027");
  });

  it("formats times in Europe/Paris, including daylight saving time", () => {
    expect(formatTime(new Date("2026-07-01T07:00:00Z"))).toBe("09:00");
    expect(formatTime(new Date("2026-01-15T08:00:00Z"))).toBe("09:00");
  });

  it("formats date and time together", () => {
    expect(formatDateTime(new Date("2026-03-10T13:45:00Z"))).toBe("10/03/2026 14:45");
  });
});

describe("Paris wall-clock conversions", () => {
  it("converts Paris date and time inputs to UTC, with DST", async () => {
    const { parisDateTimeToUtc, toParisDateInput, toParisTimeInput } = await import("@/lib/dates");
    expect(parisDateTimeToUtc("2026-07-01", "09:00")?.toISOString()).toBe("2026-07-01T07:00:00.000Z");
    expect(parisDateTimeToUtc("2026-01-15", "09:00")?.toISOString()).toBe("2026-01-15T08:00:00.000Z");
    expect(parisDateTimeToUtc("2026-02-31", "09:00")).toBeNull();
    expect(parisDateTimeToUtc("2026-01-15", "25:00")).toBeNull();
    const date = new Date("2026-12-31T23:30:00Z");
    expect(toParisDateInput(date)).toBe("2027-01-01");
    expect(toParisTimeInput(date)).toBe("00:30");
  });

  it("builds a Monday-first month grid", async () => {
    const { monthGridDays } = await import("@/lib/dates");
    const days = monthGridDays(2026, 11); // 1 November 2026 is a Sunday
    expect(days[0]).toEqual({ key: "2026-10-26", inMonth: false });
    expect(days[6]).toEqual({ key: "2026-11-01", inMonth: true });
    expect(days).toHaveLength(42);
  });
});
