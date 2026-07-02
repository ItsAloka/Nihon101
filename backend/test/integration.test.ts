/* Integration tests for the security-critical paths — the behaviors a refactor must
 * never silently break. Runs the real Worker against Postgres. See helpers.ts.
 *
 * Requires a reachable DB (Docker locally: `docker compose up -d`; migrated). In CI
 * a Postgres service container is started + migrated before this runs. */
import { describe, it, expect, afterAll } from 'bun:test';
import { eq } from 'drizzle-orm';
import { emailVerifications, users } from '../src/db/schema';
import { hashToken } from '../src/lib/crypto';
import { call, db, makeUser, makePost, deleteUsers, ENV } from './helpers';

const created: string[] = [];
afterAll(async () => { if (created.length) await deleteUsers(...created); });

describe('auth — registration + password policy', () => {
  it('rejects a weak password (no DB write)', async () => {
    const r = await call('POST', '/auth/register', { body: { email: `weak-${Date.now()}@test.local`, password: '1234567' } });
    expect(r.status).toBe(400);
    expect(r.json.error).toBe('weak_password');
  });

  it('registers with a strong password and queues an email verification', async () => {
    const u = await makeUser('reg'); created.push(u.id);
    expect(u.token).toBeTruthy();
    // A pending verification token row must exist, and the user starts unverified.
    const { db: d, pool } = db();
    try {
      const evs = await d.select().from(emailVerifications).where(eq(emailVerifications.userId, u.id));
      expect(evs.length).toBe(1);
      const [row] = await d.select().from(users).where(eq(users.id, u.id));
      expect(row.emailVerified).toBe(false);
    } finally { await pool.end(); }
  });
});

describe('email verification', () => {
  it('flips email_verified on a valid token and rejects reuse', async () => {
    const u = await makeUser('verify'); created.push(u.id);
    // Seed a known token (we only ever store its hash), as the emailed link would carry.
    const raw = 'verify-token-' + Date.now();
    const { db: d, pool } = db();
    try {
      await d.update(emailVerifications).set({ tokenHash: await hashToken(raw, ENV.REFRESH_PEPPER as string) }).where(eq(emailVerifications.userId, u.id));
    } finally { await pool.end(); }

    const ok = await call('POST', '/auth/verify-email', { body: { token: raw } });
    expect(ok.status).toBe(200);

    const { db: d2, pool: p2 } = db();
    try {
      const [row] = await d2.select().from(users).where(eq(users.id, u.id));
      expect(row.emailVerified).toBe(true);
    } finally { await p2.end(); }

    const reuse = await call('POST', '/auth/verify-email', { body: { token: raw } });
    expect(reuse.status).toBe(400); // single-use
  });
});

describe('admin gate (Broken Access Control)', () => {
  it('401 without a token, 403 for a normal user', async () => {
    const anon = await call('GET', '/admin/stats');
    expect(anon.status).toBe(401);

    const u = await makeUser('nonadmin'); created.push(u.id);
    const forbidden = await call('GET', '/admin/stats', { token: u.token });
    expect(forbidden.status).toBe(403);
  });
});

describe('comment deletion is owner-only', () => {
  it('a non-author (even the post owner) cannot delete a comment', async () => {
    const author = await makeUser('postowner'); created.push(author.id);
    const commenter = await makeUser('commenter'); created.push(commenter.id);
    const post = await makePost(author.id);
    try {
      const made = await call('POST', `/posts/${post.id}/comments`, { token: commenter.token, body: { body: 'hello from B' } });
      expect(made.status).toBe(201);
      const cid = made.json.comment.id;

      // The POST author must NOT be able to delete the commenter's comment here.
      const asOwner = await call('DELETE', `/posts/${post.id}/comments/${cid}`, { token: author.token });
      expect(asOwner.status).toBe(403);

      // The comment's own author can.
      const asAuthor = await call('DELETE', `/posts/${post.id}/comments/${cid}`, { token: commenter.token });
      expect(asAuthor.status).toBe(200);
    } finally { await post.cleanup(); }
  });
});

describe('like counter is race-safe', () => {
  it('concurrent likes never 500 and never double-count', async () => {
    const author = await makeUser('likeauthor'); created.push(author.id);
    const liker = await makeUser('liker'); created.push(liker.id);
    const post = await makePost(author.id);
    try {
      // Two like toggles fired together (separate request pools = real concurrency).
      // With the ON CONFLICT / affected-row gate, neither errors and the counter
      // can't exceed the one real like row.
      const [r1, r2] = await Promise.all([
        call('POST', `/posts/${post.id}/like`, { token: liker.token }),
        call('POST', `/posts/${post.id}/like`, { token: liker.token }),
      ]);
      expect(r1.status).toBe(200);
      expect(r2.status).toBe(200);
      const last = Math.max(r1.json.likes ?? 0, r2.json.likes ?? 0);
      expect(last).toBeLessThanOrEqual(1); // never +2 from a double-tap
    } finally { await post.cleanup(); }
  });
});

describe('reports — self-report guard + idempotency', () => {
  it('cannot report yourself; duplicate reports dedupe', async () => {
    const a = await makeUser('reporter'); created.push(a.id);
    const b = await makeUser('reported'); created.push(b.id);

    const own = await call('POST', '/reports', { token: a.token, body: { targetType: 'user', targetId: a.id, reason: 'spam' } });
    expect(own.status).toBe(400);
    expect(own.json.error).toBe('cannot_report_own');

    const first = await call('POST', '/reports', { token: a.token, body: { targetType: 'user', targetId: b.id, reason: 'spam' } });
    expect(first.status).toBe(201);
    const dupe = await call('POST', '/reports', { token: a.token, body: { targetType: 'user', targetId: b.id, reason: 'spam' } });
    expect(dupe.json.deduped).toBe(true);
  });
});

describe('auto-hide on trusted report threshold', () => {
  it('hides a post once enough trusted distinct reporters flag it (untrusted flags never count)', async () => {
    const author = await makeUser('ahauthor'); created.push(author.id);
    const r1 = await makeUser('ahrep1'); created.push(r1.id);
    const r2 = await makeUser('ahrep2'); created.push(r2.id);
    const fresh = await makeUser('ahfresh'); created.push(fresh.id); // NOT trusted (brand-new)
    const post = await makePost(author.id);

    // Snapshot settings, then lower the auto-hide threshold to 2 for the test.
    const { db: d, pool } = db();
    const { adminSettings, posts: postsT } = await import('../src/db/schema');
    let prev: { reportThreshold: number; autoHideThreshold: number } | null = null;
    try {
      const [cur] = await d.select().from(adminSettings).where(eq(adminSettings.id, 'singleton'));
      if (cur) {
        prev = { reportThreshold: cur.reportThreshold, autoHideThreshold: cur.autoHideThreshold };
        await d.update(adminSettings).set({ autoHideThreshold: 2 }).where(eq(adminSettings.id, 'singleton'));
      } else {
        await d.insert(adminSettings).values({ id: 'singleton', reportThreshold: 1, autoHideThreshold: 2, newsletterEnabled: true, updatedAt: Date.now() });
      }
      // Trusted = email-verified AND account older than the 7-day gate. Backdate r1+r2;
      // `fresh` stays new+unverified, so its flag must NOT count toward auto-hide.
      const aged = Date.now() - 8 * 24 * 60 * 60 * 1000;
      await d.update(users).set({ emailVerified: true, createdAt: aged }).where(eq(users.id, r1.id));
      await d.update(users).set({ emailVerified: true, createdAt: aged }).where(eq(users.id, r2.id));

      // Untrusted + first trusted report: still visible.
      expect((await call('POST', '/reports', { token: fresh.token, body: { targetType: 'post', targetId: post.id, reason: 'spam' } })).status).toBe(201);
      expect((await call('POST', '/reports', { token: r1.token, body: { targetType: 'post', targetId: post.id, reason: 'spam' } })).status).toBe(201);
      let [row] = await d.select({ isHidden: postsT.isHidden }).from(postsT).where(eq(postsT.id, post.id));
      expect(row!.isHidden).toBe(false); // 1 trusted + 1 untrusted < threshold 2

      // Second trusted reporter crosses the threshold → auto-hidden pending review.
      expect((await call('POST', '/reports', { token: r2.token, body: { targetType: 'post', targetId: post.id, reason: 'spam' } })).status).toBe(201);
      [row] = await d.select({ isHidden: postsT.isHidden }).from(postsT).where(eq(postsT.id, post.id));
      expect(row!.isHidden).toBe(true);
    } finally {
      if (prev) await d.update(adminSettings).set(prev).where(eq(adminSettings.id, 'singleton')).catch(() => {});
      await pool.end();
      await post.cleanup();
    }
  });
});

describe('hidden post — comments are gated like the post', () => {
  it('a moderator-hidden post returns 451 for its comments too (author still allowed)', async () => {
    const author = await makeUser('hcauthor'); created.push(author.id);
    const reader = await makeUser('hcreader'); created.push(reader.id);
    const post = await makePost(author.id);
    const { db: d, pool } = db();
    const { posts: postsT } = await import('../src/db/schema');
    try {
      // Visible post: comments list publicly.
      expect((await call('GET', `/posts/${post.id}/comments`)).status).toBe(200);

      await d.update(postsT).set({ isHidden: true }).where(eq(postsT.id, post.id));

      // Hidden: the body is already withheld (451 on the post routes) — the
      // discussion must not stay readable through the comments endpoint.
      expect((await call('GET', `/posts/${post.id}/comments`)).status).toBe(451);
      expect((await call('GET', `/posts/${post.id}/comments`, { token: reader.token })).status).toBe(451);
      // The author (like the post routes) can still load their own thread.
      expect((await call('GET', `/posts/${post.id}/comments`, { token: author.token })).status).toBe(200);
    } finally {
      await pool.end();
      await post.cleanup();
    }
  });
});
