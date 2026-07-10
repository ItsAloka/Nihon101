/* In-app notifications panel (the header bell). All endpoints require auth and
 * are throttled per user — the bell polls, and read/clear/delete are writes. */
import { Hono } from 'hono';
import { getDb } from '../db/client';
import type { AppEnv } from '../types';
import { requireAuth } from '../middleware/requireAuth';
import { limits } from '../middleware/rateLimit';
import { listNotifications, unreadCount, markRead, deleteNotifications } from '../db/queries/notifications';

const app = new Hono<AppEnv>();

app.use('*', requireAuth, limits.notif);

// The bell badge. Its own endpoint so the header can poll one indexed COUNT(*)
// instead of the full three-table list join — at 50k signed-in users that list
// query on a 60s timer would be the most expensive read on the platform.
// Registered before '/' so it isn't swallowed by the list route.
app.get('/unread-count', async (c) => {
  const count = await unreadCount(getDb(c), c.var.user!.id);
  return c.json({ count });
});

// A page of the viewer's notifications, newest first. ?before=<ms> keyset-pages
// (pass the previous page's nextBefore), ?limit caps the page (default 20, max 50).
// The panel lazy-loads this on open; the badge above is what polls.
app.get('/', async (c) => {
  const before = Number(c.req.query('before')) || undefined;
  const limit = Number(c.req.query('limit')) || undefined;
  const { items, nextBefore } = await listNotifications(getDb(c), c.var.user!.id, { before, limit });
  return c.json({ notifications: items, nextBefore });
});

// Mark notifications read. Body { ids: string[] } marks just those (clicking one
// row); an empty/absent body marks every unread row ("Read all").
app.post('/read', async (c) => {
  const body = await c.req.json().catch(() => null);
  const ids = Array.isArray(body?.ids) ? body.ids.map(String) : undefined;
  const updated = await markRead(getDb(c), c.var.user!.id, ids);
  return c.json({ updated });
});

// Clear all of the viewer's notifications.
app.delete('/', async (c) => {
  const removed = await deleteNotifications(getDb(c), c.var.user!.id);
  return c.json({ ok: true, removed });
});

// Delete one notification by id (scoped to the owner, so a foreign id removes nothing).
app.delete('/:id', async (c) => {
  const removed = await deleteNotifications(getDb(c), c.var.user!.id, [c.req.param('id')]);
  return c.json({ ok: true, removed });
});

export default app;
