/* Semantic embeddings — the optional "flavor" layer for For You + search. A post is
 * turned into a 1536-float vector that captures its MEANING (two posts about quiet
 * mountain temples land near each other even with no shared words). Stored in
 * posts.embedding (pgvector); read for the For You W_semantic term and for semantic
 * search. Cheap: text-embedding-3-small is $0.02/1M tokens, embedded once per post.
 *
 * This whole layer is OPTIONAL. With no OPENAI_EMBED_API_KEY or no stored vectors,
 * callers fall back to pure-math ranking / keyword search — nothing breaks. */
import { fetchWithTimeout } from './http';

const URL = 'https://api.openai.com/v1/embeddings';
const MODEL = 'text-embedding-3-small';
export const EMBED_DIM = 1536;
const MAX_INPUT = 8000; // chars — bounds token cost per post

/** Embed one text → a 1536-float vector. Throws on missing key / API error so the
 *  caller (always a background job) can swallow it and leave the column null. */
export async function embedText(apiKey: string, text: string): Promise<number[]> {
  if (!apiKey) throw new Error('no_embed_key');
  const res = await fetchWithTimeout(URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model: MODEL, input: text.slice(0, MAX_INPUT) }),
    timeoutMs: 30_000,
    retries: 1,
  });
  if (!res.ok) throw new Error(`embed_${res.status}`);
  const data = (await res.json()) as { data?: { embedding?: number[] }[] };
  const v = data.data?.[0]?.embedding;
  if (!v || v.length !== EMBED_DIM) throw new Error('embed_bad');
  return v;
}

/** pgvector text literal: '[0.1,0.2,…]'. Use as `${literal}::vector` in raw SQL. */
export function toVectorLiteral(v: number[]): string {
  return '[' + v.join(',') + ']';
}

/* ---- Query-embedding cache (semantic search) -------------------------------
 * Search queries repeat heavily ("ramen", "kyoto"), and a bot replaying the same
 * query must NOT re-bill OpenAI each time. Cache query→vector in KV for a day, keyed
 * by a cheap hash of the normalized query. Cache miss is the only path that calls the
 * API, so the route gates *that* with an IP quota. KV-less dev → no cache (still works). */
function queryKey(q: string): string {
  let h = 5381;
  for (let i = 0; i < q.length; i++) h = ((h << 5) + h + q.charCodeAt(i)) >>> 0;
  return 'qembed:' + h.toString(36);
}

export async function getCachedQueryEmbed(kv: KVNamespace | undefined, q: string): Promise<number[] | null> {
  if (!kv) return null;
  try { const c = await kv.get(queryKey(q)); return c ? (JSON.parse(c) as number[]) : null; } catch { return null; }
}

export async function cacheQueryEmbed(kv: KVNamespace | undefined, q: string, v: number[]): Promise<void> {
  if (!kv) return;
  try { await kv.put(queryKey(q), JSON.stringify(v), { expirationTtl: 86_400 }); } catch { /* noop */ }
}

/** The text we embed for a post: both languages' title + excerpt + HTML-stripped EN
 *  body, so the vector captures bilingual meaning. Body is trimmed by embedText. */
export function postEmbedText(p: {
  titleEn?: string | null; titleJa?: string | null;
  excerptEn?: string | null; excerptJa?: string | null; bodyEn?: string | null;
}): string {
  const strip = (s?: string | null) => (s || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  return [p.titleEn, p.titleJa, p.excerptEn, p.excerptJa, strip(p.bodyEn)]
    .filter(Boolean).join('\n').trim();
}
