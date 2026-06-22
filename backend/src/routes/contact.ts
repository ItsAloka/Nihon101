/* Public contact form. Stores the message (source of truth), then emails the admin
 * contact address with the visitor as Reply-To. Email is best-effort + backgrounded
 * so a Resend hiccup never loses the message or blocks the response. */
import { Hono } from 'hono';
import type { Context } from 'hono';
import { z } from 'zod';
import { getDb } from '../db/client';
import type { AppEnv } from '../types';
import { limits } from '../middleware/rateLimit';
import { verifyAccess } from '../lib/tokens';
import { createContactMessage } from '../db/queries/contact';
import { getSettings } from '../db/queries/admin';
import { sendEmail, contactNotifyHtml } from '../lib/mail';

const app = new Hono<AppEnv>();

const schema = z.object({
  name: z.string().trim().max(120).catch(''),
  email: z.string().trim().email().max(254),
  message: z.string().trim().min(1).max(4000),
  locale: z.enum(['ja', 'en']).catch('ja'),
  website: z.string().optional(), // honeypot
});

async function softUserId(c: Context<AppEnv>): Promise<string | null> {
  const h = c.req.header('Authorization');
  if (!h?.startsWith('Bearer ')) return null;
  try { return (await verifyAccess(c.env.JWT_SECRET, h.slice(7))).sub; } catch { return null; }
}

app.post('/', limits.contact, async (c) => {
  const parsed = schema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ error: 'invalid_input' }, 400);
  const { name, email, message, locale, website } = parsed.data;
  if (website && website.trim()) return c.json({ ok: true }); // honeypot tripped → drop silently

  const db = getDb(c);
  const userId = await softUserId(c);
  await createContactMessage(db, { userId, name, email, message, locale });

  // Notify the admin out-of-band. Destination is the admin-configured contactEmail,
  // falling back to RESEND_FROM. Reply-To = the visitor so a reply goes straight back.
  const { contactEmail } = await getSettings(db);
  const to = contactEmail || c.env.RESEND_FROM;
  if (to) {
    const { subject, html } = contactNotifyHtml(name, email, message);
    c.executionCtx.waitUntil(
      sendEmail({ apiKey: c.env.RESEND_API_KEY, from: c.env.RESEND_FROM, to, subject, html, replyTo: email })
        .catch((err) => console.error('contact notify failed', err)),
    );
  }
  return c.json({ ok: true });
});

export default app;
