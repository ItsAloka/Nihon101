/* Server-side HTML sanitizer for post bodies. Allowlist-based, built on the `xss`
 * library (matches the sibling Not Bagel project so both repos share one engine).
 *
 * Post bodies are stored as HTML (TipTap output) and rendered raw into the SSR
 * reader (`set:html`) and the SPA reader (`dangerouslySetInnerHTML`). A logged-in
 * author can POST arbitrary HTML straight to the API, bypassing the editor — so
 * `<script>`, `onerror=`, `javascript:` URLs, or a hostile `<iframe>` would run in
 * every reader's browser (stored XSS). This runs at the WRITE chokepoint (create +
 * edit + background translation), so the DB only ever holds safe HTML and every
 * read path is safe automatically. Only known-good tags survive, only known-good
 * attributes per tag, URL schemes are checked, and `<iframe>` is kept ONLY for
 * YouTube embeds. */
import { FilterXSS, escapeAttrValue } from 'xss';

const SAFE_URL = /^(https?:\/\/|\/)/i;
const YT_EMBED = /^(?:https?:)?\/\/(www\.)?(youtube-nocookie\.com|youtube\.com)\/embed\/[\w-]{11}([/?#].*)?$/;

// Inline styles the composer serializes (figure width/float, img sizing, iframe box).
const SAFE_CSS = new Set([
  'width', 'max-width', 'height', 'float', 'display', 'border-radius', 'border',
  'margin', 'margin-left', 'margin-right', 'margin-top', 'margin-bottom', 'aspect-ratio',
  'text-align',
]);

// Full TipTap output: text formatting, lists, links, images, tables, figures,
// YouTube embeds. Anything not listed is stripped (tag dropped, text kept).
const whiteList: Record<string, string[]> = {
  p: ['class'], br: [], hr: [],
  h1: [], h2: [], h3: [], h4: [], h5: [], h6: [],
  strong: [], b: [], em: [], i: [], s: [], strike: [], u: [],
  mark: [], sub: [], sup: [], small: [],
  code: ['class'], pre: ['class'], kbd: [],
  blockquote: [],
  ul: [], ol: [], li: [],
  a: ['href', 'target', 'rel'],
  img: ['src', 'alt', 'style', 'loading', 'decoding'],
  figure: ['data-ri', 'style', 'class'],
  figcaption: [],
  span: ['style', 'class'],
  div: ['data-youtube-video', 'style', 'class'],
  iframe: ['src', 'width', 'height', 'title', 'style', 'allow', 'allowfullscreen', 'frameborder'],
  table: ['style'], caption: [], colgroup: [], col: ['style'],
  thead: [], tbody: [], tfoot: [],
  tr: [], th: ['colspan', 'rowspan', 'colwidth', 'align'], td: ['colspan', 'rowspan', 'colwidth', 'align'],
};

const filter = new FilterXSS({
  whiteList,
  stripIgnoreTag: true,        // drop unknown tags, keep their text
  stripIgnoreTagBody: ['script', 'style', 'noscript'], // drop these wholesale
  css: { whiteList: Object.fromEntries([...SAFE_CSS].map((p) => [p, true])) },
  onTagAttr(tag, name, value) {
    // URL-bearing attributes: http(s) or site-relative only (kills javascript:/data:).
    if ((tag === 'a' && name === 'href') || (tag === 'img' && name === 'src')) {
      return SAFE_URL.test(value.trim()) ? `${name}="${escapeAttrValue(value)}"` : '';
    }
    // iframes: YouTube embed URLs only.
    if (tag === 'iframe' && name === 'src') {
      return YT_EMBED.test(value.trim()) ? `${name}="${escapeAttrValue(value)}"` : '';
    }
    if (tag === 'a' && name === 'target') return 'target="_blank"';
    if (tag === 'a' && name === 'rel') return 'rel="noopener noreferrer nofollow ugc"';
    return undefined; // default handling (whitelist + css filter)
  },
});

/** Sanitize untrusted post-body HTML. Safe to call on already-clean HTML. Body
 *  images are lazy-loaded: a 50-image listicle must not block first paint, so every
 *  <img> without an explicit `loading` is forced to lazy + async-decode at write
 *  time (covers both the SSR and SPA read paths automatically). */
export function sanitizeHtml(input: string): string {
  if (!input) return '';
  return filter.process(input).replace(
    /<img\b(?![^>]*\bloading=)/gi,
    '<img loading="lazy" decoding="async"',
  );
}
