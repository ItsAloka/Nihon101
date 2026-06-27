/* Sunday Letter — the weekly send job. Driven by the Sunday cron in src/index.ts.
 *
 *   1. kill switch (admin) → if off, do nothing.
 *   2. pick this week's top trending posts (one shared set, both languages).
 *   3. walk newsletter_subscribers in keyset pages; for each recipient build the
 *      letter in their locale with a signed unsubscribe link, and send in Resend
 *      batches of 100.
 *
 * Scale note (~50k): one weekly run sends ≤ N/100 batch subrequests. That's fine
 * for a list in the thousands; before it grows past the Worker subrequest ceiling,
 * move the send onto a Cloudflare Queue (enqueue here, consumer does the batches).
 */
import { eq } from 'drizzle-orm';
import type { DB } from '../db/client';
import type { AppEnv } from '../types';
import { categories } from '../db/schema';
import { listTrending } from '../db/queries/trending';
import { getSettings } from '../db/queries/admin';
import { subscribersForSend, markSent } from '../db/queries/newsletter';
import { sundayLetterHtml, sendBatch, type LetterPost, type WordOfWeek, type BatchEmail } from './mail';
import { signUnsub } from './unsubscribe';

const WEEK = 7 * 24 * 60 * 60 * 1000;
const ISSUE_EPOCH = Date.UTC(2025, 0, 5); // 2025-01-05, the first Sunday — issue #1
const PAGE = 500;   // subscribers fetched per DB page
const BATCH = 100;  // Resend /emails/batch hard cap

/** A short rotating editorial intro + word of the week so consecutive issues
 *  don't read identically. Indexed by issue number. */
const INTROS: Array<{ en: string; ja: string }> = [
  { en: "This week we kept coming back to the things that aren't said — the pauses, the spaces, the quiet. Here are the three reads that stayed with us.",
    ja: '今週は「語られないもの」——間（ま）や余白、静けさ——に何度も立ち返りました。心に残った三本をお届けします。' },
  { en: "A slow week, in the best way. Three stories about doing one thing carefully, and what Japan can teach us about it.",
    ja: 'いい意味で、ゆっくりとした一週間でした。ひとつのことを丁寧にする——日本が教えてくれる三つの物語を。' },
  { en: "Some weeks the small things win. A rice ball, a side street, a single word. Here's what readers loved most.",
    ja: '小さなものが勝つ週もあります。おにぎり、路地、ひとつのことば。読者がいちばん愛した三本です。' },
];

const WORDS: WordOfWeek[] = [
  { term: '間', reading: 'ma', gloss: 'Pause, gap, interval — the silence between notes that makes music, not noise.' },
  { term: '侘寂', reading: 'wabi-sabi', gloss: 'The quiet beauty of things imperfect, impermanent, and incomplete.' },
  { term: '木漏れ日', reading: 'komorebi', gloss: 'Sunlight filtering through the leaves of trees.' },
  { term: '一期一会', reading: 'ichigo ichie', gloss: 'One time, one meeting — treasure every encounter, it never repeats.' },
];
const WORDS_JA: Record<string, string> = {
  '間': '音と音のあいだの静けさ。それが雑音を音楽に変える。',
  '侘寂': '不完全で、移ろい、満たされないものに宿る静かな美しさ。',
  '木漏れ日': '木々の葉のあいだから差し込む陽の光。',
  '一期一会': '一度きりの出会いを大切に。同じ時は二度と来ない。',
};

function issueNumber(now: number): number {
  return Math.max(1, Math.floor((now - ISSUE_EPOCH) / WEEK) + 1);
}

function dateLabel(now: number, jp: boolean): string {
  const fmt = new Intl.DateTimeFormat(jp ? 'ja-JP' : 'en-GB', {
    year: 'numeric', month: jp ? 'long' : 'long', day: 'numeric', timeZone: 'Asia/Tokyo',
  });
  return fmt.format(new Date(now));
}

/** Map a trending card → the locale-specific LetterPost the template wants,
 *  falling back to the other language if one side is somehow empty. */
function toLetterPost(
  card: { titleEn: string | null; titleJa: string | null; excerptEn: string | null; excerptJa: string | null;
          cover: string | null; slug: string; categoryId: string },
  cats: Map<string, { en: string; ja: string }>,
  origin: string,
  locale: 'ja' | 'en',
): LetterPost {
  const jp = locale === 'ja';
  const title = (jp ? card.titleJa : card.titleEn) || card.titleEn || card.titleJa || '';
  const excerpt = (jp ? card.excerptJa : card.excerptEn) || card.excerptEn || card.excerptJa || '';
  const cat = cats.get(card.categoryId);
  return {
    title, excerpt,
    cover: card.cover ?? null,
    category: cat ? (jp ? cat.ja : cat.en) : '',
    url: `${origin}/${locale}/p/${card.slug}`,
  };
}

export interface SundayLetterResult { sent: number; skipped: 'disabled' | 'no_posts' | null; }

export async function sendSundayLetter(db: DB, env: AppEnv['Bindings']): Promise<SundayLetterResult> {
  // 1. kill switch — admin can stop every send from the dashboard.
  const settings = await getSettings(db);
  if (!settings.newsletterEnabled) return { sent: 0, skipped: 'disabled' };

  // 2. this week's shared top reads (top 3 distinct after the global author cap is
  //    already applied upstream by trend_score ordering; we just take the first 3).
  const cards = await listTrending(db, 3);
  if (!cards.length) return { sent: 0, skipped: 'no_posts' };

  const catRows = await db.select({ id: categories.id, en: categories.labelEn, ja: categories.labelJa }).from(categories);
  const cats = new Map(catRows.map((c) => [c.id, { en: c.en, ja: c.ja }]));

  const now = Date.now();
  const issue = issueNumber(now);
  const intro = INTROS[issue % INTROS.length];
  const word = WORDS[issue % WORDS.length];
  const origin = env.FRONTEND_ORIGIN;

  // Precompute the per-locale post lists + word (recipient-invariant); only the
  // unsubscribe link changes per recipient, so the heavy mapping happens once.
  const build = (locale: 'ja' | 'en') => {
    const jp = locale === 'ja';
    return {
      posts: cards.map((c) => toLetterPost(c, cats, origin, locale)),
      word: jp ? { ...word, gloss: WORDS_JA[word.term] ?? word.gloss } : word,
      intro: jp ? intro.ja : intro.en,
      dateLabel: dateLabel(now, jp),
      seeAllUrl: `${origin}/${locale}/trending`,
    };
  };
  const base = { ja: build('ja'), en: build('en') };

  // 3. walk the list and send in batches of 100.
  const apiKey = env.RESEND_API_KEY;
  const from = env.RESEND_FROM_NEWSLETTER;
  let after: string | undefined;
  let sent = 0;

  for (;;) {
    const page = await subscribersForSend(db, { limit: PAGE, after, issue });
    if (!page.length) break;

    for (let i = 0; i < page.length; i += BATCH) {
      const chunk = page.slice(i, i + BATCH);
      const emails: BatchEmail[] = await Promise.all(chunk.map(async (s) => {
        const b = base[s.locale];
        const token = await signUnsub(env.REFRESH_PEPPER, s.id);
        const unsubscribeUrl = `${env.API_ORIGIN}/newsletter/unsubscribe?t=${encodeURIComponent(token)}${s.locale === 'ja' ? '&lang=ja' : ''}`;
        const { subject, html } = sundayLetterHtml(
          { issue, dateLabel: b.dateLabel, intro: b.intro, posts: b.posts, word: b.word, seeAllUrl: b.seeAllUrl, unsubscribeUrl },
          s.locale,
        );
        return {
          from, to: s.email, subject, html,
          // One-click unsubscribe — Gmail/Apple honor these for bulk mail.
          headers: {
            'List-Unsubscribe': `<${unsubscribeUrl}>`,
            'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
          },
        };
      }));
      // Checkpoint only on a delivered batch: a failed batch stays below the issue
      // number so it's retried next run, and a crash after this point can't re-mail
      // the batches already stamped.
      if (await sendBatch(apiKey, emails)) {
        await markSent(db, chunk.map((s) => s.id), issue);
        sent += emails.length;
      }
    }

    after = page[page.length - 1].id;
    if (page.length < PAGE) break;
  }

  return { sent, skipped: null };
}
