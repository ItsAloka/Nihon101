/* Newsletter list — double opt-in. Signup inserts an UNCONFIRMED row holding a
 * peppered code hash; the subscriber types the emailed 6-digit code back to set
 * confirmedAt. Only confirmed rows receive the Sunday Letter; unconfirmed rows
 * are pruned after 7 days. Dedup by unique email so a double-submit re-issues a
 * code instead of duplicating. Open to logged-out visitors; userId links the row
 * to a signed-in subscriber when present. */
import { and, desc, eq, inArray, isNotNull, isNull, lt, sql } from 'drizzle-orm';
import type { DB } from '../client';
import { newsletterSubscribers } from '../schema';
import { id as newId } from '../../lib/ids';

const CONFIRM_MAX_ATTEMPTS = 5;

/** Upsert a signup. Returns whether a confirm code should be emailed: true for a
 *  new or still-unconfirmed row (code fields refreshed), false when the email is
 *  already confirmed (silent no-op — the caller's response never says which, so
 *  membership can't be enumerated). Single statement, race-free: the conflict
 *  update is gated on `confirmedAt IS NULL`, and a skipped update returns no row. */
export async function beginSubscribe(
  db: DB,
  input: { email: string; locale: 'ja' | 'en'; userId: string | null; codeHash: string; codeExpiresAt: number },
): Promise<{ sendCode: boolean }> {
  const res = await db.insert(newsletterSubscribers)
    .values({
      id: newId('nls'),
      email: input.email.toLowerCase().slice(0, 254),
      locale: input.locale,
      userId: input.userId,
      createdAt: Date.now(),
      codeHash: input.codeHash,
      codeExpiresAt: input.codeExpiresAt,
      attempts: 0,
    })
    .onConflictDoUpdate({
      target: newsletterSubscribers.email,
      set: { codeHash: input.codeHash, codeExpiresAt: input.codeExpiresAt, attempts: 0, locale: input.locale },
      setWhere: isNull(newsletterSubscribers.confirmedAt),
    })
    .returning({ id: newsletterSubscribers.id });
  return { sendCode: res.length > 0 };
}

export type ConfirmResult = 'ok' | 'invalid' | 'expired';

/** Check an emailed confirm code. 'ok' sets confirmedAt and burns the code;
 *  wrong codes count attempts (5 burns the code → 'expired'); anything that
 *  can't match — unknown email, already confirmed, no pending code — is a flat
 *  'invalid' so the endpoint leaks nothing about list membership. */
export async function confirmSubscribe(
  db: DB,
  input: { email: string; codeHash: string },
): Promise<ConfirmResult> {
  const email = input.email.toLowerCase().slice(0, 254);
  const [row] = await db
    .select({ id: newsletterSubscribers.id, confirmedAt: newsletterSubscribers.confirmedAt,
              codeHash: newsletterSubscribers.codeHash, codeExpiresAt: newsletterSubscribers.codeExpiresAt,
              attempts: newsletterSubscribers.attempts })
    .from(newsletterSubscribers)
    .where(eq(newsletterSubscribers.email, email));
  if (!row || row.confirmedAt || !row.codeHash) return 'invalid';
  if (!row.codeExpiresAt || row.codeExpiresAt < Date.now()) return 'expired';
  if (row.attempts >= CONFIRM_MAX_ATTEMPTS) return 'expired';
  if (row.codeHash !== input.codeHash) {
    await db.update(newsletterSubscribers)
      .set({ attempts: row.attempts + 1 })
      .where(eq(newsletterSubscribers.id, row.id));
    return 'invalid';
  }
  await db.update(newsletterSubscribers)
    .set({ confirmedAt: Date.now(), codeHash: null, codeExpiresAt: null, attempts: 0 })
    .where(eq(newsletterSubscribers.id, row.id));
  return 'ok';
}

/** Hourly cron sweep: drop signups that never confirmed within 7 days (bounded
 *  by the partial index on unconfirmed rows). Returns rows removed (rowCount —
 *  not .returning(), which would ship every pruned id over the wire). */
export async function pruneUnconfirmedSubscribers(db: DB, maxAgeMs = 7 * 24 * 60 * 60 * 1000): Promise<number> {
  const cutoff = Date.now() - maxAgeMs;
  const res = await db.execute(sql`DELETE FROM newsletter_subscribers WHERE confirmed_at IS NULL AND created_at < ${cutoff}`);
  return res.rowCount ?? 0;
}

export interface NewsletterStats {
  total: number;
  ja: number;
  en: number;
  last7Days: number;
}

export async function newsletterStats(db: DB): Promise<NewsletterStats> {
  const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
  // Confirmed rows only — unconfirmed signups are transient (pruned after 7 days)
  // and would inflate every number the admin dashboard reports.
  const [totals] = await db
    .select({
      total: sql<number>`count(*)::int`,
      ja: sql<number>`count(*) filter (where locale = 'ja')::int`,
      en: sql<number>`count(*) filter (where locale = 'en')::int`,
      last7Days: sql<number>`count(*) filter (where created_at >= ${cutoff})::int`,
    })
    .from(newsletterSubscribers)
    .where(isNotNull(newsletterSubscribers.confirmedAt));
  return totals ?? { total: 0, ja: 0, en: 0, last7Days: 0 };
}

/** Remove a subscriber by id (the unsubscribe link's payload). Returns the email
 *  that was removed, or null if no such row — so the route can show the right page
 *  and stay idempotent on a double-click. */
export async function unsubscribeById(db: DB, id: string): Promise<string | null> {
  const res = await db.delete(newsletterSubscribers)
    .where(eq(newsletterSubscribers.id, id))
    .returning({ email: newsletterSubscribers.email });
  return res[0]?.email ?? null;
}

export interface SendRow {
  id: string;
  email: string;
  locale: 'ja' | 'en';
}

/** Stream the not-yet-sent list for a send, paged by id (keyset) so a 50k list is
 *  walked in bounded chunks instead of one giant result set. Only rows whose
 *  `lastSentIssue` is below the current issue are returned, so a cron that's retried
 *  after a partial run resumes where it left off instead of re-mailing everyone. Pass
 *  the last id back as `after` for the next page; empty array = done. */
export async function subscribersForSend(
  db: DB,
  opts: { limit: number; after?: string; issue: number },
): Promise<SendRow[]> {
  const rows = await db
    .select({ id: newsletterSubscribers.id, email: newsletterSubscribers.email, locale: newsletterSubscribers.locale })
    .from(newsletterSubscribers)
    .where(and(
      sql`${newsletterSubscribers.confirmedAt} is not null`, // double opt-in gate
      lt(newsletterSubscribers.lastSentIssue, opts.issue),
      opts.after ? sql`${newsletterSubscribers.id} > ${opts.after}` : undefined,
    ))
    .orderBy(newsletterSubscribers.id)
    .limit(opts.limit);
  return rows.map((r) => ({ id: r.id, email: r.email, locale: r.locale === 'en' ? 'en' : 'ja' }));
}

/** Stamp this issue number onto the rows we just delivered, so a retried cron run
 *  skips them (the idempotency checkpoint). Called once per successfully-sent batch. */
export async function markSent(db: DB, ids: string[], issue: number): Promise<void> {
  if (!ids.length) return;
  await db.update(newsletterSubscribers)
    .set({ lastSentIssue: issue })
    .where(inArray(newsletterSubscribers.id, ids));
}

export interface SubscriberRow {
  id: string;
  email: string;
  locale: string;
  createdAt: number;
}

export async function listSubscribers(
  db: DB,
  opts: { limit?: number; before?: number } = {},
): Promise<SubscriberRow[]> {
  const limit = Math.min(opts.limit ?? 50, 200);
  // `before` = keyset cursor for older pages (rows strictly before that timestamp).
  // The old version used gte() — inverted — and never reassigned the builder, so the
  // filter was silently dropped; harmless only because no caller paged yet.
  // Confirmed rows only: unconfirmed signups are transient and would be
  // indistinguishable from real subscribers in the admin list.
  return db
    .select({ id: newsletterSubscribers.id, email: newsletterSubscribers.email, locale: newsletterSubscribers.locale, createdAt: newsletterSubscribers.createdAt })
    .from(newsletterSubscribers)
    .where(and(
      isNotNull(newsletterSubscribers.confirmedAt),
      opts.before ? lt(newsletterSubscribers.createdAt, opts.before) : undefined,
    ))
    .orderBy(desc(newsletterSubscribers.createdAt))
    .limit(limit);
}
