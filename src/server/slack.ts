import "server-only";
import { getEnv } from "@/lib/env";
import type { SlackMessage } from "@/server/domain/slack-digest";
import { storeBuffer } from "@/server/storage";

// Slack incoming webhook (one channel, chosen when the webhook is created).
// Without a webhook, development writes the payloads to .storage/slack/
// instead, like the email outbox.

export type SlackMode = "webhook" | "local" | "none";

export function slackMode(): SlackMode {
  if (getEnv().SLACK_WEBHOOK_URL) return "webhook";
  if (process.env.NODE_ENV !== "production") return "local";
  return "none";
}

/** Posts the message; returns false when Slack is not configured (production without webhook). */
export async function postToSlack(message: SlackMessage): Promise<boolean> {
  const mode = slackMode();
  if (mode === "none") return false;
  if (mode === "local") {
    await storeBuffer("slack", "json", Buffer.from(JSON.stringify(message, null, 2), "utf8"), "application/json");
    return true;
  }
  const response = await fetch(getEnv().SLACK_WEBHOOK_URL!, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(message),
  });
  if (!response.ok) throw new Error(`Slack webhook failed: ${response.status} ${await response.text()}`);
  return true;
}
