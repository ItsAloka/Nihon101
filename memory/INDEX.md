# Next Session Handoff
> **Next session:** read `memory/memory_2026-06-04.md` first. Big reset — the owner rebuilt the whole UI in a design tool (new 30 MB standalone HTML in Downloads). We **wiped** the old backend `src/` + all of `frontend/src` (kept `.dev.vars` + scaffolding; recoverable from the `login redone` commit). Model is now **multi-author** (any user writes; author = user). Stack locked: **all-Cloudflare**, not Vercel/Netlify; newest **stable** package versions; D1 now → Postgres later. Only `frontend/src/nihon/seed.ts` is rebuilt so far. **Next task: build the frontend** — re-decode the Downloads bundle and separate that one big UI into proper files (port order: ui → home → screens → social → App → mount in Astro → build). Keep responses short.

---
# Session Index
Most recent first.

| Date | File | Summary |
|------|------|---------|
| 2026-06-04 | [memory_2026-06-04.md](./memory_2026-06-04.md) | Wiped old app, decoded new UI bundle, ported seed.ts; locked all-Cloudflare stack + stable-versions rule; multi-author + mission in CLAUDE.md. |
| 2026-06-02 | [memory_2026-06-02.md](./memory_2026-06-02.md) | Reset + rebuilt prototype UI; then DB recreated, login icon wired, Settings built, full plan written. |

---
## How this works
- `/shorekeeper check` → reads INDEX + latest session.
- `/shorekeeper` → saves/updates today's session + updates INDEX.
- One file per day. Conversational. Under 100 lines. Cross-account friendly.
