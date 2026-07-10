/* SSR fetch helpers (ported from Not Bagel's post-launch hardening).
 *
 * The .astro pages fetch the API server-side; two production failure modes live
 * in a bare fetch():
 *
 *  1. No timeout — a stalled API ties up the page render until the platform
 *     kills the whole request, turning one slow dependency into a site-wide
 *     hang. ssrFetch aborts at `timeoutMs`; every page's existing try/catch (or
 *     404 fallback) then degrades gracefully instead of hanging the reader.
 *
 *  2. No visitor IP — without forwarding, the backend's per-IP rate limiter
 *     sees every SSR request as ONE caller (the frontend Worker) and could
 *     throttle all visitors collectively. fwdIp forwards the real client
 *     address (the standard cf-connecting-ip / X-Forwarded-For pattern), so
 *     the limiter keys by the actual person, same as browser-direct calls. */

/** Build forwarding headers for an SSR API fetch. Pass the `Astro` global (or an
 * API-route context). Reads `clientAddress` defensively — the @astrojs/cloudflare
 * adapter THROWS on it in local dev (workerd has no client socket info), which
 * 500'd every SSR page — and falls back to the incoming request's own
 * cf-connecting-ip / x-forwarded-for, which is what Cloudflare sets in prod. */
export function fwdIp(astro: { clientAddress?: string; request?: Request }): Record<string, string> {
  let ip: string | undefined;
  try { ip = astro.clientAddress; } catch { /* adapter dev runtime: not supported */ }
  if (!ip && astro.request) {
    ip = astro.request.headers.get('cf-connecting-ip')
      ?? astro.request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
      ?? undefined;
  }
  if (!ip) return {};
  return { 'cf-connecting-ip': ip, 'x-forwarded-for': ip };
}

/** fetch() for SSR with a hard timeout (default 5s). A timeout (or network
 * failure) resolves to a synthetic 504 Response instead of throwing, so every
 * page's existing `!res.ok` fallback handles it — no page ever hangs on a
 * stalled API, and none needs its own try/catch around the fetch. */
export async function ssrFetch(url: string | URL, init: RequestInit = {}, timeoutMs = 5000): Promise<Response> {
  try {
    return await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
  } catch {
    return new Response(null, { status: 504, statusText: 'ssr_fetch_timeout' });
  }
}
