/* Responsive covers.
 *
 * Every cover is stored at up to 2000px wide, and until now every surface served
 * that same file into a 342×240 card — Lighthouse measured 118 KB wasted on the
 * home page and 2.1 s of download inside the LCP. The backend's GET /media/:key
 * takes `?w=` from a fixed allowlist (backend/src/routes/media.ts) and returns a
 * resized WebP, so all we need here is the srcset/sizes to let the browser pick.
 *
 * Only our own media URLs get a srcset: an author can paste a remote image URL,
 * and `?w=` on someone else's host is at best ignored and at worst a cache-buster. */

/** Must stay in sync with WIDTHS in backend/src/routes/media.ts. */
const WIDTHS = [320, 480, 640, 960, 1280];

// Host must BE nihon101.com or a subdomain of it — `[^/]*nihon101\.com` would
// also match `evil-nihon101.com`, and we'd hang ?w= off a stranger's URL.
const isOwnMedia = (url: string): boolean =>
  /^https?:\/\/([a-z0-9-]+\.)*nihon101\.com\/media\//i.test(url) ||
  /^https?:\/\/localhost:8787\/media\//.test(url) ||
  url.startsWith('/media/');

/** `srcset` for a stored cover, or undefined when the URL isn't ours to resize. */
export function coverSrcset(url: string | null | undefined): string | undefined {
  if (!url || !isOwnMedia(url)) return undefined;
  const sep = url.includes('?') ? '&' : '?';
  return WIDTHS.map((w) => `${url}${sep}w=${w} ${w}w`).join(', ');
}

/** A mid-range width as the `src`, so a no-srcset client doesn't get the 2000px original. */
export function coverSrc(url: string, fallbackWidth = 960): string {
  if (!isOwnMedia(url)) return url;
  return `${url}${url.includes('?') ? '&' : '?'}w=${fallbackWidth}`;
}

/* `sizes` per surface — how wide the image actually paints, so the browser can
 * choose before layout exists. Breakpoints mirror the grid rules in Shell.astro. */
export const SIZES = {
  /** Home hero: half of the 1320px wrap on desktop, full-bleed under 820px. */
  hero: '(max-width: 820px) 100vw, 660px',
  /** Home secondary feature: ~2/3 of the wrap. */
  feature: '(max-width: 820px) 100vw, 760px',
  /** 3-up card grid → 2-up ≤1024 → 1-up ≤640. */
  card: '(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 420px',
  /** Article reader: the body column. */
  article: '(max-width: 820px) 100vw, 840px',
} as const;
