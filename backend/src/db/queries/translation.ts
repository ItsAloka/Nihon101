/* Translation queue — the DB half of the cron-driven auto-translate pipeline.
 *
 * Why a queue at all: translation used to run in the publish request's
 * `waitUntil`, which Cloudflare kills ~30s after the response. A long post
 * (25+ parallel OpenAI calls) blew that window, the isolate died mid-job, and
 * the row was left 'pending' forever with no retry. Now publish only marks the
 * row 'pending'; the per-minute scheduled() cron drains the queue with a
 * 15-minute wall budget, so post size can never kill a translation again.
 *
 * Concurrency safety (the "50 users publish at once" case): rows are claimed
 * atomically with UPDATE … (SELECT … FOR UPDATE SKIP LOCKED), so overlapping
 * cron invocations can never grab the same post, and the sweep runs
 * single-flight (skips the tick while unexpired claims exist) so the global
 * number of in-flight OpenAI calls stays capped no matter how deep the queue
 * gets. A burst of publishes just queues up and drains a few posts per minute.
 *
 * Every finishing write is guarded by the updated_at the claimer saw: if the
 * author edited the post mid-translation, the stale result is dropped on the
 * floor and the author's fresh 'pending' goes through the queue again. */

import { sql } from 'drizzle-orm';
import type { DB } from '../client';
import { getPostById, type PostRow } from './posts';

/** A claim older than this is dead (its cron tick was killed) and claimable
 * again. Must comfortably exceed the sweep's worst-case tick runtime or a live
 * run could be double-claimed. */
export const CLAIM_LEASE_MS = 15 * 60_000;

/** How long a transiently-failed post waits before its next attempt.
 * Implemented by BACKDATING the claim (releaseTranslationForRetry) so it
 * expires this soon — without ever looking "active" to the single-flight gate,
 * because a backing-off post must not block the rest of the queue. */
export const RETRY_BACKOFF_MS = 2 * 60_000;

/** Attempts (= claims) before a post is marked 'failed' and left to the owner's
 * retry chip. Spread one backoff apart → several minutes of self-healing. */
export const MAX_TRANSLATION_ATTEMPTS = 3;

/** A claim younger than this belongs to a cron tick that may still be running
 * (ticks stop STARTING posts at ~8 min; one giant final post can overrun a bit).
 * Gate window < lease by design: claims from a killed tick stop blocking the
 * queue here, several minutes before the lease makes them claimable again. */
export const ACTIVE_CLAIM_WINDOW_MS = 10 * 60_000;

/** Posts a (possibly still-running) tick is translating right now. The sweep's
 * single-flight gate: >0 means skip this tick. Backing-off rows are backdated
 * past the window, so they never hold the queue hostage. */
export async function countActiveTranslationClaims(db: DB, now: number): Promise<number> {
  const r = await db.execute(sql`
    SELECT count(*)::int AS n FROM posts
    WHERE translation_status = 'pending'
      AND translation_claimed_at IS NOT NULL
      AND translation_claimed_at > ${now - ACTIVE_CLAIM_WINDOW_MS}
  `);
  return Number((r.rows[0] as { n: number } | undefined)?.n ?? 0);
}

/** Terminal sweep: pending rows that already burned every attempt (and whose
 * last claim expired) become 'failed' — surfaces the owner's retry chip instead
 * of queueing forever. Returns how many were flipped. */
export async function failExhaustedTranslations(db: DB, now: number): Promise<number> {
  const r = await db.execute(sql`
    UPDATE posts SET translation_status = 'failed'
    WHERE translation_status = 'pending'
      AND translation_attempts >= ${MAX_TRANSLATION_ATTEMPTS}
      AND (translation_claimed_at IS NULL OR translation_claimed_at <= ${now - CLAIM_LEASE_MS})
  `);
  return r.rowCount ?? 0;
}

/** Atomically claim up to `limit` queued posts (oldest edit first, so nobody's
 * post can be starved by newer publishes). Bumps attempts as part of the claim;
 * SKIP LOCKED makes concurrent claimers grab disjoint rows. Returns full rows. */
export async function claimPendingTranslations(db: DB, now: number, limit: number): Promise<PostRow[]> {
  const r = await db.execute(sql`
    UPDATE posts
    SET translation_claimed_at = ${now},
        translation_attempts = translation_attempts + 1
    WHERE id IN (
      SELECT id FROM posts
      WHERE translation_status = 'pending'
        AND translation_attempts < ${MAX_TRANSLATION_ATTEMPTS}
        AND (translation_claimed_at IS NULL OR translation_claimed_at <= ${now - CLAIM_LEASE_MS})
      ORDER BY updated_at ASC
      LIMIT ${limit}
      FOR UPDATE SKIP LOCKED
    )
    RETURNING id
  `);
  const rows: PostRow[] = [];
  for (const { id } of r.rows as { id: string }[]) {
    const p = await getPostById(db, id);
    if (p) rows.push(p);
  }
  return rows;
}

/** Store a finished translation — but ONLY if the post wasn't edited while we
 * translated (updated_at must still be what the claimer saw). A mid-flight edit
 * re-queued the post with fresh source text; writing our stale result over it
 * would clobber the author. Returns false when the write was skipped. */
export async function completeTranslation(
  db: DB,
  postId: string,
  seenUpdatedAt: number,
  fields: { titleEn?: string; titleJa?: string; excerptEn?: string; excerptJa?: string; bodyEn?: string; bodyJa?: string },
): Promise<boolean> {
  const sets = [sql`translation_status = 'done'`, sql`translation_claimed_at = NULL`, sql`updated_at = ${Date.now()}`];
  if (fields.titleEn != null) sets.push(sql`title_en = ${fields.titleEn}`);
  if (fields.titleJa != null) sets.push(sql`title_ja = ${fields.titleJa}`);
  if (fields.excerptEn != null) sets.push(sql`excerpt_en = ${fields.excerptEn}`);
  if (fields.excerptJa != null) sets.push(sql`excerpt_ja = ${fields.excerptJa}`);
  if (fields.bodyEn != null) sets.push(sql`body_en = ${fields.bodyEn}`);
  if (fields.bodyJa != null) sets.push(sql`body_ja = ${fields.bodyJa}`);
  const r = await db.execute(sql`
    UPDATE posts SET ${sql.join(sets, sql`, `)}
    WHERE id = ${postId} AND updated_at = ${seenUpdatedAt}
  `);
  return (r.rowCount ?? 0) > 0;
}

/** A claimed post turned out to have nothing translatable (source side emptied
 * since it was queued) — drop it from the queue without burning the author's
 * retry chip on it. Same mid-flight-edit guard as completeTranslation. */
export async function dropTranslation(db: DB, postId: string, seenUpdatedAt: number): Promise<void> {
  await db.execute(sql`
    UPDATE posts SET translation_status = 'none', translation_claimed_at = NULL
    WHERE id = ${postId} AND updated_at = ${seenUpdatedAt}
  `);
}

/** Mark the final attempt's failure. Guarded like completeTranslation: an
 * author edit mid-flight wins. */
export async function failTranslation(db: DB, postId: string, seenUpdatedAt: number): Promise<void> {
  await db.execute(sql`
    UPDATE posts SET translation_status = 'failed', translation_claimed_at = NULL
    WHERE id = ${postId} AND updated_at = ${seenUpdatedAt}
  `);
}

/** Release a transiently-failed post for another attempt after
 * RETRY_BACKOFF_MS: the claim is backdated so it (a) is already outside the
 * active window — it can't block other posts' ticks — and (b) leaves the lease
 * with exactly the backoff remaining, at which point it's claimable again. */
export async function releaseTranslationForRetry(db: DB, postId: string, seenUpdatedAt: number, now: number): Promise<void> {
  await db.execute(sql`
    UPDATE posts SET translation_claimed_at = ${now - CLAIM_LEASE_MS + RETRY_BACKOFF_MS}
    WHERE id = ${postId} AND updated_at = ${seenUpdatedAt}
  `);
}
