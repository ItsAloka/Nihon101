/* Unsubscribe tokens for the Sunday Letter. The link in every newsletter carries
 * `<subscriberId>.<hmac>` so a recipient can opt out with no login and no DB token
 * table. The id alone is opaque (nanoid21) but we still HMAC it with REFRESH_PEPPER
 * so a leaked/guessed id can't be used to unsubscribe someone else — only a link we
 * actually signed verifies. Stateless, constant work, no schema change. */

const enc = new TextEncoder();

async function hmac(secret: string, msg: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(msg));
  return b64url(new Uint8Array(sig));
}

function b64url(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Constant-time string compare so token verification can't be timed. */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** `<id>.<hmac(id)>` — the value placed in the unsubscribe link. */
export async function signUnsub(secret: string, id: string): Promise<string> {
  return `${id}.${await hmac(secret, id)}`;
}

/** Return the subscriber id iff the token is intact, else null. */
export async function verifyUnsub(secret: string, token: string): Promise<string | null> {
  const dot = token.lastIndexOf('.');
  if (dot <= 0) return null;
  const id = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = await hmac(secret, id);
  return timingSafeEqual(sig, expected) ? id : null;
}
