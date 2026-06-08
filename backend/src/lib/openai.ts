/* ChatGPT-backed translation for the bilingual editor. Translation is stored,
 * not runtime — the author triggers this at edit time, reviews, then both
 * locales are saved and SSR'd. Casual, youthful register (this is a friendly
 * magazine, not a legal notice). HTML structure is preserved verbatim. */

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

  const res = await fetch(OPENAI_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`openai_${res.status}`);

  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error('openai_empty');

  const parsed = JSON.parse(content) as TranslateFields;
  return parsed;
}
