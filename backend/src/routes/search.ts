import { Hono } from 'hono';
import { getDbCached } from '../db/client';
import type { AppEnv } from '../types';
import { publicPostCard } from '../db/queries/posts';
import { searchPosts, suggestPosts, searchAuthors, semanticSearchPosts, type SearchSort, type Loc } from '../db/queries/search';
import { topTags, searchTags } from '../db/queries/tags';
import { searchCategories } from '../db/queries/categories';
import { embedText, getCachedQueryEmbed, cacheQueryEmbed } from '../lib/embeddings';
import { overAiQuota } from '../lib/aiQuota';
import { limits } from '../middleware/rateLimit';

const app = new Hono<AppEnv>();

const SORTS: SearchSort[] = ['relevance', 'new', 'top'];
const loc = (c: { req: { query: (k: string) => string | undefined } }): Loc =>
  c.req.query('loc') === 'ja' ? 'ja' : 'en';

// One endpoint for search AND browsing: with ?q it's full-text search; without it
// lists by category/tag (the SSR category + tag pages call it that way). ?page is
// 0-based, 12 per page by default. Author matches ride along on the first page of a
// text search.
app.get('/', limits.search, async (c) => {
  const db = getDbCached(c); // search over published posts — pure shared content
  const q = c.req.query('q')?.trim() || '';
  const categoryId = c.req.query('cat') || undefined;
  const tag = c.req.query('tag') || undefined;
  const authorId = c.req.query('author') || undefined;
  const sortParam = c.req.query('sort') as SearchSort | undefined;
  const sort = sortParam && SORTS.includes(sortParam) ? sortParam : undefined;
  const page = Math.max(0, Number(c.req.query('page')) || 0);
  const limit = Number(c.req.query('limit')) || undefined;
  const l = loc(c);

  // Explore searches blog posts only — author lookup lives in the header dropdown
  // (autocomplete) and the Writers tab, so the results endpoint stays post-only.
  const results = await searchPosts(db, { q, categoryId, tag, authorId, loc: l, sort, page, limit });

  // Semantic rescue: keyword search found nothing for a real query → fall back to
  // nearest-meaning posts. This is an UNAUTHENTICATED paid call, so it's doubly guarded:
  //   1) KV cache — a repeated/replayed query is served from cache, never re-billed.
  //   2) IP quota — a flood of UNIQUE queries (cache misses) is capped per IP per day,
  //      so a bot can't run up the embed bill. Both degrade to the empty keyword result.
  if (results.total === 0 && q && page === 0 && !authorId && !tag && c.env.OPENAI_EMBED_API_KEY) {
    try {
      const ql = q.toLowerCase();
      let vec = await getCachedQueryEmbed(c.env.TRENDING_KV, ql);
      if (!vec) {
        const ipKey = 'qembed:' + (c.req.header('cf-connecting-ip') || c.req.header('x-forwarded-for')?.split(',')[0]?.trim() || 'anon');
        if (!(await overAiQuota(c, ipKey))) {
          vec = await embedText(c.env.OPENAI_EMBED_API_KEY, ql);
          await cacheQueryEmbed(c.env.TRENDING_KV, ql, vec);
        }
      }
      if (vec) {
        const sem = await semanticSearchPosts(db, vec, { categoryId, limit });
        if (sem.length) {
          return c.json({ posts: sem.map((r) => publicPostCard(r)), total: sem.length, nextPage: null, semantic: true });
        }
      }
    } catch { /* fall through to the empty keyword result */ }
  }

  return c.json({
    posts: results.items.map((r) => publicPostCard(r)),
    total: results.total,
    nextPage: results.nextPage,
  });
});

// Top tags by published-post usage — the "try searching for" suggestion chips on
// the empty search page.
app.get('/suggest', limits.search, async (c) => {
  const rows = await topTags(getDbCached(c), 8);
  return c.json({ tags: rows.map((t) => ({ id: t.id, label: t.label, postCount: t.postCount })) });
});

// Query-aware autocomplete for the search dropdown: grouped matches in the order the
// UI renders them — posts, categories, tags, authors. Each group is capped small;
// the full results live on the /search page.
app.get('/autocomplete', limits.autocomplete, async (c) => {
  const db = getDbCached(c); // dropdown suggestions — shared content, hot path
  const q = c.req.query('q')?.trim() || '';
  if (!q) return c.json({ posts: [], categories: [], tags: [], authors: [] });
  const l = loc(c);

  const [posts, categories, tags, authors] = await Promise.all([
    suggestPosts(db, q, l, 6),
    searchCategories(db, q, 4),
    searchTags(db, q, 6),
    searchAuthors(db, q, 4),
  ]);

  return c.json({
    posts,
    categories: categories.map((cat) => ({ id: cat.id, labelEn: cat.labelEn, labelJa: cat.labelJa, kanji: cat.kanji, tint: cat.tint })),
    tags: tags.map((t) => ({ id: t.id, label: t.label, postCount: t.postCount })),
    authors,
  });
});

export default app;
