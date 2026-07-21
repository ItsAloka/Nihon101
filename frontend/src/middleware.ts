import { defineMiddleware } from 'astro:middleware';

/* Page-level security headers for the SSR'd site (the JSON API sets its own,
 * stricter deny-all set). Applied to HTML document responses only — assets and
 * the proxied API JSON are left alone.
 *
 * CSP notes:
 *  • script-src 'self' 'unsafe-inline' — Astro inlines the island-hydration
 *    bootstrap; without a per-request nonce (awkward on this adapter) inline
 *    scripts must be allowed. Real XSS defence is sanitize-on-store on post
 *    bodies; CSP is the defence-in-depth layer (frame-ancestors/object-src are
 *    the free wins).
 *  • style-src 'unsafe-inline' — Astro + the inline <style> blocks emit inline CSS.
 *  • Google Fonts: stylesheet from fonts.googleapis.com, font files from gstatic.
 *  • frame-src youtube-nocookie — stored YouTube embeds in the reader.
 *  • img-src https: — post covers/avatars (R2 via the Worker), YT thumbnails, etc.
 *  • connect-src — the API origin (prod) + ws/wss for the Vite HMR socket (dev). */

// The backend the browser calls. Resolved with the SAME dev/prod rule the client
// uses (api.jsx / ui.jsx / the .astro pages): local dev is http://localhost:8787
// (which `https:` in img-src wouldn't cover), prod is https://api.nihon101.com. One
// expression, so connect-src/img-src can't drift from where the app actually fetches.
const API_ORIGIN = import.meta.env.DEV ? 'http://localhost:8787' : 'https://api.nihon101.com';

const CSP = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  // blob: is required for the in-browser avatar/crop preview (URL.createObjectURL
  // on the picked file, social.jsx) — without it the preview <img> never loads.
  // Not Bagel shipped without it and the crop modal rendered empty in prod.
  `img-src 'self' data: blob: https: ${API_ORIGIN}`,
  "font-src 'self' https://fonts.gstatic.com",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  // static.cloudflareinsights.com = Cloudflare Web Analytics beacon (auto-injected
  // when Web Analytics is enabled on the zone; harmless otherwise).
  "script-src 'self' 'unsafe-inline' https://static.cloudflareinsights.com",
  "frame-src https://www.youtube-nocookie.com https://www.youtube.com",
  // cloudflareinsights.com = where the Web Analytics beacon POSTs its data.
  `connect-src 'self' ${API_ORIGIN} https://cloudflareinsights.com ws: wss:`,
  "form-action 'self'",
].join('; ');

export const onRequest = defineMiddleware(async (context, next) => {
  // Canonical host: 301 www → apex, preserving path + query (best for SEO — one
  // canonical origin; the www custom domain in wrangler.deploy.jsonc routes here).
  if (context.url.hostname === 'www.nihon101.com') {
    const to = new URL(context.url);
    to.hostname = 'nihon101.com';
    return context.redirect(to.href, 301);
  }

  // Root → default locale. Handled here rather than in a page component so the
  // hop costs one edge response instead of booting Astro's renderer for a body
  // nobody reads — this redirect is on the critical path of every visitor who
  // types the bare domain (and of every PageSpeed/Search Console run).
  if (context.url.pathname === '/') {
    // Carry the query through: campaign traffic lands on the bare domain, and
    // dropping ?utm_* here would silently zero out the attribution for every ad,
    // newsletter and shared link that doesn't spell out the locale.
    return new Response(null, {
      status: 308,
      headers: { location: `/ja/${context.url.search}`, 'cache-control': 'public, max-age=3600' },
    });
  }

  const res = await next();
  if (!res.headers.get('content-type')?.includes('text/html')) return res;

  res.headers.set('Content-Security-Policy', CSP);
  res.headers.set('X-Content-Type-Options', 'nosniff');
  res.headers.set('X-Frame-Options', 'DENY');
  res.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.headers.set('Permissions-Policy', 'geolocation=(), microphone=(), camera=(), browsing-topics=()');
  res.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  return res;
});
