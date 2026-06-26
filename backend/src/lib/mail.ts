// Resend is used ONLY for transactional auth emails — welcome, password reset,
// email verification, and login codes (per plan — no newsletter, no notification
// emails). If no API key is configured (local dev), we log to the console so the
// flow is testable.

import { fetchWithTimeout } from './http';

type SendArgs = {
  apiKey: string;
  from: string;
  to: string;
  subject: string;
  html: string;
  replyTo?: string;  // so an admin reply / contact notice can be replied to directly
  headers?: Record<string, string>;  // e.g. List-Unsubscribe for the newsletter
};

export async function sendEmail({ apiKey, from, to, subject, html, replyTo, headers }: SendArgs): Promise<void> {
  if (!apiKey) {
    console.log(`[mail:dev] would send to ${to}${replyTo ? ` (reply-to ${replyTo})` : ''} — "${subject}"\n${html}`);
    return;
  }
  const res = await fetchWithTimeout('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to, subject, html, ...(replyTo ? { reply_to: replyTo } : {}), ...(headers ? { headers } : {}) }),
    timeoutMs: 10_000,
    retries: 1, // a reset/verify email is worth one retry over a transient blip
  });
  if (!res.ok) {
    console.error('[mail] resend failed', res.status, await res.text());
    throw new Error('mail_send_failed');
  }
}

export type BatchEmail = {
  from: string;
  to: string;
  subject: string;
  html: string;
  headers?: Record<string, string>;
};

/** Send up to 100 distinct emails in one Resend call (POST /emails/batch). The
 *  Sunday Letter personalises each body (its unsubscribe link), so this is the
 *  per-recipient path, chunked by the caller. Returns false on failure so the
 *  caller can keep going to the next chunk rather than aborting the whole run. */
export async function sendBatch(apiKey: string, emails: BatchEmail[]): Promise<boolean> {
  if (!emails.length) return true;
  if (!apiKey) {
    console.log(`[mail:dev] would batch-send ${emails.length} emails — first: ${emails[0].to} "${emails[0].subject}"`);
    return true;
  }
  const res = await fetchWithTimeout('https://api.resend.com/emails/batch', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(emails.map((e) => ({
      from: e.from, to: e.to, subject: e.subject, html: e.html, ...(e.headers ? { headers: e.headers } : {}),
    }))),
    timeoutMs: 20_000,
    retries: 1,
  });
  if (!res.ok) {
    console.error('[mail] resend batch failed', res.status, await res.text());
    return false;
  }
  return true;
}

/* ─────────────────────────────────────────────────────────────────────────────
 * Branded email shell. Table-based + fully inline styles for mail-client compat
 * (Gmail/Outlook strip <style> and flexbox). The palette mirrors the site: paper
 * background, ink text, the nihon1●1 wordmark with its rose dot, rose accents.
 * ──────────────────────────────────────────────────────────────────────────── */
const INK = '#1A1817';
const INK_SOFT = '#5C544C';
const ROSE = '#D63752';
const ROSE_DARK = '#BE2C45';
const ROSE_SOFT = '#FBE9EC';
const INDIGO = '#3B5168';
const GOLD = '#C9923B';
const PAPER = '#F4EEE4';
const CARD = '#FFFFFF';
const LINE = '#EAE2D6';

/** A primary call-to-action button (bulletproof-ish for Outlook via padding).
 * `bg` lets a template pick the indigo accent (used by the verify email). */
function button(href: string, label: string, bg: string = ROSE): string {
  return `<a href="${href}" style="display:inline-block;background:${bg};color:#ffffff;font-weight:700;font-size:15px;text-decoration:none;padding:13px 28px;border-radius:10px;font-family:'Helvetica Neue',Arial,sans-serif">${label}</a>`;
}

/** The login code as a red hanko seal — the code sits in white on a rose disk.
 * Pure CSS (no SVG) so it renders in Gmail/Outlook; Outlook drops border-radius
 * and the disk degrades to a rose square, which still reads fine. */
function codeSeal(code: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" align="center" style="margin:6px auto 2px"><tr>
    <td width="150" height="150" align="center" valign="middle"
        style="width:150px;height:150px;background:${ROSE};border:6px solid #ffffff;border-radius:75px;box-shadow:0 0 0 5px ${ROSE_DARK};mso-padding-alt:0">
      <span style="font-family:'SFMono-Regular',Consolas,monospace;font-size:30px;font-weight:700;letter-spacing:0.14em;color:#ffffff">${code}</span>
    </td>
  </tr></table>`;
}

/** A blooming sakura mark for the welcome email hero (inline SVG — renders in
 * Apple/iOS Mail; clients that strip SVG simply show the title below it). */
function sakuraMark(): string {
  const petal = 'M0 -52 C 13 -38 13 -20 0 -10 C -13 -20 -13 -38 0 -52 Z';
  const petals = [0, 72, 144, 216, 288]
    .map((d) => `<path d="${petal}" transform="rotate(${d})" fill="${ROSE_SOFT}" stroke="${ROSE}" stroke-width="3"/>`)
    .join('');
  return `<svg viewBox="0 0 160 160" width="112" height="112" aria-hidden="true" style="display:block;margin:0 auto 6px">
    <g transform="translate(80,80)">${petals}<circle r="8" fill="${GOLD}"/></g>
  </svg>`;
}

/** Wrap inner content in the branded card + header wordmark + footer. `inner`
 * is already-trusted HTML built by the template functions below. */
function shell(inner: string, footnote: string): string {
  return `<!doctype html><html><body style="margin:0;padding:0;background:${PAPER}">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${PAPER};padding:32px 12px">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;width:100%">
        <tr><td align="center" style="padding:8px 0 22px">
          <span style="font-family:Georgia,'Times New Roman',serif;font-size:26px;font-weight:700;letter-spacing:-0.01em;color:${INK}">nihon1<span style="color:${ROSE}">●</span>1</span>
        </td></tr>
        <tr><td style="background:${CARD};border:1px solid ${LINE};border-radius:18px;padding:38px 40px">
          ${inner}
        </td></tr>
        <tr><td align="center" style="padding:20px 16px 4px">
          <p style="margin:0;font-family:'Helvetica Neue',Arial,sans-serif;font-size:12px;line-height:1.6;color:${INK_SOFT}">${footnote}</p>
          <p style="margin:8px 0 0;font-family:'Helvetica Neue',Arial,sans-serif;font-size:11px;color:#9C948A">Nihon101 · a slow read on Japan · nihon101.com</p>
        </td></tr>
      </table>
    </td></tr>
  </table></body></html>`;
}

/** Title + body paragraph(s) block, shared by every template. */
function block(title: string, bodyHtml: string): string {
  return `<h1 style="margin:0 0 14px;font-family:Georgia,'Times New Roman',serif;font-size:23px;font-weight:600;color:${INK}">${title}</h1>
    <div style="font-family:'Helvetica Neue',Arial,sans-serif;font-size:15px;line-height:1.65;color:${INK_SOFT}">${bodyHtml}</div>`;
}

/** Center a block of card content — the chosen designs are all centered. */
function center(inner: string): string {
  return `<div style="text-align:center">${inner}</div>`;
}

/** Escape HTML so a user-set display name can't inject markup into the email. */
function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}

export function welcomeEmailHtml(name: string, link: string, locale: 'ja' | 'en'): { subject: string; html: string } {
  const who = esc(name?.trim() || (locale === 'ja' ? 'ようこそ' : 'there'));
  if (locale === 'ja') {
    return {
      subject: 'Nihon101へようこそ 🌸',
      html: shell(
        center(sakuraMark() +
        block(`${who}さん、ようこそ。`,
          `<p style="margin:0 0 16px">Nihon101へのご登録ありがとうございます。日本の文化・食・旅・言葉・アニメ・歴史を、ゆっくり読むための場所です。</p>
           <p style="margin:0 0 24px">読むのはもちろん、あなた自身の物語を書いて公開することもできます。まずはホームを覗いてみてください。</p>
           <p style="margin:0 0 8px">${button(link, 'はじめる')}</p>`)),
        '心当たりがない場合は、このメールを無視してください。',
      ),
    };
  }
  return {
    subject: 'Welcome to Nihon101 🌸',
    html: shell(
      center(sakuraMark() +
      block(`Welcome, ${who}.`,
        `<p style="margin:0 0 16px">Thanks for joining Nihon101 — a quiet corner of the internet for Japan's culture, food, travel, language, anime, and history.</p>
         <p style="margin:0 0 24px">Read at your own pace, follow writers you love, and when you're ready, publish a story of your own.</p>
         <p style="margin:0 0 8px">${button(link, 'Start reading')}</p>`)),
      "If you didn't create this account, you can safely ignore this email.",
    ),
  };
}

export function resetEmailHtml(link: string, locale: 'ja' | 'en'): { subject: string; html: string } {
  if (locale === 'ja') {
    return {
      subject: 'Nihon101 — パスワードの再設定',
      html: shell(
        center(block('パスワードの再設定',
          `<p style="margin:0 0 24px">下のボタンから新しいパスワードを設定してください。リンクは1時間有効です。</p>
           <p style="margin:0">${button(link, 'パスワードを再設定')}</p>`)),
        '心当たりがない場合は、このメールを無視してください。',
      ),
    };
  }
  return {
    subject: 'Nihon101 — Reset your password',
    html: shell(
      center(block('Reset your password',
        `<p style="margin:0 0 24px">Click the button below to set a new password. This link expires in 1 hour.</p>
         <p style="margin:0">${button(link, 'Reset password')}</p>`)),
      "If you didn't request this, you can ignore this email.",
    ),
  };
}

export function loginOtpHtml(code: string, locale: 'ja' | 'en'): { subject: string; html: string } {
  if (locale === 'ja') {
    return {
      subject: `Nihon101 — ログインコード ${code}`,
      html: shell(
        center(block('ログインコード',
          `<p style="margin:0 0 14px">下のコードを入力してログインを完了してください。10分間有効です。</p>`) +
          codeSeal(code) +
          `<p style="margin:14px 0 0;font-family:'Helvetica Neue',Arial,sans-serif;font-size:12px;color:#9C948A">押印済み・10分間有効</p>`),
        '心当たりがない場合は、このメールを無視してください。誰かがあなたのパスワードを入力した可能性があります。',
      ),
    };
  }
  return {
    subject: `Nihon101 — Your login code ${code}`,
    html: shell(
      center(block('Your login code',
        `<p style="margin:0 0 14px">Enter the code below to finish signing in. It expires in 10 minutes.</p>`) +
        codeSeal(code) +
        `<p style="margin:14px 0 0;font-family:'Helvetica Neue',Arial,sans-serif;font-size:12px;color:#9C948A">Stamped &amp; expires in 10 minutes</p>`),
      "If you didn't try to sign in, ignore this email — someone may have entered your password.",
    ),
  };
}

export function verifyEmailHtml(link: string, locale: 'ja' | 'en'): { subject: string; html: string } {
  if (locale === 'ja') {
    return {
      subject: 'Nihon101 — メールアドレスの確認',
      html: shell(
        center(block('メールアドレスの確認',
          `<p style="margin:0 0 24px">下のボタンを押して、メールアドレスの確認を完了してください。リンクは24時間有効です。</p>
           <p style="margin:0">${button(link, 'メールを確認')}</p>`)),
        '心当たりがない場合は、このメールを無視してください。',
      ),
    };
  }
  return {
    subject: 'Nihon101 — Verify your email',
    html: shell(
      center(block('Verify your email',
        `<p style="margin:0 0 24px">Click the button below to confirm your email address. This link expires in 24 hours.</p>
         <p style="margin:0">${button(link, 'Verify email')}</p>`)),
      "If you didn't create this account, you can ignore this email.",
    ),
  };
}

/* ─────────────────────────────────────────────────────────────────────────────
 * Sunday Letter — the weekly newsletter (picker variant B, "The Letter").
 * Personal intro → one feature read with cover → 2 smaller reads → word of the
 * week. Sent to newsletter_subscribers; gated by the admin kill switch upstream.
 * ──────────────────────────────────────────────────────────────────────────── */

export type LetterPost = {
  title: string;
  excerpt: string;
  url: string;
  cover?: string | null;           // absolute image URL (post cover)
  category: string;                // already-localized label, e.g. "Language" / "言語"
};

export type WordOfWeek = { term: string; reading: string; gloss: string };

const CAT_COLORS = [ROSE, GOLD, INDIGO];

/** A small "also this week" row: thumbnail + category + title + read link. */
function letterRow(p: LetterPost, color: string, readLabel: string): string {
  const thumb = p.cover
    ? `<img src="${esc(p.cover)}" width="56" height="56" alt="" style="display:block;border-radius:8px;object-fit:cover">`
    : `<div style="width:56px;height:56px;border-radius:8px;background:${PAPER}"></div>`;
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:14px"><tr>
    <td width="56" style="vertical-align:middle;padding-right:12px">${thumb}</td>
    <td style="vertical-align:middle">
      <p style="margin:0 0 3px;font-family:'Helvetica Neue',Arial,sans-serif;font-size:11px;font-weight:700;color:${color};text-transform:uppercase;letter-spacing:0.06em">${esc(p.category)}</p>
      <p style="margin:0 0 4px;font-family:Georgia,'Times New Roman',serif;font-size:15px;font-weight:600;color:${INK};line-height:1.3">${esc(p.title)}</p>
      <a href="${esc(p.url)}" style="font-family:'Helvetica Neue',Arial,sans-serif;font-size:12px;color:${ROSE};text-decoration:none;font-weight:700">${readLabel} →</a>
    </td>
  </tr></table>`;
}

/**
 * Build the Sunday Letter. `posts[0]` is the feature; up to two more become the
 * "also this week" rows. `intro` is the editorial lede; `word` is optional.
 */
export function sundayLetterHtml(
  args: {
    issue: number;
    dateLabel: string;          // e.g. "29 June 2025" / "2025年6月29日"
    intro: string;
    posts: LetterPost[];
    word?: WordOfWeek | null;
    seeAllUrl: string;
    unsubscribeUrl: string;
  },
  locale: 'ja' | 'en',
): { subject: string; html: string } {
  const jp = locale === 'ja';
  const feature = args.posts[0];
  const rest = args.posts.slice(1, 3);
  const t = jp
    ? { kicker: 'ゆっくり読む週刊レター', read: 'この一週間の一本', cta: '全文を読む', also: '今週はほかにも', more: '読む', seeAll: '今週のトレンドをすべて見る', word: '今週のことば', sub: 'nihon101.com で購読中', unsub: '配信停止', subject: `日曜レター #${args.issue} — 今週の三本` }
    : { kicker: 'A slow weekly letter', read: "This week's read", cta: 'Read the full story', also: 'Also this week', more: 'Read', seeAll: 'See all trending this week', word: 'Word of the week', sub: 'You subscribed at nihon101.com', unsub: 'Unsubscribe', subject: `Sunday Letter #${args.issue} — this week's three reads` };

  const issueLabel = jp ? `第${args.issue}号` : `Issue #${args.issue}`;
  const cover = feature?.cover
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:22px"><tr><td>
        <img src="${esc(feature.cover)}" width="100%" alt="" style="display:block;width:100%;border-radius:10px;object-fit:cover;max-height:220px">
      </td></tr></table>`
    : '';

  const wordBox = args.word
    ? `<div style="height:1px;background:${LINE};margin:24px 0"></div>
       <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
         <td style="background:${ROSE_SOFT};border-radius:12px;padding:18px 22px">
           <p style="margin:0 0 4px;font-family:'Helvetica Neue',Arial,sans-serif;font-size:10px;font-weight:700;letter-spacing:0.12em;color:${ROSE};text-transform:uppercase">${t.word}</p>
           <p style="margin:0 0 6px;font-family:Georgia,'Times New Roman',serif;font-size:32px;font-weight:600;color:${INK}">${esc(args.word.term)} <span style="font-size:16px;color:#9C948A;font-weight:400">· ${esc(args.word.reading)}</span></p>
           <p style="margin:0;font-family:'Helvetica Neue',Arial,sans-serif;font-size:13px;line-height:1.6;color:${INK_SOFT}">${esc(args.word.gloss)}</p>
         </td>
       </tr></table>`
    : '';

  const restRows = rest.length
    ? `<div style="height:1px;background:${LINE};margin:24px 0"></div>
       <p style="margin:0 0 12px;font-family:'Helvetica Neue',Arial,sans-serif;font-size:10px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:#9C948A">${t.also}</p>
       ${rest.map((p, i) => letterRow(p, CAT_COLORS[(i + 1) % CAT_COLORS.length], t.more)).join('')}`
    : '';

  const inner = `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:-38px -40px 0;width:auto">
      <tr><td style="background:${ROSE_SOFT};border-bottom:1px solid #F0D4DB;padding:12px 40px">
        <p style="margin:0;font-family:'Helvetica Neue',Arial,sans-serif;font-size:11px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:${ROSE}">${esc(args.dateLabel)} · ${t.kicker}</p>
      </td></tr>
    </table>
    <div style="padding-top:30px">
      <p style="margin:0 0 22px;font-family:Georgia,'Times New Roman',serif;font-size:17px;line-height:1.75;color:${INK_SOFT};font-style:italic">${esc(args.intro)}</p>
      <div style="height:1px;background:${LINE};margin:0 0 24px"></div>
      <p style="margin:0 0 8px;font-family:'Helvetica Neue',Arial,sans-serif;font-size:10px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:${ROSE}">${t.read}</p>
      <h2 style="margin:0 0 10px;font-family:Georgia,'Times New Roman',serif;font-size:22px;font-weight:600;line-height:1.3;color:${INK}">${esc(feature?.title ?? '')}</h2>
      <p style="margin:0 0 16px;font-family:'Helvetica Neue',Arial,sans-serif;font-size:15px;line-height:1.65;color:${INK_SOFT}">${esc(feature?.excerpt ?? '')}</p>
      ${cover}
      <p style="margin:0 0 4px;text-align:center">${button(feature?.url ?? args.seeAllUrl, t.cta)}</p>
      ${restRows}
      ${wordBox}
    </div>`;

  const footnote = `${t.sub} · <a href="${esc(args.unsubscribeUrl)}" style="color:${ROSE};text-decoration:none">${t.unsub}</a> · ${issueLabel}`;
  return { subject: t.subject, html: shell(inner, footnote) };
}
