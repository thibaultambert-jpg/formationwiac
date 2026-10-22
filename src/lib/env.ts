import "server-only";
import { z } from "zod";

const serverEnvSchema = z.object({
  DATABASE_URL: z.string().min(1),
  GOOGLE_CLIENT_ID: z.string().min(1),
  GOOGLE_CLIENT_SECRET: z.string().min(1),
  ALLOWED_GOOGLE_DOMAIN: z
    .string()
    .min(1)
    .transform((value) => value.trim().toLowerCase()),
  INITIAL_ADMIN_EMAIL: z.email().transform((value) => value.trim().toLowerCase()),
  NEXTAUTH_SECRET: z.string().min(32),
  APP_URL: z.url(),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

let cached: ServerEnv | undefined;

// Validated lazily so that `next build` does not require runtime secrets.
export function getEnv(): ServerEnv {
  if (!cached) {
    const parsed = serverEnvSchema.safeParse(process.env);
    if (!parsed.success) {
      const fields = parsed.error.issues.map((issue) => issue.path.join(".")).join(", ");
      throw new Error(`Invalid or missing environment variables: ${fields}`);
    }
    cached = parsed.data;
  }
  return cached;
}
