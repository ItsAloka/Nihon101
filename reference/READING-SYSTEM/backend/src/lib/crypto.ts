/* HS256 JWT + hashing via Web Crypto (Workers-native). */

const enc = new TextEncoder();

function b64urlEncode(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlDecode(str: string): Uint8Array {
  const pad = str.length % 4 ? 4 - (str.length % 4) : 0;
  const b64 = str.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat(pad);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
}

export interface JwtClaims {
  sub: string;
  username: string;
  role: string;
}

/** Sign an access token. `ttlSec` defaults to 15 minutes. */
export async function signJwt(claims: JwtClaims, secret: string, ttlSec = 900): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'HS256', typ: 'JWT' };
  const payload = { ...claims, iat: now, exp: now + ttlSec };
  const head = b64urlEncode(enc.encode(JSON.stringify(header)));
  const body = b64urlEncode(enc.encode(JSON.stringify(payload)));
  const data = `${head}.${body}`;
  const sig = await crypto.subtle.sign('HMAC', await hmacKey(secret), enc.encode(data));
  return `${data}.${b64urlEncode(new Uint8Array(sig))}`;
}

/** Verify + decode an access token. Returns claims or null if invalid/expired. */
export async function verifyJwt(token: string, secret: string): Promise<JwtClaims | null> {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [head, body, sig] = parts;
  const valid = await crypto.subtle.verify(
    'HMAC',
    await hmacKey(secret),
    b64urlDecode(sig),
    enc.encode(`${head}.${body}`),
  );
  if (!valid) return null;
  try {
    const payload = JSON.parse(new TextDecoder().decode(b64urlDecode(body)));
    if (typeof payload.exp === 'number' && payload.exp < Math.floor(Date.now() / 1000)) return null;
    return { sub: payload.sub, username: payload.username, role: payload.role };
  } catch {
    return null;
  }
}

/** Hex SHA-256 of `input` — used for `sha256(token + pepper)` storage. */
export async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', enc.encode(input));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** A 32-byte opaque token as hex (the raw refresh token). */
export function randomTokenHex(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}
