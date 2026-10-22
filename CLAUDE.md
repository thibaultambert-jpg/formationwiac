# CLAUDE.md

Training management application (replaces Dendreo). The full specification is
`docs/cahier-des-charges.md`; read it before any work. Development is done lot
by lot (section 11) and stops at the end of each lot for validation.

@AGENTS.md

## Stack

- Next.js 16 (App Router, `src/`), TypeScript strict, React 19. Cache Components is **disabled** (all pages are per-user).
- Tailwind CSS 4 + shadcn/ui (`components.json`, components in `src/components/ui`). The shadcn registry may be
  unreachable from the sandbox: copy component sources by hand if `shadcn add` fails.
- PostgreSQL on Supabase (EU) through Prisma 7 (`prisma-client` generator, output `src/generated/prisma`, pg driver
  adapter). `DATABASE_URL` = pooled connection (runtime), `DIRECT_URL` = direct connection (migrations).
- Auth.js v5 (`next-auth@beta`) with Google only, JWT sessions of 30 days, no adapter: users are upserted in the
  `signIn` callback (`src/auth.ts`).
- Gmail API (emails, service account), Supabase Storage (files), Vercel (region `cdg1`). Planned: @react-pdf/renderer
  (PDF, lot 4).

## Conventions

- Code, identifiers and comments in **English**; every user-facing text in **French**. URLs are French
  (`/admin/formations`, `/mes-formations`).
- Dates displayed as JJ/MM/AAAA in Europe/Paris: always use `src/lib/dates.ts`.
- Database: models PascalCase, tables/columns snake_case via `@@map`/`@map`, UUIDv7 ids, `Timestamptz` dates.
  The training session model is `TrainingSession` (table `sessions`).
- **Row Level Security**: enabled on every table without policy (migration `*_enable_rls`). Any migration that creates
  a table must also run `ALTER TABLE ... ENABLE ROW LEVEL SECURITY`.
- **Authorization is always checked server-side**: `src/proxy.ts` is only an optimistic check. Every page, layout,
  server action and route handler calls `requireUser()` / `requireRole([...])` from `src/server/auth/guards.ts`,
  which reads the role from the database.
- Pure business rules live in `src/server/auth/policy.ts` and `src/server/domain/` and are unit tested. Database
  logic shared by several screens lives in `src/server/services/` (enrollments, sessions, companies).
- Enrollment changes always go through `src/server/services/enrollments.ts`: it locks the session row
  (`SELECT … FOR UPDATE`), counts seats, promotes the waitlist and switches published/full automatically.
- Forms: server actions with the signature `(state: ActionState, formData) => Promise<ActionState>` rendered with
  `ActionForm` and the field components of `src/components/forms/`. Submitted values are echoed back on error.
  Non-blocking warnings (trainer conflict, overlapping sessions, duplicate name) return `status: "warning"`; the form
  is submitted again with `confirm=1`.
- Files are stored through `src/server/storage.ts` (Supabase Storage, or `.storage/` in development) and always served
  by the authenticated route `/fichiers/[...path]`.
- Emails: `src/server/email/` (templates with `{{variables}}`, MIME, .ics, Gmail service account). Send through
  `sendEmail()` (traced in `documents`, never throws) and schedule notices with `after()` via
  `scheduleEnrollmentNotices()` once the transaction is committed. Without Gmail, emails go to the local outbox
  (`.storage/boite-envoi/`) in development.
- Front enrollment rules (visibility, deadline, unenrollment) are in `src/server/domain/front-enrollment.ts`; overlapping
  sessions are blocking on the front and only a warning in the BO.
- GDPR: `src/server/services/privacy.ts` (export, anonymization keeping proofs, retention period).
- Lists keep their filters in the URL (GET forms) so that CSV exports reuse them.
- No physical deletion of records with history: archive (`archivedAt`) or anonymize (`anonymizedAt`).
- Creations, updates and sends are written to `audit_logs`.
- Environment variables are read through `getEnv()` (`src/lib/env.ts`); every new variable goes in `.env.example`.
- Ask instead of assuming when the specification is ambiguous.

## Commands

| Task                    | Command                                                   |
| ----------------------- | --------------------------------------------------------- |
| Install                 | `pnpm install` (runs `prisma generate`)                   |
| Dev server              | `pnpm dev`                                                |
| Lint / format / types   | `pnpm lint`, `pnpm format`, `pnpm typecheck`              |
| Unit tests (Vitest)     | `pnpm test`                                               |
| Integration tests (DB)  | `pnpm test:integration` (needs `DATABASE_URL`)            |
| E2E tests (Playwright)  | `pnpm build && pnpm test:e2e` (env vars must be exported) |
| New migration (dev)     | `pnpm db:migrate --name <name>`                           |
| Apply migrations (prod) | `pnpm db:deploy`                                          |
| Seed (idempotent)       | `pnpm db:seed`                                            |
| Demo data               | `pnpm db:seed:demo`                                       |
| Prisma Studio           | `pnpm db:studio`                                          |

Local database: any PostgreSQL 16, e.g.
`DATABASE_URL=DIRECT_URL=postgresql://postgres:postgres@localhost:5432/formation_dev`.

E2E tests sign in with session cookies generated in `e2e/global-setup.ts` (no Google, no backdoor in the app) and
need a migrated database; they run the production build with `ALLOW_LOCAL_STORAGE=1` and `ALLOW_LOCAL_OUTBOX=1`.

Playwright is pinned to 1.56.1 to match the Chromium pre-installed in the Claude Code sandbox
(`/opt/pw-browsers`); do not run `playwright install` there.
