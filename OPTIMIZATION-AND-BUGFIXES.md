# Optimization & Bug-Fix Backlog

> Strategy: **build first, optimize later.** Wire up every phase until the system
> fully works end-to-end, then come back here and fix these in order. Don't do
> these mid-build unless one actively breaks something.
>
> Found 2026-06-12 during the Phase 2 (SSR home) review. Recommended fix order:
> **1 → 3 → 9 → 7**, rest ride along.

## Perf / scale (target: 50k users)

1. **No caching on `GET /home`** — hottest endpoint; 3 DB queries + a fresh
   Postgres connection per anonymous page view. Fix: add
   `Cache-Control: public, max-age=60, stale-while-revalidate=300` on the route
   (response is identical for everyone) so Cloudflare absorbs the load.
   Single biggest win. (`backend/src/routes/home.ts`)

2. **`listTopAuthors` aggregates every published post per request**
   (`backend/src/db/queries/users.ts:32` — `count + sum(likes)` group-by over
   all posts). Fine at ~50 posts; full-table aggregate at scale. Caching (#1)
   hides it; materialize via the Phase 6 trending cron later.

3. **Missing composite index** — home query filters `status='published'` and
   sorts `published_at desc`, but only `posts_status_idx` exists (low
   selectivity). Fix: `index('posts_pub_idx').on(t.status, t.publishedAt)` in
   `schema.ts` + `db:generate` + `db:migrate`.

4. **`listCategories` is unbounded** (`backend/src/db/queries/categories.ts:17`)
   — categories are user-creatable, no `LIMIT`. Home needs 9. Fix: limit param
   (or slice in the route).

5. **`bodyChars` detoasts both bodies per row per request**
   (`backend/src/db/queries/posts.ts:116` — `char_length` on bodyEn+bodyJa).
   Cheap at limit 16; eventually store `readMins` at write time instead.

6. **Per-request pool open/close** — already the documented PROD TODO in
   CLAUDE.md: Hyperdrive in front of Neon, or Neon `-pooler` URL, before launch.

## Bugs

7. **API down ⇒ blank 502 home, no fetch timeout**
   (`frontend/src/pages/[locale]/index.astro:14-15`). A hung backend hangs SSR.
   Fix: `fetch(..., { signal: AbortSignal.timeout(5000) })` + a minimal
   friendly fallback page instead of bare 502.

8. **Picks excerpt always appends `…`** even when shorter than 120 chars
   (`frontend/src/pages/[locale]/index.astro:418`). Cosmetic.

## Security

9. **`cover` stored as any unvalidated string**
   (`backend/src/routes/posts.ts:181,222`) and SSR'd into `<img src>` for every
   visitor. No XSS (Astro escapes), but a malicious author can hot-link
   arbitrary third-party URLs from the homepage (tracking pixels / reader IP
   harvesting / mixed content). Fix: validate at write time — must start with
   our media/R2 origin (or strict `https://` allowlist).

10. ~~XSS on home~~ — audited 2026-06-12, none found: all interpolation
    Astro-escaped, style strings internal-only, carousel script reads nothing
    user-controlled. Listed so we don't re-audit.
