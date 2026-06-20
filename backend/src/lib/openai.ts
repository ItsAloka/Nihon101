/* ChatGPT-backed translation for the bilingual editor. Translation is stored,
 * not runtime — the author triggers this at edit time, reviews, then both
 * locales are saved and SSR'd. Casual, youthful register (this is a friendly
 * magazine, not a legal notice). HTML structure is preserved verbatim. */

import { fetchWithTimeout } from './http';

const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';
const MODEL = 'gpt-5-mini'; // cheaper than 4.1, more natural casual JP for blog prose

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
  return [
    `You are a professional translator for a bilingual blog about Japan.`,
    `Translate the given fields into ${LANG_NAME[to]}.`,
    tone,
    `The "body" field is HTML: translate ONLY the human-readable text, and keep every HTML tag, attribute, and structure exactly as-is. Do not add, remove, or reorder tags.`,
    `Do not translate proper nouns that are normally left as-is, code, or URLs.`,
    `Return ONLY a JSON object with the same keys you were given ("title", "excerpt", "body" — whichever were provided), each holding the translated string. No commentary.`,
  ].join(' ');
}

/** Translate the provided fields into `to`. Throws on a missing key or API error. */
export async function translateFields(
  apiKey: string,
  to: Locale,
  fields: TranslateFields,
): Promise<TranslateFields> {
  if (!apiKey) throw new Error('no_api_key');

  const payload = {
    model: MODEL,
    // GPT-5 reasoning models only accept the default temperature — don't set it.
    response_format: { type: 'json_object' as const },
    messages: [
      { role: 'system', content: systemPrompt(to) },
      { role: 'user', content: JSON.stringify(fields) },
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
  return parsed;
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
