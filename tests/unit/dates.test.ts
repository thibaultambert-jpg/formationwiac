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
