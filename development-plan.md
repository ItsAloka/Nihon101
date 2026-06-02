# Nihon101 — Development Plan

Section-by-section build order, from where we are now to production hosting.
Each phase is shippable on its own. Build **backend first, then wire the frontend**
for each feature. Keep the Portability Law (see `CLAUDE.md`) in every DB change —
we are building for **~50,000 users** on D1 (SQLite) now, Postgres later, switchable
with zero rewrite.

Legend: ✅ done · ▶ next up · ☐ todo

---

## ✅ Phase 0 — Auth & account (DONE)

- ✅ DB migration `0001_init_auth.sql` (users, refresh_tokens, google_links, password_resets)
- ✅ Backend auth: register, login, refresh (rotation + family revoke), logout, me, forgot, reset
- ✅ Google OAuth (server-side flow, `google_links`)
- ✅ Account **Settings**: update profile, change password, delete account
- ✅ Frontend: auth pages (`/[locale]/login|register|forgot|reset`), settings page, header auth control
- ✅ Verified end-to-end against live `wrangler dev`

### Carry-over cleanup (do early in Phase 1)
- ☐ Remove dead code: `frontend/src/layouts/BaseLayout.astro` + `frontend/src/components/SiteHeader.tsx`
  (unused — superseded by the `nihon/` Nav). Confirm with owner before deleting.
- ☐ Decide the **email-verification** policy (register sets `email_verified=0` but there is
  no verify flow yet). Either add a verify-email step or drop the column's use for launch.

---

## ☐ Phase 1 — Content data layer (backend only)

Goal: real posts in the DB, readable via API, so the frontend can stop using mock `data.ts`.

1. ☐ Migration `0002_content.sql`: `posts`, `post_translations`, `post_revisions`,
   `post_drafts`, `tags`, `post_tags`, `media`. Portable types only; ANSI SQL.
2. ☐ Drizzle schema additions in `src/db/schema.ts`.
3. ☐ Query helpers in `src/db/queries/posts.ts`, `tags.ts` (paginated list, by-slug+locale,
   tag list, posts-by-tag). Never inline Drizzle in routes.
4. ☐ Public read routes: `GET /posts` (paginated), `GET /posts/:slug?locale=`,
   `GET /tags`, `GET /tags/:slug`. `attachUserIfAuthed` middleware (optional auth).
5. ☐ Seed script `backend/scripts/seed.ts`: port mock `nihon/data.ts` (9 categories,
   5 authors, posts) into the real DB so the live UI matches today's look.
6. ☐ `mapPost(raw)` shape decision: server rows prefixed `Raw…`, display mapping documented.

**Done when:** `curl /posts` and `/posts/:slug` return seeded bilingual content.

---

## ☐ Phase 2 — Public reading UI (SSR migration — the big one)

Goal: replace the `client:only` mock SPA with **Astro SSR** pages backed by the API.
Required for SEO (Phase 7). Reuse the `nihon/` visual components, but render server-side.

1. ☐ `src/lib/api.ts`: add `postApi` (list/get), `tagApi`. SSR-safe fetch (server-side, no token).
2. ☐ Home `/[locale]/index.astro` — SSR: cover story + feed + topics sidebar (from API).
3. ☐ Single post `/[locale]/posts/[slug].astro` — SSR full article.
4. ☐ Tag index `/[locale]/tags` + single tag `/[locale]/tags/[slug]`.
5. ☐ Search `/[locale]/search` — D1 `LIKE` (no FTS5). SSR results.
6. ☐ Language switcher: resolve counterpart slug via `post_translations`, fall back to home.
7. ☐ Convert `nihon/` SPA pieces into Astro components / small islands. Drop hash routing
   (`window.__nihon_go`) and the SPA `lang` state in favor of locale routes + the auth store.
8. ☐ Retire `nihon/App.tsx` SPA shell once all screens are SSR.

**Done when:** every public page is server-rendered per locale, no mock data left,
view-source shows real HTML.

---

## ☐ Phase 3 — Admin editor (author tools)

1. ☐ `requireAdmin` middleware; seed the owner as `role='admin'`.
2. ☐ Routes: create/update/publish/unpublish/delete post; draft autosave.
3. ☐ Drafts with **30s autosave** (single-author long-form).
4. ☐ DeepL adapter `src/lib/translate.ts` + manual "translate other locale" button
   (avoid burning quota per keystroke). `translated_by` = human|deepl|mixed, `reviewed` flag.
5. ☐ Media upload to **R2** via `src/lib/media.ts`; `resolveMediaUrl(key)` on frontend with
   `<img onError>` gradient fallback.
6. ☐ Admin editor island `/[locale]/admin/...` (gated).

**Done when:** owner can write JA/EN, auto-translate, review, upload images, publish.

---

## ☐ Phase 4 — Engagement

1. ☐ Comments: create, edit own, delete own, **one-level replies**, like, report.
2. ☐ Reactions: emoji bar on posts and comments (`post_reactions`, `comment_reactions`).
3. ☐ View counts per post, debounced by IP+UA hash (`post_views`).
4. ☐ Trending widget: last 7 days, weighted views + reactions. Business logic in a plain
   function; cron trigger (`0 * * * *`) **and** `POST /admin/cron/recompute-trending` both call it.

**Done when:** readers can comment/react, views count, trending updates hourly.

---

## ☐ Phase 5 — Social

1. ☐ Follow users (YouTube-style subscribe) — `user_follows`.
2. ☐ Feed of posts from followed users.
3. ☐ In-app **notification feed only** (bell + dropdown + page). No email, no Web Push.
   `notifications`, `notification_reads`.

---

## ☐ Phase 6 — Moderation & admin

1. ☐ `reports`, `bans`, `warnings`, `admin_actions` tables + routes.
2. ☐ Moderation queue UI; author/admin can delete any comment, ban users, hide posts.

---

## ☐ Phase 7 — SEO, feeds, legal, polish

1. ☐ SEO: OpenGraph + JSON-LD + **hreflang** per locale.
2. ☐ RSS per locale, sitemap per locale, `robots.txt`.
3. ☐ AdSense slot placeholders (after content + traffic threshold). No popup networks.
4. ☐ Cloudflare Web Analytics (cookieless).
5. ☐ Legal pages: Privacy, Terms, Cookies. 404 + error page.

---

## ☐ Phase 8 — Hardening & hosting

1. ☐ Rate-limit auth endpoints (login/register/forgot) — abuse protection at 50k scale.
2. ☐ Secrets to prod: `wrangler secret put` for JWT_SECRET, REFRESH_PEPPER, RESEND_*,
   DEEPL_API_KEY, GOOGLE_*. Set prod `[vars]` (FRONTEND_ORIGIN, GOOGLE_REDIRECT_URI).
3. ☐ Backend CORS: exact-origin allow for `https://nihon101.com` + credentials.
4. ☐ Apply migrations to **remote** D1 (`wrangler d1 migrations apply nihon101 --remote`).
5. ☐ Custom domains: `nihon101.com` (Pages) + `api.nihon101.com` (Worker).
6. ☐ Deploy: `wrangler deploy` (backend) + Pages build (frontend). Smoke-test prod auth.
7. ☐ Set up the hourly cron in prod; verify trending recompute runs.

**Done when:** the site is live at nihon101.com with working auth, content, and SEO.

---

## Future migration (post-monetization)

When ad revenue justifies it: move D1 → managed Postgres. Because the schema obeys
the Portability Law, this should be: point Drizzle at the PG dialect, run the same
ANSI-SQL migrations against Postgres, copy data, swap the binding. No app rewrite.
Validate this assumption with a dry-run before committing.
