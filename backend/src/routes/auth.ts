import { Hono } from 'hono';
import { eq, and, isNull, ne } from 'drizzle-orm';
import { getDb } from '../db/client';
import bcrypt from 'bcryptjs';
import type { AppEnv } from '../types';
import { users, refreshTokens, passwordResets, googleLinks } from '../db/schema';
import { id } from '../lib/ids';
import { randomToken, hashToken } from '../lib/crypto';
import { signAccess } from '../lib/tokens';
import { clearRefreshCookie, readRefreshCookie } from '../lib/cookies';
import { sendEmail, resetEmailHtml } from '../lib/mail';
import { requireAuth } from '../middleware/requireAuth';
import { limits } from '../middleware/rateLimit';
import { startSession, revokeFamily } from '../lib/session';
import { uniqueHandle, handleTaken, HANDLE_RE } from '../db/queries/users';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const auth = new Hono<AppEnv>();

const db = (c: any) => getDb(c);
const now = () => Date.now();

type PublicUser = {
  id: string; email: string; displayName: string; displayNameJa: string; role: string;
  handle: string; bio: string; bioJa: string; location: string; avatarUrl: string | null;
};
const publicUser = (u: any): PublicUser => ({
  id: u.id,
  email: u.email,
  displayName: u.displayName,
  displayNameJa: u.displayNameJa,
  role: u.role,
  handle: u.handle,
  bio: u.bio,
  bioJa: u.bioJa,
  location: u.location,
  avatarUrl: u.avatarUrl,
});

/** Ban gate, self-healing. Permanent (bannedUntil null) or still-in-window →
 *  blocked. An expired timed ban auto-lifts (clears the mirrored user-row flag) so
 *  the next auth succeeds without an admin action. Called on login + refresh, so a
 *  ban issued mid-session ends it within one 15-min access-token cycle. */
async function enforceBan(c: any, u: any): Promise<{ banned: boolean; until: number | null }> {
  if (!u.isBanned) return { banned: false, until: null };
  if (u.bannedUntil == null || u.bannedUntil > now()) return { banned: true, until: u.bannedUntil ?? null };
  await db(c).update(users).set({ isBanned: false, bannedUntil: null, updatedAt: now() }).where(eq(users.id, u.id));
  return { banned: false, until: null };
}

// ---------------------------------------------------------------- register
auth.post('/register', limits.register, async (c) => {
  const { email, password, displayName } = await c.req.json().catch(() => ({}));
  const mail = String(email ?? '').trim().toLowerCase();
  const name = String(displayName ?? '').trim();

  if (!EMAIL_RE.test(mail)) return c.json({ error: 'invalid_email' }, 400);
  if (String(password ?? '').length < 8) return c.json({ error: 'weak_password' }, 400);

  const [existing] = await db(c).select().from(users).where(eq(users.email, mail));
  if (existing) return c.json({ error: 'email_taken' }, 409);

  const userId = id('usr');
  const display = name || mail.split('@')[0];
  await db(c).insert(users).values({
    id: userId,
    email: mail,
    passwordHash: await bcrypt.hash(password, 10),
    displayName: display,
    handle: await uniqueHandle(db(c), display, userId.slice(-6)),
    role: 'user',
    emailVerified: false,
    createdAt: now(),
    updatedAt: now(),
  });

  const [u] = await db(c).select().from(users).where(eq(users.id, userId));
  await startSession(c, userId);
  const access = await signAccess(c.env.JWT_SECRET, u!);
  return c.json({ access, user: publicUser(u) }, 201);
});

// ------------------------------------------------------------------- login
auth.post('/login', limits.login, async (c) => {
  const { email, password } = await c.req.json().catch(() => ({}));
  const mail = String(email ?? '').trim().toLowerCase();

  const [u] = await db(c).select().from(users).where(eq(users.email, mail));
  // Constant-ish: still run a compare to blunt timing/user-enumeration.
  const ok = u?.passwordHash
    ? await bcrypt.compare(String(password ?? ''), u.passwordHash)
    : await bcrypt.compare('x', '$2a$10$invalidinvalidinvalidinvalidinvalidinvalidinv');
  if (!u || !ok) return c.json({ error: 'invalid_credentials' }, 401);

  const ban = await enforceBan(c, u);
  if (ban.banned) return c.json({ error: 'banned', bannedUntil: ban.until }, 403);

  await startSession(c, u.id);
  const access = await signAccess(c.env.JWT_SECRET, u);
  return c.json({ access, user: publicUser(u) });
});

// ----------------------------------------------------------------- refresh
auth.post('/refresh', limits.refresh, async (c) => {
  const raw = readRefreshCookie(c);
  if (!raw) return c.json({ error: 'no_session' }, 401);

  const tokenHash = await hashToken(raw, c.env.REFRESH_PEPPER);
  const [row] = await db(c)
    .select()
    .from(refreshTokens)
    .where(eq(refreshTokens.tokenHash, tokenHash));

  if (!row) {
    clearRefreshCookie(c);
    return c.json({ error: 'no_session' }, 401);
  }
  // Reuse of an already-rotated/revoked token => compromise. Burn the family.
  if (row.revokedAt || row.expiresAt < now()) {
    await revokeFamily(c, row.familyId);
    clearRefreshCookie(c);
    return c.json({ error: 'session_expired' }, 401);
  }

  const [u] = await db(c).select().from(users).where(eq(users.id, row.userId));
  if (!u) {
    clearRefreshCookie(c);
    return c.json({ error: 'no_session' }, 401);
  }

  // A ban issued mid-session ends it here: burn the family so the refresh token
  // can't be reused, and force the cookie clear.
  const ban = await enforceBan(c, u);
  if (ban.banned) {
    await revokeFamily(c, row.familyId);
    clearRefreshCookie(c);
    return c.json({ error: 'banned', bannedUntil: ban.until }, 403);
  }

  // Rotate: new token in same family, old marked replaced + revoked.
  const newId = await startSession(c, u.id, row.familyId);
  await db(c)
    .update(refreshTokens)
    .set({ revokedAt: now(), replacedBy: newId })
    .where(eq(refreshTokens.id, row.id));

  const access = await signAccess(c.env.JWT_SECRET, u);
  return c.json({ access, user: publicUser(u) });
});

// ------------------------------------------------------------------ logout
auth.post('/logout', async (c) => {
  const raw = readRefreshCookie(c);
  if (raw) {
    const tokenHash = await hashToken(raw, c.env.REFRESH_PEPPER);
    const [row] = await db(c)
      .select()
      .from(refreshTokens)
      .where(eq(refreshTokens.tokenHash, tokenHash));
    if (row) await revokeFamily(c, row.familyId);
  }
  clearRefreshCookie(c);
  return c.json({ ok: true });
});

// ---------------------------------------------------------------------- me
auth.get('/me', requireAuth, async (c) => {
  const sess = c.get('user')!;
  const [u] = await db(c).select().from(users).where(eq(users.id, sess.id));
  if (!u) return c.json({ error: 'unauthorized' }, 401);
  const [g] = await db(c).select().from(googleLinks).where(eq(googleLinks.userId, u.id));
  return c.json({
    user: publicUser(u),
    hasPassword: !!u.passwordHash,
    google: g ? { linked: true, email: g.email } : { linked: false, email: null },
  });
});

// -------------------------------------------------------- update profile
auth.patch('/me', requireAuth, limits.profile, async (c) => {
  const sess = c.get('user')!;
  const body = await c.req.json().catch(() => ({}));
  const set: Record<string, unknown> = {};

  if (body.displayName !== undefined) {
    const name = String(body.displayName ?? '').trim();
    if (name.length < 1 || name.length > 50) return c.json({ error: 'invalid_name' }, 400);
    set.displayName = name;
  }
  if (body.handle !== undefined) {
    const handle = String(body.handle ?? '').trim().toLowerCase();
    if (!HANDLE_RE.test(handle)) return c.json({ error: 'invalid_handle' }, 400);
    if (await handleTaken(db(c), handle, sess.id)) return c.json({ error: 'handle_taken' }, 409);
    set.handle = handle;
  }
  if (body.displayNameJa !== undefined) {
    const nameJa = String(body.displayNameJa ?? '').trim();
    if (nameJa.length > 50) return c.json({ error: 'invalid_name' }, 400);
    set.displayNameJa = nameJa; // '' = fall back to EN
  }
  if (body.bio !== undefined) {
    const bio = String(body.bio ?? '').trim();
    if (bio.length > 300) return c.json({ error: 'bio_too_long' }, 400);
    set.bio = bio;
  }
  if (body.bioJa !== undefined) {
    const bioJa = String(body.bioJa ?? '').trim();
    if (bioJa.length > 300) return c.json({ error: 'bio_too_long' }, 400);
    set.bioJa = bioJa;
  }
  if (body.location !== undefined) {
    const location = String(body.location ?? '').trim();
    if (location.length > 60) return c.json({ error: 'location_too_long' }, 400);
    set.location = location;
  }
  if (body.avatarUrl !== undefined) {
    const avatarUrl = body.avatarUrl === null ? null : String(body.avatarUrl);
    // Only our own /media URLs (or clearing) — no hotlinking arbitrary origins.
    if (avatarUrl !== null && !/^https?:\/\/[^/]+\/media\/[\w-]+\/[\w.-]+$/.test(avatarUrl))
      return c.json({ error: 'invalid_avatar' }, 400);
    set.avatarUrl = avatarUrl;
  }
  if (Object.keys(set).length === 0) return c.json({ error: 'nothing_to_update' }, 400);

  // Replacing (or clearing) the avatar orphans the old R2 object — delete it.
  if (body.avatarUrl !== undefined) {
    const [old] = await db(c).select({ avatarUrl: users.avatarUrl }).from(users).where(eq(users.id, sess.id));
    if (old?.avatarUrl && old.avatarUrl !== set.avatarUrl) {
      const key = old.avatarUrl.split('/media/')[1];
      // Only our own keys, and only this user's folder — never delete on a bad parse.
      if (key?.startsWith(`${sess.id}/`)) await c.env.MEDIA.delete(key).catch(() => {});
    }
  }

  await db(c).update(users).set({ ...set, updatedAt: now() }).where(eq(users.id, sess.id));
  const [u] = await db(c).select().from(users).where(eq(users.id, sess.id));
  return c.json({ user: publicUser(u) });
});

// ------------------------------------------------------- change password
auth.post('/change-password', requireAuth, limits.profile, async (c) => {
  const sess = c.get('user')!;
  const { current, password } = await c.req.json().catch(() => ({}));
  if (String(password ?? '').length < 8) return c.json({ error: 'weak_password' }, 400);

  const [u] = await db(c).select().from(users).where(eq(users.id, sess.id));
  if (!u) return c.json({ error: 'unauthorized' }, 401);
  // Google-only accounts have no password to verify against.
  if (!u.passwordHash) return c.json({ error: 'no_password' }, 400);
  if (!(await bcrypt.compare(String(current ?? ''), u.passwordHash))) {
    return c.json({ error: 'invalid_credentials' }, 401);
  }

  await db(c)
    .update(users)
    .set({ passwordHash: await bcrypt.hash(password, 10), updatedAt: now() })
    .where(eq(users.id, u.id));

  // Keep this session; log out every other one.
  const raw = readRefreshCookie(c);
  const currentFam = raw
    ? (await db(c).select().from(refreshTokens)
        .where(eq(refreshTokens.tokenHash, await hashToken(raw, c.env.REFRESH_PEPPER))))[0]?.familyId
    : undefined;
  await db(c)
    .update(refreshTokens)
    .set({ revokedAt: now() })
    .where(and(
      eq(refreshTokens.userId, u.id),
      isNull(refreshTokens.revokedAt),
      currentFam ? ne(refreshTokens.familyId, currentFam) : undefined,
    ));

  return c.json({ ok: true });
});

// -------------------------------------------------------- delete account
auth.delete('/me', requireAuth, async (c) => {
  const sess = c.get('user')!;
  await db(c).delete(refreshTokens).where(eq(refreshTokens.userId, sess.id));
  await db(c).delete(passwordResets).where(eq(passwordResets.userId, sess.id));
  await db(c).delete(googleLinks).where(eq(googleLinks.userId, sess.id));
  await db(c).delete(users).where(eq(users.id, sess.id));
  clearRefreshCookie(c);
  return c.json({ ok: true });
});

// ------------------------------------------------------------------ forgot
auth.post('/forgot', limits.forgot, async (c) => {
  const { email, locale } = await c.req.json().catch(() => ({}));
  const mail = String(email ?? '').trim().toLowerCase();
  const loc: 'ja' | 'en' = locale === 'en' ? 'en' : 'ja';

  // Always 200 — never reveal whether the address exists.
  if (EMAIL_RE.test(mail)) {
    const [u] = await db(c).select().from(users).where(eq(users.email, mail));
    if (u) {
      const raw = randomToken();
      await db(c).insert(passwordResets).values({
        id: id('pr'),
        userId: u.id,
        tokenHash: await hashToken(raw, c.env.REFRESH_PEPPER),
        expiresAt: now() + 60 * 60 * 1000, // 1 hour
        usedAt: null,
        createdAt: now(),
      });
      const link = `${c.env.FRONTEND_ORIGIN}/${loc}/reset?token=${raw}`;
      const { subject, html } = resetEmailHtml(link, loc);
      await sendEmail({
        apiKey: c.env.RESEND_API_KEY,
        from: c.env.RESEND_FROM,
        to: mail,
        subject,
        html,
      });
    }
  }
  return c.json({ ok: true });
});

// ------------------------------------------------------------------- reset
auth.post('/reset', limits.reset, async (c) => {
  const { token, password } = await c.req.json().catch(() => ({}));
  if (String(password ?? '').length < 8) return c.json({ error: 'weak_password' }, 400);
  if (!token) return c.json({ error: 'invalid_token' }, 400);

  const tokenHash = await hashToken(String(token), c.env.REFRESH_PEPPER);
  const [pr] = await db(c)
    .select()
    .from(passwordResets)
    .where(eq(passwordResets.tokenHash, tokenHash));

  if (!pr || pr.usedAt || pr.expiresAt < now()) {
    return c.json({ error: 'invalid_token' }, 400);
  }

  await db(c)
    .update(users)
    .set({ passwordHash: await bcrypt.hash(password, 10), updatedAt: now() })
    .where(eq(users.id, pr.userId));
  await db(c).update(passwordResets).set({ usedAt: now() }).where(eq(passwordResets.id, pr.id));
  // Force re-login everywhere after a reset.
  await db(c)
    .update(refreshTokens)
    .set({ revokedAt: now() })
    .where(and(eq(refreshTokens.userId, pr.userId), isNull(refreshTokens.revokedAt)));

  return c.json({ ok: true });
});

export default auth;
