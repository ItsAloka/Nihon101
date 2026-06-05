# Next Session Handoff
> **Next session:** read `memory/memory_2026-06-05.md` first. **Auth backend is restored and the login page works.** We brought back the old auth backend from git (commit `7a7d553`) into `backend/src` + `migrations/0001_init_auth.sql`, reset local D1, and wired the real login/register/Google/eye modal (`frontend/src/nihon/api.jsx` + the `LoginModal` in `social.jsx` + refresh-on-load/logout in `app.jsx`). Verified in-browser: register hits the backend, session survives reload via /auth/refresh. **Tomorrow's task: user profile + writing** — build the backend for profiles (writer fields on the `users` table) and for composing/publishing posts, then wire the Profile page + Composer the same way. Loose ends: Google needs real redirect URIs; prod still needs `wrangler d1 create` + a fresh `database_id`. Stack stays all-Cloudflare, newest stable, multi-author. Keep responses short.

---
# Session Index
Most recent first.

| Date | File | Summary |
|------|------|---------|
| 2026-06-05 | [memory_2026-06-05.md](./memory_2026-06-05.md) | Made login mockups (picked **B centered card**); **restored the auth backend** from git + reset local D1; **wired the real login/register/Google/eye** to it and verified register + session-survives-reload in the browser. |
| 2026-06-04 | [memory_2026-06-04.md](./memory_2026-06-04.md) | Wiped old app + deleted old D1/R2; decoded the UI bundle and **built the frontend** (client-only island, /ja /en); shipped the new **nihon1●1 / 日本1●1** logo + favicon; locked all-Cloudflare + stable-versions; multi-author + mission in CLAUDE.md. |
| 2026-06-02 | [memory_2026-06-02.md](./memory_2026-06-02.md) | Reset + rebuilt prototype UI; then DB recreated, login icon wired, Settings built, full plan written. |

---
## How this works
- `/shorekeeper check` → reads INDEX + latest session.
- `/shorekeeper` → saves/updates today's session + updates INDEX.
- One file per day. Conversational. Under 100 lines. Cross-account friendly.
