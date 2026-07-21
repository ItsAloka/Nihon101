import type { APIRoute } from 'astro';
import { ssrFetch } from '../lib/ssr';

/* Dynamic bilingual sitemap — static pages, live categories, and every published
 * post, in BOTH locales with hreflang alternates (the xhtml:link form Google
 * documents for multilingual sites). SSR (not prerendered) so a fresh post shows
 * up without a rebuild. Submit https://nihon101.com/sitemap.xml in Google Search
 * Console / Bing once the domain is live. */
export const prerender = false;

const API_URL = import.meta.env.DEV ? 'http://localhost:8787' : 'https://api.nihon101.com';
const LOCALES = ['ja', 'en'] as const;
const STATIC_PATHS = ['', 'trending', 'search', 'about', 'contact', 'privacy'];

const xmlEscape = (s: string): string =>
  s.replace(/[<>&'"]/g, (ch) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[ch]!));

interface Entry { path: (loc: string) => string; lastmod?: string; changefreq: string; priority: string }

export const GET: APIRoute = async ({ site }) => {
  const origin = (site ?? new URL('https://nihon101.com')).origin;
  const entries: Entry[] = [];

  for (const p of STATIC_PATHS) {
    entries.push({
      path: (loc) => (p === '' ? `/${loc}/` : `/${loc}/${p}`),
      changefreq: 'daily',
      priority: p === '' ? '1.0' : '0.6',
    });
  }

  // Categories (bounded server-side; shared content)
  try {
    const res = await ssrFetch(`${API_URL}/categories`);
    if (res.ok) {
      const { categories } = await res.json();
      for (const cat of categories ?? []) {
        entries.push({ path: (loc) => `/${loc}/c/${cat.id}`, changefreq: 'daily', priority: '0.7' });
      }
    }
  } catch { /* API down — omit categories */ }

  // Published posts (page-paginated cards; hard page cap so a huge DB can't hang
  // the request — 50 pages × 60 = 3,000 newest posts, refreshed on every fetch).
  // Fetched in parallel batches: 50 sequential 8s-timeout calls could add up to
  // 400 s on a bad day, and a sitemap that times out is a sitemap Google drops.
  const BATCH = 5;
  const authorHandles = new Set<string>();
  try {
    let page = 0;
    outer: while (page < 50) {
      const batch = await Promise.all(
        Array.from({ length: Math.min(BATCH, 50 - page) }, (_, i) =>
          ssrFetch(`${API_URL}/posts?status=published&limit=60&page=${page + i}`, {}, 8000)
            .then((r) => (r.ok ? r.json() : null))
            .catch(() => null)),
      );
      for (const data of batch) {
        if (!data) break outer;
        for (const post of data.posts ?? []) {
          if (!post.slug) continue;
          if (post.authorHandle) authorHandles.add(post.authorHandle);
          entries.push({
            path: (loc) => `/${loc}/p/${post.slug}`,
            lastmod: post.updatedAt ? new Date(post.updatedAt).toISOString() : undefined,
            changefreq: 'weekly',
            priority: '0.8',
          });
        }
        if (!data.hasMore) break outer;
      }
      page += BATCH;
    }
  } catch { /* API down — omit posts */ }

  // Author profiles — real, crawlable landing pages on a multi-author platform,
  // and the only route by which an author's whole body of work is discoverable.
  for (const handle of authorHandles) {
    entries.push({ path: (loc) => `/${loc}/u/${handle}`, changefreq: 'weekly', priority: '0.5' });
  }

  // One <url> per locale per entry, each carrying hreflang links to BOTH locales
  // plus x-default. Google reads the set as incomplete without x-default, and on a
  // site where every URL exists twice that's the difference between "two locales of
  // one page" and "two pages competing with each other". ja is the site default.
  const urls: string[] = [];
  for (const e of entries) {
    const alt = [
      ...LOCALES.map((loc) => `    <xhtml:link rel="alternate" hreflang="${loc}" href="${xmlEscape(origin + e.path(loc))}"/>`),
      `    <xhtml:link rel="alternate" hreflang="x-default" href="${xmlEscape(origin + e.path('ja'))}"/>`,
    ].join('\n');
    for (const loc of LOCALES) {
      urls.push(
        `  <url>\n    <loc>${xmlEscape(origin + e.path(loc))}</loc>\n${alt}\n` +
        (e.lastmod ? `    <lastmod>${e.lastmod}</lastmod>\n` : '') +
        `    <changefreq>${e.changefreq}</changefreq>\n    <priority>${e.priority}</priority>\n  </url>`,
      );
    }
  }

  const body =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n` +
    urls.join('\n') +
    `\n</urlset>\n`;

  return new Response(body, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
};
