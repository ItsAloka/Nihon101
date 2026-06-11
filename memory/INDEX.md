# Next Session Handoff
> **Next session:** read `memory/memory_2026-06-11.md` first. **Phase 1 (public author profiles) is COMPLETE and verified live.** Users have unique handles, bio, location, avatar (R2 upload + crop, old blob auto-deleted), and bilingual name/bio (`display_name_ja`/`bio_ja`; names manual, bio auto-translated via ChatGPT on save). First real SSR page shipped: `/[locale]/u/[handle].astro` (canonical + hreflang, both locales). Bylines link to public profiles. New public `GET /users/:handle`; `PATCH /auth/me` extended. **All uncommitted — offer to commit first.** kageloom's avatar was deleted by a cleanup test — re-upload it. Next = **Phase 2: real SSR Home** (replace mock `NIHON_DATA` in `home.jsx`). kageloom login: kageloom@gmail.com / REDACTED (local). Docker up first; `wsl bash -lic '...'` for bun/wrangler; frontend dev server runs under the preview tool ("frontend"). Keep responses short.

---
# Session Index
Most recent first.

| Date | File | Summary |
|------|------|---------|
| 2026-06-11 | [memory_2026-06-11.md](./memory_2026-06-11.md) | **Phase 1 complete:** public author profiles full-stack — handles (unique, backfilled), bio/location, avatar upload + crop + R2 cleanup, **bilingual name/bio** (manual JA name, auto-translated bio), first real **SSR page** `/[locale]/u/[handle]`, bylines linked, `GET /users/:handle`, end-of-day audit fixes (bodies stripped, bio counter, orphan cleanup). Phase 8 gains an admin R2 orphan-cleanup tab. **Uncommitted.** Next: Phase 2 real SSR Home. |
| 2026-06-09 | [memory_2026-06-09.md](./memory_2026-06-09.md) | **Backend fully migrated D1/SQLite → Postgres** (Docker local→Neon later; `pg`+drizzle node-postgres, per-request pool; dropped Portability Law → native `bigint`/`boolean`/`jsonb`; drizzle-kit migrations). Migrated all 160 rows + verified live. **Added 13 FKs + cascade rules** (fixed old orphan bugs). **Added char-limit counters** (composer + comments, mirror server caps). Updated CLAUDE.md + wrote `development-plan.md`. **All uncommitted.** Next: Phase 1 public author profiles. |
| 2026-06-08 (late) | [memory_2026-06-08.md](./memory_2026-06-08.md) | **Cover captions** (PHOTO tag + credit) full-stack. **Density** fixed + moved into the editor toolbar. **Dynamic categories** in composer + profile (shared store, top-7 + count badges + search + create, descending); reconciled drifted counts. **Edit-redirect bug fixed** (`edReady`, editId in URL). YouTube flicker REAL fix (dropped GPU-layer hack). 2 kageloom test posts. **Verified live via preview MCP.** kageloom pw: REDACTED. Next: dynamic cats on home/nav/category/feed. |
| 2026-06-08 (eve) | [memory_2026-06-08.md](./memory_2026-06-08.md) | Built the **both-way language** system (editor opens in site lang; Save-draft+Publish translate w/ dirty-check; toggle locked in composer). **Solved YouTube flicker** with a click-to-load poster + isolated progress bar. Made real-post reading view match the prototype (drop cap, avatar byline, author card). Found & fixed the **WSL `/mnt/c` HMR trap** (usePolling). Next: density→reading + composer toolbar. |
| 2026-06-08 | [memory_2026-06-08.md](./memory_2026-06-08.md) | Built the full **writing system** (TipTap), **reading mode** (owner Edit/Delete + warning), real-post profile, and **ChatGPT gpt-5-mini auto-translate** (background on publish). Added a dev API proxy. Next: the agreed **both-way language** rewrite (editor follows site lang) + lock toggle in editor + URL wiring + YouTube flicker fix. |
| 2026-06-05 | [memory_2026-06-05.md](./memory_2026-06-05.md) | Made login mockups (picked **B centered card**); **restored the auth backend** from git + reset local D1; **wired the real login/register/Google/eye** to it and verified register + session-survives-reload in the browser. |
| 2026-06-04 | [memory_2026-06-04.md](./memory_2026-06-04.md) | Wiped old app + deleted old D1/R2; decoded the UI bundle and **built the frontend** (client-only island, /ja /en); shipped the new **nihon1●1 / 日本1●1** logo + favicon; locked all-Cloudflare + stable-versions; multi-author + mission in CLAUDE.md. |
| 2026-06-02 | [memory_2026-06-02.md](./memory_2026-06-02.md) | Reset + rebuilt prototype UI; then DB recreated, login icon wired, Settings built, full plan written. |

---
## How this works
- `/shorekeeper check` → reads INDEX + latest session.
- `/shorekeeper` → saves/updates today's session + updates INDEX.
- One file per day. Conversational. Under 100 lines. Cross-account friendly.
