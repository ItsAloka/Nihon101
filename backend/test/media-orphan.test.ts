/* End-to-end guard for the orphan-media sweep (ported from Not Bagel's 07-25
 * incident: the scanner missed reference sources and deleted live images).
 * Exercises the REAL code paths against the testing Postgres branch + an
 * in-memory R2, proving:
 *   - collectReferencedKeys counts cover, BOTH body locales, avatar AND banner
 *   - bulk-delete skips referenced keys AND freshly-uploaded keys (30-day grace)
 *   - "delete" is a soft move to _trash/, and purgeTrash erases it past the window */
import { test, expect, beforeAll, afterAll } from 'bun:test';
import worker from '../src/index';
import { ENV, makeCtx, makeUser, makePost, db, deleteUsers } from './helpers';
import { collectReferencedKeys } from '../src/routes/admin';
import { purgeTrash } from '../src/lib/media';
import { signAccess } from '../src/lib/tokens';
import { id as newId } from '../src/lib/ids';
import { users, posts } from '../src/db/schema';
import { eq } from 'drizzle-orm';

const DAY = 24 * 60 * 60 * 1000;

// Minimal R2Bucket stand-in — just the surface the media code touches.
class MockR2 {
  map = new Map<string, { body: unknown; httpMetadata: unknown; customMetadata?: unknown; uploaded: Date; size: number }>();
  seed(key: string, uploaded: Date, size = 100) {
    this.map.set(key, { body: 'bytes:' + key, httpMetadata: { contentType: 'image/webp' }, uploaded, size });
  }
  async list(opts: { prefix?: string; cursor?: string; limit?: number } = {}) {
    let keys = [...this.map.keys()].sort();
    if (opts.prefix) keys = keys.filter((k) => k.startsWith(opts.prefix!));
    return { objects: keys.map((k) => { const v = this.map.get(k)!; return { key: k, size: v.size, uploaded: v.uploaded }; }), truncated: false, cursor: undefined as string | undefined };
  }
  async head(key: string) { const v = this.map.get(key); return v ? { key, size: v.size, uploaded: v.uploaded } : null; }
  async get(key: string) { const v = this.map.get(key); return v ? { body: v.body, httpMetadata: v.httpMetadata } : null; }
  async put(key: string, body: unknown, opts: { httpMetadata?: unknown; customMetadata?: unknown } = {}) {
    this.map.set(key, { body, httpMetadata: opts.httpMetadata, customMetadata: opts.customMetadata, uploaded: new Date(), size: 100 });
  }
  async delete(keys: string | string[]) { for (const k of (Array.isArray(keys) ? keys : [keys])) this.map.delete(k); }
  trashKeys() { return [...this.map.keys()].filter((k) => k.startsWith('_trash/')); }
}

const tag = newId('mt').replace(/_/g, '');           // regex-safe, unique per run
const K = (n: string) => `usr_${tag}/${tag}-${n}.webp`;
const REF_BODY_EN = K('bodyen'), REF_BODY_JA = K('bodyja'), REF_COVER = K('cover');
const REF_AVATAR = K('avatar'), REF_BANNER = K('banner');
const ORPHAN_OLD = K('orphanold'), ORPHAN_NEW = K('orphannew');

let author: { id: string; token: string; email: string };
let post: { id: string; categoryId: string; cleanup: () => Promise<void> };
let adminToken: string;

async function adminCall(method: string, path: string, mock: MockR2, body?: unknown) {
  const req = new Request('http://localhost' + path, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + adminToken, 'cf-connecting-ip': '10.1.2.3' },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const { ctx, settle } = makeCtx();
  const res = await worker.fetch(req as any, { ...ENV, MEDIA: mock } as any, ctx);
  await settle();
  return { status: res.status, json: await res.json().catch(() => ({})) as any };
}

beforeAll(async () => {
  author = await makeUser('orph');
  post = await makePost(author.id);
  const { db: d, pool } = db();
  try {
    // Promote to admin + set avatar AND banner; embed body images in BOTH locales + a cover.
    await d.update(users).set({
      role: 'admin',
      avatarUrl: `https://api.nihon101.com/media/${REF_AVATAR}`,
      bannerUrl: `https://api.nihon101.com/media/${REF_BANNER}`,
    }).where(eq(users.id, author.id));
    await d.update(posts).set({
      bodyEn: `<p>x</p><img src="https://api.nihon101.com/media/${REF_BODY_EN}?w=640">`,
      bodyJa: `<p>や</p><img src="https://api.nihon101.com/media/${REF_BODY_JA}">`,
      cover: `https://api.nihon101.com/media/${REF_COVER}`,
    }).where(eq(posts.id, post.id));
  } finally { await pool.end(); }
  adminToken = await signAccess(ENV.JWT_SECRET as string, { id: author.id, role: 'admin', displayName: 'orph' });
});

afterAll(async () => { await post.cleanup(); await deleteUsers(author.id); });

test('collectReferencedKeys counts cover, both body locales, avatar AND banner', async () => {
  const { db: d, pool } = db();
  try {
    const refs = await collectReferencedKeys(d);
    for (const k of [REF_COVER, REF_BODY_EN, REF_BODY_JA, REF_AVATAR, REF_BANNER]) expect(refs.has(k)).toBe(true);
    expect(refs.has(ORPHAN_OLD)).toBe(false);
  } finally { await pool.end(); }
});

test('GET /admin/media hides _trash/, flags only true orphans', async () => {
  const mock = new MockR2();
  const old = new Date(Date.now() - 40 * DAY);
  for (const k of [REF_COVER, REF_BODY_EN, REF_BODY_JA, REF_AVATAR, REF_BANNER, ORPHAN_OLD]) mock.seed(k, old);
  mock.seed(ORPHAN_NEW, new Date());
  mock.seed('_trash/123/usr_x/should-be-hidden.webp', old); // must NOT surface

  const r = await adminCall('GET', '/admin/media', mock);
  expect(r.status).toBe(200);
  const byKey = new Map(r.json.objects.map((o: any) => [o.key, o]));
  expect(byKey.has('_trash/123/usr_x/should-be-hidden.webp')).toBe(false);
  for (const k of [REF_COVER, REF_BODY_EN, REF_BODY_JA, REF_AVATAR, REF_BANNER]) expect((byKey.get(k) as any)?.referenced).toBe(true);
  const orphanKeys = r.json.objects.filter((o: any) => !o.referenced).map((o: any) => o.key);
  expect(orphanKeys).toContain(ORPHAN_OLD);
  expect(orphanKeys).toContain(ORPHAN_NEW);
  expect(orphanKeys).not.toContain(REF_BANNER);
});

test('bulk-delete: skips referenced + recent, soft-deletes a real orphan', async () => {
  const mock = new MockR2();
  mock.seed(REF_BANNER, new Date(Date.now() - 40 * DAY));
  mock.seed(ORPHAN_OLD, new Date(Date.now() - 40 * DAY));
  mock.seed(ORPHAN_NEW, new Date());

  const r = await adminCall('POST', '/admin/media/bulk-delete', mock, { keys: [REF_BANNER, ORPHAN_OLD, ORPHAN_NEW] });
  expect(r.status).toBe(200);
  expect(r.json).toMatchObject({ deleted: 1, skippedReferenced: 1, skippedRecent: 1, missing: 0 });

  expect(mock.map.has(REF_BANNER)).toBe(true);      // referenced → untouched
  expect(mock.map.has(ORPHAN_NEW)).toBe(true);      // too fresh → untouched
  expect(mock.map.has(ORPHAN_OLD)).toBe(false);     // orphan → moved out of its live key
  const trash = mock.trashKeys();
  expect(trash.length).toBe(1);
  expect(trash[0]!.endsWith(ORPHAN_OLD)).toBe(true);

  // Restore puts it back at the original key and empties the trash copy.
  const rr = await adminCall('POST', '/admin/media/restore', mock, { keys: trash });
  expect(rr.json).toMatchObject({ restored: 1, skippedExists: 0, missing: 0 });
  expect(mock.map.has(ORPHAN_OLD)).toBe(true);
  expect(mock.trashKeys().length).toBe(0);

  // Trash again (re-age it first — restore stamped a fresh upload time, which the
  // 30-day grace would otherwise protect), then purgeTrash respects the retention
  // cutoff before erasing.
  mock.map.get(ORPHAN_OLD)!.uploaded = new Date(Date.now() - 40 * DAY);
  await adminCall('POST', '/admin/media/bulk-delete', mock, { keys: [ORPHAN_OLD] });
  expect(mock.trashKeys().length).toBe(1);
  expect(await purgeTrash(mock as any, Date.now() - 1000)).toBe(0);   // newer than cutoff → kept
  expect(await purgeTrash(mock as any, Date.now() + 1000)).toBe(1);   // past cutoff → purged
  expect(mock.trashKeys().length).toBe(0);
});

test('bulk-delete is admin-gated', async () => {
  const mock = new MockR2();
  const req = new Request('http://localhost/admin/media/bulk-delete', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + author.token, 'cf-connecting-ip': '10.9.9.9' },
    body: JSON.stringify({ keys: [ORPHAN_OLD] }),
  });
  const { ctx, settle } = makeCtx();
  const res = await worker.fetch(req as any, { ...ENV, MEDIA: mock } as any, ctx);
  await settle();
  expect(res.status).toBe(403); // author.token carries role=user in its claim
});
