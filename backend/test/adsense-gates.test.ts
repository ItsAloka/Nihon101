/* AdSense-prep gates: publishing requires a verified email + one-time /terms
 * acceptance; pirate-site links are blocked in published posts and comments
 * (never drafts — autosave law); profanity is masked at read time for the
 * public but NEVER for the owner (a masked editor round-trip would destroy
 * the original text). */
import { test, expect, beforeAll, afterAll } from 'bun:test';
import { call, db, makeUser, makePost, deleteUsers } from './helpers';
import { users } from '../src/db/schema';
import { eq } from 'drizzle-orm';
import { findBlockedLink, findBlockedLinkHtml } from '../src/lib/linkGuard';
import { maskProfanity, maskProfanityHtml } from '../src/lib/profanity';
import { publicPost } from '../src/db/queries/posts';

let author: { id: string; token: string; email: string };
let fixture: { id: string; categoryId: string; cleanup: () => Promise<void> };

beforeAll(async () => {
  author = await makeUser('adsg');
  fixture = await makePost(author.id); // supplies a real category id
});
// Delete the user FIRST — their API-created posts cascade away, freeing the
// category for cleanup (posts→categories is ON DELETE RESTRICT).
afterAll(async () => { await deleteUsers(author.id); await fixture.cleanup(); });

const draft = (over: Record<string, unknown> = {}) => ({
  titleEn: 'Gate test', categoryId: fixture.categoryId, lang: 'en',
  bodyEn: '<p>hello world, long enough to publish</p>', ...over,
});

test('publish gates: email_unverified → terms_not_accepted → accept → published', async () => {
  // Fresh accounts are unverified — publish refused, DRAFT still fine.
  const asDraft = await call('POST', '/posts', { token: author.token, body: draft({ status: 'draft' }) });
  expect(asDraft.status).toBe(201);
  const r1 = await call('POST', '/posts', { token: author.token, body: draft({ status: 'published' }) });
  expect(r1.status).toBe(403);
  expect(r1.json.error).toBe('email_unverified');

  const { db: d, pool } = db();
  try { await d.update(users).set({ emailVerified: true }).where(eq(users.id, author.id)); }
  finally { await pool.end(); }

  const r2 = await call('POST', '/posts', { token: author.token, body: draft({ status: 'published' }) });
  expect(r2.status).toBe(403);
  expect(r2.json.error).toBe('terms_not_accepted');

  const acc = await call('POST', '/users/me/accept-terms', { token: author.token });
  expect(acc.status).toBe(200);

  const r3 = await call('POST', '/posts', { token: author.token, body: draft({ status: 'published' }) });
  expect(r3.status).toBe(201);

  // Publishing the earlier draft via PUT is also allowed now.
  const put = await call('PUT', `/posts/${asDraft.json.post.id}`, { token: author.token, body: { status: 'published' } });
  expect(put.status).toBe(200);
});

test('piracy links: blocked on publish + comments, allowed in drafts', async () => {
  const pirate = '<p>watch it at <a href="https://gogoanime.tv/ep-1">here</a></p>';
  // Draft with a pirate link saves fine (autosave must never wedge).
  const dr = await call('POST', '/posts', { token: author.token, body: draft({ status: 'draft', bodyEn: pirate }) });
  expect(dr.status).toBe(201);
  // Publishing it is refused — both on create and on the status-flip PUT.
  const pub = await call('POST', '/posts', { token: author.token, body: draft({ status: 'published', bodyEn: pirate }) });
  expect(pub.status).toBe(400);
  expect(pub.json.error).toBe('piracy_link');
  const flip = await call('PUT', `/posts/${dr.json.post.id}`, { token: author.token, body: { status: 'published' } });
  expect(flip.status).toBe(400);
  expect(flip.json.error).toBe('piracy_link');
  // Comment with a bare pirate URL → refused.
  const cm = await call('POST', `/posts/${fixture.id}/comments`, { token: author.token, body: { body: 'free at https://9anime.to/x' } });
  expect(cm.status).toBe(400);
  expect(cm.json.error).toBe('piracy_link');
  // TLD hop still caught; subdomains of innocent hosts are not.
  expect(findBlockedLink('see https://www.gogoanime.io/show')).toBeTruthy();
  expect(findBlockedLinkHtml('<a href="https://zoro.fandom.com/wiki">wiki</a>')).toBeNull();
});

test('profanity: masked for the public, raw for the owner, HTML-safe', () => {
  const row = {
    id: 'p1', authorId: 'u1', categoryId: 'c1', lang: 'en', slug: 's',
    titleEn: 'What the fuck is natto', titleJa: 'くたばれ納豆', excerptEn: 'shit happens', excerptJa: '',
    bodyEn: '<p>fuck this</p><img src="https://x/media/u/fuck-cool.webp">', bodyJa: '',
    cover: null, coverLabel: '', coverCredit: '', status: 'published', translationStatus: 'none',
    isHidden: false, hiddenReason: null, density: 'compact', score: null, tags: [],
    likes: 0, saves: 0, comments: 0, publishedAt: 1, createdAt: 1, updatedAt: 1,
  } as any;
  const pub = publicPost(row);
  expect(pub.titleEn).toBe('What the ●●●● is natto');
  expect(pub.titleJa).toContain('●●●●');
  expect(pub.excerptEn).toBe('●●●● happens');
  expect(pub.bodyEn).toContain('<p>●●●● this</p>');
  expect(pub.bodyEn).toContain('fuck-cool.webp'); // URLs inside tags are never touched
  const own = publicPost(row, true);
  expect(own.titleEn).toBe('What the fuck is natto');
  expect(own.bodyEn).toBe(row.bodyEn);
  // Clean text passes through untouched (fast-bail path).
  expect(maskProfanityHtml('<p>lovely onsen town</p>')).toBe('<p>lovely onsen town</p>');
  expect(maskProfanity('regular sentence')).toBe('regular sentence');
});
