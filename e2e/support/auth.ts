import type { Browser, BrowserContext } from "@playwright/test";
import { encode } from "next-auth/jwt";
import { upsertUser } from "./db";

const COOKIE = "authjs.session-token";

/** Creates (or reuses) an account and returns a browser context signed in as it. */
export async function signedInContext(
  browser: Browser,
  user: { email: string; role: "admin" | "trainer" | "employee"; firstName: string; lastName: string },
): Promise<BrowserContext> {
  const userId = await upsertUser(user.email, user.role, user.firstName, user.lastName);
  const value = await encode({
    token: { email: user.email, sub: userId, userId, role: user.role, roleCheckedAt: Date.now() },
    secret: process.env.NEXTAUTH_SECRET!,
    salt: COOKIE,
  });
  const context = await browser.newContext({ locale: "fr-FR", timezoneId: "Europe/Paris" });
  await context.addCookies([{ name: COOKIE, value, domain: "localhost", path: "/", httpOnly: true, sameSite: "Lax" }]);
  return context;
}

export function domain(): string {
  return process.env.ALLOWED_GOOGLE_DOMAIN ?? "example.fr";
}
