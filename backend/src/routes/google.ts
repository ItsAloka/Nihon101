import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import { setCookie, getCookie, deleteCookie } from 'hono/cookie';
import { getDb } from '../db/client';
import type { AppEnv } from '../types';
import { users, googleLinks } from '../db/schema';
import { id } from '../lib/ids';
import { randomToken } from '../lib/crypto';
import { startSession } from '../lib/session';
import { uniqueHandle } from '../db/queries/users';

const google = new Hono<AppEnv>();
const STATE_COOKIE = 'n101_oauth';
const now = () => Date.now();

// 1) Kick off: stash a CSRF nonce, bounce the user to Google's consent screen.
google.get('/start', (c) => {
  const locale = c.req.query('locale') === 'en' ? 'en' : 'ja';
  const nonce = randomToken(16);

  // Lax so the cookie survives Google's top-level GET redirect back to us.
  setCookie(c, STATE_COOKIE, nonce, {
    httpOnly: true,
    secure: true,
    sameSite: 'Lax',
    path: '/auth/google',
    maxAge: 600,
  });

  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.searchParams.set('client_id', c.env.GOOGLE_CLIENT_ID);
  url.searchParams.set('redirect_uri', c.env.GOOGLE_REDIRECT_URI);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', 'openid email profile');
  url.searchParams.set('state', `${nonce}.${locale}`);
  url.searchParams.set('prompt', 'select_account');
  return c.redirect(url.toString());
});

// 2) Callback: verify state, exchange code, upsert the user, start a session,
//    then redirect to the frontend (which silently refreshes into a session).
google.get('/callback', async (c) => {
  const code = c.req.query('code');
  const state = c.req.query('state') ?? '';
  const [nonce, localeRaw] = state.split('.');
  const locale = localeRaw === 'en' ? 'en' : 'ja';
  const home = `${c.env.FRONTEND_ORIGIN}/${locale}/`;

  const saved = getCookie(c, STATE_COOKIE);
  deleteCookie(c, STATE_COOKIE, { path: '/auth/google' });
  if (!code || !nonce || !saved || saved !== nonce) {
    return c.redirect(`${c.env.FRONTEND_ORIGIN}/${locale}/login?error=google`);
  }

  // Exchange the auth code for tokens.
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: c.env.GOOGLE_CLIENT_ID,
      client_secret: c.env.GOOGLE_CLIENT_SECRET,
      redirect_uri: c.env.GOOGLE_REDIRECT_URI,
      grant_type: 'authorization_code',
    }),
  });
  if (!tokenRes.ok) {
    console.error('[google] token exchange failed', tokenRes.status, await tokenRes.text());
    return c.redirect(`${c.env.FRONTEND_ORIGIN}/${locale}/login?error=google`);
  }
  const { id_token } = (await tokenRes.json()) as { id_token?: string };
  const claims = id_token ? decodeJwt(id_token) : null;
  if (!claims?.sub || !claims.email) {
    return c.redirect(`${c.env.FRONTEND_ORIGIN}/${locale}/login?error=google`);
  }

  const db = getDb(c);
  const sub = String(claims.sub);
  const email = String(claims.email).toLowerCase();
  const name = String(claims.name ?? email.split('@')[0]);

  // a) already linked? -> that user.  b) email exists? -> link it.  c) else create.
  let userId: string;
  const [link] = await db.select().from(googleLinks).where(eq(googleLinks.googleSub, sub));
  if (link) {
    userId = link.userId;
  } else {
    const [existing] = await db.select().from(users).where(eq(users.email, email));
    if (existing) {
      userId = existing.id;
    } else {
      userId = id('usr');
      await db.insert(users).values({
        id: userId,
        email,
        passwordHash: null,
        displayName: name,
        handle: await uniqueHandle(db, name, userId.slice(-6)),
        role: 'user',
        emailVerified: true, // Google already verified it
        createdAt: now(),
        updatedAt: now(),
      });
    }
    await db.insert(googleLinks).values({
      id: id('gl'),
      userId,
      googleSub: sub,
      email,
      createdAt: now(),
    });
  }

  await startSession(c, userId);
  return c.redirect(home);
});

/** Decode (not verify) a JWT payload. The id_token came straight from Google's
 *  token endpoint over TLS, so we trust the channel rather than re-verifying. */
function decodeJwt(jwt: string): Record<string, unknown> | null {
  try {
    const payload = jwt.split('.')[1];
    const json = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
    return JSON.parse(decodeURIComponent(escape(json)));
  } catch {
    return null;
  }
}

export default google;
