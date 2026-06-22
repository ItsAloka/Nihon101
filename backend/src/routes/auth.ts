import { Hono } from 'hono';
import { z } from 'zod';
import { eq, and, isNull, ne, desc } from 'drizzle-orm';
import { getDb } from '../db/client';
import bcrypt from 'bcryptjs';
import type { AppEnv } from '../types';
import { users, refreshTokens, passwordResets, googleLinks, emailVerifications, loginOtps, trustedDevices } from '../db/schema';
import { id } from '../lib/ids';
import { randomToken, randomDigits, hashToken } from '../lib/crypto';
import { signAccess, signOtpTicket, verifyOtpTicket } from '../lib/tokens';
import { clearRefreshCookie, readRefreshCookie, setTrustedDeviceCookie, readTrustedDeviceCookie } from '../lib/cookies';
import { sendEmail, resetEmailHtml, verifyEmailHtml, loginOtpHtml } from '../lib/mail';
import { requireAuth } from '../middleware/requireAuth';
import { limits } from '../middleware/rateLimit';
import { startSession, revokeFamily } from '../lib/session';
import { uniqueHandle, handleTaken, HANDLE_RE } from '../db/queries/users';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const auth = new Hono<AppEnv>();

/** Password policy, enforced server-side everywhere a password is set (register,
 *  change, reset). 8–72 chars (bcrypt silently truncates past 72 bytes, so a longer
 *  "password" would hash the same as its prefix — a real footgun). Strength: either
 *  a 12+ char passphrase, or 8+ chars spanning ≥2 character classes, so "12345678"
 *  and "aaaaaaaa" are rejected but real passwords aren't nagged. Returns true if ok. */
export function validPassword(pw: unknown): pw is string {
  const p = String(pw ?? '');
  if (p.length < 8 || p.length > 72) return false;
  if (p.length >= 12) return true;
  const classes = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^a-zA-Z0-9]/].filter((re) => re.test(p)).length;
  return classes >= 2;
}

/* ---------------- request validation (Zod) ----------------
 * Schemas mirror the previous hand-rolled checks exactly, so every error code and
 * status is preserved. Strict schemas 400 on bad shape, mapped back to the original
 * per-field code via `firstErr`. Lenient schemas (.catch) never 400 — they coerce to
 * safe defaults and let the handler's own logic (401/200) decide, matching the old
 * `String(x ?? '')` behavior. */
const FIELD_ERR: Record<string, string> = {
  email: 'invalid_email',
  password: 'weak_password',
  token: 'invalid_token',
};
function firstErr(e: z.ZodError): string {
  const f = e.issues[0]?.path[0];
  return (typeof f === 'string' && FIELD_ERR[f]) || 'invalid_body';
}

const registerSchema = z.object({
  email: z.string().trim().toLowerCase().regex(EMAIL_RE),
  password: z.string().refine(validPassword),
  displayName: z.string().trim().optional().default(''),
  locale: z.string().optional().catch(undefined),
});
const loginSchema = z.object({
  email: z.string().trim().toLowerCase().catch(''),
  password: z.string().catch(''),
  locale: z.string().optional().catch(undefined),
}).catch({ email: '', password: '' });
const verifyOtpSchema = z.object({
  pending: z.string().catch(''),
  code: z.string().catch(''),
  remember: z.boolean().catch(false),
}).catch({ pending: '', code: '', remember: false });
const resendOtpSchema = z.object({
  pending: z.string().catch(''),
  locale: z.string().optional().catch(undefined),
}).catch({ pending: '' });
const forgotSchema = z.object({
  email: z.string().trim().toLowerCase().catch(''),
  locale: z.string().optional().catch(undefined),
}).catch({ email: '' });
const resetSchema = z.object({
  password: z.string().refine(validPassword),
  token: z.string().min(1),
});
const verifyEmailSchema = z.object({
  token: z.string().min(1),
});
const changePasswordSchema = z.object({
  current: z.string().catch(''),
  password: z.string().refine(validPassword),
});

const db = (c: any) => getDb(c);
const now = () => Date.now();

type PublicUser = {
  id: string; email: string; displayName: string; displayNameJa: string; role: string;
  handle: string; bio: string; bioJa: string; location: string; avatarUrl: string | null;
  emailVerified: boolean;
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
  emailVerified: !!u.emailVerified,
});

/** Mint a fresh single-use verification token (one pending per user — old ones
 *  cleared) and store only its hash. Returns the verification URL to email. The DB
 *  writes are synchronous (on the request pool, still open); the slow/failure-prone
 *  email send is left to the caller to defer via waitUntil. */
async function createVerificationLink(c: any, userId: string, loc: 'ja' | 'en'): Promise<string> {
  await db(c).delete(emailVerifications).where(eq(emailVerifications.userId, userId));
  const raw = randomToken();
  await db(c).insert(emailVerifications).values({
    id: id('ev'),
    userId,
    tokenHash: await hashToken(raw, c.env.REFRESH_PEPPER),
    expiresAt: now() + 24 * 60 * 60 * 1000, // 24h
    usedAt: null,
    createdAt: now(),
  });
  return `${c.env.FRONTEND_ORIGIN}/${loc}/verify-email?token=${raw}`;
}

/** Fire the verification email in the background (no DB — just the network call), so
 *  a mail outage can't break register/resend. */
function emailVerification(c: any, to: string, link: string, loc: 'ja' | 'en'): void {
  const { subject, html } = verifyEmailHtml(link, loc);
  c.executionCtx.waitUntil(
    sendEmail({ apiKey: c.env.RESEND_API_KEY, from: c.env.RESEND_FROM, to, subject, html })
      .catch((e: unknown) => console.error('[verify] send failed', e)),
  );
}

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
  const parsed = registerSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ error: firstErr(parsed.error) }, 400);
  const { email: mail, password, displayName: name } = parsed.data;
  const loc: 'ja' | 'en' = parsed.data.locale === 'en' ? 'en' : 'ja';

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
  // Email verification — token written now, email sent in the background so signup
  // stays instant and a mail outage can't block account creation. The user is signed
  // in immediately; emailVerified flips once they click the link.
  const link = await createVerificationLink(c, userId, loc);
  emailVerification(c, mail, link, loc);
  await startSession(c, userId);
  const access = await signAccess(c.env.JWT_SECRET, u!);
  return c.json({ access, user: publicUser(u) }, 201);
});

// --------------------------------------------------- login OTP (2nd factor)
const OTP_TTL_MS = 10 * 60 * 1000;       // code lifetime
const OTP_MAX_ATTEMPTS = 5;              // wrong tries before the code is burned
const TRUSTED_TTL_MS = 30 * 24 * 60 * 60 * 1000; // "remember this device" 30 days

/** Issue a fresh login code (one pending per user — old ones cleared) and mail it.
 *  The DB write is synchronous on the request pool; the slow/failure-prone send is
 *  deferred so a mail outage can't break login (the user can resend). */
async function issueLoginOtp(c: any, u: any, loc: 'ja' | 'en'): Promise<void> {
  await db(c).delete(loginOtps).where(eq(loginOtps.userId, u.id));
  const code = randomDigits(6);
  await db(c).insert(loginOtps).values({
    id: id('otp'),
    userId: u.id,
    codeHash: await hashToken(code, c.env.REFRESH_PEPPER),
    attempts: 0,
    expiresAt: now() + OTP_TTL_MS,
    usedAt: null,
    createdAt: now(),
  });
  const { subject, html } = loginOtpHtml(code, loc);
  c.executionCtx.waitUntil(
    sendEmail({ apiKey: c.env.RESEND_API_KEY, from: c.env.RESEND_FROM, to: u.email, subject, html })
      .catch((e: unknown) => console.error('[otp] send failed', e)),
  );
}

/** True if this device carries a still-valid "remember me" token for the user. */
async function deviceTrusted(c: any, userId: string): Promise<boolean> {
  const raw = readTrustedDeviceCookie(c);
  if (!raw) return false;
  const tokenHash = await hashToken(raw, c.env.REFRESH_PEPPER);
  const [row] = await db(c).select().from(trustedDevices).where(eq(trustedDevices.tokenHash, tokenHash));
  return !!(row && row.userId === userId && row.expiresAt > now());
}

// ------------------------------------------------------------------- login
auth.post('/login', limits.login, async (c) => {
  const { email: mail, password, locale } = loginSchema.parse(await c.req.json().catch(() => ({})));
  const loc: 'ja' | 'en' = locale === 'en' ? 'en' : 'ja';

  const [u] = await db(c).select().from(users).where(eq(users.email, mail));
  // Constant-ish: still run a compare to blunt timing/user-enumeration.
  const ok = u?.passwordHash
    ? await bcrypt.compare(password, u.passwordHash)
    : await bcrypt.compare('x', '$2a$10$invalidinvalidinvalidinvalidinvalidinvalidinv');
  if (!u || !ok) return c.json({ error: 'invalid_credentials' }, 401);

  const ban = await enforceBan(c, u);
  if (ban.banned) return c.json({ error: 'banned', bannedUntil: ban.until }, 403);

  // Second factor for password logins: unless this device is already trusted,
  // mail a one-time code and hand back a short-lived ticket — no session yet.
  // (Google logins never reach here; that flow is its own strong factor.)
  if (!(await deviceTrusted(c, u.id))) {
    await issueLoginOtp(c, u, loc);
    const pending = await signOtpTicket(c.env.JWT_SECRET, u.id);
    return c.json({ otpRequired: true, pending });
  }

  await startSession(c, u.id);
  const access = await signAccess(c.env.JWT_SECRET, u);
  return c.json({ access, user: publicUser(u) });
});

// ---------------------------------------------------------- login verify-otp
auth.post('/login/verify-otp', limits.otpVerify, async (c) => {
  const { pending, code, remember } = verifyOtpSchema.parse(await c.req.json().catch(() => ({})));
  const userId = await verifyOtpTicket(c.env.JWT_SECRET, pending);
  if (!userId) return c.json({ error: 'otp_expired' }, 401);

  const [u] = await db(c).select().from(users).where(eq(users.id, userId));
  if (!u) return c.json({ error: 'otp_expired' }, 401);
  const ban = await enforceBan(c, u);
  if (ban.banned) return c.json({ error: 'banned', bannedUntil: ban.until }, 403);

  const [otp] = await db(c).select().from(loginOtps)
    .where(eq(loginOtps.userId, userId)).orderBy(desc(loginOtps.createdAt)).limit(1);
  if (!otp || otp.usedAt || otp.expiresAt < now()) return c.json({ error: 'otp_expired' }, 400);
  if (otp.attempts >= OTP_MAX_ATTEMPTS) {
    await db(c).delete(loginOtps).where(eq(loginOtps.id, otp.id));
    return c.json({ error: 'too_many_attempts' }, 429);
  }

  const match = (await hashToken(code, c.env.REFRESH_PEPPER)) === otp.codeHash;
  await db(c).update(loginOtps).set({ attempts: otp.attempts + 1 }).where(eq(loginOtps.id, otp.id));
  if (!match) return c.json({ error: 'invalid_code' }, 400);

  await db(c).update(loginOtps).set({ usedAt: now() }).where(eq(loginOtps.id, otp.id));

  // Remember this device → skip OTP for 30 days. Opaque token, only its hash stored.
  if (remember) {
    const raw = randomToken();
    await db(c).insert(trustedDevices).values({
      id: id('td'),
      userId,
      tokenHash: await hashToken(raw, c.env.REFRESH_PEPPER),
      userAgent: c.req.header('User-Agent') ?? null,
      expiresAt: now() + TRUSTED_TTL_MS,
      createdAt: now(),
    });
    setTrustedDeviceCookie(c, raw, TRUSTED_TTL_MS);
  }

  await startSession(c, userId);
  const access = await signAccess(c.env.JWT_SECRET, u);
  return c.json({ access, user: publicUser(u) });
});

// ---------------------------------------------------------- login resend-otp
auth.post('/login/resend-otp', limits.otpResend, async (c) => {
  const { pending, locale } = resendOtpSchema.parse(await c.req.json().catch(() => ({})));
  const userId = await verifyOtpTicket(c.env.JWT_SECRET, pending);
  if (!userId) return c.json({ error: 'otp_expired' }, 401);
  const [u] = await db(c).select().from(users).where(eq(users.id, userId));
  if (!u) return c.json({ error: 'otp_expired' }, 401);
  await issueLoginOtp(c, u, locale === 'en' ? 'en' : 'ja');
  return c.json({ ok: true });
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
  const parsed = changePasswordSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ error: firstErr(parsed.error) }, 400);
  const { current, password } = parsed.data;

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
  await db(c).delete(emailVerifications).where(eq(emailVerifications.userId, sess.id));
  await db(c).delete(googleLinks).where(eq(googleLinks.userId, sess.id));
  await db(c).delete(users).where(eq(users.id, sess.id));
  clearRefreshCookie(c);
  return c.json({ ok: true });
});

// ------------------------------------------------------------------ forgot
auth.post('/forgot', limits.forgot, async (c) => {
  const { email: mail, locale } = forgotSchema.parse(await c.req.json().catch(() => ({})));
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
  const parsed = resetSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ error: firstErr(parsed.error) }, 400);
  const { token, password } = parsed.data;

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
  // Force re-login everywhere after a reset, and drop every "remembered" device so
  // the next login on each must pass OTP again (a reset implies possible compromise).
  await db(c)
    .update(refreshTokens)
    .set({ revokedAt: now() })
    .where(and(eq(refreshTokens.userId, pr.userId), isNull(refreshTokens.revokedAt)));
  await db(c).delete(trustedDevices).where(eq(trustedDevices.userId, pr.userId));

  return c.json({ ok: true });
});

// ------------------------------------------------------- verify email (public)
auth.post('/verify-email', limits.reset, async (c) => {
  const parsed = verifyEmailSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ error: firstErr(parsed.error) }, 400);
  const { token } = parsed.data;
  const tokenHash = await hashToken(token, c.env.REFRESH_PEPPER);
  const [ev] = await db(c).select().from(emailVerifications).where(eq(emailVerifications.tokenHash, tokenHash));
  if (!ev || ev.usedAt || ev.expiresAt < now()) return c.json({ error: 'invalid_token' }, 400);

  await db(c).update(users).set({ emailVerified: true, updatedAt: now() }).where(eq(users.id, ev.userId));
  await db(c).update(emailVerifications).set({ usedAt: now() }).where(eq(emailVerifications.id, ev.id));
  return c.json({ ok: true });
});

// ------------------------------------------------ resend verification (authed)
auth.post('/resend-verification', requireAuth, limits.forgot, async (c) => {
  const sess = c.get('user')!;
  const [u] = await db(c).select().from(users).where(eq(users.id, sess.id));
  if (!u) return c.json({ error: 'not_found' }, 404);
  if (u.emailVerified) return c.json({ ok: true, alreadyVerified: true });
  const loc: 'ja' | 'en' = (await c.req.json().catch(() => ({})))?.locale === 'en' ? 'en' : 'ja';
  const link = await createVerificationLink(c, u.id, loc);
  emailVerification(c, u.email, link, loc);
  return c.json({ ok: true });
});

export default auth;
