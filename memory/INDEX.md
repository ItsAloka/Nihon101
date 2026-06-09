# Next Session Handoff
> **Next session:** read `memory/memory_2026-06-09.md` first. **Big day — backend fully moved D1/SQLite → Postgres** (Docker local on :5432, Neon later — just swap `DATABASE_URL`; `pg` + `drizzle-orm/node-postgres`, per-request pool). Dropped the Portability Law → native types (`bigint` ms, `boolean`, `jsonb`); migrations via drizzle-kit. **All data migrated** (160 rows) and verified live. **Added 13 foreign keys + cascade rules** (verified cascade/restrict; fixed old orphan bugs). **Added char-limit counters** (composer title/excerpt/body + comments, mirror backend caps, red past 90%) — verified live. Updated CLAUDE.md (Postgres + FK-mandatory rule + Hyperdrive prod note) and wrote the full **`development-plan.md`** roadmap (Phase 0 done; next = **Phase 1 public author profiles**, then Home/Explore as real SSR — they're still mock `NIHON_DATA`). **kageloom login: kageloom@gmail.com / REDACTED (local).** **Everything is uncommitted — offer to commit first.** Run backend dev with Docker up (`docker compose up -d`); use `wsl bash -lic '...'` for bun/wrangler (Bash tool = Git Bash, no bun); kill zombie `workerd` before restart. Keep responses short.

---
# Session Index
Most recent first.

| Date | File | Summary |
|------|------|---------|
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
