# Nihon101 — Development Plan (build roadmap)

The ordered roadmap. Read `CLAUDE.md` (always-loaded summary) and `stack.txt`
(full technical reference) alongside this. This file answers **"what do we build
next, and in what order."**

> **Production tool, not a hobby.** Every phase ships at the masterpiece bar:
> real data (no mock), both locales SSR'd for SEO, FKs + indexes on every new
> table, verified live before it's called done.

---

## Phase 0 — Core foundation ✅ DONE

The plumbing the rest of the site stands on. Complete and verified live.

- **Database: Postgres** (Docker local → Neon prod), Drizzle on
  `node-postgres`. Native types, indexes, **foreign keys with cascade rules**.
- **Auth:** register / login / refresh (rotation + reuse-revoke) / logout /
  forgot / reset, Google OAuth, account Settings (profile/password/google/delete).
- **Writing:** multi-author composer (TipTap), single source language +
  background ChatGPT translation to the other locale on publish, cover + caption,
  density, tags, categories (dynamic, count-tracked).
- **Reading:** real-post reading view (drop cap, byline, author card).
- **Engagement:** per-user likes + flat comments (one reply level), with
  character-limit counters wired to the server caps.

**Nothing core is missing.** Everything below is surfaces + platform features on
top of this, plus two cross-cutting hardening tracks (SSR, pooling) called out
where they land.

---

## The order (reader-facing surfaces first, then the social platform)

Each phase = a real, wired, SSR'd surface or feature. "Done" means: no
`NIHON_DATA` mock left on that surface, both `ja`+`en` SSR'd, verified live.

### Phase 1 — Public author profiles
The first surface a reader and an author both care about.
- **Backend:** public user endpoint (`GET /users/:handle` → display name, bio,
  avatar, join date, published-post list + counts). Add `bio`, `avatar`,
  `handle` to `users` if missing. Reuse `listPosts({ authorId })`.
- **Frontend:** `/[locale]/u/<handle>` SSR page — header, stats, their published
  posts. Wire the existing `ProfilePage` to show **any** author, not just self.
- **Done:** visit any author's public profile; own profile still editable.

### Phase 2 — Home page (real + SSR)
The front door. Today it's `home.jsx` on mock `NIHON_DATA`.
- **Backend:** home feed query (latest published, a featured/editor's-pick flag,
  per-category rails). Add `posts.featured` boolean if we want editor picks.
- **Frontend:** replace all `window.NIHON_DATA` reads in `home.jsx` with real
  data, rendered as **SSR HTML** (islands only for interactive bits).
- **Done:** home shows real posts in both locales, SEO-crawlable.

### Phase 3 — Explore / category / tag / search
How readers discover beyond the home rails.
- **Backend:** category pages (`listPosts({ categoryId })` — exists), tag filter,
  and **search** (Postgres full-text — now allowed; add a `tsvector` index over
  title+excerpt+body per locale).
- **Frontend:** SSR category pages, tag pages, an explore/discover grid, a search
  box + results. Wire nav chips (`ui.jsx`) to real categories.
- **Done:** every reader-facing list is real + SSR; mock `NIHON_DATA` deleted.

### Phase 4 — Social graph: follow + following feed + notifications
Turns the magazine into a platform.
- **DB (new tables, FKs + indexes):**
  - `follows` (follower_id → users, followee_id → users, unique pair, both cascade).
  - `notifications` (user_id → users cascade, type, actor_id → users, post_id →
    posts cascade, comment_id, read_at, created_at; index user_id+created_at).
- **Backend:** follow/unfollow, following-feed query, notification create hooks
  (on like / comment / reply / follow / new post by a followed author), list +
  mark-read endpoints.
- **Frontend:** follow buttons (profiles + cards), a "Following" feed tab, the
  in-app notifications panel (the bell in the header).
- **Done:** follow an author → see their posts in the feed + get notified.

### Phase 5 — Safety & moderation
Required before any public launch.
- **DB:** `reports` (reporter_id → users, target_type, target_id, reason, status,
  created_at; index status).
- **Backend:** report a post/comment; admin actions — hide/remove post or
  comment, ban a user (role/flag on `users`); admin-only middleware on `role`.
- **Frontend:** report affordance on posts/comments; a minimal admin moderation
  queue (hidden/removed states reflected in reader views).
- **Done:** a reader can report; an admin can act; banned users can't post.

### Phase 6 — Trending
Wire the `scheduled()` cron stub in `index.ts`.
- **Backend:** a scoring pass (likes + comments + recency decay) writing a
  `posts.trend_score` on the hourly cron; a trending query/endpoint.
- **Frontend:** replace the mock Trending page with the real ranked list (SSR).
- **Done:** trending reflects real engagement, recomputed hourly.

### Phase 7 — SEO / SSR polish
SEO is a launch requirement, not an afterthought — most of it lands per-surface
in Phases 1–3, this phase finishes it.
- Per-page `<title>`/meta/canonical, `hreflang` for ja↔en, Open Graph + OG
  images, JSON-LD `Article` structured data, `sitemap.xml`, `robots.txt`.
- Confirm every reader surface is server-rendered HTML (islands only where
  interactive).

### Phase 8 — Production hardening + launch
- **Connection pooling** (the one thing between "works" and "prod at scale"):
  **Cloudflare Hyperdrive** in front of Neon (recommended) or Neon's pooled
  connection string; stop opening a connection per request. (See CLAUDE.md.)
- Provision **Neon**; set `DATABASE_URL` + all secrets via `wrangler secret put`.
- Rate limiting on auth + write + comment endpoints; basic abuse controls.
- Deploy: backend → `api.nihon101.com`, frontend → `nihon101.com`. Smoke test.

---

## Cross-cutting (true throughout, not a phase)
- **No mock data** on a shipped surface — wire the backend or don't ship it.
- **FKs + indexes** on every new table the moment it's created.
- **Both locales SSR'd** for every reader-facing page.
- **Verify live** before calling anything done.
- Counters/caps shown in the UI must mirror the server caps.

## Known limitations to revisit
- Denormalized counters (`categories.post_count`, `posts.comments`) are
  app-maintained; rare cascade deletes can drift them → periodic reconcile.
- Reading view is still a client island; it becomes SSR in Phase 7 (or earlier).
