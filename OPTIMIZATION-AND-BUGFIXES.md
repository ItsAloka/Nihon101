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

## Perf / scale — added 2026-06-14 (Phase 4 social graph)

11. **Synchronous follower fan-out on publish** (`backend/src/routes/posts.ts`,
    `notifyFollowersOfPost`). Publishing a post inserts one notification row per
    follower inside the request. At 50k users a popular author (tens of
    thousands of followers) = one giant INSERT blocking the publish response.
    Fix: move the fan-out to `waitUntil` + `standaloneDb` (background, like
    translation already does), and batch the insert.

12. **For You feed recomputed per request, no cache** (`backend/src/routes/feed.ts`).
    Two candidate queries + affinity (cached 1h) + ranking on every `/feed` hit.
    Fine now; at scale add short-TTL caching for the logged-out (trending+fresh)
    variant — it's identical for every anonymous viewer.

13. **`recordRead` writes on every article open** (`backend/src/routes/feed.ts`).
    One upsert per read — fine, but high-write. If it gets hot, debounce client-
    side or batch. Indexed by `(post_id,user_id)` unique so no row blow-up.

## Pre-launch gaps — added 2026-06-16 (security + rate-limit audit)

> Audited after shipping the rate-limiter (DO/KV/memory three-tier), stored-XSS
> sanitizer, and API security headers. These four are the remaining **operational**
> gaps — not correctness or security holes. Recommended order: **14 → 15 → 16 → 17.**

14. **Connection pooling (blocker)** — same as #6 above; restating as a launch
    gate. The Worker opens + closes a Postgres connection **per request**; at 50k
    users this exhausts connections and adds latency. Fix before public launch:
    Cloudflare **Hyperdrive** in front of Neon (pooling + edge cache, recommended),
    or Neon's **`-pooler`** connection string (PgBouncer) and stop closing the pool
    per request. Set the prod `DATABASE_URL` as a Wrangler secret. (CLAUDE.md PROD TODO.)

15. **Media served without edge caching** (`backend/src/routes/media.ts:40`).
    `GET /media/:key` reads from the **private** R2 bucket on every hit (R2 charges
    per GET), so at AdSense-traffic levels each edge miss is wasted cost + latency.
    The Worker-proxy approach is correct (keeps the bucket private; do NOT switch to
    expiring presigned URLs — those break stable/cacheable public blog images). Fix:
    wrap the serve path in `caches.default` (put on first read, hit on repeat) and
    honor `If-None-Match` → `304`. Optionally front it with a `media.nihon101.com`
    custom domain for CDN caching. ~15 lines.

16. **Frontend page CSP not set** (`frontend/` Astro responses). The stored-XSS hole
    is closed at the data layer (write-time sanitizer + backfill), so this is now
    **defense-in-depth**, not an open hole. Deliberately deferred until AdSense is
    wired, because AdSense dictates the required `script-src` — building the CSP
    before then means building it twice. Add an Astro middleware setting
    `Content-Security-Policy` (script-src/style-src/img-src/frame-src tuned to React
    islands + Google OAuth + AdSense) when ads go in.

17. **No automated tests** — none exist. Fine for shipping, but (a) a recruiter will
    ask, and (b) the rate-limiter, sanitizer, and auth/refresh rotation are exactly
    the kind of security-critical logic worth locking with tests. Add a small suite
    (the sanitizer XSS battery + rate-limit tier behavior + refresh-token rotation)
    before or just after launch.
