import { eq, and, sql, type SQL } from 'drizzle-orm';
import type { DB } from '../client';
import { posts, users } from '../schema';
import { cardCols, type PostCardRow } from './posts';

/* Bilingual search over published posts. Full-text first (websearch syntax: quoted
 * phrases, -exclusions) against the combined `posts.search` tsvector, ranked by
 * tsvector weight blended with a small likes boost; when FTS finds nothing, a
 * pg_trgm pass on the locale's title catches typos/partials and is the main
 * workhorse for Japanese (which 'simple' tsvector can't word-segment). With no
 * query this doubles as the category/tag browse listing, so category + tag pages
 * reuse the same path. */

export type Loc = 'en' | 'ja';
export type SearchSort = 'relevance' | 'new' | 'top';

export interface SearchFilter {
  q?: string;
  categoryId?: string;
  tag?: string;       // tag slug (matched against posts.tags jsonb)
  authorId?: string;  // restrict to one author (powers the profile feed)
  loc?: Loc;
  sort?: SearchSort;
  page?: number;      // 0-based
  limit?: number;
}

export interface SearchPage {
  items: PostCardRow[];
  total: number;
  nextPage: number | null;
}

const DEFAULT_LIMIT = 12;
const MAX_LIMIT = 50;

/** The active locale's title column — what trigram fallback + suggestions match. */
function titleCol(loc: Loc): SQL {
  return loc === 'ja' ? sql`"posts"."title_ja"` : sql`"posts"."title_en"`;
}
/** tsquery config per locale: 'english' stems EN, 'simple' for JA tokens. */
function tsConfig(loc: Loc): string {
  return loc === 'ja' ? 'simple' : 'english';
}

export async function searchPosts(db: DB, f: SearchFilter): Promise<SearchPage> {
  const limit = Math.min(MAX_LIMIT, Math.max(1, Math.trunc(f.limit ?? DEFAULT_LIMIT)));
  const page = Math.max(0, Math.trunc(f.page ?? 0));
  const q = f.q?.trim().slice(0, 200) || '';
  const loc: Loc = f.loc === 'ja' ? 'ja' : 'en';

  const base: (SQL | undefined)[] = [
    eq(posts.status, 'published'),
    f.authorId ? eq(posts.authorId, f.authorId) : undefined,
    f.categoryId ? eq(posts.categoryId, f.categoryId) : undefined,
    // posts.tags stores free-form display labels ("Makoto Shinkai"); the URL gives
    // a slug ("makoto-shinkai"). Slug-normalize each stored tag the same way JS
    // slugify() does so the page matches regardless of casing/spacing.
    f.tag ? sql`EXISTS (SELECT 1 FROM jsonb_array_elements_text("posts"."tags") AS _t(v)
      WHERE trim(both '-' from lower(regexp_replace(_t.v, '[^a-zA-Z0-9]+', '-', 'g'))) = ${f.tag})` : undefined,
  ];

  if (q) {
    const tsq = sql`websearch_to_tsquery(${tsConfig(loc)}, ${q})`;
    const fts = await run(db, [...base, sql`"posts"."search" @@ ${tsq}`], rankOrder(f.sort, tsq), limit, page);
    if (fts.total > 0) return fts;
    // Fallback for what FTS misses — crucially Japanese, which `to_tsvector` can't
    // word-segment, so a sub-title query like 火曜日 never matches the tsvector.
    // Substring (ILIKE) is exact + reliable for JA and index-accelerated by the
    // gin_trgm_ops indexes on the titles; trigram word_similarity adds typo/partial
    // tolerance for the Latin scripts.
    const title = titleCol(loc);
    const like = '%' + q.replace(/[\\%_]/g, '\\$&') + '%';
    return run(
      db,
      [...base, sql`(
        word_similarity(${q}, ${title}) > 0.3
        OR "posts"."title_ja" ILIKE ${like} OR "posts"."title_en" ILIKE ${like}
        OR "posts"."excerpt_ja" ILIKE ${like} OR "posts"."excerpt_en" ILIKE ${like}
      )`],
      sql`word_similarity(${q}, ${title}) DESC, "posts"."published_at" DESC`,
      limit,
      page,
    );
  }
  return run(db, base, browseOrder(f.sort), limit, page);
}

/** Relevance = FTS rank with a gentle engagement boost; explicit sorts win. */
function rankOrder(sort: SearchSort | undefined, tsq: SQL): SQL {
  if (sort && sort !== 'relevance') return browseOrder(sort);
  return sql`(ts_rank("posts"."search", ${tsq}) * (1 + ln(1 + "posts"."likes") * 0.05)) DESC, "posts"."published_at" DESC`;
}

function browseOrder(sort: SearchSort | undefined): SQL {
  if (sort === 'top') return sql`"posts"."likes" DESC, "posts"."published_at" DESC`;
  return sql`"posts"."published_at" DESC, "posts"."id" DESC`;
}

async function run(db: DB, conds: (SQL | undefined)[], order: SQL, limit: number, page: number): Promise<SearchPage> {
  const where = and(...conds.filter((c): c is SQL => !!c));

  const [items, [{ total }]] = await Promise.all([
    db
      .select(cardCols)
      .from(posts)
      .leftJoin(users, eq(posts.authorId, users.id))
      .where(where)
      .orderBy(order)
      .limit(limit)
      .offset(page * limit) as Promise<PostCardRow[]>,
    db.select({ total: sql<number>`count(*)::int` }).from(posts).where(where),
  ]);

  return { items, total, nextPage: (page + 1) * limit < total ? page + 1 : null };
}

/* ---------------- autocomplete (lightweight title suggestions) ---------------- */

export interface PostSuggestion {
  id: string;
  slug: string;
  titleEn: string;
  titleJa: string;
  categoryId: string;
}

/** Slim post matches for the search dropdown: just enough to render a row and link
 * to the article. FTS first, trigram-on-(locale)-title fallback for typos/partials. */
export async function suggestPosts(db: DB, q: string, loc: Loc, limit = 6): Promise<PostSuggestion[]> {
  const needle = q.trim().slice(0, 100);
  if (!needle) return [];
  const cols = {
    id: posts.id, slug: posts.slug, titleEn: posts.titleEn, titleJa: posts.titleJa, categoryId: posts.categoryId,
  };
  const tsq = sql`websearch_to_tsquery(${tsConfig(loc)}, ${needle})`;
  const fts = await db
    .select(cols)
    .from(posts)
    .where(and(eq(posts.status, 'published'), sql`"posts"."search" @@ ${tsq}`))
    .orderBy(sql`ts_rank("posts"."search", ${tsq}) DESC, "posts"."likes" DESC`)
    .limit(limit);
  if (fts.length) return fts;
  // Same JA-aware fallback as searchPosts: substring (ILIKE) + trigram on titles.
  const title = titleCol(loc);
  const like = '%' + needle.replace(/[\\%_]/g, '\\$&') + '%';
  return db
    .select(cols)
    .from(posts)
    .where(and(
      eq(posts.status, 'published'),
      sql`(word_similarity(${needle}, ${title}) > 0.3 OR "posts"."title_ja" ILIKE ${like} OR "posts"."title_en" ILIKE ${like})`,
    ))
    .orderBy(sql`word_similarity(${needle}, ${title}) DESC, "posts"."likes" DESC`)
    .limit(limit);
}

/* ---------------- author matches ---------------- */

export interface AuthorMatch {
  handle: string;
  displayName: string;
  displayNameJa: string;
  avatarUrl: string | null;
}

/** Authors whose handle / display name (EN or JA) resembles the query — the
 * autocomplete's "Authors" group + page-1 garnish on the results page. */
export async function searchAuthors(db: DB, q: string, limit = 4): Promise<AuthorMatch[]> {
  const needle = q.trim().slice(0, 100);
  if (!needle) return [];
  const like = '%' + needle + '%';
  return db
    .select({
      handle: users.handle,
      displayName: users.displayName,
      displayNameJa: users.displayNameJa,
      avatarUrl: users.avatarUrl,
    })
    .from(users)
    .where(
      sql`("users"."handle" ILIKE ${like} OR "users"."display_name" ILIKE ${like} OR "users"."display_name_ja" ILIKE ${like}
        OR similarity("users"."display_name", ${needle}) > 0.3 OR similarity("users"."display_name_ja", ${needle}) > 0.3)`,
    )
    .orderBy(sql`GREATEST(similarity("users"."handle", ${needle}), similarity("users"."display_name", ${needle}), similarity("users"."display_name_ja", ${needle})) DESC`)
    .limit(limit);
}
