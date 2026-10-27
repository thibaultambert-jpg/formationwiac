import { describe, expect, it } from "vitest";
import {
  buildDigestMessage,
  digestWeekKey,
  formatDigestDays,
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
  slotStarts: [new Date("2026-11-20T08:00:00Z"), new Date("2026-11-21T08:00:00Z")],
  capacityMax: 10,
  occupiedSeats: 7,
  ...overrides,
});

describe("weekly Slack digest selection", () => {
  it("keeps sessions open to collaborators, full ones included, earliest first", () => {
    const later = session({ id: "later", firstSlotStart: new Date("2026-12-01T08:00:00Z") });
    const full = session({
      id: "full",
      status: "full",
      occupiedSeats: 10,
      firstSlotStart: new Date("2026-11-25T08:00:00Z"),
    });
    const items = selectDigestSessions([later, full, session()], now);
    expect(items.map((item) => [item.id, item.remaining])).toEqual([
      ["s1", 3],
      ["full", 0],
      ["later", 3],
    ]);
  });

  it("drops closed to internals, drafts, started and past-deadline sessions", () => {
    const sessions = [
      session({ id: "external", openToInternal: false }),
      session({ id: "draft", status: "draft" }),
      session({ id: "started", firstSlotStart: new Date("2026-11-02T08:00:00Z") }),
      session({ id: "deadline", registrationDeadline: new Date("2026-11-01T22:59:59Z") }),
    ];
    expect(selectDigestSessions(sessions, now)).toEqual([]);
  });
});

describe("weekly Slack digest message", () => {
  it("lists every Paris day of a session", () => {
    expect(
      formatDigestDays([
        new Date("2026-11-03T13:00:00Z"),
        new Date("2026-11-03T08:00:00Z"),
        new Date("2026-11-04T08:00:00Z"),
        new Date("2026-11-09T08:00:00Z"),
        new Date("2026-11-10T08:00:00Z"),
      ]),
    ).toBe("Mardi 03/11/2026, mercredi 04/11/2026, lundi 09/11/2026 et mardi 10/11/2026");
    expect(formatDigestDays([new Date("2026-11-03T08:00:00Z")])).toBe("Mardi 03/11/2026");
  });

  it("follows the announced format, with a link to each session", () => {
    const items = selectDigestSessions(
      [
        session({
          id: "pm2",
          trainingTitle: "WIVOO - Formation PM2",
          trainingSlug: "pm2",
          occupiedSeats: 7,
          capacityMax: 8,
        }),
        session({
          id: "builder",
          status: "full",
          trainingTitle: "WIVOO - Product <Builder>",
          trainingSlug: "builder",
          occupiedSeats: 10,
          firstSlotStart: new Date("2026-11-21T08:00:00Z"),
        }),
        session({
          id: "data",
          trainingTitle: "Data",
          trainingSlug: "data",
          occupiedSeats: 4,
          firstSlotStart: new Date("2026-11-22T08:00:00Z"),
        }),
      ],
      now,
    );
    const { text } = buildDigestMessage(items, "https://formation.example.fr/");
    expect(text.split("\n")).toEqual([
      "Hello <!here> :wave: Voici les formations ouvertes à l'inscription. Une session est confirmée dès 6 inscrits : inscrivez-vous et faites passer le mot !",
      "",
      "• *<https://formation.example.fr/formations/pm2#session-pm2|WIVOO - Formation PM2>* – Vendredi 20/11/2026 et samedi 21/11/2026",
      "\u2003\u20037 inscrit(s) – 1 place(s) disponible(s) – :white_check_mark: session confirmée",
      "• *<https://formation.example.fr/formations/builder#session-builder|WIVOO - Product &lt;Builder&gt;>* – Vendredi 20/11/2026 et samedi 21/11/2026",
      "\u2003\u200310 inscrit(s) – complet – :white_check_mark: session confirmée",
      "• *<https://formation.example.fr/formations/data#session-data|Data>* – Vendredi 20/11/2026 et samedi 21/11/2026",
      "\u2003\u20034 inscrit(s) – 6 place(s) disponible(s) – :hourglass_flowing_sand: encore 2 inscrit(s) pour confirmer",
    ]);
  });
});
