# Next Session Handoff
> **Next session:** read `memory/memory_2026-06-08.md` first (esp. the **Late update** at the bottom). **Done:** YouTube flicker REAL fix (removed a GPU-layer hack in editor.jsx; reading view uses a plain live iframe like the reference). **Cover captions** (PHOTO tag + credit) shipped full-stack (migration 0004). **Density button** was dead → fixed end-to-end AND moved into the editor toolbar. **Dynamic categories** live in composer + profile only — shared `N101_CATS` store + `useCategories`; picker = top-7 by post_count + **count badges** + **search** + **create-new**, descending. Backend counts were already correct; we **reconciled** drifted post_counts (food 4 / animation 2 / travel 2 / culture 1). **Edit-redirect bug fixed** (`edReady` state instead of a ref; editId now in the URL `#/compose/<id>`). Added length caps. Made two kageloom test posts (Your Name, Nichijou). **kageloom login: kageloom@gmail.com / REDACTED (local only).** **VERIFIED LIVE** via the preview MCP (`wsl bun`, port 4321) as kageloom — all working, no console errors. **NEXT:** roll dynamic categories out to the rest (home rail, nav chips, category pages, Trending/Feed — still seed data). Also run `bunx tsc --noEmit` + `bun run build`. Nichijou cover is an external poster URL — replace before public. Keep responses short.

---
# Session Index
Most recent first.

| Date | File | Summary |
|------|------|---------|
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
