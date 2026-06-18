/* Outbound HTTP helpers for the third-party calls (OpenAI, Resend, Open-Meteo).
 * Every external fetch MUST have a timeout — a hung upstream otherwise ties up the
 * caller (a background/cron task here) until the Worker's wall-clock limit. Optional
 * retry-with-backoff rides over a transient blip so a one-off 5xx/network error
 * doesn't silently drop a translation or email. */

export interface FetchOpts extends RequestInit {
  timeoutMs?: number;   // abort the request after this long (default 10s)
  retries?: number;     // extra attempts on network error / 5xx / 429 (default 0)
  retryBaseMs?: number; // backoff base, doubled per attempt with jitter (default 300)
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** fetch() with a hard timeout and optional backoff retry. Throws on exhaustion. */
export async function fetchWithTimeout(url: string, opts: FetchOpts = {}): Promise<Response> {
  const { timeoutMs = 10_000, retries = 0, retryBaseMs = 300, ...init } = opts;
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
      // Retry transient upstream failures; return everything else (incl. 4xx) as-is.
      if (attempt < retries && (res.status >= 500 || res.status === 429)) {
        lastErr = new Error(`http_${res.status}`);
      } else {
        return res;
      }
    } catch (e) {
      lastErr = e; // timeout (TimeoutError) or network error
      if (attempt >= retries) break;
    }
    await sleep(retryBaseMs * 2 ** attempt + Math.random() * retryBaseMs);
  }
  throw lastErr instanceof Error ? lastErr : new Error('fetch_failed');
}
