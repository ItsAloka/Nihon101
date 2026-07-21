import type { APIRoute } from 'astro';

/* robots.txt — allow everything public, hide the session-gated/thin pages, and
 * point crawlers at the sitemap. Cloudflare's managed AI-crawler block section is
 * prepended automatically at the edge; this is the origin half it merges with. */
export const prerender = false;

const PRIVATE = ['app', 'write', 'settings', 'me', 'saved', 'admin', 'reset', 'verify-email'];

/* AI training crawlers. This list used to come from Cloudflare's managed
 * robots.txt block, prepended at the edge — but that block also emits
 * `Content-Signal: search=yes,ai-train=no,use=reference`, which Google's parser
 * rejects as an unknown directive (Lighthouse: "robots.txt is not valid", the one
 * thing holding SEO at 92 in production, 2026-07-21). Owning the list here means
 * the managed block can be switched off without quietly opening the site to
 * scrapers. Search engines are NOT in this list — being indexed is the point;
 * what's refused is having the writing used as training data. */
const AI_CRAWLERS = [
  'Amazonbot', 'Applebot-Extended', 'Bytespider', 'CCBot', 'ClaudeBot',
  'CloudflareBrowserRenderingCrawler', 'Google-Extended', 'GPTBot',
  'meta-externalagent', 'PerplexityBot', 'Omgilibot', 'anthropic-ai', 'cohere-ai',
];

export const GET: APIRoute = ({ site }) => {
  const origin = (site ?? new URL('https://nihon101.com')).origin;
  const body = [
    'User-agent: *',
    'Allow: /',
    // Session-gated SPA surfaces (also meta-noindexed via SpaLayout) + auth pages.
    ...PRIVATE.flatMap((p) => [`Disallow: /ja/${p}`, `Disallow: /en/${p}`]),
    // Search RESULT pages: infinite, thin, and duplicates of content that already
    // has canonical URLs. /{loc}/search itself stays crawlable — it's the explore
    // landing page and it's in the sitemap; only the ?q= permutations are blocked.
    'Disallow: /ja/search?',
    'Disallow: /en/search?',
    '',
    ...AI_CRAWLERS.flatMap((ua) => [`User-agent: ${ua}`, 'Disallow: /', '']),
    `Sitemap: ${origin}/sitemap.xml`,
    '',
  ].join('\n');
  return new Response(body, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
};
