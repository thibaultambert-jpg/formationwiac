import { describe, expect, it } from "vitest";
import {
  buildDigestMessage,
  DIGEST_MAX_SESSIONS,
  digestWeekKey,
  type DigestSession,
  selectDigestSessions,
  weeklyDigestDue,
} from "@/server/domain/slack-digest";

describe("weekly Slack digest timing", () => {
  it("is due on Monday from noon, Paris time, in winter and summer", () => {
    // Winter (UTC+1): noon Paris = 11:00 UTC.
    expect(weeklyDigestDue(new Date("2026-11-02T10:59:00Z"))).toBe(false);
    expect(weeklyDigestDue(new Date("2026-11-02T11:00:00Z"))).toBe(true);
    // Summer (UTC+2): noon Paris = 10:00 UTC.
    expect(weeklyDigestDue(new Date("2026-06-01T09:59:00Z"))).toBe(false);
    expect(weeklyDigestDue(new Date("2026-06-01T10:00:00Z"))).toBe(true);
  });

  it("is not due on other days", () => {
    expect(weeklyDigestDue(new Date("2026-11-01T12:00:00Z"))).toBe(false); // Sunday
    expect(weeklyDigestDue(new Date("2026-11-03T12:00:00Z"))).toBe(false); // Tuesday
    // Monday 23:30 UTC is already Tuesday in Paris.
    expect(weeklyDigestDue(new Date("2026-11-02T23:30:00Z"))).toBe(false);
  });

  it("keys the digest by the Paris Monday", () => {
    expect(digestWeekKey(new Date("2026-11-02T11:00:00Z"))).toBe("2026-11-02");
  });
});

const now = new Date("2026-11-02T11:00:00Z");
const session = (overrides: Partial<DigestSession> = {}): DigestSession => ({
  id: "s1",
  status: "published",
  openToInternal: true,
  registrationDeadline: null,
  firstSlotStart: new Date("2026-11-20T08:00:00Z"),
  trainingTitle: "Excel avancé",
  trainingSlug: "excel-avance",
  modality: "remote",
  slotStarts: [new Date("2026-11-20T08:00:00Z"), new Date("2026-11-21T08:00:00Z")],
  capacityMax: 10,
  occupiedSeats: 7,
  ...overrides,
});

describe("weekly Slack digest selection", () => {
  it("keeps sessions open to collaborators with free seats, earliest first", () => {
    const later = session({ id: "later", firstSlotStart: new Date("2026-12-01T08:00:00Z") });
    const items = selectDigestSessions([later, session()], now);
    expect(items.map((item) => [item.id, item.remaining])).toEqual([
      ["s1", 3],
      ["later", 3],
    ]);
  });

  it("drops full, closed to internals, started and past-deadline sessions", () => {
    const sessions = [
      session({ id: "full", occupiedSeats: 10 }),
      session({ id: "status-full", status: "full" }),
      session({ id: "external", openToInternal: false }),
      session({ id: "draft", status: "draft" }),
      session({ id: "started", firstSlotStart: new Date("2026-11-02T08:00:00Z") }),
      session({ id: "deadline", registrationDeadline: new Date("2026-11-01T22:59:59Z") }),
    ];
    expect(selectDigestSessions(sessions, now).map((item) => item.id)).toEqual(["status-full"]);
  });
});

describe("weekly Slack digest message", () => {
  it("lists each session with dates, modality, seats, deadline and link", () => {
    const items = selectDigestSessions(
      [session({ trainingTitle: "R&D <IA>", registrationDeadline: new Date("2026-11-15T22:59:00Z") })],
      now,
    );
    const message = buildDigestMessage(items, "https://formation.example.fr/");
    expect(message.text).toContain("1 session");
    const body = JSON.stringify(message.blocks);
    expect(body).toContain("<https://formation.example.fr/formations/excel-avance|R&amp;D &lt;IA&gt;>");
    expect(body).toContain("20/11/2026 → 21/11/2026 · Distanciel · *3 places restantes*");
    expect(body).toContain("Inscription jusqu'au 15/11/2026");
    expect(body).toContain("<https://formation.example.fr/formations|");
  });

  it("stays within the Slack block limit", () => {
    const items = selectDigestSessions(
      Array.from({ length: DIGEST_MAX_SESSIONS + 5 }, (_, index) => session({ id: `s${index}` })),
      now,
    );
    const message = buildDigestMessage(items, "https://formation.example.fr");
    expect(message.blocks.length).toBeLessThanOrEqual(50);
    expect(JSON.stringify(message.blocks)).toContain("… et 5 autres.");
  });
});
