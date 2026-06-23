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
};

export async function sendEmail({ apiKey, from, to, subject, html, replyTo }: SendArgs): Promise<void> {
  if (!apiKey) {
    console.log(`[mail:dev] would send to ${to}${replyTo ? ` (reply-to ${replyTo})` : ''} — "${subject}"\n${html}`);
    return;
  }
  const res = await fetchWithTimeout('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to, subject, html, ...(replyTo ? { reply_to: replyTo } : {}) }),
    timeoutMs: 10_000,
    retries: 1, // a reset/verify email is worth one retry over a transient blip
  });
  if (!res.ok) {
    console.error('[mail] resend failed', res.status, await res.text());
    throw new Error('mail_send_failed');
  }
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
           <p style="margin:0">${button(link, 'メールを確認', INDIGO)}</p>`)),
        '心当たりがない場合は、このメールを無視してください。',
      ),
    };
  }
  return {
    subject: 'Nihon101 — Verify your email',
    html: shell(
      center(block('Verify your email',
        `<p style="margin:0 0 24px">Click the button below to confirm your email address. This link expires in 24 hours.</p>
         <p style="margin:0">${button(link, 'Verify email', INDIGO)}</p>`)),
      "If you didn't create this account, you can ignore this email.",
    ),
  };
}
