/* Public newsletter signup — capture only (no emails sent yet). Open to logged-out
 * visitors; if a valid access token is present we link the row to that user. */
import { Hono } from 'hono';
import type { Context } from 'hono';
import { z } from 'zod';
import { getDb } from '../db/client';
import type { AppEnv } from '../types';
import { limits } from '../middleware/rateLimit';
import { verifyAccess } from '../lib/tokens';
import { subscribe } from '../db/queries/newsletter';

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

export default app;
