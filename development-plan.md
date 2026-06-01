# Nihon101 — Development Plan

> Bilingual (JA + EN) blog about Japan. Cloudflare-only stack. Two deploys:
> `backend/` Worker at `localhost:8787` (dev) → `api.nihon101.com` (prod),
> `frontend/` Astro on Pages at `localhost:4321` (dev) → `nihon101.com` (prod).
> All dev URLs are localhost; production hostnames swapped at deploy.

---

## 1. Launch scope (final)

### IN
- Bilingual posts (JA + EN), one canonical post, two stored translations via DeepL + author review
- Language switcher preserving slug → `/ja/<slug>` ↔ `/en/<slug>`
- Home, tag index, single tag page, single post page, search (D1 `LIKE`)
- Auth: register, login, forgot password, reset password, change password, delete account
- **Social login (Google)** at launch
- Comments: post, edit own, delete own, like, report, **threaded replies (one level deep)**
- **Reactions** (emoji bar) per post + per comment, distinct from likes
- **View counts** per post (debounced, IP+UA hash to avoid double-counting)
- **Trending widget** on home (last 7 days, weighted views + reactions)
- **Drafts** — single author writes long posts, saves draft, resumes later. Autosave every 30s
- **Follows** — users follow other users (YouTube-style); feed shows latest posts from followed users. Tags are labels on posts for search only — not followable.
- **In-app notification feed only** — new comment on your comment, reply, new post from followed tag/author, mention. Bell icon + dropdown + `/me/notifications` page. No email, no Web Push.
- Admin: post editor with DeepL auto-translate + review, publish/unpublish, delete, moderation queue
- SEO: per-locale OG + JSON-LD Article + hreflang
- RSS per locale, sitemap per locale, robots.txt
- AdSense slot placeholders (ads ship after content threshold)
- Legal: Privacy, Terms, Cookies
- 404 + error page
- Cookieless analytics (CF Web Analytics)

### OUT (post-launch)
- Newsletter / email broadcast
- Multi-author (assume single-author; schema supports future flip)
- Author profile pages, bylines
- Multi-level comment threading (one level only)
- Web Push notifications
- Email notifications (Resend used only for password reset)
- Post scheduling (publish-at-time)
- Wiki-style revisions UI (table kept, no UI)
- FTS5 / advanced search
- Megamenus
- Reading time

### Open forks
(none — all resolved)

---

## 2. Hosting & URLs

| Env | Frontend | Backend |
|---|---|---|
| Dev | `http://localhost:4321` | `http://localhost:8787` |
| Prod | `https://nihon101.com` | `https://api.nihon101.com` |

- Backend CORS: exact-origin allow + credentials.
- Refresh cookie `n101_rt`: `HttpOnly; Secure; SameSite=Strict; Path=/auth` on backend host. Host-only (not shared with frontend).
- Access JWT: 15 min, in-memory only on frontend.
- AdSense and Web Push require HTTPS — both stubbed in dev, enabled in prod.

---

## 3. Repo layout

```
nihon101/
├─ backend/                 Cloudflare Worker (Hono + Drizzle + D1 + R2)
├─ frontend/                Cloudflare Pages (Astro SSR + React islands)
├─ ui-mocks/                Prototype HTML
├─ stack.txt
├─ development-plan.md      (this file)
└─ CLAUDE.md
```

Detailed file tree: see `stack.txt` (kept as the architecture reference).

---

## 4. Build order (small, reversible steps)

Each step ends with a working deploy on localhost. No step depends on a later step.

### Step 0 — Bootstrap
- Init `backend/` (Bun + Hono + Wrangler + Drizzle).
- Init `frontend/` (Bun + Astro + Tailwind + React + `@astrojs/cloudflare`).
- `wrangler.toml` for backend: D1 binding `DB` (local name `nihon101`), R2 binding `MEDIA` (bucket `nihon101-media`), `[triggers] crons = ["0 * * * *"]`.
- `.dev.vars` with `JWT_SECRET`, `REFRESH_PEPPER`, `FRONTEND_ORIGIN=http://localhost:4321`, `DEEPL_API_KEY`, `RESEND_API_KEY`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`.
- Frontend `PUBLIC_API_URL=http://localhost:8787`.

### Step 1 — Auth core
- `migrations/0001_init_auth.sql`: `users`, `refresh_tokens`, `google_links`.
- Backend: `/auth/register`, `/auth/login`, `/auth/refresh`, `/auth/logout`, `/auth/me`, `/auth/forgot`, `/auth/reset`, `/auth/google/start`, `/auth/google/callback`.
- Frontend: `login`, `register`, `forgot`, `reset` pages + Zustand `authStore` + silent refresh on mount.

### Step 2 — Posts (single locale first)
- `migrations/0002_posts.sql`: `posts`, `post_translations`, `post_revisions`, `post_drafts`.
- Backend: `/posts` (list, public), `/posts/:slug` (read, public), `/admin/posts` (create/update/publish/delete), `/admin/posts/:id/draft` (save autosave).
- Frontend: admin `PostEditor.tsx` (markdown + cover upload + autosave every 30s), public `[locale]/p/[slug].astro`, `[locale]/index.astro` (latest).

### Step 3 — Bilingual + DeepL
- `lib/translate.ts` adapter calling DeepL.
- Admin `TranslationPanel.tsx`: button "Auto-translate to EN/JA" → populate other-locale fields → author reviews + edits → publish writes both.
- Astro i18n config: `/ja` default, `/en` secondary, hreflang tags, language switcher swaps slug via `post_translations.slug`.

### Step 4 — Media
- `migrations/0004_media.sql`: `media`.
- Backend `/media/upload` (admin), `/media/:key` (signed-ish — public R2 with key obfuscation).
- Frontend `MediaPicker.tsx` reused in editor.

### Step 5 — Tags + user follows
- `migrations/0003_tags.sql`: `tags`, `post_tags`.
- `migrations/0003b_follows.sql`: `user_follows(follower_id, followee_id, created_at)`.
- Backend `/tags`, `/tags/:slug`, `/users/:id/follow` (POST/DELETE), `/me/feed` (posts from followed users).
- Frontend `[locale]/tag/[tag].astro` (tag search page), `[locale]/tags/index.astro` (tag cloud), follow button on author area, `[locale]/me/feed.astro`.

### Step 6 — Comments + reactions + likes
- `migrations/0005_comments.sql`: `comments` (with `parent_id` for one-level reply), `comment_likes`, `comment_reports`, `post_reactions`, `comment_reactions`.
- Backend `/comments/:postId` (list + create), `/comments/:id` (update/delete own), `/comments/:id/like`, `/comments/:id/report`, `/reactions/post/:id`, `/reactions/comment/:id`.
- Frontend `CommentThread.tsx`, `CommentForm.tsx`, `CommentItem.tsx`, `ReactionBar.tsx`.

### Step 7 — Views + trending
- `migrations/0007_views.sql`: `post_views` (post_id, day_bucket, ip_ua_hash, count). Cron rolls up daily into `posts.view_count` + `posts.trending_score`.
- Backend `/posts/:slug/view` (POST, debounced server-side by ip_ua_hash within window).
- Backend `/admin/cron/recompute-trending` mirrors cron for local trigger.
- Frontend trending widget on home.

### Step 8 — Notifications (in-app only)
- `migrations/0008_notifications.sql`: `notifications`, `notification_reads`.
- Triggers: new comment on your post, reply to your comment, new post by followed user, mention.
- Backend `/me/notifications` (list, mark read), unread count endpoint.
- Frontend bell icon + dropdown + `/me/notifications` page.
- No email, no Web Push.

### Step 9 — Moderation
- `migrations/0010_moderation.sql`: `reports` (generic), `bans`, `warnings`, `admin_actions`.
- Backend admin endpoints + middleware blocks banned users.
- Frontend admin moderation queue.

### Step 10 — SEO + feeds + legal
- Per-locale OG + JSON-LD Article + hreflang in `PostLayout.astro`.
- `pages/rss-[locale].xml.ts`, `pages/sitemap-[locale].xml.ts`, `public/robots.txt`.
- Legal pages: Privacy, Terms, Cookies.

### Step 11 — Ads + analytics + polish
- AdSense `<AdSlot>` placeholders in layout (height reserved → no CLS).
- Cloudflare Web Analytics snippet.
- 404, error page, profile page (change password, delete account).
- Search page (D1 `LIKE` across `post_translations.title` + `body`).

### Step 12 — Pre-launch
- Lighthouse pass per locale.
- AdSense application after ≥20 posts + Privacy/Terms/Cookies live.
- Swap `wrangler.toml` to prod bindings, `wrangler secret put` for all secrets.
- Point DNS: `nihon101.com` → Pages, `api.nihon101.com` → Worker.

---

## 5. Portability checkpoints

At end of every step, verify:
- No `AUTOINCREMENT`, no `WITHOUT ROWID`, no FTS5, no `json_*()` SQL.
- All IDs are `<prefix>_<nanoid21>`.
- All timestamps are `bigint` ms.
- All booleans stored as `integer` 0/1.
- R2 access only via `lib/media.ts`.
- DeepL access only via `lib/translate.ts`.
- Cron jobs have a matching `/admin/cron/*` endpoint.

---

## 6. Hard rules (carry from `stack.txt`)
- Access tokens: memory only.
- Refresh token: HttpOnly + Secure + SameSite=Strict cookie on backend host.
- No client-side translation widgets.
- No SQLite-only schema or queries.
- Terse responses, no preamble.
