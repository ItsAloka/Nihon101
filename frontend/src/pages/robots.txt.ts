import type { APIRoute } from 'astro';

/* robots.txt — allow everything public, hide the session-gated/thin pages, and
 * point crawlers at the sitemap. Cloudflare's managed AI-crawler block section is
 * prepended automatically at the edge; this is the origin half it merges with. */
export const prerender = false;

const PRIVATE = ['app', 'write', 'settings', 'me', 'saved', 'admin', 'reset', 'verify-email'];

export const GET: APIRoute = ({ site }) => {
  const origin = (site ?? new URL('https://nihon101.com')).origin;
  const body = [
    'User-agent: *',
    'Allow: /',
    // Session-gated SPA surfaces (also meta-noindexed via SpaLayout) + auth pages.
    ...PRIVATE.flatMap((p) => [`Disallow: /ja/${p}`, `Disallow: /en/${p}`]),
    '',
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
