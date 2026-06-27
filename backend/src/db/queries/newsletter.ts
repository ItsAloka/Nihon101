/* Newsletter list — capture only (the weekly digest sender ships later). Dedup by
 * unique email so a double-submit is a no-op. Open to logged-out visitors; userId
 * links the row to a signed-in subscriber when present. */
import { and, desc, gte, eq, inArray, lt, sql } from 'drizzle-orm';
import type { DB } from '../client';
import { newsletterSubscribers } from '../schema';
import { id as newId } from '../../lib/ids';

export async function subscribe(
  db: DB,
  input: { email: string; locale: 'ja' | 'en'; userId: string | null },
): Promise<{ created: boolean }> {
  const res = await db.insert(newsletterSubscribers)
    .values({
      id: newId('nls'),
      email: input.email.toLowerCase().slice(0, 254),
      locale: input.locale,
      userId: input.userId,
      createdAt: Date.now(),
    })
    .onConflictDoNothing({ target: newsletterSubscribers.email })
    .returning({ id: newsletterSubscribers.id });
  return { created: res.length > 0 };
}

export interface NewsletterStats {
  total: number;
  ja: number;
  en: number;
  last7Days: number;
}

export async function newsletterStats(db: DB): Promise<NewsletterStats> {
  const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const [totals] = await db
    .select({
      total: sql<number>`count(*)::int`,
      ja: sql<number>`count(*) filter (where locale = 'ja')::int`,
      en: sql<number>`count(*) filter (where locale = 'en')::int`,
      last7Days: sql<number>`count(*) filter (where created_at >= ${cutoff})::int`,
    })
    .from(newsletterSubscribers);
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
  const q = db
    .select({ id: newsletterSubscribers.id, email: newsletterSubscribers.email, locale: newsletterSubscribers.locale, createdAt: newsletterSubscribers.createdAt })
    .from(newsletterSubscribers)
    .orderBy(desc(newsletterSubscribers.createdAt))
    .limit(limit);
  if (opts.before) q.where(gte(newsletterSubscribers.createdAt, opts.before));
  return q;
}
