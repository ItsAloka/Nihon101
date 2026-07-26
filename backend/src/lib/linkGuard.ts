/* Piracy-link guard — blocks publishing content that links to known pirate
 * streaming / scan / scanlation sites (an AdSense account-level ban risk, and
 * against /terms). Matching is deliberately conservative: only the registrable
 * label of each linked hostname is compared (so `www.gogoanime.tv`, `bato.to`
 * hit, but `zoro.fandom.com` never false-positives on a subdomain). TLD-hopping
 * mirrors (`gogoanime.io` vs `.tv`) are caught because the TLD is ignored.
 * Adding a site = one lowercase name in BLOCKED. */

const BLOCKED = new Set([
  // anime streaming
  'gogoanime', '9anime', 'kissanime', 'aniwatch', 'aniwave', 'animepahe',
  'animixplay', 'hianime', 'animesuge', 'kayoanime', 'zoro', 'animeflix',
  'kickassanime', 'animeheaven', 'wcostream', 'kimcartoon',
  // manga / scanlation
  'mangadex', 'mangakakalot', 'manganato', 'manganelo', 'chapmanganato',
  'mangapark', 'mangafire', 'mangasee123', 'bato', 'batoto', 'mangabat',
  'kissmanga', 'mangafreak', 'mangareader', 'comick',
  // general piracy / torrents
  'nyaa', '1337x', 'thepiratebay', 'fmovies', 'soap2day', 'putlocker',
  // nsfw aggregators
  'nhentai', 'hentaihaven', 'hanime',
]);

// Bare URLs in visible text (comments are plain text; post bodies may carry
// pasted links outside <a> too).
const URL_RE = /https?:\/\/[^\s<>"')]+/gi;
// Sanitized HTML always serializes href in double quotes (see sanitize.ts).
const HREF_RE = /href="([^"]+)"/gi;

function registrableLabel(hostname: string): string {
  const labels = hostname.toLowerCase().split('.').filter(Boolean);
  return labels.length >= 2 ? labels[labels.length - 2] : (labels[0] ?? '');
}

function isBlockedUrl(raw: string): boolean {
  try {
    return BLOCKED.has(registrableLabel(new URL(raw).hostname));
  } catch {
    return false; // relative or malformed — not an external link, not our problem
  }
}

/** First blocked URL found in plain text (bare URLs), or null. */
export function findBlockedLink(text: string): string | null {
  if (!text) return null;
  for (const m of text.matchAll(URL_RE)) if (isBlockedUrl(m[0])) return m[0];
  return null;
}

/** First blocked URL in sanitized HTML — checks hrefs AND bare text URLs. */
export function findBlockedLinkHtml(html: string): string | null {
  if (!html) return null;
  for (const m of html.matchAll(HREF_RE)) if (isBlockedUrl(m[1])) return m[1];
  return findBlockedLink(html);
}
