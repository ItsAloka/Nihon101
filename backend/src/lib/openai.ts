/* ChatGPT-backed translation for the bilingual editor. Translation is stored,
 * not runtime — the author triggers this at edit time, reviews, then both
 * locales are saved and SSR'd. Casual, youthful register (this is a friendly
 * magazine, not a legal notice). HTML structure is preserved verbatim. */

import { fetchWithTimeout } from './http';

const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';
const MODEL = 'gpt-5.4-mini'; // successor of gpt-5-mini (delisted 2026); holds inline tags/tone far better — fewer check-retries

export type Locale = 'en' | 'ja';

export interface TranslateFields {
  title?: string;
  excerpt?: string;
  body?: string; // HTML
}

const LANG_NAME: Record<Locale, string> = { en: 'English', ja: 'Japanese' };

function systemPrompt(to: Locale): string {
  const tone = to === 'ja'
    ? 'Use natural, casual, friendly modern Japanese (カジュアルな話し言葉寄りの自然な日本語) — the voice of a youthful culture magazine, NOT stiff/formal 敬語-heavy translationese. Keep it warm and readable.'
    : 'Use natural, casual, friendly modern English — the voice of a youthful culture magazine, not stiff or literal.';
  // Chunks arrive with NO surrounding context (a chunk can be a lone <h2>), so
  // the rules must be explicit that fragments are still content — this is what
  // used to leave short headings untranslated on otherwise-complete pages.
  const loanwords = to === 'ja'
    ? `Japanese culture terms written in romaji in the source (kamon, sakura, onsen, ...) become the normal Japanese word (家紋, 桜, 温泉, ...).`
    : `Japanese culture terms (家紋, 桜, 温泉, ...) become their usual romaji form, with a brief English gloss on first natural opportunity (e.g. "kamon (family crests)").`;
  return [
    `You are a professional translator for a bilingual blog about Japan.`,
    `Translate the given fields into ${LANG_NAME[to]}.`,
    tone,
    `Translate EVERY piece of human-readable text — headings, section titles, list items, captions, and short standalone phrases included. You may receive a fragment with no surrounding context; it is still content: translate it, never return it unchanged because it is short or looks like a title.`,
    `The "body" field is HTML: keep every HTML tag, attribute value, URL, code snippet, hashtag, and @handle exactly as-is. Do not add, remove, or reorder tags; never split or merge paragraphs; keep inline formatting (<strong>, <em>, ...) around the corresponding translated words; always write tags with ASCII angle brackets < >, never full-width ＜ ＞.`,
    `Names of people, places, brands, and works are written the way ${LANG_NAME[to]} conventionally writes them (e.g. Kyoto ↔ 京都, Miyazaki ↔ 宮崎). ${loanwords}`,
    `Text already in ${LANG_NAME[to]} stays as it is — do not re-translate it.`,
    `Return ONLY a JSON object with the same keys you were given ("title", "excerpt", "body" — whichever were provided), each holding the translated string. No commentary.`,
  ].join(' ');
}

/** Translate the provided fields into `to`. Throws on a missing key or API error.
 * `extraNote` rides along as a second user message — used by the untranslated-
 * output retry to tell the model its first pass skipped content. */
export async function translateFields(
  apiKey: string,
  to: Locale,
  fields: TranslateFields,
  extraNote?: string,
): Promise<TranslateFields> {
  if (!apiKey) throw new Error('no_api_key');

  const payload = {
    model: MODEL,
    // GPT-5 reasoning models only accept the default temperature — don't set it.
    // Translation needs no chain-of-thought: 'none' (gpt-5.4's rename of the old
    // 'minimal') skips the reasoning tokens, which is what keeps full-post calls
    // finishing inside the 30s fetch timeout / Workers waitUntil window.
    reasoning_effort: 'none' as const,
    response_format: { type: 'json_object' as const },
    messages: [
      { role: 'system', content: systemPrompt(to) },
      { role: 'user', content: JSON.stringify(fields) },
      ...(extraNote ? [{ role: 'user', content: extraNote }] : []),
    ],
  };

  const res = await fetchWithTimeout(OPENAI_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify(payload),
    timeoutMs: 30_000, // LLM calls are slow; one retry over a transient 5xx/429
    retries: 1,
  });
  if (!res.ok) throw new Error(`openai_${res.status}`);

  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error('openai_empty');

  const parsed = JSON.parse(content) as TranslateFields;
  if (typeof parsed.body === 'string') parsed.body = fixFullWidthTags(parsed.body);
  return parsed;
}

/* ---- Whole-post translation (chunked, bounded-parallel) --------------------
 * One call for a full post body used to time out: gpt-5-mini emitting several
 * thousand output tokens takes well over the 30s fetch timeout. So the body is
 * split into standalone chunks of complete top-level blocks and the pieces
 * (title+excerpt, then each chunk) run through a small concurrency pool. The
 * cap matters more than speed: this runs inside the per-minute cron sweep
 * (15-min wall budget — a 100-chunk post at 4-wide ≈ 5-6 min fits fine), and a
 * bounded pool means a burst of queued posts can never fire enough simultaneous
 * OpenAI calls to trip rate limits. All-or-nothing: any failed piece rejects
 * the whole translation, so a half-translated body is never stored. */

// Void tags in sanitized TipTap output (see sanitizeHtml whitelist) — they
// never close, so they must not move the depth counter.
const VOID_TAGS = new Set(['img', 'br', 'hr', 'col']);

/** Split sanitized post HTML into chunks of ≤ maxLen chars, cutting ONLY on
 * top-level block boundaries so every chunk is valid standalone HTML (a `</p>`
 * inside a `<li>` never splits). A single oversized block stays whole.
 * Chunk size is a latency knob, not a cost one: the calls run in parallel, so
 * wall time ≈ the SLOWEST single chunk. 2000 chars ≈ 10-15s on gpt-5-mini —
 * measured 28.6s for a 4000-char chunk, which grazed the 30s waitUntil kill. */
export function splitHtmlBlocks(html: string, maxLen = 2000): string[] {
  const blocks: string[] = [];
  const tagRe = /<(\/?)([a-zA-Z][a-zA-Z0-9]*)(?:\s[^>]*)?>/g;
  let depth = 0;
  let start = 0;
  let m: RegExpExecArray | null;
  while ((m = tagRe.exec(html))) {
    const name = m[2].toLowerCase();
    if (!VOID_TAGS.has(name)) depth = Math.max(0, depth + (m[1] === '/' ? -1 : 1));
    if (depth === 0) {
      blocks.push(html.slice(start, m.index + m[0].length));
      start = m.index + m[0].length;
    }
  }
  if (start < html.length) blocks.push(html.slice(start));

  const chunks: string[] = [];
  let cur = '';
  for (const b of blocks) {
    if (cur && cur.length + b.length > maxLen) { chunks.push(cur); cur = ''; }
    cur += b;
  }
  if (cur.trim()) chunks.push(cur);
  return chunks.filter((c) => c.trim());
}

/* ---- Untranslated-output detection ------------------------------------------
 * The model sometimes returns a chunk with whole blocks still in the source
 * language ("text already in the target stays as it is" gives it an out, and
 * context-free fragments make it worse) — the exact bug that left English
 * sections in the middle of a Japanese page. The HTML comes back structurally
 * intact, so only a script check can catch it: Japanese output must carry
 * kana/kanji, English output must not be dominated by them. A flagged piece
 * gets ONE corrective retry, then the whole post fails — all-or-nothing, so the
 * queue's backoff/failed-chip semantics take over. Deliberately conservative:
 * tags, URLs, entities and <pre>/<code> content are ignored, and short Latin
 * runs (names, "photo: ..." credits) are tolerated. A false positive costs a
 * visible retry chip; a miss costs a silently half-English page — so when in
 * doubt this stays quiet. */

// 々 + hiragana/katakana (+ phonetic extensions) + CJK ideographs + half-width katakana.
const JA_SCRIPT_RE = /[々぀-ヿㇰ-ㇿ一-鿿ｦ-ﾟ]/g;
const LATIN_RE = /[A-Za-z]/g;

const OUTPUT_RETRY_NOTE =
  'IMPORTANT: a previous attempt was rejected. Two rules were violated: ' +
  '(1) translate EVERY heading, paragraph, list item, and caption into the target language — ' +
  'only URLs, code, proper names, and established loanwords may stay; ' +
  '(2) preserve the HTML markup EXACTLY — every tag that is in the input must be in the output, ' +
  'unchanged and with normal ASCII angle brackets: never drop, add, merge, or rewrite tags or attributes.';

/* When writing Japanese the model sometimes re-types HTML tags with FULL-WIDTH
 * brackets — ＜strong＞…＜/strong＞ (U+FF1C/FF1E) — which are not tags at all, so
 * the reader shows them as literal text (found live on the Shinto post,
 * 2026-07-12). Deterministic repair first: attribute-less formatting tags in
 * full-width brackets are converted back to real tags. Anything ASCII-tag-shaped
 * still left in full-width brackets afterwards fails the output check and gets
 * the retry → failed-chip path, same as an untranslated block. */
const FW_TAG_RE = /＜(\/?)(strong|b|em|i|s|strike|u|mark|sub|sup|small|code|kbd|p|br|hr|li|ul|ol|blockquote|h[1-6])＞/gi;

/** Repair full-width-bracket tags in translated HTML. */
export function fixFullWidthTags(html: string): string {
  return html.replace(FW_TAG_RE, (_, slash: string, name: string) => `<${slash}${name.toLowerCase()}>`);
}

/** True when output still contains something ASCII-tag-shaped in full-width
 * brackets (e.g. ＜div …＞). Japanese text in full-width brackets (＜注意＞) is
 * untouched — the pattern requires an ASCII letter after the bracket. */
export function hasFullWidthTagArtifact(html: string): boolean {
  return /＜\/?[a-zA-Z][^＜＞]*＞/.test(html);
}

/** Visible text of an HTML fragment minus everything that legitimately stays in
 * the source language: tags, URLs, entities, and <pre>/<code> content. */
function visibleText(html: string): string {
  return html
    .replace(/<(pre|code)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/&[a-zA-Z#0-9]+;/g, ' ');
}

/** True when plain text is clearly NOT written in `to`. `short` lowers the
 * evidence bar for one-liner fields (title/excerpt). */
export function textLooksUntranslated(text: string, to: Locale, short = false): boolean {
  const ja = (text.match(JA_SCRIPT_RE) ?? []).length;
  const latin = (text.match(LATIN_RE) ?? []).length;
  // Real Japanese prose always carries kana/kanji; substantial pure-Latin text is a skip.
  if (to === 'ja') return ja === 0 && latin >= (short ? 10 : 25);
  // English keeping a couple of Japanese terms (家紋, 初詣…) is fine — flag only
  // when Japanese script outweighs the Latin around it.
  return ja >= (short ? 4 : 15) && ja > latin;
}

/** True when any top-level block of a translated HTML fragment is still in the
 * source language — the shape of the "one section left in English" bug. */
export function htmlHasUntranslatedBlock(html: string, to: Locale): boolean {
  return splitHtmlBlocks(html, 1).some((b) => textLooksUntranslated(visibleText(b), to));
}

/** Open/close tag counts per name ("strong", "/strong", …). */
function tagCensus(html: string): Map<string, number> {
  const census = new Map<string, number>();
  // `\/?>` — self-closing style (<br/> vs <br>) is a spelling, not a structural
  // difference; both must land on the same census key (missed live, 2026-07-12).
  for (const t of html.matchAll(/<(\/?)([a-zA-Z][a-zA-Z0-9]*)(?:\s[^>]*)?\/?>/g)) {
    const key = t[1] + t[2].toLowerCase();
    census.set(key, (census.get(key) ?? 0) + 1);
  }
  return census;
}

/** First structural difference between source HTML and its translation, or
 * null when the markup survived intact. Translation must never add, drop, or
 * rewrite markup — bold silently disappearing (<strong> counts drifting) was a
 * live bug, 2026-07-12 — so open and close counts must match per tag name, and
 * image sources / link targets must be byte-identical. The reason string
 * ("tag_strong_7_vs_5") is for logs and the audit report. */
export function htmlStructureMismatch(src: string, out: string): string | null {
  const a = tagCensus(src);
  const b = tagCensus(out);
  for (const k of new Set([...a.keys(), ...b.keys()])) {
    if ((a.get(k) ?? 0) !== (b.get(k) ?? 0)) return `tag_${k}_${a.get(k) ?? 0}_vs_${b.get(k) ?? 0}`;
  }
  const urls = (h: string, re: RegExp) => [...h.matchAll(re)].map((m) => m[1]).sort().join('\n');
  const IMG_SRC = /<img\b[^>]*\bsrc="([^"]*)"/gi;
  const A_HREF = /<a\b[^>]*\bhref="([^"]*)"/gi;
  if (urls(src, IMG_SRC) !== urls(out, IMG_SRC)) return 'img_src_changed';
  if (urls(src, A_HREF) !== urls(out, A_HREF)) return 'a_href_changed';
  return null;
}

/** translateFields + the untranslated-output check: one corrective retry, then
 * throw — a caller never receives a half-translated result. */
/** Turn a check-reason into a concrete instruction for the corrective retry —
 * "preserve the markup" wasn't stopping the model from splitting a paragraph
 * (tag_p_25_vs_26, live 2026-07-12); naming the exact violation does better. */
function retryDetail(reason: string): string {
  const m = /^tag_(\/?)([a-z0-9]+)_(\d+)_vs_(\d+)$/.exec(reason);
  if (m) {
    return ` In your rejected attempt the input had exactly ${m[3]} <${m[1]}${m[2]}> tags but your output had ${m[4]} — ` +
      'reproduce every tag exactly; never split, merge, add, or drop one.';
  }
  if (reason === 'img_src_changed' || reason === 'a_href_changed')
    return ' Your rejected attempt rewrote an image src or link href — copy every URL byte-for-byte.';
  if (reason === 'fullwidth_tag')
    return ' Your rejected attempt wrote HTML tags with full-width ＜＞ brackets — use normal ASCII < > for every tag.';
  return ''; // untranslated_block / meta_* — the generic note already covers it
}

/** Exact tag inventory of a chunk, told to the model UP FRONT — tag drift is
 * probabilistic (the same chunk passes one run and fails the next), so
 * pre-declaring the census cuts first-attempt failures instead of relying on
 * retries to repair them. */
function tagCountNote(html: string): string {
  const counts = [...tagCensus(html)]
    .filter(([k]) => !k.startsWith('/'))
    .map(([k, n]) => `${n}×<${k}>`).join(', ');
  return counts
    ? `The HTML body contains exactly: ${counts}. Your output must contain exactly the same tags — never split, merge, add, or drop one.`
    : '';
}

/* Last-resort inline-tag protection. The model sometimes refuses to keep an
 * inline tag no matter how the prompt insists — <strong>matsuri (祭り)</strong>
 * collapses to plain 祭り because the term "merges" into the Japanese sentence
 * (live, 2026-07-12). Masking each inline tag as an opaque ⟦n⟧ placeholder
 * turns "preserve semantic markup" (which it fails probabilistically) into
 * "copy this token" (which it does), and restoring is exact — attributes ride
 * along in the map. Dropped/duplicated placeholders surface as tag-count drift
 * in the post-restore structure check. */
const INLINE_TAG_RE = /<\/?(?:strong|b|em|i|s|strike|u|mark|sub|sup|small|code|kbd)(?:\s[^>]*)?>/gi;

function maskInlineTags(html: string): { masked: string; tags: string[] } {
  const tags: string[] = [];
  const masked = html.replace(INLINE_TAG_RE, (t) => {
    tags.push(t);
    return `⟦${tags.length - 1}⟧`;
  });
  return { masked, tags };
}

function restoreInlineTags(html: string, tags: string[]): string {
  return html.replace(/⟦(\d+)⟧/g, (_, i) => tags[Number(i)] ?? '');
}

async function translateChecked(
  apiKey: string,
  to: Locale,
  fields: TranslateFields,
  why: (r: TranslateFields) => string | null,
  note?: string,
): Promise<TranslateFields> {
  let extra = note;
  let reason: string | null = null;
  // First pass + two corrective retries — each retry names the exact violation.
  for (let attempt = 0; attempt < 3; attempt++) {
    const r = await translateFields(apiKey, to, fields, extra);
    reason = why(r);
    if (reason == null) return r;
    extra = (note ? `${note} ` : '') + OUTPUT_RETRY_NOTE + retryDetail(reason);
  }
  throw new Error(`openai_output_check_failed:${reason}`);
}

/** Run every job through `width` workers. Rejects like Promise.all, but never
 * more than `width` fetches are in flight, and a failure stops the remaining
 * queue instead of burning tokens on a translation that's already doomed. */
async function runPool(jobs: (() => Promise<void>)[], width: number): Promise<void> {
  let next = 0;
  let failed = false;
  const worker = async () => {
    while (!failed && next < jobs.length) {
      const job = jobs[next++];
      try { await job(); } catch (e) { failed = true; throw e; }
    }
  };
  await Promise.all(Array.from({ length: Math.min(width, jobs.length) }, worker));
}

/** Translate a whole post (title/excerpt/body) into `to`, chunking the body.
 * Throws if ANY piece fails — callers store either a complete translation or
 * nothing. `concurrency` caps simultaneous OpenAI calls (see pool note above). */
export async function translatePost(
  apiKey: string,
  to: Locale,
  fields: TranslateFields,
  opts: { concurrency?: number } = {},
): Promise<TranslateFields> {
  const out: TranslateFields = {};
  const jobs: (() => Promise<void>)[] = [];

  const meta: TranslateFields = {};
  if (fields.title?.trim()) meta.title = fields.title;
  if (fields.excerpt?.trim()) meta.excerpt = fields.excerpt;
  if (Object.keys(meta).length) {
    jobs.push(async () => {
      const r = await translateChecked(apiKey, to, meta, (x) =>
        meta.title != null && (!x.title || textLooksUntranslated(x.title, to, true)) ? 'meta_title'
        : meta.excerpt != null && x.excerpt != null && textLooksUntranslated(x.excerpt, to, true) ? 'meta_excerpt'
        : null);
      if (r.title != null) out.title = r.title;
      if (r.excerpt != null) out.excerpt = r.excerpt;
    });
  }

  /** One HTML piece through the checked pipeline. Tag drift is probabilistic —
   * the more tags a piece carries, the likelier the model drops one — so when a
   * multi-block chunk exhausts its retries, fall back to translating it one
   * top-level block at a time (a paragraph with one <strong> is an easy task).
   * Only a single block failing all its retries is a real failure. */
  const translateBody = async (piece: string): Promise<string> => {
    try {
      const r = await translateChecked(apiKey, to, { body: piece }, (x) =>
        !x.body ? 'empty_body'
        : htmlHasUntranslatedBlock(x.body, to) ? 'untranslated_block'
        : hasFullWidthTagArtifact(x.body) ? 'fullwidth_tag'
        : htmlStructureMismatch(piece, x.body), tagCountNote(piece));
      return r.body!;
    } catch (e) {
      const blocks = splitHtmlBlocks(piece, 1);
      if (blocks.length <= 1) {
        // Single block already failed its retries: mask inline tags and try once more.
        const { masked, tags } = maskInlineTags(piece);
        if (tags.length === 0) throw e; // nothing to mask — the failure is real
        const r = await translateChecked(apiKey, to, { body: masked }, (x) => {
          if (!x.body) return 'empty_body';
          const restored = restoreInlineTags(x.body, tags);
          if (process.env.N101_TRANSLATE_DEBUG) console.error('MASKED_IN:', masked, '\nMASKED_OUT:', x.body);
          return htmlHasUntranslatedBlock(restored, to) ? 'untranslated_block'
            : hasFullWidthTagArtifact(restored) ? 'fullwidth_tag'
            : htmlStructureMismatch(piece, restored);
        }, 'Placeholders like ⟦3⟧ are protected markup: copy each one into your output exactly once, '
          + 'unchanged, around the text it wrapped in the input. ' + tagCountNote(masked));
        return restoreInlineTags(r.body!, tags);
      }
      const parts: string[] = [];
      for (const b of blocks) parts.push(await translateBody(b)); // sequential: stays within this pool worker's slot
      return parts.join('');
    }
  };

  const chunks = fields.body?.trim() ? splitHtmlBlocks(fields.body) : [];
  const bodyParts: string[] = new Array(chunks.length);
  chunks.forEach((chunk, i) => {
    jobs.push(async () => { bodyParts[i] = await translateBody(chunk); });
  });

  await runPool(jobs, opts.concurrency ?? 4);
  if (chunks.length) out.body = bodyParts.join('');
  return out;
}

export interface CategorySuggestion { labelEn: string; labelJa: string; kanji: string; }

/** Given a category label in ONE locale, return both locale labels + a single
 *  representative kanji (e.g. Food→食, Travel→旅). The kanji is GENERATED, not
 *  translated, so this needs its own prompt. We hard-enforce a single Han glyph on
 *  the way out — the model is told, but never trusted, to return exactly one. */
export async function suggestCategory(apiKey: string, label: string, from: Locale): Promise<CategorySuggestion> {
  if (!apiKey) throw new Error('no_api_key');

  const system = [
    `You name blog categories for a bilingual (English + Japanese) magazine about Japan.`,
    `The user gives one category label written in ${LANG_NAME[from]}.`,
    `Return ONLY a JSON object with exactly these keys:`,
    `"labelEn" — the category name in natural English (Title Case, 1-3 words);`,
    `"labelJa" — the category name in natural Japanese;`,
    `"kanji" — EXACTLY ONE kanji character (常用漢字) that best captures the meaning. Never kana, never Latin, never more than one character.`,
    `Examples: {"labelEn":"Food","labelJa":"食べ物","kanji":"食"}, {"labelEn":"Travel","labelJa":"旅行","kanji":"旅"}, {"labelEn":"Anime","labelJa":"アニメ","kanji":"画"}.`,
    `No commentary.`,
  ].join(' ');

  const res = await fetchWithTimeout(OPENAI_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: MODEL,
      response_format: { type: 'json_object' as const },
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: label },
      ],
    }),
    timeoutMs: 30_000,
    retries: 1,
  });
  if (!res.ok) throw new Error(`openai_${res.status}`);

  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error('openai_empty');

  const p = JSON.parse(content) as Partial<CategorySuggestion>;
  // Trust nothing: keep only the first actual Han glyph the model returned.
  const kanji = [...String(p.kanji ?? '')].find((ch) => /\p{Script=Han}/u.test(ch)) ?? '';
  return {
    labelEn: String(p.labelEn ?? label).trim(),
    labelJa: String(p.labelJa ?? label).trim(),
    kanji,
  };
}
