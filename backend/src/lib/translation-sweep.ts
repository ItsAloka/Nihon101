/* The cron half of the auto-translate pipeline (see db/queries/translation.ts
 * for the queue mechanics and why translation left waitUntil). Called from
 * scheduled() every minute:
 *
 *   1. Flip queue rows that burned all attempts to 'failed' (owner retry chip).
 *   2. Single-flight gate: if a previous tick is still translating (unexpired
 *      claims exist), do nothing — this bounds global OpenAI concurrency to one
 *      batch (≤ POSTS_PER_TICK posts × TRANSLATE_CONCURRENCY calls) no matter
 *      how many posts were published at once.
 *   3. Claim a batch (oldest first) and translate the posts SEQUENTIALLY,
 *      chunked + pooled, stopping when the tick's time budget runs out.
 *
 * Failure story: a transient error releases the row with a short backoff
 * (backdated claim — see releaseTranslationForRetry) and a later tick retries
 * it; only the final attempt writes 'failed'. A killed isolate (deploy, wall
 * limit) leaves claims behind; they age out of the active window, then the
 * lease expires and the work is retried. Nothing here can fail silently. */

import type { DB } from '../db/client';
import { translatePost, type Locale } from './openai';
import { sanitizeHtml } from './sanitizeHtml';
import type { PostRow } from '../db/queries/posts';
import {
  MAX_TRANSLATION_ATTEMPTS,
  claimPendingTranslations,
  completeTranslation,
  countActiveTranslationClaims,
  dropTranslation,
  failExhaustedTranslations,
  failTranslation,
  releaseTranslationForRetry,
} from '../db/queries/translation';

/** Posts per tick × chunk concurrency = the hard cap on simultaneous OpenAI
 * calls (4 here, since posts run sequentially). Queue drain ≈ 2-3 posts/min —
 * 50 simultaneous publishes are fully translated in ~20-25 min. Scale levers,
 * in order: TRANSLATE_CONCURRENCY, then POSTS_PER_TICK. */
const POSTS_PER_TICK = 3;
const TRANSLATE_CONCURRENCY = 4;

/** Stop starting new posts past this. Must stay under both the 15-min
 * scheduled() wall limit and CLAIM_LEASE_MS (so a live run is never re-claimed).
 * Worst single post (200k-char cap ≈ 100 chunks, 4-wide) ≈ 6 min, so one giant
 * post always fits; a batch of three might spill into later ticks — fine. */
const TICK_BUDGET_MS = 8 * 60_000;

export interface SweepResult { claimed: number; done: number; failed: number; skipped: boolean; }

export async function runTranslationSweep(db: DB, env: { OPENAI_API_KEY?: string }): Promise<SweepResult> {
  const zero: SweepResult = { claimed: 0, done: 0, failed: 0, skipped: true };
  if (!env.OPENAI_API_KEY) return zero; // dev/tests without a key: queue just sits
  const started = Date.now();

  const exhausted = await failExhaustedTranslations(db, started);
  if (await countActiveTranslationClaims(db, started) > 0) return { ...zero, failed: exhausted };

  const batch = await claimPendingTranslations(db, started, POSTS_PER_TICK);
  const res: SweepResult = { claimed: batch.length, done: 0, failed: exhausted, skipped: false };

  for (const post of batch) {
    if (Date.now() - started > TICK_BUDGET_MS) break; // leftovers stay claimed → lease expiry retries them
    res.done += await translateOne(db, env.OPENAI_API_KEY, post) ? 1 : 0;
  }
  return res;
}

/** Translate one claimed post into its missing locale. True = stored 'done'. */
async function translateOne(db: DB, apiKey: string, post: PostRow): Promise<boolean> {
  const from: Locale = post.lang === 'ja' ? 'ja' : 'en';
  const to: Locale = from === 'en' ? 'ja' : 'en';
  const src = {
    title: from === 'en' ? post.titleEn : post.titleJa,
    excerpt: from === 'en' ? post.excerptEn : post.excerptJa,
    body: from === 'en' ? post.bodyEn : post.bodyJa,
  };
  if (!src.title.trim() && !src.excerpt.trim() && !src.body.trim()) {
    await dropTranslation(db, post.id, post.updatedAt); // source side emptied since queueing
    return false;
  }

  try {
    const out = await translatePost(apiKey, to, src, { concurrency: TRANSLATE_CONCURRENCY });
    const fields: Record<string, string> = {};
    if (out.title != null) fields[to === 'en' ? 'titleEn' : 'titleJa'] = out.title;
    if (out.excerpt != null) fields[to === 'en' ? 'excerptEn' : 'excerptJa'] = out.excerpt;
    if (out.body != null) fields[to === 'en' ? 'bodyEn' : 'bodyJa'] = sanitizeHtml(out.body);
    return await completeTranslation(db, post.id, post.updatedAt, fields);
  } catch (e) {
    if (post.translationAttempts >= MAX_TRANSLATION_ATTEMPTS) {
      await failTranslation(db, post.id, post.updatedAt).catch(() => {});
    } else {
      // Short backoff, then a later tick retries — without blocking the queue.
      await releaseTranslationForRetry(db, post.id, post.updatedAt, Date.now()).catch(() => {});
    }
    console.error(JSON.stringify({
      level: 'error', msg: 'translation_sweep_post_failed', postId: post.id,
      attempt: post.translationAttempts, err: e instanceof Error ? e.message : String(e),
    }));
    return false;
  }
}
