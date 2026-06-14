/* In-app notifications panel (the header bell). All endpoints require auth. */
import { Hono } from 'hono';
import { getDb } from '../db/client';
import type { AppEnv } from '../types';
import { requireAuth } from '../middleware/requireAuth';
import { listNotifications, unreadCount, markAllRead, deleteAllNotifications } from '../db/queries/notifications';

const app = new Hono<AppEnv>();

// The viewer's notifications (newest first) + unread count for the badge.
app.get('/', requireAuth, async (c) => {
  const db = getDb(c);
  const uid = c.var.user!.id;
  const [items, unread] = await Promise.all([
    listNotifications(db, uid, 30),
    unreadCount(db, uid),
  ]);
  return c.json({ notifications: items, unread });
});

// Mark all of the viewer's notifications read (called when the panel opens).
app.post('/read', requireAuth, async (c) => {
  const db = getDb(c);
  await markAllRead(db, c.var.user!.id);
  return c.json({ ok: true });
});

// Clear all of the viewer's notifications.
app.delete('/', requireAuth, async (c) => {
  const db = getDb(c);
  const removed = await deleteAllNotifications(db, c.var.user!.id);
  return c.json({ ok: true, removed });
});

export default app;
