# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Frontend
npm run dev        # Start Vite dev server (connects to local Supabase)
npm run build      # TypeScript check + production build
npm run lint       # Run ESLint

# Supabase local stack
supabase start     # Start local Docker-based Supabase
supabase stop      # Stop local stack
supabase db diff   # Generate a migration file from local schema changes
supabase db push   # Push migrations to the linked remote project
supabase test db   # Run pgTAP database tests against the local stack
```

## Architecture

**Stack:** React 18 + TypeScript + Vite, Tailwind CSS, Supabase (Auth, Database).

**App schema:** All application tables live in the `app` schema, not `public`. The Supabase client is initialized with `{ db: { schema: 'app' } }` in `src/lib/supabase.ts`. Every query automatically targets the `app` schema.

**Tables** (all in `app` schema, all RLS-enabled, all have `user_id` → `auth.users`):
- `cars` — a user's vehicles
- `refuelings` — fuel fill-up records tied to a car
- `services` — maintenance records tied to a car
- `expenses` — general expense records tied to a car

**Multi-environment strategy:**

| Environment | Supabase Project | Trigger |
|---|---|---|
| Development | Local Docker (`127.0.0.1:54321`) | `supabase start` + `.env.development` |
| Staging | `yiejtkppiwhzedyfeyuv` | Push to `feature/environments` (or `develop`) branch |
| Production | `cofmlyvqhxjkmyzbtrsy` | Merge to `main` |

GitHub Actions in `.github/workflows/` handle automated `supabase db push` to staging and production. Database pgTAP tests run on PRs and pushes to `main` via `supabase test db`.

**Frontend auth flow:** `App.tsx` subscribes to `supabase.auth.onAuthStateChange`. Unauthenticated users are shown `src/components/Login.tsx`; authenticated users see the main app shell.

## Critical Rules

- **NEVER modify the legacy schema** — only make changes within the `app` schema. This is the most important rule in this repository.
- **Always use the `supabase` skill** when interacting with Supabase products (database, auth, edge functions, storage).
- **SQL must follow the `supabase-postgres-best-practices` skill** — apply it for all DDL and query writing.
- Schema changes must go through migration files (`supabase/migrations/`), generated via `supabase db diff`. Never apply ad-hoc DDL to remote projects directly.
- RLS policies are required on all new tables. Tests for isolation go in `supabase/tests/database/`.

## Testing skills (keeping `.claude/skills` honest)

A skill is **prose + embedded facts**, not executable code, so "correctness" means facts don't silently go stale. Skills are kept honest three ways — prefer the cheapest layer that covers a given fact, and lean on **defensive prose** first (a skill should tell the agent to re-verify volatile values before acting rather than trusting hardcoded ones):

1. **Static lint (`npm run skill:lint`)** — runs under vitest on every PR (`scripts/skills/skill-lint.test.ts`). Scans all `.claude/skills/*/SKILL.md`: validates frontmatter, asserts every referenced repo path exists, checks relative links, and validates any `facts.yaml`. No credentials. This is where "test skills like source code" actually happens.
2. **Fact-audit (`.github/workflows/skill-audit.yml`, weekly)** — verifies live external contracts against a skill's `facts.yaml` sidecar and opens a `skill-drift` issue on divergence. Credential-gated + non-blocking.
3. **Evals (`.github/workflows/skill-eval.yml`, monthly / manual)** — non-deterministic behavior checks (trigger routing + generated output). A pass is a threshold, not a proof.

When a skill hardcodes volatile facts (project refs, schema columns, IDs), put them in a `facts.yaml` sidecar with a `last_verified` date so the audit can diff them — don't scatter them across prose.
