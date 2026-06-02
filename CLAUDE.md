# Nihon101 — Project Guide (CLAUDE.md)

Bilingual (JA + EN) blog/magazine about Japan — culture, food, travel, language,
anime, history. Wholesome, slow-reading, ad-supported. Domain: **nihon101.com**.
Single author (the owner) writes; readers register, comment, react, follow, get
in-app notifications.

> Full technical reference lives in **`stack.txt`**. The ordered build roadmap lives
> in **`development-plan.md`**. Read both before large changes. This file is the
> short, always-loaded summary.

## Scale & database strategy (read this every time)

- **We are building for scale — target ~50,000 users.** Every decision (schema,
  indexes, query shape, caching, pagination) is made for a platform at that size,
  not a toy. Do not write code that only works for a handful of rows.
- **Database now: Cloudflare D1 (SQLite).** It is cheap and good enough until the
  site earns real ad revenue.
- **Database later: a managed Postgres provider.** When earnings justify it, we
  migrate off D1 to Postgres.
- **Because of that, the schema obeys a strict Portability Law so we can switch
  between the two database engines with zero rewrite.** Concretely:
  - IDs are `text`, format `<prefix>_<nanoid21>`. No `AUTOINCREMENT`, no integer PKs.
  - Timestamps are `bigint` ms (`integer` in SQLite). Never `DATETIME`.
  - Booleans stored as `integer` 0/1, exposed via Drizzle `mode: 'boolean'`.
  - No SQLite-only features: no FTS5, no `json_*()` SQL, no `WITHOUT ROWID`.
  - JSON columns stored as `text`, parsed in app code.
  - Migrations are hand-written **ANSI SQL** under `backend/migrations/NNNN_*.sql`.
  - Drizzle starts on `drizzle-orm/d1`; schema uses portable column types only.
  - R2 blob access only through `backend/src/lib/media.ts`.
- **Treat every DB change through this lens.** If a feature can only be done with a
  SQLite-only trick, find the portable way instead.

## Architecture (two independent Cloudflare deploys)

- `backend/` — Cloudflare Worker: **Hono + Drizzle + D1 + R2**. Dev on `:8787`
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
- Never use SQLite-only types/functions (see Portability Law above).
- Translation is **stored, not runtime** — no client-side translate widgets.
  DeepL fills the other locale at edit time; author reviews; both locales are SSR'd.
- Default response style: terse, no preamble.

## Common commands (run in WSL)

```bash
# backend
cd backend && bun install
bun run wrangler d1 execute nihon101 --local --file=./migrations/0001_init_auth.sql
bun run dev                       # :8787
bunx tsc --noEmit                 # typecheck

# frontend
cd frontend && bun install
bun run dev                       # :4321
bun run build                     # full typecheck + build
```

## Current state (2026-06-02)

Done: auth (register/login/refresh/logout/forgot/reset), Google OAuth, account
**Settings** (profile/password/google/delete), header auth control. Home is still
a **mock SPA** (`frontend/src/nihon/`) with mock `data.ts` — not yet wired to the
backend or SSR. Next steps are tracked in `development-plan.md`.
