/* Public report filing. Any signed-in reader can flag a post, comment, or user;
 * the report lands in the admin moderation queue. Idempotent per (reporter,
 * target) while still open, so a double-tap doesn't spam the queue. */
import { Hono } from 'hono';
import type { AppEnv } from '../types';
import { getDb } from '../db/client';
import { requireAuth } from '../middleware/requireAuth';
import { limits } from '../middleware/rateLimit';
import { getPostById } from '../db/queries/posts';
import { getComment as getCommentRow } from '../db/queries/engagement';
import { getUserById } from '../db/queries/users';
import { createReport, existingOpenReport, type TargetType } from '../db/queries/admin';

const app = new Hono<AppEnv>();

const TARGET_TYPES: TargetType[] = ['post', 'comment', 'user'];
// Short reason categories the UI offers; free text goes in `detail`.
const REASONS = new Set(['spam', 'harassment', 'hate', 'sexual', 'violence', 'misinformation', 'other']);

// POST /reports { targetType, targetId, reason, detail }
app.post('/', requireAuth, limits.report, async (c) => {
  const db = getDb(c);
  const me = c.var.user!;
  const body = (await c.req.json().catch(() => null)) as
    | { targetType?: unknown; targetId?: unknown; reason?: unknown; detail?: unknown }
    | null;
  const targetType = body?.targetType as TargetType;
  const targetId = typeof body?.targetId === 'string' ? body.targetId : '';
  const reason = typeof body?.reason === 'string' && REASONS.has(body.reason) ? body.reason : 'other';
  const detail = typeof body?.detail === 'string' ? body.detail.trim().slice(0, 1000) : '';
  if (!TARGET_TYPES.includes(targetType) || !targetId) return c.json({ error: 'invalid_target' }, 400);

  // The target must exist; you can't report yourself / your own content.
  if (targetType === 'post') {
    const p = await getPostById(db, targetId);
    if (!p) return c.json({ error: 'not_found' }, 404);
    if (p.authorId === me.id) return c.json({ error: 'cannot_report_own' }, 400);
  } else if (targetType === 'comment') {
    const cm = await getCommentRow(db, targetId);
    if (!cm) return c.json({ error: 'not_found' }, 404);
    if (cm.userId === me.id) return c.json({ error: 'cannot_report_own' }, 400);
  } else {
    if (targetId === me.id) return c.json({ error: 'cannot_report_own' }, 400);
    const u = await getUserById(db, targetId);
    if (!u) return c.json({ error: 'not_found' }, 404);
  }

  // Idempotent while open — return the existing report rather than stacking dupes.
  const open = await existingOpenReport(db, me.id, targetType, targetId);
  if (open) return c.json({ ok: true, reported: true, deduped: true });

  await createReport(db, { reporterId: me.id, targetType, targetId, reason, detail });
  return c.json({ ok: true, reported: true }, 201);
});

export default app;
