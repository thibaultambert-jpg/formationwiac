import { timingSafeEqual } from "node:crypto";
import { getEnv } from "@/lib/env";
import { runScheduledTasks } from "@/server/services/automation";

// Scheduled job (vercel.json "crons"). Vercel sends "Authorization: Bearer <CRON_SECRET>".
export const maxDuration = 300;

function authorized(header: string | null, secret: string): boolean {
  const expected = Buffer.from(`Bearer ${secret}`);
  const received = Buffer.from(header ?? "");
  return expected.length === received.length && timingSafeEqual(expected, received);
}

export async function GET(request: Request) {
  const secret = getEnv().CRON_SECRET;
  if (!secret) return Response.json({ error: "CRON_SECRET n'est pas configuré." }, { status: 503 });
  if (!authorized(request.headers.get("authorization"), secret))
    return Response.json({ error: "Non autorisé" }, { status: 401 });
  const report = await runScheduledTasks(new Date(), null);
  return Response.json(report, { status: report.errors.length ? 500 : 200 });
}
