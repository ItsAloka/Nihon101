// Resend is used ONLY for transactional auth emails — password reset and email
// verification (per plan — no newsletter, no notification emails). If no API key is
// configured (local dev), we log the link to the console so the flow is testable.

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

export function resetEmailHtml(link: string, locale: 'ja' | 'en'): { subject: string; html: string } {
  if (locale === 'ja') {
    return {
      subject: 'Nihon101 — パスワードの再設定',
      html: `<div style="font-family:sans-serif;color:#1A1817">
        <h2 style="font-weight:600">パスワードの再設定</h2>
        <p>下のボタンから新しいパスワードを設定してください。リンクは1時間有効です。</p>
        <p><a href="${link}" style="display:inline-block;background:#D63752;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none">パスワードを再設定</a></p>
        <p style="color:#5C544C;font-size:13px">心当たりがない場合は、このメールを無視してください。</p>
      </div>`,
    };
  }
  return {
    subject: 'Nihon101 — Reset your password',
    html: `<div style="font-family:sans-serif;color:#1A1817">
      <h2 style="font-weight:600">Reset your password</h2>
      <p>Click the button below to set a new password. This link expires in 1 hour.</p>
      <p><a href="${link}" style="display:inline-block;background:#D63752;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none">Reset password</a></p>
      <p style="color:#5C544C;font-size:13px">If you didn't request this, you can ignore this email.</p>
    </div>`,
  };
}

export function loginOtpHtml(code: string, locale: 'ja' | 'en'): { subject: string; html: string } {
  const codeBox = `<p style="font-family:monospace;font-size:32px;font-weight:700;letter-spacing:0.3em;color:#1A1817;margin:18px 0">${code}</p>`;
  if (locale === 'ja') {
    return {
      subject: `Nihon101 — ログインコード ${code}`,
      html: `<div style="font-family:sans-serif;color:#1A1817">
        <h2 style="font-weight:600">ログインコード</h2>
        <p>下のコードを入力してログインを完了してください。10分間有効です。</p>
        ${codeBox}
        <p style="color:#5C544C;font-size:13px">心当たりがない場合は、このメールを無視してください。誰かがあなたのパスワードを入力した可能性があります。</p>
      </div>`,
    };
  }
  return {
    subject: `Nihon101 — Your login code ${code}`,
    html: `<div style="font-family:sans-serif;color:#1A1817">
      <h2 style="font-weight:600">Your login code</h2>
      <p>Enter the code below to finish signing in. It expires in 10 minutes.</p>
      ${codeBox}
      <p style="color:#5C544C;font-size:13px">If you didn't try to sign in, ignore this email — someone may have entered your password.</p>
    </div>`,
  };
}

/** HTML-escape untrusted text before dropping it into an email body. */
function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Notification to the admin contact address when a visitor submits the form. The
 *  visitor's address is set as Reply-To by the caller, so a reply goes straight back. */
export function contactNotifyHtml(name: string, email: string, message: string): { subject: string; html: string } {
  const who = name ? `${esc(name)} (${esc(email)})` : esc(email);
  return {
    subject: `Nihon101 — new contact message from ${name || email}`,
    html: `<div style="font-family:sans-serif;color:#1A1817">
      <h2 style="font-weight:600">New contact message</h2>
      <p style="color:#5C544C">From: <strong>${who}</strong></p>
      <div style="white-space:pre-wrap;border-left:3px solid #D63752;padding:8px 14px;margin:14px 0;color:#1A1817">${esc(message)}</div>
      <p style="color:#5C544C;font-size:13px">Reply directly to this email, or from the admin console.</p>
    </div>`,
  };
}

/** The admin's reply, sent to the visitor. `body` is the admin's free text. */
export function contactReplyHtml(body: string, locale: 'ja' | 'en'): { subject: string; html: string } {
  const sign = locale === 'ja' ? 'Nihon101 より' : '— Nihon101';
  return {
    subject: locale === 'ja' ? 'Nihon101 — お問い合わせへの返信' : 'Nihon101 — re: your message',
    html: `<div style="font-family:sans-serif;color:#1A1817">
      <div style="white-space:pre-wrap;color:#1A1817">${esc(body)}</div>
      <p style="color:#5C544C;font-size:13px;margin-top:18px">${sign}</p>
    </div>`,
  };
}

export function verifyEmailHtml(link: string, locale: 'ja' | 'en'): { subject: string; html: string } {
  if (locale === 'ja') {
    return {
      subject: 'Nihon101 — メールアドレスの確認',
      html: `<div style="font-family:sans-serif;color:#1A1817">
        <h2 style="font-weight:600">メールアドレスの確認</h2>
        <p>下のボタンを押して、メールアドレスの確認を完了してください。リンクは24時間有効です。</p>
        <p><a href="${link}" style="display:inline-block;background:#D63752;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none">メールを確認</a></p>
        <p style="color:#5C544C;font-size:13px">心当たりがない場合は、このメールを無視してください。</p>
      </div>`,
    };
  }
  return {
    subject: 'Nihon101 — Verify your email',
    html: `<div style="font-family:sans-serif;color:#1A1817">
      <h2 style="font-weight:600">Verify your email</h2>
      <p>Click the button below to confirm your email address. This link expires in 24 hours.</p>
      <p><a href="${link}" style="display:inline-block;background:#D63752;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none">Verify email</a></p>
      <p style="color:#5C544C;font-size:13px">If you didn't create this account, you can ignore this email.</p>
    </div>`,
  };
}
