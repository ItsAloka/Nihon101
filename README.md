# 🌸 Nihon101

**A bilingual (Japanese / English) magazine platform about Japan: culture, food, travel, language, anime and history.**

Anyone could sign up, write posts and publish them in both languages. Readers could comment, react, follow authors,
save posts and subscribe to a weekly newsletter. It ran in production at `nihon101.com` and is now **retired**. This
repository is kept public as a portfolio project.

I designed and built it solo: frontend, backend, database, AI features and deployment.

---

## Highlights

### AI features

- **AI translation pipeline (JA ⇄ EN):** authors write in one language and the post is translated into the other with an
  OpenAI model. The HTML structure is kept intact, and the tone is set for a casual magazine voice. A cron-driven queue
  translates posts in the background with retries, a single-flight lock and a failure state the author can retry, so a
  failed translation never disappears silently. An audit check flags output that came back untranslated.
- **Semantic search:** each post is turned into an embedding vector (`text-embedding-3-small`, stored with **pgvector**),
  so a search for "quiet mountain temples" finds matching posts even when they share no keywords.
- **"For You" recommendation feed:** posts are ranked by one clear formula that combines topic taste, followed authors,
  semantic similarity to what you read recently, and trending, then adjusted for freshness and what you've already seen.
  **AI is never load-bearing:** if the embedding API is down, the feed falls back to pure-math ranking.
- **Per-user AI quota and rate limits**, so the paid AI endpoints can't be abused.

### Platform

- Multi-author writing with a rich-text editor (Tiptap): images, tables and YouTube embeds.
- Accounts with email verification, password reset, Google sign-in and one-time codes; bot protection with Cloudflare
  Turnstile.
- Comments, reactions, follows, saved posts, in-app notifications, trending posts, and category and tag pages.
- Admin moderation: ban, hide, remove, handle reports, and a translation audit page.
- "Sunday Letter": a weekly newsletter of trending posts, sent in each subscriber's language, with signed unsubscribe
  links.
- HTML sanitising for user content, a guard against links to piracy sites, a profanity filter and rate limiting via a Durable Object.
- SEO: server-side rendering, sitemap and robots.txt. Lighthouse Accessibility, Best Practices and SEO all scored 100.

### Built for scale

- Designed for about 50,000 users: indexed Postgres schema with real foreign keys, keyset pagination and cached reads for
  public content. Per-user data is never cached.
- Cost work: dirty-flag–gated cron jobs and cached anonymous reads to keep database costs low.
- Daily off-platform database backups to Cloudflare R2, on top of Neon's point-in-time recovery.

---

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | Astro 7 (SSR) + React 19 islands, TypeScript, Tiptap editor |
| Backend | Hono on Cloudflare Workers, TypeScript, Zod validation |
| Database | Neon PostgreSQL + Drizzle ORM (30 migrations), pgvector, Postgres full-text search, Hyperdrive |
| AI | OpenAI chat model for translation, OpenAI embeddings for semantic search and recommendations |
| Storage & email | Cloudflare R2 (media, backups), Resend (email) |
| Tooling | Bun, Wrangler, GitHub Actions CI, Dependabot |

## Project layout

```
frontend/     Astro + React site: pages under src/pages/[locale]/ (en and ja)
backend/      Hono API on Cloudflare Workers
  src/routes/   auth, posts, feed, search, translate, trending, newsletter, admin, ...
  src/lib/      translation pipeline, embeddings, mail, sanitising, sessions
  drizzle/      database migrations
  test/         unit and integration tests
maintenance/  maintenance-mode worker
docs/         disaster-recovery notes
```

## Status

The live site has been shut down. The code is here to show how it was built. It will not run without its own Neon
database, Cloudflare account and API keys; the required settings are listed in `backend/.dev.vars.example` and
`frontend/.env.example`.

---

Built by **Warnakulasinhage S.N.A.** · [GitHub](https://github.com/ItsAloka) · [LinkedIn](https://www.linkedin.com/in/aloka-warnakula/)
