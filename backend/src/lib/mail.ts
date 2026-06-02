// Resend is used ONLY for password-reset emails (per plan — no newsletter, no
// notification emails). If no API key is configured (local dev), we log the
// link to the console so the flow is still testable.

type SendArgs = {
  apiKey: string;
  from: string;
  to: string;
  subject: string;
  html: string;
};

export async function sendEmail({ apiKey, from, to, subject, html }: SendArgs): Promise<void> {
  if (!apiKey) {
    console.log(`[mail:dev] would send to ${to} — "${subject}"\n${html}`);
    return;
  }
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to, subject, html }),
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
