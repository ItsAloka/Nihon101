# Next Session Handoff
> **Next session:** read `memory/memory_2026-06-08.md` first (esp. the **Evening update** at the bottom). **Done today:** the both-way language system is built (editor opens in site lang, Save-draft+Publish translate with a dirty-check, draft translation allowed, lang toggle locked in composer) — backend typecheck + frontend build pass. **YouTube flicker SOLVED** by switching the reading view to a **click-to-load poster** (no live iframe until click) + isolating the reading-progress bar. **Reading view now matches the prototype** (drop cap, avatar byline, "written by" author card). **Critical gotcha:** Vite in WSL doesn't see `/mnt/c` file changes → HMR was serving stale code; fixed with `usePolling` in `astro.config.mjs`; if edits don't show, kill ALL stale servers and start ONE clean (we had zombies on 4321/4322/4323). **Resume:** user confirms the video draft "What's your name??" at localhost:4321 (no flicker, thumbnail→click→plays). **Then:** apply post `density` to reading line-height (stored but unused) + move the composer density button into the editor toolbar. URL `/ja`↔`/en` wiring deferred to the later SSR/SEO pass. Keep responses short.

---
# Session Index
Most recent first.

| Date | File | Summary |
|------|------|---------|
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
