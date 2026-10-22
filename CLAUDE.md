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
- Planned: Gmail API (emails), @react-pdf/renderer (PDF), Supabase Storage (files), Vercel (region `cdg1`).

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
- Pure business rules live in `src/server/auth/policy.ts` and `src/server/domain/` and are unit tested.
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
| E2E tests (Playwright)  | `pnpm build && pnpm test:e2e` (env vars must be exported) |
| New migration (dev)     | `pnpm db:migrate --name <name>`                           |
| Apply migrations (prod) | `pnpm db:deploy`                                          |
| Seed (idempotent)       | `pnpm db:seed`                                            |
| Prisma Studio           | `pnpm db:studio`                                          |

Local database: any PostgreSQL 16, e.g.
`DATABASE_URL=DIRECT_URL=postgresql://postgres:postgres@localhost:5432/formation_dev`.

Playwright is pinned to 1.56.1 to match the Chromium pre-installed in the Claude Code sandbox
(`/opt/pw-browsers`); do not run `playwright install` there.
