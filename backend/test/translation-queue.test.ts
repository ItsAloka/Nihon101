/* Translation-queue mechanics (db/queries/translation.ts) — the invariants that
 * keep the cron pipeline safe: atomic claims with a lease, attempt exhaustion,
 * and the edited-mid-flight guard that must never let a stale translation
 * clobber an author's newer save. Pure DB tests: no OpenAI key is involved
 * (runTranslationSweep itself no-ops without one, also asserted here). */
import { describe, it, expect, afterAll } from 'bun:test';
import { eq } from 'drizzle-orm';
import { posts } from '../src/db/schema';
import {
  ACTIVE_CLAIM_WINDOW_MS,
  CLAIM_LEASE_MS,
  MAX_TRANSLATION_ATTEMPTS,
  RETRY_BACKOFF_MS,
  claimPendingTranslations,
  completeTranslation,
  countActiveTranslationClaims,
  failExhaustedTranslations,
  releaseTranslationForRetry,
} from '../src/db/queries/translation';
import { runTranslationSweep } from '../src/lib/translation-sweep';
import { db, makeUser, makePost, deleteUsers } from './helpers';

const created: string[] = [];
const cleanups: (() => Promise<void>)[] = [];
afterAll(async () => {
  for (const c of cleanups) await c().catch(() => {});
  if (created.length) await deleteUsers(...created);
});

/** A pending post fixture with controllable queue bookkeeping. */
async function makePending(authorId: string, patch: Partial<typeof posts.$inferInsert> = {}) {
  const made = await makePost(authorId);
  cleanups.push(made.cleanup);
  const { db: d, pool } = db();
  try {
    await d.update(posts)
      .set({ bodyEn: '<p>Hello queue</p>', translationStatus: 'pending', ...patch })
      .where(eq(posts.id, made.id));
  } finally { await pool.end(); }
  return made.id;
}

async function readRow(id: string) {
  const { db: d, pool } = db();
  try { return (await d.select().from(posts).where(eq(posts.id, id)))[0]; }
  finally { await pool.end(); }
}

describe('translation queue — claims + lease', () => {
  it('claims a pending post once: bumps attempts, leases it against other claimers', async () => {
    const u = await makeUser('trq'); created.push(u.id);
    const id = await makePending(u.id);
    const now = Date.now();

    const { db: d, pool } = db();
    try {
      const batch = await claimPendingTranslations(d, now, 100);
      expect(batch.map((p) => p.id)).toContain(id);
      const mine = batch.find((p) => p.id === id)!;
      expect(mine.translationAttempts).toBe(1);
      expect(mine.translationClaimedAt).toBe(now);

      // Same tick or an overlapping one: the leased row must NOT be claimable.
      const again = await claimPendingTranslations(d, now + 1, 100);
      expect(again.map((p) => p.id)).not.toContain(id);
      // …and it counts as active work for the single-flight gate.
      expect(await countActiveTranslationClaims(d, now + 1)).toBeGreaterThan(0);
    } finally { await pool.end(); }
  });

  it('an expired lease (killed tick) makes the row claimable again', async () => {
    const u = await makeUser('trq'); created.push(u.id);
    const now = Date.now();
    const id = await makePending(u.id, { translationClaimedAt: now - CLAIM_LEASE_MS - 1, translationAttempts: 1 });

    const { db: d, pool } = db();
    try {
      const batch = await claimPendingTranslations(d, now, 100);
      const mine = batch.find((p) => p.id === id);
      expect(mine).toBeDefined();
      expect(mine!.translationAttempts).toBe(2);
    } finally { await pool.end(); }
  });

  it('a backoff-released row stops blocking the queue but only retries after the backoff', async () => {
    const u = await makeUser('trq'); created.push(u.id);
    const id = await makePending(u.id);
    const now = Date.now();

    const { db: d, pool } = db();
    try {
      const [mine] = (await claimPendingTranslations(d, now, 100)).filter((p) => p.id === id);
      expect(mine).toBeDefined();
      await releaseTranslationForRetry(d, id, mine.updatedAt, now);

      const row = await readRow(id);
      // Outside the active window (can't hold the single-flight gate hostage)…
      expect(row.translationClaimedAt!).toBeLessThan(now - ACTIVE_CLAIM_WINDOW_MS);
      // …not claimable before the backoff elapses…
      expect((await claimPendingTranslations(d, now + 1, 100)).map((p) => p.id)).not.toContain(id);
      // …claimable right after it.
      const retried = (await claimPendingTranslations(d, now + RETRY_BACKOFF_MS + 1, 100)).find((p) => p.id === id);
      expect(retried).toBeDefined();
      expect(retried!.translationAttempts).toBe(2);
    } finally { await pool.end(); }
  });

  it('flips a post to failed only after every attempt burned AND the lease expired', async () => {
    const u = await makeUser('trq'); created.push(u.id);
    const now = Date.now();
    const exhausted = await makePending(u.id, { translationAttempts: MAX_TRANSLATION_ATTEMPTS, translationClaimedAt: now - CLAIM_LEASE_MS - 1 });
    const stillRunning = await makePending(u.id, { translationAttempts: MAX_TRANSLATION_ATTEMPTS, translationClaimedAt: now });

    const { db: d, pool } = db();
    try { await failExhaustedTranslations(d, now); } finally { await pool.end(); }
    expect((await readRow(exhausted)).translationStatus).toBe('failed');
    expect((await readRow(stillRunning)).translationStatus).toBe('pending');
  });
});

describe('translation queue — finishing writes', () => {
  it('stores the translation when the post was not edited mid-flight', async () => {
    const u = await makeUser('trq'); created.push(u.id);
    const id = await makePending(u.id);
    const seen = (await readRow(id)).updatedAt;

    const { db: d, pool } = db();
    try {
      expect(await completeTranslation(d, id, seen, { titleJa: 'テスト', bodyJa: '<p>こんにちは</p>' })).toBe(true);
    } finally { await pool.end(); }
    const row = await readRow(id);
    expect(row.translationStatus).toBe('done');
    expect(row.translationClaimedAt).toBeNull();
    expect(row.titleJa).toBe('テスト');
    expect(row.bodyJa).toBe('<p>こんにちは</p>');
  });

  it('drops a stale result when the author edited during translation', async () => {
    const u = await makeUser('trq'); created.push(u.id);
    const id = await makePending(u.id);
    const seen = (await readRow(id)).updatedAt;

    // Author saves again mid-flight → updated_at moves, row re-queued fresh.
    const { db: d, pool } = db();
    try {
      await d.update(posts).set({ updatedAt: seen + 5, bodyEn: '<p>Newer text</p>' }).where(eq(posts.id, id));
      expect(await completeTranslation(d, id, seen, { bodyJa: '<p>古い翻訳</p>' })).toBe(false);
    } finally { await pool.end(); }
    const row = await readRow(id);
    expect(row.translationStatus).toBe('pending'); // the fresh save still queued
    expect(row.bodyJa).toBe('');                    // stale translation NOT stored
  });
});

describe('translation sweep', () => {
  it('no-ops without an OpenAI key — the queue is left untouched', async () => {
    const u = await makeUser('trq'); created.push(u.id);
    const id = await makePending(u.id);

    const { db: d, pool } = db();
    try {
      const r = await runTranslationSweep(d, { OPENAI_API_KEY: '' });
      expect(r.skipped).toBe(true);
      expect(r.claimed).toBe(0);
    } finally { await pool.end(); }
    const row = await readRow(id);
    expect(row.translationStatus).toBe('pending');
    expect(row.translationAttempts).toBe(0); // no attempt burned
  });
});
