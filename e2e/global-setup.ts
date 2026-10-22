import { mkdir, writeFile } from "node:fs/promises";
import { encode } from "next-auth/jwt";
import { upsertUser } from "./support/db";

// Creates the test accounts and signed session cookies (same format as
// Auth.js), so that tests run without going through Google.
const COOKIE = "authjs.session-token";

async function storageState(email: string, role: "admin" | "employee", userId: string) {
  const value = await encode({
    token: { email, sub: userId, userId, role, roleCheckedAt: Date.now() },
    secret: process.env.NEXTAUTH_SECRET!,
    salt: COOKIE,
  });
  return {
    cookies: [
      {
        name: COOKIE,
        value,
        domain: "localhost",
        path: "/",
        expires: -1,
        httpOnly: true,
        secure: false,
        sameSite: "Lax" as const,
      },
    ],
    origins: [],
  };
}

export default async function globalSetup() {
  if (!process.env.DATABASE_URL || !process.env.NEXTAUTH_SECRET) {
    throw new Error("DATABASE_URL and NEXTAUTH_SECRET must be set to run the e2e tests.");
  }
  const domain = process.env.ALLOWED_GOOGLE_DOMAIN ?? "example.fr";
  const adminEmail = `e2e-admin@${domain}`;
  const employeeEmail = `e2e-collaborateur@${domain}`;
  const adminId = await upsertUser(adminEmail, "admin", "Alice", "Admin");
  const employeeId = await upsertUser(employeeEmail, "employee", "Claude", "Collaborateur");

  await mkdir("e2e/.auth", { recursive: true });
  await writeFile("e2e/.auth/admin.json", JSON.stringify(await storageState(adminEmail, "admin", adminId)));
  await writeFile("e2e/.auth/employee.json", JSON.stringify(await storageState(employeeEmail, "employee", employeeId)));
}
