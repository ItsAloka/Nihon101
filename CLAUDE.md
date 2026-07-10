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
- **Database: Neon Postgres** (Drizzle on `drizzle-orm/node-postgres`). **Both
  local dev and prod point at Neon** (ap-southeast-1 / Singapore, same region as
  Not Bagel; switched off Docker 2026-07-10). `DATABASE_URL` lives in
  `backend/.dev.vars` — use `?sslmode=require` and the `-pooler` host; do NOT
  include `channel_binding=require` (node-postgres rejects it). Because dev writes
  to the future prod DB, treat data as real; the `@test.local` seed authors get
  purged before launch. The connection is a per-request `pg.Pool` via
  `backend/src/db/client.ts` (`getDb(c)`), closed by a cleanup middleware in
  `src/index.ts`. Background work (waitUntil) uses `standaloneDb`.
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
- **Prod DB path (built 2026-07-09, from Not Bagel's launch lessons): TWO
  Hyperdrive configs** in front of the same Neon DB, bound as `HYPERDRIVE` (live,
  caching disabled) and `HYPERDRIVE_CACHED` (60s query cache). `getDb(c)` = live;
  `getDbCached(c)` = content-only reads (post bodies/listings, search, trending,
  categories, public profiles, logged-out feed) — the reading path merges live
  counts over the cached shell. **Caching law: per-user data is NEVER cached.**
  - **HARD RULE (hang bug):** on Workers, never reuse a pg pool/socket across
    requests over Hyperdrive — the socket dies between invocations and the next
    request hangs → intermittent 500s (bit Not Bagel in prod 2026-07-07).
    `db/client.ts` opens a fresh per-request pool over Hyperdrive's local socket;
    don't "optimize" that away. Local dev needs neither binding (getDbCached
    falls back to live; direct Neon over `DATABASE_URL`). Once the [[hyperdrive]]
    bindings are uncommented, `wrangler dev` needs
    `WRANGLER_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE` and `..._CACHED`
    **exported in the shell** before launch (wrangler ≥4.107 does not read them
    from `.dev.vars`; the values live there — see `.claude/launch.json` backend
    entry for the export one-liner).
  Set the prod `DATABASE_URL` as a Wrangler secret (`wrangler secret put
  DATABASE_URL`), never in `wrangler.toml`. Deploy runbook: `DEPLOYMENT_GUIDE.txt`.

## Architecture (two independent Cloudflare deploys)

- `backend/` — Cloudflare Worker: **Hono + Drizzle + Postgres + R2**. Dev on `:8787`
  (`wrangler dev`), prod `api.nihon101.com`. One route file per resource in
  `src/routes/`, mounted in `src/index.ts`. Query helpers in `src/db/queries/`,
  never inline Drizzle in routes.
- `frontend/` — Cloudflare **Worker** (decided 2026-07-09; was Pages): **Astro SSR +
  React 19 islands**. Dev on `:4321`, prod `nihon101.com` (+ www → apex 301 in
  `src/middleware.ts`, which is the ONLY owner of page headers/CSP — there is no
  `_headers` file). Deploys via `wrangler.deploy.jsonc` (see `DEPLOYMENT_GUIDE.txt`).
  Locales `ja` (default) + `en` as file routes under `src/pages/[locale]/`.
  **Islands only where interactivity is needed; everything else is pure SSR HTML**
  (required for SEO). SSR pages fetch the API only through `lib/ssr.ts`
  (`ssrFetch` = 5s timeout, `fwdIp` = visitor-IP forwarding for the rate limiter).

## Auth model (already built)

Access JWT (HS256, 15 min, frontend memory only) + opaque refresh token
(HttpOnly/Secure/SameSite=Strict cookie `n101_rt`, path `/auth`). Server stores
`sha256(token + REFRESH_PEPPER)`. Rotation on every `/auth/refresh`; reuse revokes
the whole family. Google OAuth via server-side flow + `google_links`. bcryptjs
cost 10. See `backend/src/routes/auth.ts` + `google.ts`.

## Hard rules

- **Native Windows + Git Bash for all dev/shell work — NO WSL, NO Docker** (same
  as Not Bagel; switched 2026-07-10). bun at `~/.bun/bin`, Node LTS at
  `C:\Program Files\nodejs`. Frontend dev runs under **node**, not bun (Astro 7
  won't run on bun's runtime).
- Never store access tokens in localStorage/sessionStorage.
- Never send the refresh token in JSON; never weaken SameSite from Strict.
- Translation is **stored, not runtime** — no client-side translate widgets.
  DeepL fills the other locale at edit time; author reviews; both locales are SSR'd.
- **Caching law:** per-user data is never cached anywhere; every cache must be
  purgeable or cron-rewritten — no blind TTLs on data users can change.
  `getDbCached` is content-only.
- **Autosave law:** the editor never saves more than 1 req/30s, only on real
  change, and NEVER fails silently (visible "not saved — retrying"). Write rate
  limits for editors are per-minute, never per-hour (a blown hourly cap once ate
  a Not Bagel post).
- Default response style: terse, no preamble.

## Common commands (run in Git Bash, native Windows)

```bash
# backend  (db:* scripts need DATABASE_URL exported; wrangler dev reads .dev.vars itself)
cd backend && bun install
export DATABASE_URL=$(sed -n 's/^DATABASE_URL=//p' .dev.vars | tr -d '"')
bun run db:generate               # regenerate migration after a schema.ts change
bun run db:migrate                # apply migrations to Neon
bun run dev                       # :8787
bunx tsc --noEmit                 # typecheck
bun run test                      # tests vs Neon (script sets --timeout 20000; bare `bun test` flakes on latency)

# frontend
cd frontend && bun install
bun run dev                       # :4321 (script invokes node, not bun)
bun run build                     # full typecheck + build
```

## Test accounts (seeded on Neon by `backend/scripts/seed-posts.ts`)

Password for all four: `nihon-test-2026`. ~50 bilingual published posts spread
across them + kageloom for testing feeds/rankings.

- `yuki.writes@test.local` (@yuki-shirakawa) — language/culture/philosophy
- `kenta.eats@test.local` (@kenta-hori) — food
- `mari.travels@test.local` (@mari-aoki) — travel
- `ren.frames@test.local` (@ren-takeda) — animation/history
- `kageloom@gmail.com` (@kage-loom) — main dev account (password NOT stored here;
  a real credential must never be committed — it lives outside the repo)

## Current state (2026-07-09)

Done: auth (register/login/refresh/logout/forgot/reset + login OTP 2FA + trusted
devices), Google OAuth, account **Settings**, full blog writing/reading + bilingual
auto-translate + engagement (likes/saves/comments/follows), For You feed, trending,
search (FTS + trigram + semantic), notifications, moderation (reports + auto-hide +
bans + audit log), Sunday Letter newsletter. **All reader surfaces run on the real
backend** (SSR pages + islands; the old mock data was removed 2026-06-14).
Frontend is on **Astro 7** (upgraded 2026-07-02, cleared all npm advisories).
Full pre-hosting audit passed 2026-07-02. **2026-07-09: every production lesson
from Not Bagel's launch (07-07 → 07-09) ported ahead of hosting** — Hyperdrive
two-config cache split, comment pagination, autosave rebuild, SSR timeouts +
IP forwarding, CSP blob:/insights + www 301, full SEO layer (OG/JSON-LD/sitemap/
robots/favicons), UTC dates, deploy kit (`DEPLOYMENT_GUIDE.txt`, maintenance
worker, `wrangler.deploy.jsonc`). Deferred items live in the security backlog
memory. Next steps: `development-plan.md`.
