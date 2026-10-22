import "server-only";
import { createSign } from "node:crypto";
import { base64Url } from "@/server/email/mime";

// Gmail API through a service account with domain-wide delegation
// (scope gmail.send only), impersonating the sender mailbox.

type ServiceAccountKey = { client_email: string; private_key: string; token_uri?: string };

const SCOPE = "https://www.googleapis.com/auth/gmail.send";
let cachedToken: { value: string; expiresAt: number; key: string } | null = null;

export function parseServiceAccountKey(json: string): ServiceAccountKey {
  const key = JSON.parse(json) as Partial<ServiceAccountKey>;
  if (!key.client_email || !key.private_key)
    throw new Error("GOOGLE_SERVICE_ACCOUNT_KEY is not a service account JSON key");
  return {
    client_email: key.client_email,
    private_key: key.private_key.replace(/\\n/g, "\n"),
    token_uri: key.token_uri,
  };
}

/** Signed JWT assertion for the OAuth 2.0 JWT bearer grant. */
export function buildAssertion(key: ServiceAccountKey, subject: string, now = Date.now()): string {
  const issuedAt = Math.floor(now / 1000);
  const header = base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = base64Url(
    JSON.stringify({
      iss: key.client_email,
      sub: subject,
      scope: SCOPE,
      aud: key.token_uri ?? "https://oauth2.googleapis.com/token",
      iat: issuedAt,
      exp: issuedAt + 3600,
    }),
  );
  const signer = createSign("RSA-SHA256");
  signer.update(`${header}.${claims}`);
  return `${header}.${claims}.${base64Url(signer.sign(key.private_key))}`;
}

async function accessToken(key: ServiceAccountKey, subject: string): Promise<string> {
  const cacheKey = `${key.client_email}:${subject}`;
  if (cachedToken && cachedToken.key === cacheKey && cachedToken.expiresAt > Date.now() + 60_000)
    return cachedToken.value;

  const response = await fetch(key.token_uri ?? "https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: buildAssertion(key, subject),
    }),
  });
  if (!response.ok) throw new Error(`Google token request failed: ${response.status} ${await response.text()}`);
  const data = (await response.json()) as { access_token: string; expires_in: number };
  cachedToken = { value: data.access_token, expiresAt: Date.now() + data.expires_in * 1000, key: cacheKey };
  return data.access_token;
}

/** Sends a raw MIME message and returns the Gmail message id. */
export async function sendWithGmail(keyJson: string, sender: string, rawMime: string): Promise<string> {
  const key = parseServiceAccountKey(keyJson);
  const token = await accessToken(key, sender);
  const response = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ raw: base64Url(rawMime) }),
  });
  if (!response.ok) throw new Error(`Gmail send failed: ${response.status} ${await response.text()}`);
  const data = (await response.json()) as { id: string };
  return data.id;
}
