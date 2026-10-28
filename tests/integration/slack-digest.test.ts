import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { sendWeeklySlackDigest } from "@/server/services/slack-digest";

// A Monday unique to this run, so the weekly idempotency key is not taken yet.
const week = Math.floor(Math.random() * 2000);
const monday = new Date(Date.UTC(2040, 0, 2) + week * 7 * 86_400_000); // 2040-01-02 is a Monday
const noonParis = new Date(monday.getTime() + 11 * 3_600_000 + 5 * 60_000); // 12:05 (winter) or 13:05 (summer) in Paris
const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

afterAll(async () => {
  await db.$disconnect();
});

async function session(suffix: string, capacityMax: number, enrolled: number) {
  const key = `${stamp}-${suffix}`;
  const training = await db.training.create({
    data: {
      title: `Slack ${key}`,
      slug: `slack-${key}`,
      objectives: "Objectifs",
      durationHours: 7,
      modality: "remote",
    },
  });
  const startsAt = new Date(monday.getTime() + 3 * 86_400_000 + 8 * 3_600_000);
  const created = await db.trainingSession.create({
    data: {
      trainingId: training.id,
      reference: `SLACK-${key}`,
      status: "published",
      capacityMax,
      slots: { create: [{ startsAt, endsAt: new Date(startsAt.getTime() + 3 * 3_600_000) }] },
    },
  });
  for (let index = 0; index < enrolled; index++) {
    const participant = await db.participant.create({
      data: { type: "internal", firstName: "P", lastName: `${index}`, email: `p${index}-${key}@test.example` },
    });
    await db.enrollment.create({
      data: {
        sessionId: created.id,
        participantId: participant.id,
        participantType: "internal",
        source: "back_office",
        status: "confirmed",
      },
    });
  }
  return { training, session: created };
}

describe("weekly Slack digest", () => {
  it("posts the open sessions, full ones included, once a week", async () => {
    const open = await session("open", 3, 1);
    const full = await session("full", 1, 1);
    await db.trainingSession.update({ where: { id: full.session.id }, data: { status: "full" } });

    expect(await sendWeeklySlackDigest(new Date(monday.getTime() + 8 * 3_600_000))).toBe(0); // Monday morning
    expect(await sendWeeklySlackDigest(noonParis)).toBe(1);
    expect(await sendWeeklySlackDigest(new Date(noonParis.getTime() + 3_600_000))).toBe(0); // second cron

    const log = await db.auditLog.findFirstOrThrow({
      where: { action: "slack_digest", entityId: noonParis.toISOString().slice(0, 10) },
    });
    const ids = (log.after as { sessions: { id: string; remaining: number }[] }).sessions;
    expect(ids).toContainEqual({ id: open.session.id, remaining: 2 });
    expect(ids).toContainEqual({ id: full.session.id, remaining: 0 });

    const folder = path.join(process.cwd(), ".storage", "slack");
    const contents = await Promise.all(
      (await readdir(folder)).map((file) => readFile(path.join(folder, file), "utf8")),
    );
    expect(
      contents.some((body) => body.includes(`/formations/${open.training.slug}#session-${open.session.id}|`)),
    ).toBe(true);
  });
});
