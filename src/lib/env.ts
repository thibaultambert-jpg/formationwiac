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
  // Supabase Storage; when absent, files are stored on the local disk in development.
  SUPABASE_URL: z.url().optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1).optional(),
  SUPABASE_STORAGE_BUCKET: z.string().min(1).default("documents"),
  // Gmail API through a service account with domain-wide delegation; when
  // absent, emails go to the local outbox in development.
  GOOGLE_SERVICE_ACCOUNT_KEY: z.string().min(1).optional(),
  GMAIL_SENDER_ADDRESS: z.email().optional(),
  // Bearer token expected by /api/cron (Vercel Cron sends it automatically).
  CRON_SECRET: z.string().min(16).optional(),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

let cached: ServerEnv | undefined;

// Validated lazily so that `next build` does not require runtime secrets.
export function getEnv(): ServerEnv {
  if (!cached) {
    // Empty strings (e.g. copied from .env.example) are treated as unset.
    const source = Object.fromEntries(Object.entries(process.env).filter(([, value]) => value !== ""));
    const parsed = serverEnvSchema.safeParse(source);
    if (!parsed.success) {
      const fields = parsed.error.issues.map((issue) => issue.path.join(".")).join(", ");
      throw new Error(`Invalid or missing environment variables: ${fields}`);
    }
    cached = parsed.data;
  }
  return cached;
}
