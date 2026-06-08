/* NOT BAGEL — content data layer. Talks to the Worker's /categories and /posts
 * routes and maps the API shapes onto the view shapes the cards/article already
 * consume (see data/seed.ts). This is the runtime replacement for the seed
 * arrays: categories and posts are now live, user-authored data. */
import { apiFetch } from './api';
import type { Post, Category, Author } from '../data/seed';

/* ---------------- API shapes (mirror backend publicPost / category) ---------------- */

export interface ApiCategory {
  id: string;
  label: string;
  colorVar: string;
  postCount: number;
  createdBy: string | null;
  createdAt: string;
}

export interface ApiPost {
  id: string;
  authorId: string;
  authorUsername: string | null;
  authorName: string | null;
  authorColor: string | null;
  categoryId: string;
  title: string;
  slug: string;
  excerpt: string;
  cover: string | null;
  body: string;
  status: 'draft' | 'published';
  density: 'compact' | 'normal' | 'relaxed';
  score: number | null;
  tags: string[];
  likes: number;
  saves: number;
  comments: number;
  publishedAt: number | null;
  createdAt: number;
  updatedAt: number;
}

export interface NewPostBody {
  title: string;
  categoryId: string;
  excerpt: string;
  cover: string | null;
  body: string;
  status: 'draft' | 'published';
  density: 'compact' | 'normal' | 'relaxed';
  score: number | null;
  tags: string[];
}

/* ---------------- API clients ---------------- */

export const categoryApi = {
  list: () => apiFetch<{ categories: ApiCategory[] }>('/categories').then((r) => r.categories),
  create: (label: string) =>
    apiFetch<{ category: ApiCategory }>('/categories', { method: 'POST', auth: true, body: { label } }).then((r) => r.category),
};

export const postApi = {
  list: (params: { cat?: string; author?: string; status?: 'draft' | 'published' } = {}) => {
    const q = new URLSearchParams();
    if (params.cat) q.set('cat', params.cat);
    if (params.author) q.set('author', params.author);
    if (params.status) q.set('status', params.status);
    const qs = q.toString();
    // Drafts are owner-scoped → send credentials/token.
    return apiFetch<{ posts: ApiPost[] }>(`/posts${qs ? `?${qs}` : ''}`, { auth: params.status === 'draft' }).then((r) => r.posts);
  },
  get: (id: string) => apiFetch<{ post: ApiPost }>(`/posts/${id}`).then((r) => r.post),
  create: (body: NewPostBody) => apiFetch<{ post: ApiPost }>('/posts', { method: 'POST', auth: true, body }).then((r) => r.post),
  update: (id: string, body: Partial<NewPostBody>) =>
    apiFetch<{ post: ApiPost }>(`/posts/${id}`, { method: 'PUT', auth: true, body }).then((r) => r.post),
  remove: (id: string) => apiFetch<{ ok: boolean }>(`/posts/${id}`, { method: 'DELETE', auth: true }),
};

/* ---------------- mappers (API -> view shapes) ---------------- */

export function hydrateCategory(c: ApiCategory): Category {
  return { id: c.id, label: c.label, var: c.colorVar };
}

/** "May 28, 2026" from an epoch-ms timestamp. */
export function formatDate(ms: number): string {
  return new Date(ms).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

/** Rough reading time from a markdown body (~200 wpm). */
export function readTime(body: string): string {
  const words = body.trim() ? body.trim().split(/\s+/).length : 0;
  return `${Math.max(1, Math.round(words / 200))} min`;
}

/** Map an API post onto the card/article view shape. `cats` resolves catObj. */
export function hydratePost(p: ApiPost, cats: Map<string, Category>): Post {
  const catObj: Category = cats.get(p.categoryId) ?? { id: p.categoryId, label: p.categoryId, var: '--c-anime' };
  const authorObj: Author = {
    id: p.authorUsername ?? p.authorId,
    name: p.authorName ?? 'Unknown',
    handle: p.authorUsername ? `@${p.authorUsername}` : '@unknown',
    color: p.authorColor ?? 'var(--teal)',
    bio: '',
    followers: '0',
  };
  return {
    id: p.id,
    cat: p.categoryId,
    author: p.authorUsername ?? p.authorId,
    date: formatDate(p.publishedAt ?? p.createdAt),
    read: readTime(p.body),
    title: p.title,
    excerpt: p.excerpt,
    cov: p.categoryId, // gradient fallback key; coverImg wins when present
    coverImg: p.cover,
    md: p.body, // markdown source; ArticleView renders this when set
    score: p.score,
    kind: p.score != null ? 'Review' : 'Post',
    likes: p.likes,
    saves: p.saves,
    comments: p.comments,
    tags: p.tags,
    body: [], // runtime posts use `md`; seed posts use structured blocks
    authorObj,
    catObj,
  };
}
