# Next Session Handoff
> **Next session:** read `memory/memory_2026-06-02.md` first. Auth, account **Settings**, and Google login are done and live-tested; the home is still a mock SPA (`src/nihon/`) not yet wired to the backend. We wrote `CLAUDE.md` + a full 9-phase `development-plan.md`. Building for ~50k users on D1 now, Postgres later (portable schema). Pick up at **Phase 1, step 1**: migration `0002_content.sql` (posts/tags/media), then read API + seed. Keep responses short.

---
# Session Index
Most recent first.

| Date | File | Summary |
|------|------|---------|
| 2026-06-02 | [memory_2026-06-02.md](./memory_2026-06-02.md) | Reset + rebuilt prototype UI; then DB recreated, login icon wired, Settings built, full plan written. |

---
## How this works
- `/shorekeeper check` → reads INDEX + latest session.
- `/shorekeeper` → saves/updates today's session + updates INDEX.
- One file per day. Conversational. Under 100 lines. Cross-account friendly.
