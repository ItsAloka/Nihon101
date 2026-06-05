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

function base64url(buf: Uint8Array): string {
  let s = '';
  for (const b of buf) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
