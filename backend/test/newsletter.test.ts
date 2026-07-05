/* Sunday Letter double opt-in. Drives the real Worker against Postgres. The
 * confirm code is mailed; with RESEND_API_KEY='' the mailer logs the subject
 * ("…Confirm code 123456" / "…確認コード 123456"), so we capture console.log
 * during the signup call and pull the 6 digits out — same trick as otp.test.ts. */
import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { eq, inArray } from 'drizzle-orm';
import { call, db, makeUser, deleteUsers } from './helpers';
import { newsletterSubscribers } from '../src/db/schema';
import { pruneUnconfirmedSubscribers, subscribersForSend } from '../src/db/queries/newsletter';
import { updateSettings } from '../src/db/queries/admin';
import { signUnsub } from '../src/lib/unsubscribe';
import { id as newId } from '../src/lib/ids';

const PEPPER = 'test-pepper-0123456789abcdef0123456789abcdef'; // must match helpers.ENV

/** Flip the admin-settings singleton (route gate for signup). */
async function setNewsletterEnabled(on: boolean): Promise<void> {
  const { db: d, pool } = db();
  try { await updateSettings(d, { newsletterEnabled: on }); } finally { await pool.end(); }
}

const emails: string[] = [];
const userIds: string[] = [];

function freshEmail(): string {
  const e = `nls-${newId('t').slice(-10)}@test.local`.toLowerCase();
  emails.push(e);
  return e;
}

beforeAll(async () => {
  // The signup route is gated on adminSettings.newsletterEnabled; make sure a
  // previous (failed) run didn't leave it off.
  await setNewsletterEnabled(true);
});

afterAll(async () => {
  const { db: d, pool } = db();
  try {
    if (emails.length) await d.delete(newsletterSubscribers).where(inArray(newsletterSubscribers.email, emails));
  } finally { await pool.end(); }
  if (userIds.length) await deleteUsers(...userIds);
});

/** Run `fn`, capturing the 6-digit confirm code printed by the dev mailer
 *  (waitUntil is settled inside `call`, so the log lands before this returns).
 *  code === '' means no confirm email was sent during `fn`. */
async function withCode<T>(fn: () => Promise<T>): Promise<{ result: T; code: string }> {
  const lines: string[] = [];
  const orig = console.log;
  console.log = (...a: unknown[]) => { lines.push(a.map(String).join(' ')); };
  try {
    const result = await fn();
    const m = lines.join('\n').match(/(?:確認コード|Confirm code)\s+(\d{6})/i);
    return { result, code: m ? m[1]! : '' };
  } finally { console.log = orig; }
}

/** POST /newsletter and expect the flat {ok:true} + a mailed code. */
async function signup(email: string, locale: 'ja' | 'en' = 'en', token?: string): Promise<string> {
  const { result, code } = await withCode(() => call('POST', '/newsletter', { body: { email, locale }, token }));
  expect(result.status).toBe(200);
  expect(result.json).toEqual({ ok: true });
  expect(code).toMatch(/^\d{6}$/);
  return code;
}

async function row(email: string) {
  const { db: d, pool } = db();
  try {
    const [r] = await d.select().from(newsletterSubscribers).where(eq(newsletterSubscribers.email, email));
    return r;
  } finally { await pool.end(); }
}

describe('newsletter — double opt-in', () => {
  it('signup mails a 6-digit code and stores an UNCONFIRMED row', async () => {
    const email = freshEmail();
    await signup(email);
    const r = await row(email);
    expect(r).toBeTruthy();
    expect(r!.confirmedAt).toBeNull();
    expect(r!.codeHash).toBeTruthy(); // hashed, never the raw code
  });

  it('wrong code is rejected, correct code confirms', async () => {
    const email = freshEmail();
    const code = await signup(email);

    const bad = await call('POST', '/newsletter/confirm', { body: { email, code: code === '000000' ? '000001' : '000000' } });
    expect(bad.status).toBe(400);
    expect(bad.json.error).toBe('invalid_code');

    const ok = await call('POST', '/newsletter/confirm', { body: { email, code } });
    expect(ok.status).toBe(200);
    expect(ok.json).toEqual({ ok: true });

    const r = await row(email);
    expect(r!.confirmedAt).toBeGreaterThan(0);
    expect(r!.codeHash).toBeNull(); // burned on success
  });

  it('a code is single-use — replaying it after confirm fails flat', async () => {
    const email = freshEmail();
    const code = await signup(email);
    expect((await call('POST', '/newsletter/confirm', { body: { email, code } })).status).toBe(200);
    const replay = await call('POST', '/newsletter/confirm', { body: { email, code } });
    expect(replay.status).toBe(400);
    expect(replay.json.error).toBe('invalid_code'); // same shape as unknown email
  });

  it('re-signup of a confirmed email is a silent no-op with the identical response', async () => {
    const email = freshEmail();
    const code = await signup(email);
    await call('POST', '/newsletter/confirm', { body: { email, code } });

    // Same {ok:true}, but NO email goes out — membership can't be enumerated.
    const { result, code: resent } = await withCode(() => call('POST', '/newsletter', { body: { email, locale: 'en' } }));
    expect(result.status).toBe(200);
    expect(result.json).toEqual({ ok: true });
    expect(resent).toBe('');
    expect((await row(email))!.confirmedAt).toBeGreaterThan(0); // still confirmed
  });

  it('re-POST resends: fresh code works, the replaced one does not', async () => {
    const email = freshEmail();
    const oldCode = await signup(email);
    const newCode = await signup(email); // resend path — upsert refreshes the code

    if (newCode !== oldCode) {
      const stale = await call('POST', '/newsletter/confirm', { body: { email, code: oldCode } });
      expect(stale.status).toBe(400);
      expect(stale.json.error).toBe('invalid_code');
    }
    const ok = await call('POST', '/newsletter/confirm', { body: { email, code: newCode } });
    expect(ok.status).toBe(200);
  });

  it('5 wrong attempts burn the code — even the right one is dead after', async () => {
    const email = freshEmail();
    const code = await signup(email);
    const wrong = code === '999999' ? '999998' : '999999';
    for (let i = 0; i < 5; i++) {
      const r = await call('POST', '/newsletter/confirm', { body: { email, code: wrong } });
      expect(r.json.error).toBe('invalid_code');
    }
    const afterBurn = await call('POST', '/newsletter/confirm', { body: { email, code } });
    expect(afterBurn.status).toBe(400);
    expect(afterBurn.json.error).toBe('code_expired');
  });

  it('an expired code is rejected as code_expired', async () => {
    const email = freshEmail();
    const code = await signup(email);
    const { db: d, pool } = db();
    try {
      await d.update(newsletterSubscribers)
        .set({ codeExpiresAt: Date.now() - 1000 })
        .where(eq(newsletterSubscribers.email, email));
    } finally { await pool.end(); }
    const r = await call('POST', '/newsletter/confirm', { body: { email, code } });
    expect(r.status).toBe(400);
    expect(r.json.error).toBe('code_expired');
  });

  it('honeypot field silently drops the signup — no row, no email', async () => {
    const email = freshEmail();
    const { result, code } = await withCode(() =>
      call('POST', '/newsletter', { body: { email, locale: 'en', website: 'http://spam.example' } }));
    expect(result.status).toBe(200);
    expect(result.json.ok).toBe(true); // bot sees success
    expect(code).toBe('');
    expect(await row(email)).toBeUndefined();
  });

  it('confirming an unknown email is the same flat invalid_code (enumeration-safe)', async () => {
    const r = await call('POST', '/newsletter/confirm', { body: { email: freshEmail(), code: '123456' } });
    expect(r.status).toBe(400);
    expect(r.json.error).toBe('invalid_code');
  });

  it('rejects malformed input', async () => {
    expect((await call('POST', '/newsletter', { body: { email: 'not-an-email' } })).status).toBe(400);
    expect((await call('POST', '/newsletter/confirm', { body: { email: freshEmail(), code: '12345' } })).status).toBe(400);
    expect((await call('POST', '/newsletter/confirm', { body: { email: freshEmail(), code: 'abcdef' } })).status).toBe(400);
  });

  it('a signed-in signup links the row to the user', async () => {
    const u = await makeUser('nls'); userIds.push(u.id);
    const email = freshEmail();
    await signup(email, 'en', u.token);
    expect((await row(email))!.userId).toBe(u.id);
  });

  it('the JA locale mails a Japanese confirm code', async () => {
    const email = freshEmail();
    const code = await signup(email, 'ja'); // withCode matches 確認コード too
    expect(code).toMatch(/^\d{6}$/);
  });
});

describe('newsletter — send list, prune, unsubscribe', () => {
  it('only confirmed rows are on the Sunday send list', async () => {
    const confirmed = freshEmail();
    const pending = freshEmail();
    const code = await signup(confirmed);
    await call('POST', '/newsletter/confirm', { body: { email: confirmed, code } });
    await signup(pending); // never confirmed

    const { db: d, pool } = db();
    try {
      // Walk every keyset page — membership must be checked over the full list.
      // last_sent_issue is int4, so "an issue every row is behind" = int4 max.
      const futureIssue = 2 ** 31 - 1;
      const seen = new Set<string>();
      let after: string | undefined;
      for (let i = 0; i < 100; i++) {
        const page = await subscribersForSend(d, { limit: 500, after, issue: futureIssue });
        if (!page.length) break;
        for (const s of page) seen.add(s.email);
        after = page[page.length - 1]!.id;
      }
      expect(seen.has(confirmed)).toBe(true);
      expect(seen.has(pending)).toBe(false);
    } finally { await pool.end(); }
  });

  it('prune removes stale unconfirmed rows and keeps confirmed ones', async () => {
    const staleUnconfirmed = freshEmail();
    const oldConfirmed = freshEmail();
    const eightDaysAgo = Date.now() - 8 * 24 * 60 * 60 * 1000;
    const { db: d, pool } = db();
    try {
      await d.insert(newsletterSubscribers).values([
        { id: newId('nls'), email: staleUnconfirmed, locale: 'en', createdAt: eightDaysAgo },
        { id: newId('nls'), email: oldConfirmed, locale: 'en', createdAt: eightDaysAgo, confirmedAt: eightDaysAgo },
      ]);
      const removed = await pruneUnconfirmedSubscribers(d);
      expect(removed).toBeGreaterThanOrEqual(1);
    } finally { await pool.end(); }
    expect(await row(staleUnconfirmed)).toBeUndefined();
    expect((await row(oldConfirmed))!.confirmedAt).toBe(eightDaysAgo);
  });

  it('a signed unsubscribe token removes the row; a tampered one does not', async () => {
    const email = freshEmail();
    const code = await signup(email);
    await call('POST', '/newsletter/confirm', { body: { email, code } });
    const r = await row(email);

    // Tampered signature → 400, row survives.
    const bad = await call('POST', `/newsletter/unsubscribe?t=${encodeURIComponent(r!.id + '.AAAA')}`);
    expect(bad.status).toBe(400);
    expect(await row(email)).toBeTruthy();

    // The real signed link (same HMAC the Sunday Letter embeds) → row gone.
    const token = await signUnsub(PEPPER, r!.id);
    const ok = await call('POST', `/newsletter/unsubscribe?t=${encodeURIComponent(token)}`);
    expect(ok.status).toBe(200);
    expect(await row(email)).toBeUndefined();

    // Idempotent: the same valid token still lands on the success page.
    const again = await call('POST', `/newsletter/unsubscribe?t=${encodeURIComponent(token)}`);
    expect(again.status).toBe(200);
  });

  it('signup returns 503 while the newsletter is disabled', async () => {
    try {
      await setNewsletterEnabled(false);
      const r = await call('POST', '/newsletter', { body: { email: freshEmail(), locale: 'en' } });
      expect(r.status).toBe(503);
      expect(r.json.error).toBe('newsletter_disabled');
    } finally {
      await setNewsletterEnabled(true);
    }
  });
});
