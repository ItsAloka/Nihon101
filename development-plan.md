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

## 4. Build order — vertical slices

**How we build (the rule):**
- One **feature slice** at a time. A slice = its DB migration → its API routes → the UI page that calls them. Shipped working on localhost before the next slice starts.
- **Not** all-backend-then-all-frontend. Backend and frontend move together, one feature deep.
- Within a slice: **API first, then its page** (the page needs something to call).
- **Stop after every slice. Test it in the browser. Then move on.**
- Late slices (trending, comments, likes, tags) are deliberately isolated so their churn never touches login/posts.

**UI source:** the prototype (`ui-mocks/prototype.html`) is a **design reference, not a code base** (it's CDN-React + in-browser Babel — do not port the runtime). Extract design **tokens once** (slice 1); extract each page's layout **lazily** when that page is built. Rebuild as Astro pages + React islands.

> Step 0 (bootstrap) is already done: backend + frontend scaffolded, D1 `nihon101` + R2 `nihon101-media` created, `.dev.vars` filled.

### Slice 1 — Design tokens
- Pull palette + font stack from `ui-mocks/prototype.html` into Tailwind theme.
- Palette: paper `#FBFAF7`, ink `#1A1817`, hinomaru red `#D63752`, sakura `#E8A0AE`, tan `#d6c7b3`.
- Fonts: `Inter` (Latin UI), `Noto Sans JP` (JA body), `Shippori Mincho B1` (JA serif headings).
- Base layout shell + boot loader. No feature logic.

### Slice 2 — Login / Auth
- `migrations/0001_init_auth.sql`: `users`, `refresh_tokens`, `google_links`.
- Backend: `/auth/register`, `/auth/login`, `/auth/refresh`, `/auth/logout`, `/auth/me`, `/auth/forgot`, `/auth/reset`, `/auth/google/start`, `/auth/google/callback`.
- Frontend: `login`, `register`, `forgot`, `reset` pages + Zustand `authStore` + silent refresh on mount.

### Slice 3 — Write a post (single locale)
- `migrations/0002_posts.sql`: `posts`, `post_translations`, `post_revisions`, `post_drafts`.
- Backend: `/admin/posts` (create/update/publish/delete), `/admin/posts/:id/draft` (autosave).
- Frontend: admin `PostEditor.tsx` (markdown + autosave every 30s). One language only.

### Slice 4 — Read a post (single locale)
- Backend: `/posts` (list, public), `/posts/:slug` (read, public).
- Frontend: public `[locale]/p/[slug].astro`, `[locale]/index.astro` (latest list).

### Slice 5 — Media
- `migrations/0004_media.sql`: `media`.
- Backend `/media/upload` (admin), `/media/:key` (public R2 with key obfuscation).
- Frontend `MediaPicker.tsx` wired into the editor (cover + inline images).

### Slice 6 — Bilingual + DeepL
- `lib/translate.ts` adapter calling DeepL (host by `:fx` suffix).
- Admin `TranslationPanel.tsx`: "Auto-translate to EN/JA" → fill other locale → author reviews → publish writes both.
- Astro i18n: `/ja` default, `/en` secondary, hreflang, switcher swaps slug via `post_translations.slug`.

### Slice 7 — Tags + search
- `migrations/0003_tags.sql`: `tags`, `post_tags`.
- Backend `/tags`, `/tags/:slug`, search via D1 `LIKE` over `post_translations.title` + `body`.
- Frontend `[locale]/tag/[tag].astro`, `[locale]/tags/index.astro`, search page.

### Slice 8 — Comments + reactions + likes
- `migrations/0005_comments.sql`: `comments` (`parent_id` one-level reply), `comment_likes`, `comment_reports`, `post_reactions`, `comment_reactions`.
- Backend `/comments/:postId` (list + create), `/comments/:id` (update/delete own), `/comments/:id/like`, `/comments/:id/report`, `/reactions/post/:id`, `/reactions/comment/:id`.
- Frontend `CommentThread.tsx`, `CommentForm.tsx`, `CommentItem.tsx`, `ReactionBar.tsx`.

### Slice 9 — Views + trending
- `migrations/0007_views.sql`: `post_views` (post_id, day_bucket, ip_ua_hash, count). Cron rolls up daily into `posts.view_count` + `posts.trending_score` (7-day weighted views + reactions).
- Backend `/posts/:slug/view` (POST, server-debounced by ip_ua_hash), `/admin/cron/recompute-trending` (mirrors cron).
- Frontend trending widget on home.

### Slice 10 — Notifications + follows
- `migrations/0003b_follows.sql`: `user_follows(follower_id, followee_id, created_at)`.
- `migrations/0008_notifications.sql`: `notifications`, `notification_reads`.
- Backend `/users/:id/follow` (POST/DELETE), `/me/feed`, `/me/notifications` (list, mark read), unread count.
- Frontend follow button, `[locale]/me/feed.astro`, bell icon + dropdown + `/me/notifications`. In-app only.

### Slice 11 — Moderation
- `migrations/0010_moderation.sql`: `reports` (generic), `bans`, `warnings`, `admin_actions`.
- Backend admin endpoints + middleware blocks banned users.
- Frontend admin moderation queue.

### Slice 12 — SEO + feeds + legal + polish
- Per-locale OG + JSON-LD Article + hreflang in `PostLayout.astro`.
- `pages/rss-[locale].xml.ts`, `pages/sitemap-[locale].xml.ts`, `public/robots.txt`.
- Legal: Privacy, Terms, Cookies. 404 + error page. Profile (change password, delete account).
- AdSense `<AdSlot>` placeholders (height reserved → no CLS). Cloudflare Web Analytics.

### Slice 13 — Pre-launch
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
