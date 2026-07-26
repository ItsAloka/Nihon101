/* Cloudflare Turnstile server-side verification (bot gate on signup). The
 * widget on the register form produces a one-time token; we confirm it with
 * Cloudflare before creating the account. Fail-closed WHEN configured: any
 * network error or bad token rejects. Not configured (no secret) = skipped,
 * so local dev and tests never need Turnstile. */

export async function verifyTurnstile(secret: string, token: string, remoteIp?: string): Promise<boolean> {
  if (!token) return false;
  try {
    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ secret, response: token, ...(remoteIp ? { remoteip: remoteIp } : {}) }),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return false;
    const data = (await res.json()) as { success?: boolean };
    return data.success === true;
  } catch {
    return false;
  }
}
