/* Stored-translation audit (lib/translation-audit.ts) — the backfill half of
 * the untranslated-output guard: it must find a 'done' post whose generated
 * locale still carries source-language blocks, leave clean bilingual posts
 * alone, and (via requeueTranslations) send offenders back through the queue.
 * Runs against the seeded testing branch, so the dry run also doubles as a
 * false-positive canary over all seeded bilingual posts. */
import { describe, it, expect, afterAll } from 'bun:test';
import { eq } from 'drizzle-orm';
import { posts } from '../src/db/schema';
import { auditTranslations } from '../src/lib/translation-audit';
import { requeueTranslations } from '../src/db/queries/translation';
import { db, makeUser, makePost, deleteUsers } from './helpers';

const created: string[] = [];
const cleanups: (() => Promise<void>)[] = [];
afterAll(async () => {
  for (const c of cleanups) await c().catch(() => {});
  if (created.length) await deleteUsers(...created);
});

const JA_P = '<p>神道は日本固有の宗教で、自然や祖先への敬意から生まれました。</p>';
const EN_P = '<p>Shinto is Japan’s native spiritual tradition, built on respect for nature and ancestors.</p>';
const EN_SECTION = '<h2>Shinto Shrines: Places Where People Connect With Kami</h2>' + EN_P;

/** bodyEn defaults to the same tag structure as the given bodyJa, so only the
 * defect under test fires — the audit also compares markup between the sides. */
async function makeDonePost(authorId: string, bodyJa: string, bodyEn?: string) {
  const made = await makePost(authorId);
  cleanups.push(made.cleanup);
  const { db: d, pool } = db();
  try {
    await d.update(posts).set({
      lang: 'en',
      titleEn: 'Religion in Japan', titleJa: '日本の宗教',
      excerptEn: 'A gentle introduction.', excerptJa: 'やさしい入門。',
      bodyEn: bodyEn ?? bodyJa.replace(/<p>[^<]*<\/p>/g, EN_P).replace(/<h2>[^<]*<\/h2>/g, '<h2>A Heading</h2>'),
      bodyJa,
      translationStatus: 'done',
    }).where(eq(posts.id, made.id));
  } finally { await pool.end(); }
  return made.id;
}

describe('translation audit', () => {
  it('flags a done post whose Japanese body kept an English section; clean posts pass', async () => {
    const u = await makeUser('tra'); created.push(u.id);
    const brokenId = await makeDonePost(u.id, JA_P + EN_SECTION + JA_P);
    const cleanId = await makeDonePost(u.id, JA_P + '<h2>日本文化における「神」の役割</h2>' + JA_P);

    const { db: d, pool } = db();
    try {
      const res = await auditTranslations(d, false);
      const flaggedIds = res.findings.map((f) => f.id);
      expect(flaggedIds).toContain(brokenId);
      expect(flaggedIds).not.toContain(cleanId);
      expect(res.requeued).toBe(0);

      const broken = res.findings.find((f) => f.id === brokenId)!;
      expect(broken.locale).toBe('ja');
      expect(broken.fields).toContain('body');

      // Dry run must not touch the queue.
      const row = (await d.select().from(posts).where(eq(posts.id, brokenId)))[0];
      expect(row.translationStatus).toBe('done');

      // Canary: the seeded bilingual posts should not trip the heuristic. Not
      // asserted to zero (seed content may change), but surfaced loudly.
      const others = res.findings.filter((f) => f.id !== brokenId);
      if (others.length) console.warn('translation-audit canary — seeded posts flagged:', others.map((f) => f.slug));
    } finally { await pool.end(); }
  }, 30_000);

  it('flags markup drift: a bold span dropped by the translation', async () => {
    const u = await makeUser('trc'); created.push(u.id);
    const id = await makeDonePost(
      u.id,
      '<p>キリスト教は16世紀に日本へ伝わりました。</p>', // bold lost in translation
      '<p>Christianity arrived in Japan in the <strong>16th century</strong>.</p>',
    );
    const { db: d, pool } = db();
    try {
      const res = await auditTranslations(d, false);
      const f = res.findings.find((x) => x.id === id);
      expect(f).toBeDefined();
      expect(f!.fields).toEqual(['structure']);
      expect(f!.detail).toBe('tag_strong_1_vs_0');
    } finally { await pool.end(); }
  }, 30_000);

  it('requeueTranslations sends a flagged post back through the cron queue', async () => {
    const u = await makeUser('trb'); created.push(u.id);
    const id = await makeDonePost(u.id, JA_P + EN_SECTION);

    const { db: d, pool } = db();
    try {
      await requeueTranslations(d, [id]);
      const row = (await d.select().from(posts).where(eq(posts.id, id)))[0];
      expect(row.translationStatus).toBe('pending');
      expect(row.translationAttempts).toBe(0);
      expect(row.translationClaimedAt).toBeNull();
    } finally { await pool.end(); }
  });
});
