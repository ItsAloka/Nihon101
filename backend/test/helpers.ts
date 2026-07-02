/* Integration-test harness. Drives the real Worker (Hono app) over its fetch entry
 * against a live Postgres (Docker locally, a service container in CI). No HTTP
 * server is started — we call worker.fetch directly with a test env + a mock
 * executionCtx (waitUntil work is swallowed). Each test creates uniquely-keyed rows
 * and tears them down (user deletes cascade to their posts/comments/tokens). */
import worker from '../src/index';
import { standaloneDb } from '../src/db/client';
import { id as newId } from '../src/lib/ids';
import { categories, posts, users } from '../src/db/schema';
import { eq } from 'drizzle-orm';

export const DATABASE_URL =
  process.env.DATABASE_URL || 'postgres://nihon101:nihon101@localhost:5432/nihon101';

export const ENV = {
  DATABASE_URL,
  // ≥32 chars — the fail-closed config guard in src/index.ts refuses to serve on
  // anything shorter (it would 500 every request in these tests, by design).
  JWT_SECRET: 'test-jwt-secret-0123456789abcdef0123456789abcdef',
  REFRESH_PEPPER: 'test-pepper-0123456789abcdef0123456789abcdef',
  FRONTEND_ORIGIN: 'http://localhost:4321',
  RESEND_API_KEY: '',                 // empty → mail is logged, not sent
  RESEND_FROM: 'test@nihon101.com',
  OPENAI_API_KEY: '',                 // empty → publish skips background translation
  GOOGLE_CLIENT_ID: '', GOOGLE_CLIENT_SECRET: '', GOOGLE_REDIRECT_URI: '',
} as Record<string, unknown>;

// Mock execution context: collect waitUntil promises so we can await them, and
// never let a background rejection crash the test run.
export function makeCtx() {
  const tasks: Promise<unknown>[] = [];
  return {
    ctx: {
      waitUntil: (p: Promise<unknown>) => { tasks.push(Promise.resolve(p).catch(() => {})); },
      passThroughOnException: () => {},
    } as unknown as ExecutionContext,
    settle: () => Promise.all(tasks),
  };
}

export interface Res { status: number; json: any; headers: Headers; }

/** One request through the Worker. `token` sets the Bearer access token. */
export async function call(
  method: string, path: string,
  opts: { token?: string; body?: unknown; cookie?: string } = {},
): Promise<Res> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (opts.token) headers.Authorization = 'Bearer ' + opts.token;
  if (opts.cookie) headers.Cookie = opts.cookie;
  // Unique client IP per call so the by-IP auth limiters (register 5/hr etc.) don't
  // collide across the many users a test run creates — they'd otherwise all share the
  // 'anon' bucket. User-keyed write limits are unaffected.
  headers['cf-connecting-ip'] = `10.${(Math.random() * 255) | 0}.${(Math.random() * 255) | 0}.${(Math.random() * 255) | 0}`;
  const req = new Request('http://localhost' + path, {
    method, headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  const { ctx, settle } = makeCtx();
  const res = await worker.fetch(req as any, ENV as any, ctx);
  await settle();
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json, headers: res.headers };
}

export const db = () => standaloneDb(ENV as { DATABASE_URL: string });

/** Register a fresh user and return { id, token, email }. */
export async function makeUser(prefix = 'itest'): Promise<{ id: string; token: string; email: string }> {
  const email = `${prefix}-${newId('t').slice(-10)}@test.local`.toLowerCase();
  const r = await call('POST', '/auth/register', { body: { email, password: 'Test-pass-1234', displayName: prefix } });
  if (r.status !== 201) throw new Error('register failed: ' + JSON.stringify(r.json));
  return { id: r.json.user.id, token: r.json.access, email };
}

/** Insert a published post fixture authored by `authorId`. Returns its id. */
export async function makePost(authorId: string): Promise<{ id: string; categoryId: string; cleanup: () => Promise<void> }> {
  const { db: d, pool } = db();
  const categoryId = newId('cat');
  const postId = newId('pst');
  const at = Date.now();
  try {
    await d.insert(categories).values({ id: categoryId, labelEn: 'Test', labelJa: 'テスト', kanji: '試', tint: 'rose', postCount: 0, createdAt: at });
    await d.insert(posts).values({
      id: postId, authorId, categoryId, slug: 'itest-' + postId.slice(-8),
      titleEn: 'Test', status: 'published', publishedAt: at, createdAt: at, updatedAt: at,
    });
  } finally { await pool.end(); }
  const cleanup = async () => {
    const { db: d2, pool: p2 } = db();
    try {
      await d2.delete(posts).where(eq(posts.id, postId));
      await d2.delete(categories).where(eq(categories.id, categoryId));
    } finally { await p2.end(); }
  };
  return { id: postId, categoryId, cleanup };
}

/** Delete users (cascades to their posts/comments/tokens/verifications). */
export async function deleteUsers(...ids: string[]): Promise<void> {
  const { db: d, pool } = db();
  try { for (const uid of ids) await d.delete(users).where(eq(users.id, uid)); }
  finally { await pool.end(); }
}
