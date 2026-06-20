# For You — Build Spec (the clean version)

One screen, one formula. Pure math is the engine; embeddings are a turbocharger you
can unplug. Built as the 4 steps from the diagram. This replaces the ad-hoc growth in
`src/db/queries/for-you.ts` with a clearly-labeled pipeline anyone can read.

> **Golden rule:** AI is never load-bearing. Every AI term has a pure-math fallback.
> If the embed API dies, the feed still ranks correctly — it just loses some flavor.

---

## The one formula (Step 3)

```
score(post) =
  (  W_taste    · topicMatch(post)                  // B  — scorecard: anime/travel/…
   + W_follow   · isFollowed(post)                  // B  — you follow the author
   + W_semantic · cos(post.vec, recentTasteVec)     // C  — flavor of your RECENT reads
   + W_trend    · trendingNorm(post) )              // shared trending signal
  × freshness(post)        // newer multiplies up; old decays toward (never to) 0
  × seenPenalty(post)      // already read/liked/saved → pushed down

W_follow 3.0   W_taste 2.0   W_semantic 1.5   W_trend 1.0   (tune later)
```

`W_semantic` term = **0** whenever embeddings are missing/stale/API-down → pure-math feed.

---

## Step 1 — Learn taste (two scorecards + search)

Per-user affinity over **category, tag, author**, learned from engagement.

**Event weights:** search **5** · comment 4 · like 3 · save 2 · read 1 (minus unlike/unsave).

**Two timescales (the mood-shift trick):**
- `slow` scorecard — 14-day half-life → "I generally like anime."
- `fast` scorecard — 6-hour half-life → "right now I'm into travel."
- `effectiveTaste = 0.5·slow + 1.5·fast` (fast weighted heavier so a burst dominates, then fades).

`topicMatch(post) = catAff[cat] + tagWeight · Σ_tags idf(tag)·tagAff[tag] + authorAff[author]`
(keep existing IDF + Bayesian shrinkage — they just make the numbers honest.)

**NEW — search is a signal.** On a search whose results the user clicks, record the
clicked post's category/tag into `user_signals` with base 5 and a short half-life.
This is what makes the feed pivot the instant you go exploring.

**Caching:** `slow` is cached (1h TTL, as today). `fast` is computed live from the
last few hours of events (tiny) so the feed reacts within the session.

## Step 2 — Gather candidates (dumb on purpose)

`SELECT` the newest ~300 published posts + posts from followed authors. Dedupe. No
scoring here — this is just the framework (Postgres/Drizzle) handing Step 3 a pile.

## Step 3 — Score (the formula above)

- `topicMatch` — Step 1's `effectiveTaste`.
- `recentTasteVec` — average of the embeddings of posts in the **fast window** (recent
  reads), NOT all-time. This both shifts with mood AND dodges the multi-interest mush
  (a single all-time vector can't hold "anime + travel"; a recent-only one usually
  holds just what you're into now).
- `trendingNorm` — read `posts.trend_score` (shared with the Trending page), normalized
  0–1 across the candidate window. Falls back to a live floor if not yet computed.
- `freshness = 0.5 ^ (age / 3 days)`. `seenPenalty = 0.35 if seen else 1`.

## Step 4 — Arrange fairly (diversity)

Keep the existing pass: cap posts per author, cap the followed-author share, and weave
in the freshest under-ranked posts every Nth slot (cadence from taste entropy — narrow
taste explores harder). Nothing is dropped; deferred posts sink to a tail.

**Gentle refresh freshness (NOT a slot machine).** A slow-reading magazine must NOT
fully reshuffle on every refresh (that buries the article the reader came back for).
Instead the feed *breathes* at the edges while relevance stays put — three light touches:

1. **Read → it floats down.** `seenPenalty` (0.35) already demotes anything you read /
   liked / saved, so each refresh the stuff you've consumed sinks and new posts rise to
   the top. This is the main "something new every load" effect — organic, not random.
2. **Tiny jitter among near-equal scores.** When two posts score within a small epsilon,
   a small random wiggle decides their order. Top stays relevant; exact arrangement
   shifts a little each load so the feed feels alive.
3. **Rotate the discovery sprinkles.** The explore slots pick *different* fresh posts
   each load (rotate the candidate pointer), so new faces appear without touching the
   ranked core.

Avoid: full random reshuffle of the whole feed (YouTube/IG style) — wrong for a calm
reading site; it would hide a post the reader meant to finish.

---

## Fallback tiers (why it never breaks)

| Tier | Adds | Needs | If it fails |
|------|------|-------|-------------|
| 0 | recency + trending | DB | — (logged out / brand new) |
| 1 | + topicMatch, follow, search, two-timescale | DB only | this IS the backup |
| 2 | + `W_semantic` embedding term | embed API | term → 0, drops to Tier 1 silently |
| 3 | + collaborative "people like you" (later) | scale/data | skipped until traffic exists |

---

## Data / infra to add

1. **Schema:** `posts.embedding vector(1536)` + HNSW index; `user_signals` already exists
   (extend its use for search). (Re-introduces pgvector — the one real cost.)
2. **Embed-on-write:** when a post is published/edited, embed `title + excerpt + body`
   via `OPENAI_EMBED_API_KEY` (model `text-embedding-3-small`) in `waitUntil`. ~$0.50
   one-time for the backfill; pennies/month after.
3. **Backfill script:** embed all existing posts once (`scripts/embed-backfill.ts`).
4. **Quota:** embedding calls are server-side + cheap; no per-user quota needed (only
   fires on author publish, already rate-limited by `postCreate`/`postEdit`).

## Same vectors power Search (free reuse)

Semantic search = embed the query → nearest `posts.embedding`. Shares the exact post
vectors above; only adds ~10 tokens/query. Pure-math FTS+trigram stays underneath as
the fallback. Build after For You Tier 2 (infra already in place).

---

## Build order

1. **Refactor `for-you.ts` into the 4 labeled steps** — no behavior change, just clarity
   so the code matches the diagram. *(Do first — understanding before features.)*
2. **Two-timescale taste** (fast + slow blend). *Pure math, free.*
3. **Search-as-signal** into `user_signals`. *Pure math, free.*
4. **pgvector + embed-on-write + backfill**, then the **`W_semantic`** term. *$5, last.*
5. **Semantic search** (reuses #4's vectors). *Cheap.*
6. **Collaborative (Tier 3)** — only once traffic exists. *Later.*

Steps 1–3 give ~90% of the feel and are the unbreakable backbone. 4–5 add the flavor.
