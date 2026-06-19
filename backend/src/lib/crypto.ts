// Opaque-token helpers built on Web Crypto (available in Workers).

/** Random URL-safe token, default 32 bytes of entropy. */
export function randomToken(bytes = 32): string {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  return base64url(buf);
}

/** sha256(token + pepper) as lowercase hex — what we store, never the raw token. */
export async function hashToken(token: string, pepper: string): Promise<string> {
  const data = new TextEncoder().encode(token + pepper);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Cryptographically-random N-digit numeric code (default 6), zero-padded.
 *  Rejection-sampled so every value is uniform (no modulo bias). */
export function randomDigits(n = 6): string {
  const max = 10 ** n;
  const buf = new Uint32Array(1);
  let v: number;
  do { crypto.getRandomValues(buf); v = buf[0]!; } while (v >= Math.floor(0xffffffff / max) * max);
  return String(v % max).padStart(n, '0');
}

function base64url(buf: Uint8Array): string {
  let s = '';
  for (const b of buf) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
