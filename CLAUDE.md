# Nihon101 — Project Guide (CLAUDE.md)

Bilingual (JA + EN) blog/magazine about Japan — culture, food, travel, language,
anime, history. Wholesome, slow-reading, ad-supported. Domain: **nihon101.com**.
**Multi-author platform:** any registered user writes blog posts and publishes them
to the public; readers register, comment, react, follow, report, and get in-app
notifications. Admins moderate (ban/hide/remove). Posts can trend.

> **This website is the pinnacle of website that I can build.** It is the mission —
> the owner's masterpiece. Build to that bar: nothing sloppy, nothing throwaway.

> Full technical reference lives in **`stack.txt`**. The ordered build roadmap lives
> in **`development-plan.md`**. Read both before large changes. This file is the
> short, always-loaded summary.

## Scale & database strategy (read this every time)

- **We are building for scale — target ~50,000 users.** Every decision (schema,
  indexes, query shape, caching, pagination) is made for a platform at that size,
  not a toy. Do not write code that only works for a handful of rows.
- **Database: Postgres** (Drizzle on `drizzle-orm/node-postgres`). Local dev runs
  Postgres in **Docker** (`docker-compose.yml`, port 5432); prod will run on
  **Neon** — switching is just the `DATABASE_URL`. The connection is a per-request
  `pg.Pool` via `backend/src/db/client.ts` (`getDb(c)`), closed by a cleanup
  middleware in `src/index.ts`. Background work (waitUntil) uses `standaloneDb`.
  - We moved off D1/SQLite entirely on 2026-06-09 — **no Portability Law anymore.**
    Use native Postgres types freely. (Old D1 migrations are gone.)
  - IDs are `text`, format `<prefix>_<nanoid21>` (good design, kept — not for portability).
  - Timestamps are epoch-ms in `bigint` columns (`Date.now()` everywhere; the API
    speaks ms numbers so the frontend is unchanged).
  - Booleans are real `boolean`; JSON columns are `jsonb` (e.g. `posts.tags`).
  - Schema is the source of truth in `src/db/schema.ts`; migrations are generated
    by **drizzle-kit** into `backend/drizzle/` (`bun run db:generate` →
    `db:migrate`). Do not hand-write SQL.
  - R2 blob access only through `backend/src/routes/media.ts`.
- **Still building for scale (~50k users):** indexes are declared in the schema
  (unique email/slug, the `(post_id,user_id)` like constraint, etc.). Keep that up.
- **Foreign keys are mandatory — this is a production platform, not a hobby.**
  Every column that points at another table's id MUST have a real FK
  (`.references(() => parent.col, { onDelete })`) with a deliberate on-delete
  rule. Never ship a relation as a bare `text` id. Existing FKs live in
  `schema.ts` (13 of them, e.g. user→cascade, category→restrict, self-ref
  comments→cascade). When you add a table or a relation, add its FK in the same
  change and regenerate the migration.
- **PROD TODO before public launch — connection pooling.** The current Worker
  opens + closes a Postgres connection **per request**. That's fine for Docker dev
  but will exhaust connections and add latency at scale. Before going live on Neon,
  do **one** of:
  - **Cloudflare Hyperdrive** in front of Neon (recommended — pooling + edge
    caching, the Worker connects to Hyperdrive instead of Neon directly), or
  - **Neon's pooled connection string** (PgBouncer; use the `-pooler` host in
    `DATABASE_URL`), and stop closing the pool per request.
  Set the prod `DATABASE_URL` as a Wrangler secret (`wrangler secret put
  DATABASE_URL`), never in `wrangler.toml`.

## Architecture (two independent Cloudflare deploys)

- `backend/` — Cloudflare Worker: **Hono + Drizzle + Postgres + R2**. Dev on `:8787`
  (`wrangler dev`), prod `api.nihon101.com`. One route file per resource in
  `src/routes/`, mounted in `src/index.ts`. Query helpers in `src/db/queries/`,
  never inline Drizzle in routes.
- `frontend/` — Cloudflare Pages: **Astro SSR + React 19 islands**. Dev on `:4321`,
  prod `nihon101.com`. Locales `ja` (default) + `en` as file routes under
  `src/pages/[locale]/`. **Islands only where interactivity is needed; everything
  else is pure SSR HTML** (required for SEO).

## Auth model (already built)

Access JWT (HS256, 15 min, frontend memory only) + opaque refresh token
(HttpOnly/Secure/SameSite=Strict cookie `n101_rt`, path `/auth`). Server stores
`sha256(token + REFRESH_PEPPER)`. Rotation on every `/auth/refresh`; reuse revokes
the whole family. Google OAuth via server-side flow + `google_links`. bcryptjs
cost 10. See `backend/src/routes/auth.ts` + `google.ts`.

## Hard rules

- WSL/bash for installs and `wrangler` (no Node on Windows PATH; bun lives in WSL).
- Never store access tokens in localStorage/sessionStorage.
- Never send the refresh token in JSON; never weaken SameSite from Strict.
- Docker must be running for backend dev (`docker compose up -d`).
- Translation is **stored, not runtime** — no client-side translate widgets.
  DeepL fills the other locale at edit time; author reviews; both locales are SSR'd.
- Default response style: terse, no preamble.

## Common commands (run in WSL)

```bash
# backend
docker compose up -d              # local Postgres on :5432 (run from repo root)
cd backend && bun install
bun run db:generate               # regenerate migration after a schema.ts change
bun run db:migrate                # apply migrations to Postgres
bun run dev                       # :8787
bunx tsc --noEmit                 # typecheck

# frontend
cd frontend && bun install
bun run dev                       # :4321
bun run build                     # full typecheck + build
```

## Local test accounts (dev DB only, seeded by `backend/scripts/seed-posts.ts`)

Password for all four: `nihon-test-2026`. ~50 bilingual published posts spread
across them + kageloom for testing feeds/rankings.

- `yuki.writes@test.local` (@yuki-shirakawa) — language/culture/philosophy
- `kenta.eats@test.local` (@kenta-hori) — food
- `mari.travels@test.local` (@mari-aoki) — travel
- `ren.frames@test.local` (@ren-takeda) — animation/history
- `kageloom@gmail.com` (@kage-loom) — main dev account, pw `snaloka20040310sn`

## Current state (2026-06-09)

Done: auth (register/login/refresh/logout/forgot/reset), Google OAuth, account
**Settings** (profile/password/google/delete), header auth control, full blog
writing/reading + bilingual auto-translate + engagement (likes/comments).
**Backend fully migrated D1/SQLite → Postgres** (Docker local, Neon later); all
accounts + posts copied over and verified live on `:8787`. Home is still a **mock
SPA** (`frontend/src/nihon/`) with mock `data.ts` — not yet wired to the backend or
SSR. Next steps are tracked in `development-plan.md`.
