# Nihon101 — Security & Scalability Improvement Plan

> Audit date: 2026-06-19. Same bar as the sibling **Not Bagel** audit (OWASP Top 10,
> 12-factor, test pyramid). **Project tier: production** (real users, email/PII,
> AdSense, target ~50k users) — the full security + reliability + data sections apply.

**Verdict: ship-ready after ONE local should-fix (frontend page CSP) + the deploy-day
infra steps.** Nihon101 is the more mature of the two siblings: 2FA, DR backups, CI with
a migration-applied guard, and the full account-recovery suite are already in. The gaps
are concentrated and mostly *infra flips*, not code.

---

## What's already strong (do not touch)

- **Auth model** — HS256 access JWT (15 min, memory-only on the client) + opaque rotating
  refresh token in `HttpOnly; Secure; SameSite=Strict; Path=/auth` cookie, stored as
  `sha256(token+pepper)`, rotation-on-refresh with **family reuse-revocation**. Ban gate
  on both login and refresh.
- **2FA** — email OTP second factor for all password logins (single-use, 10-min, 5-attempt
  cap) + 30-day remember-device; Google logins skip it; reset wipes trusted devices.
- **Authorization** — `requireAdmin` re-verifies the **live user row** on mutations so a
  revoked admin can't ride a stale token. Ownership checks on every mutating route.
- **Rate limiting** — three-tier (Durable Object exact / KV / in-memory), every endpoint
  class covered.
- **Injection / XSS** — parameterised Drizzle throughout; post bodies run through a
  server-side `sanitizeHtml` allowlist **at the write chokepoint** (sanitize-on-store).
- **Media** — uploads byte-sniffed (`sniffExt`), served only through the Worker proxy with
  unguessable `userId/uuid.ext` keys; no public bucket URL handed out.
- **API headers/CORS** — exact-origin CORS w/ credentials, `nosniff`, `X-Frame-Options`,
  deny-all CSP on the JSON API, HSTS, Referrer/Permissions-Policy.
- **DB schema** — 13 FKs with deliberate on-delete rules, unique + composite indexes,
  keyset pagination. Built for ~50k.
- **CI** — typecheck + tests (Postgres service) + frontend build + **gitleaks** secret scan
  + `bun audit` + **coverage ratchet** + **`db:verify`** migration-applied guard.
- **DR** — daily `pg_dump`→R2 backup workflow + `docs/disaster-recovery.md` runbook.
- **Account lifecycle** — register, login, refresh, logout, forgot/reset (always-200, no
  enumeration), change-password, cascading account deletion (GDPR erasure).

---

## 🟠 Should-fix — the one real local gap

### 1. Frontend has no page-level CSP / security headers — `frontend/` (missing)
- **Problem:** The Astro frontend ships **no `_headers` file and no `src/middleware.ts`.**
  The API CSP is `default-src 'none'` (correct for JSON), and `backend/src/index.ts`
  explicitly defers *page* CSP to the frontend — but it doesn't exist yet.
- **Why it matters:** The HTML site renders `set:html` post bodies
  (`frontend/src/pages/[locale]/p/[slug].astro`). Sanitize-on-store already blunts stored
  XSS; a page CSP is the defense-in-depth layer behind it, plus clickjacking protection.
- **Fix:** Port **Not Bagel's `frontend/src/middleware.ts`** (it solved this) — set
  `Content-Security-Policy`, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`,
  HSTS, `Referrer-Policy`, `Permissions-Policy` on SSR HTML responses. Allow-list only what
  the site actually loads (self, fonts, the API origin, AdSense when wired).
- **Level-up:** *Two CSPs for two origins* — the API denies everything; the site allow-lists
  only what it loads.

---

## 🟡 Maturity gaps — polish

### 2. Coverage floor is low — `backend/bunfig.toml`
- Floor is line 0.42 / func 0.30, ratcheted so it can't regress. Fine for now; raise as
  tests accrue around auth/admin. *Level-up: ratchet up, never down.*

### 3. GDPR consent banner (AdSense) — frontend (missing)
- Once AdSense is wired, EU traffic needs a consent banner (cookies/ad personalisation).
  Pair it with the existing deletion + reset paths to complete the privacy story.

### 4. Accessibility pass — Astro frontend (core done 2026-06-19)
- **Done:** keyboard dismissal (Esc) + dialog/menu semantics + `aria-label`/`aria-expanded`
  on the shared chrome (login modal, avatar menu, notification panel, header triggers);
  notification items keyboard-operable. `lang` already correct.
- **Remaining (refinements):** contrast audit of faint-grey text, full focus-trap inside
  modals, alt-text review on avatars. Lower urgency.

### 5. API versioning — repo-wide → MOVED to deploy-day
- `/v1` is **not** cheap here: the refresh/trusted-device cookie paths (`/auth`) and the
  **externally-registered `GOOGLE_REDIRECT_URI`** (Google Cloud console) both move with it.
  Do it in the deploy window, coordinated with the OAuth callback + secrets — not as
  pre-deploy churn.

---

## Deploy-day checklist (NOT local-fixable — needs prod infra)

- [ ] **Flip connection pooling on.** `backend/src/db/client.ts` already has the `DB_POOLED`
  per-isolate shared-pool path. Stand up **Cloudflare Hyperdrive** (or Neon `-pooler`),
  point `DATABASE_URL` at it, set `DB_POOLED="true"`. Per-request pool at 50k users = a
  connection storm — this is the scaling gate.
- [ ] **Run migrations 0011–0017 + the DO migration on Neon**, then
  `DATABASE_URL=<neon> bun run db:verify` to prove every migration is applied.
- [ ] **Set Wrangler secrets:** `DATABASE_URL` (pooled), `RESEND_API_KEY`, `JWT_SECRET`,
  `REFRESH_PEPPER`, Google OAuth creds — never in `wrangler.toml`.
- [ ] **Enable DR:** Neon PITR retention ≥7d + the 5 backup secrets (`DATABASE_URL`,
  `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BACKUP_BUCKET`), then
  **run the backup workflow once and restore the dump into a throwaway DB** to prove it
  loads. *A backup you've never restored is a hope, not a plan.*
- [ ] **TLS:** Cloudflare "Always Use HTTPS" + HSTS at the edge.
- [ ] **k6 load test** against staging — validates the pooling flip under real concurrency.
- [ ] **Confirm the `nihon101-media` R2 bucket has no public `r2.dev` domain** — serving must
  go through the Worker proxy only, or the proxy is bypassable.
- [ ] **Branch protection** on `main`: require CI green before merge.
- [ ] **Budget alerts** on Cloudflare + Neon + Resend so a runaway spike pages you.
- [ ] **API versioning (`/v1`)** — mount all routes under `/v1`, move the refresh/trusted-device
  cookie paths to `/v1/auth`, update `GOOGLE_REDIRECT_URI` (+ Google Cloud console), and point
  the frontend client + Vite proxy at `/v1`. Do this here because the OAuth callback is being
  set in this window anyway.

---

## Parity notes vs Not Bagel
- **Nihon101 is ahead on:** 2FA maturity (remember-device), admin/moderation console,
  feed/trending algorithms, DR runbook.
- **Not Bagel is ahead on:** the **frontend page CSP** (`middleware.ts`) — item #1 above is
  literally "port it back from Not Bagel."
- Both share the same deploy-day infra list (pooling flip, secrets, restore-test, R2 check).
