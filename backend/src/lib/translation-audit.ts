/* Stored-translation audit — finds posts whose GENERATED locale still contains
 * source-language segments (posts translated before the per-chunk output check
 * in lib/openai.ts existed, or whose translated side was saved with gaps).
 * Admin-triggered via POST /admin/translation-audit: scans every
 * translation_status='done' post, script-checks the generated side, and — only
 * when asked — re-queues the offenders for the cron sweep, which re-translates
 * them under the per-chunk check.
 *
 * Manual by design, twice over: (1) authors may hand-edit the generated side
 * after review, and an automatic re-queue would silently overwrite that work;
 * (2) a post that legitimately trips the heuristic (say, a long quoted English
 * poem inside a Japanese piece) would ping-pong forever under automation. A
 * human reads the report, then pulls the trigger. */

import type { DB } from '../db/client';
import { htmlHasUntranslatedBlock, textLooksUntranslated, type Locale } from './openai';
import { listDoneTranslations, requeueTranslations, type DoneTranslationRow } from '../db/queries/translation';

export interface TranslationAuditFinding {
  id: string;
  slug: string;
  lang: string;                             // source locale — the other side is generated
  locale: Locale;                           // generated locale that failed the check
  fields: ('title' | 'excerpt' | 'body')[]; // which parts still look untranslated
}

export interface TranslationAuditResult {
  checked: number;
  findings: TranslationAuditFinding[];
  requeued: number;
}

const BATCH = 50;         // bodies can be ~100KB each — keep each page modest
const MAX_SCANNED = 2000; // request-time guard; re-run the audit for any rest

/** Check one post's generated side. Null = clean. */
function auditPost(p: DoneTranslationRow): TranslationAuditFinding | null {
  const to: Locale = p.lang === 'ja' ? 'en' : 'ja';
  const title = to === 'ja' ? p.titleJa : p.titleEn;
  const excerpt = to === 'ja' ? p.excerptJa : p.excerptEn;
  const body = to === 'ja' ? p.bodyJa : p.bodyEn;

  const fields: TranslationAuditFinding['fields'] = [];
  if (title.trim() && textLooksUntranslated(title, to, true)) fields.push('title');
  if (excerpt.trim() && textLooksUntranslated(excerpt, to, true)) fields.push('excerpt');
  if (body.trim() && htmlHasUntranslatedBlock(body, to)) fields.push('body');
  return fields.length ? { id: p.id, slug: p.slug, lang: p.lang, locale: to, fields } : null;
}

export async function auditTranslations(db: DB, requeue: boolean): Promise<TranslationAuditResult> {
  const findings: TranslationAuditFinding[] = [];
  let checked = 0;

  for (let offset = 0; offset < MAX_SCANNED; offset += BATCH) {
    const rows = await listDoneTranslations(db, BATCH, offset);
    for (const p of rows) {
      checked++;
      const f = auditPost(p);
      if (f) findings.push(f);
    }
    if (rows.length < BATCH) break;
  }

  let requeued = 0;
  if (requeue && findings.length) {
    await requeueTranslations(db, findings.map((f) => f.id));
    requeued = findings.length;
  }
  return { checked, findings, requeued };
}
