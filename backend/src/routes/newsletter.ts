/* Public newsletter signup — capture only (no emails sent yet). Open to logged-out
 * visitors; if a valid access token is present we link the row to that user. */
import { Hono } from 'hono';
import type { Context } from 'hono';
import { z } from 'zod';
import { getDb } from '../db/client';
import type { AppEnv } from '../types';
import { limits } from '../middleware/rateLimit';
import { verifyAccess } from '../lib/tokens';
import { subscribe, unsubscribeById } from '../db/queries/newsletter';
import { getSettingsCached } from '../db/queries/admin';
import { verifyUnsub } from '../lib/unsubscribe';

const app = new Hono<AppEnv>();

const schema = z.object({
  email: z.string().trim().email().max(254),
  locale: z.enum(['ja', 'en']).catch('ja'),
  // Honeypot: bots fill hidden fields. A non-empty value → silently drop.
  website: z.string().optional(),
});

/** Best-effort: resolve the signed-in user id from a Bearer token, else null. */
async function softUserId(c: Context<AppEnv>): Promise<string | null> {
  const h = c.req.header('Authorization');
  if (!h?.startsWith('Bearer ')) return null;
  try { return (await verifyAccess(c.env.JWT_SECRET, h.slice(7))).sub; } catch { return null; }
}

app.post('/', limits.newsletter, async (c) => {
  const { newsletterEnabled } = await getSettingsCached(getDb(c), c.env.TRENDING_KV);
  if (!newsletterEnabled) return c.json({ error: 'newsletter_disabled' }, 503);

  const parsed = schema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ error: 'invalid_email' }, 400);
  const { email, locale, website } = parsed.data;
  if (website && website.trim()) return c.json({ ok: true, created: false }); // honeypot tripped

  const userId = await softUserId(c);
  // Subscribe is idempotent (dedup by unique email). We intentionally do NOT return
  // whether the row was newly created — that would leak which emails are already on
  // the list (membership enumeration). Always the same response.
  await subscribe(getDb(c), { email, locale, userId });
  return c.json({ ok: true });
});

/* ── Unsubscribe ─────────────────────────────────────────────────────────────
 * One link in every Sunday Letter: GET shows a branded confirm page (so an email
 * client prefetching the URL can't silently opt someone out), the button POSTs
 * back to actually remove the row. The POST endpoint also satisfies Gmail/Apple
 * one-click List-Unsubscribe (List-Unsubscribe-Post), which sends a bare POST. */

function unsubPage(opts: { jp: boolean; title: string; body: string; form?: string }): string {
  const { jp, title, body, form } = opts;
  return `<!doctype html><html lang="${jp ? 'ja' : 'en'}"><head><meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title></head>
  <body style="margin:0;background:#F4EEE4;font-family:'Helvetica Neue',Arial,sans-serif">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:48px 16px"><tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:460px;width:100%">
        <tr><td align="center" style="padding-bottom:20px">
          <span style="font-family:Georgia,serif;font-size:24px;font-weight:700;color:#1A1817">nihon1<span style="color:#D63752">●</span>1</span>
        </td></tr>
        <tr><td style="background:#fff;border:1px solid #EAE2D6;border-radius:18px;padding:36px 36px;text-align:center">
          <h1 style="margin:0 0 12px;font-family:Georgia,serif;font-size:22px;font-weight:600;color:#1A1817">${title}</h1>
          <p style="margin:0 0 22px;font-size:14px;line-height:1.65;color:#5C544C">${body}</p>
          ${form ?? ''}
        </td></tr>
      </table>
    </td></tr></table>
  </body></html>`;
}

const T = (en: string, ja: string, jp: boolean) => (jp ? ja : en);

app.get('/unsubscribe', async (c) => {
  const jp = c.req.query('lang') === 'ja';
  const token = c.req.query('t') ?? '';
  const id = await verifyUnsub(c.env.REFRESH_PEPPER, token);
  if (!id) {
    return c.html(unsubPage({ jp, title: T('Invalid link', 'リンクが無効です', jp),
      body: T('This unsubscribe link is invalid or has expired.', 'この配信停止リンクは無効か、期限切れです。', jp) }), 400);
  }
  const action = `/newsletter/unsubscribe?t=${encodeURIComponent(token)}${jp ? '&lang=ja' : ''}`;
  const form = `<form method="post" action="${action}" style="margin:0">
    <button type="submit" style="display:inline-block;background:#D63752;color:#fff;border:none;cursor:pointer;font-size:14px;font-weight:700;padding:12px 28px;border-radius:999px">${T('Unsubscribe', '配信を停止する', jp)}</button>
  </form>`;
  return c.html(unsubPage({ jp, title: T('Unsubscribe from the Sunday Letter?', '日曜レターの配信を停止しますか？', jp),
    body: T("You'll stop receiving the weekly Sunday Letter. You can resubscribe anytime from the site.",
            '週刊「日曜レター」の配信が停止されます。いつでもサイトから再登録できます。', jp), form }));
});

app.post('/unsubscribe', async (c) => {
  const jp = c.req.query('lang') === 'ja';
  const token = c.req.query('t') ?? '';
  const id = await verifyUnsub(c.env.REFRESH_PEPPER, token);
  // Idempotent: a valid token always lands on the success page even if already gone.
  if (id) await unsubscribeById(getDb(c), id);
  if (!id) {
    return c.html(unsubPage({ jp, title: T('Invalid link', 'リンクが無効です', jp),
      body: T('This unsubscribe link is invalid or has expired.', 'この配信停止リンクは無効か、期限切れです。', jp) }), 400);
  }
  return c.html(unsubPage({ jp, title: T("You're unsubscribed", '配信を停止しました', jp),
    body: T("You won't receive the Sunday Letter anymore. Sorry to see you go — the door's always open.",
            '今後、日曜レターは届きません。またいつでも戻ってきてくださいね。', jp) }));
});

export default app;
