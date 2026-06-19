/* Admin + moderation API. Everything here is gated by requireAdmin (valid access
 * token + role=admin). Each state change writes an audit row. Mounted at /admin. */
import { Hono } from 'hono';
import { isNotNull } from 'drizzle-orm';
import { getDb } from '../db/client';
import type { AppEnv } from '../types';
import { requireAdmin } from '../middleware/requireAdmin';
import { users, posts } from '../db/schema';
import { getUserById, getUserByHandle } from '../db/queries/users';
import { getPostById, deletePost, publicPostCard } from '../db/queries/posts';
import { getComment, deleteComment } from '../db/queries/engagement';
import {
  createReport, listReports, getReportById, resolveReport, reopenReport,
  resolveReportsForTarget, dismissReportsForTarget, dismissStaleWatchingReports,
  reportsAgainstUser, getDisplayNamesByIds,
  listReportCases, listReportsForTarget, resolveReportTargets, countOpenReportsForTargets,
  getSettings, updateSettings, invalidateSettingsCache, type ReportCase,
  applyBan, liftBan, listUserBans,
  setPostHidden, setCommentHidden,
  logAdminAction, listAdminActions,
  searchUsersAdmin, setUserRole, adminStats,
  listFeatured, setFeatured, searchPostsAdmin,
  type ReportStatus, type BanDuration, type FeaturedSection,
} from '../db/queries/admin';

const app = new Hono<AppEnv>();
app.use('*', requireAdmin);

const REPORT_STATUSES: ReportStatus[] = ['open', 'resolved', 'dismissed'];
const TARGET_TYPES = new Set(['post', 'comment', 'user']);
const DURATIONS: BanDuration[] = ['24h', '7d', 'permanent'];
const SECTIONS: FeaturedSection[] = ['hero', 'feature', 'picks'];
const SECTION_CAP: Record<FeaturedSection, number> = { hero: 3, feature: 1, picks: 6 };
const DAY = 24 * 60 * 60 * 1000;

/* ───────────── dashboard ───────────── */
app.get('/stats', async (c) => c.json(await adminStats(getDb(c))));

/* ───────────── reports ───────────── */

app.get('/reports', async (c) => {
  const db = getDb(c);
  const sp = c.req.query('status');
  const status = REPORT_STATUSES.includes(sp as ReportStatus) ? (sp as ReportStatus) : 'open';

  // OPEN reports are returned GROUPED into one case per target, split by the
  // distinct-reporter threshold: "needs action" (≥ threshold) vs "watching"
  // (below — a lone/abusive reporter stays out of the way). Resolved/dismissed
  // are returned as a flat history list (keyset-paginated). Target context is
  // batch-resolved (fixed query count) rather than per-row.
  if (status === 'open') {
    const { reportThreshold } = await getSettings(db);
    const cases = await listReportCases(db, 'open');
    const ctx = await resolveReportTargets(db, cases);
    const withCtx = cases.map((k: ReportCase) => ({ ...k, target: ctx.get(`${k.targetType}:${k.targetId}`)! }));
    return c.json({
      mode: 'cases' as const,
      threshold: reportThreshold,
      needsAction: withCtx.filter((k) => k.distinctReporters >= reportThreshold),
      watching: withCtx.filter((k) => k.distinctReporters < reportThreshold),
    });
  }

  const before = Number(c.req.query('before'));
  const beforeMs = Number.isFinite(before) && before > 0 ? before : null;
  const rows = await listReports(db, status, 50, beforeMs);
  const nameIds = Array.from(new Set(rows.flatMap((r) => [r.reporterId, r.resolvedBy]).filter((v): v is string => !!v)));
  const [names, ctx, dupes] = await Promise.all([
    getDisplayNamesByIds(db, nameIds),
    resolveReportTargets(db, rows),
    countOpenReportsForTargets(db, rows),
  ]);
  const reports = rows.map((r) => ({
    ...r,
    reporterName: r.reporterId ? names.get(r.reporterId) ?? null : null,
    resolverName: r.resolvedBy ? names.get(r.resolvedBy) ?? null : null,
    dupeCount: dupes.get(`${r.targetType}:${r.targetId}`) ?? 0,
    target: ctx.get(`${r.targetType}:${r.targetId}`)!,
  }));
  return c.json({ mode: 'list' as const, reports, nextBefore: rows.length === 50 ? rows[rows.length - 1].createdAt : null });
});

/* Every individual report against one target (who reported, why, their note) —
 *  the case "details" drawer. Defaults to open reports. */
app.get('/reports/by-target', async (c) => {
  const db = getDb(c);
  const targetType = c.req.query('targetType') || '';
  const targetId = c.req.query('targetId') || '';
  if (!TARGET_TYPES.has(targetType) || !targetId) return c.json({ error: 'invalid_target' }, 400);
  const statusQ = c.req.query('status');
  const status = REPORT_STATUSES.includes(statusQ as ReportStatus) ? (statusQ as ReportStatus) : 'open';
  const reports = await listReportsForTarget(db, targetType, targetId, status);
  return c.json({ reports });
});

/* Case-level: dismiss every open report against a target (judged harmless). */
app.post('/reports/dismiss-target', async (c) => {
  const db = getDb(c);
  const actor = c.var.user!;
  const body = (await c.req.json().catch(() => null)) as { targetType?: unknown; targetId?: unknown; note?: unknown } | null;
  const targetType = body?.targetType;
  const targetId = typeof body?.targetId === 'string' ? body.targetId : '';
  const note = typeof body?.note === 'string' ? body.note : '';
  if (typeof targetType !== 'string' || !targetId) return c.json({ error: 'invalid_target' }, 400);
  const n = await dismissReportsForTarget(db, targetType, targetId, actor.id, note);
  await logAdminAction(db, { actorId: actor.id, action: 'dismiss_report', targetType, targetId, detail: { dismissed: n, note } });
  return c.json({ ok: true, dismissed: n });
});

/* Bulk-clear stale low-signal "watching" cases on demand (the manual counterpart
 *  to the hourly cron sweep). body.olderThanDays > 0 limits to cases that haven't
 *  moved in that long; omit/0 clears every sub-threshold case now. */
app.post('/reports/dismiss-watching', async (c) => {
  const db = getDb(c);
  const actor = c.var.user!;
  const { reportThreshold } = await getSettings(db);
  const body = (await c.req.json().catch(() => null)) as { olderThanDays?: unknown } | null;
  const days = Number(body?.olderThanDays);
  const cutoff = Number.isFinite(days) && days > 0 ? Date.now() - days * DAY : Date.now() + 1;
  const n = await dismissStaleWatchingReports(db, reportThreshold, cutoff, actor.id, 'dismissed: low-signal case cleared by admin');
  await logAdminAction(db, { actorId: actor.id, action: 'dismiss_watching', targetType: 'report', targetId: '', detail: { dismissed: n, olderThanDays: days > 0 ? days : 0 } });
  return c.json({ ok: true, dismissed: n });
});

/* Moderation settings (report threshold + auto-hide threshold). */
app.get('/settings', async (c) => c.json(await getSettings(getDb(c))));
app.put('/settings', async (c) => {
  const db = getDb(c);
  const actor = c.var.user!;
  const body = (await c.req.json().catch(() => null)) as { reportThreshold?: unknown; autoHideThreshold?: unknown } | null;
  const cur = await getSettings(db);
  const clamp = (v: unknown, def: number) => {
    const n = Math.round(Number(v));
    return Number.isFinite(n) ? Math.min(100, Math.max(1, n)) : def;
  };
  const reportThreshold = clamp(body?.reportThreshold, cur.reportThreshold);
  // auto-hide must never be below the surface threshold.
  const autoHideThreshold = Math.max(reportThreshold, clamp(body?.autoHideThreshold, cur.autoHideThreshold));
  const next = await updateSettings(db, { reportThreshold, autoHideThreshold });
  await invalidateSettingsCache(c.env.TRENDING_KV); // hot-path report POST reads the cache
  await logAdminAction(db, { actorId: actor.id, action: 'update_settings', targetType: 'settings', targetId: '', detail: { ...next } });
  return c.json(next);
});

app.patch('/reports/:id', async (c) => {
  const db = getDb(c);
  const actor = c.var.user!;
  const body = (await c.req.json().catch(() => null)) as { status?: unknown; note?: unknown } | null;
  const status = body?.status;
  const note = typeof body?.note === 'string' ? body.note : '';
  if (status !== 'resolved' && status !== 'dismissed' && status !== 'open') return c.json({ error: 'status must be resolved, dismissed, or open' }, 400);
  const report = await getReportById(db, c.req.param('id'));
  if (!report) return c.json({ error: 'not_found' }, 404);
  // Reopen a closed report back into the queue (does NOT unhide its target).
  if (status === 'open') {
    const ok = await reopenReport(db, report.id);
    if (!ok) return c.json({ error: 'not_closed' }, 409);
    await logAdminAction(db, { actorId: actor.id, action: 'reopen_report', targetType: 'report', targetId: report.id, detail: { note } });
    return c.json({ ok: true });
  }
  const ok = await resolveReport(db, report.id, actor.id, status, note);
  if (!ok) return c.json({ error: 'already_closed' }, 409);
  await logAdminAction(db, { actorId: actor.id, action: status === 'resolved' ? 'resolve_report' : 'dismiss_report', targetType: 'report', targetId: report.id, detail: { note } });
  return c.json({ ok: true });
});

/* ───────────── post / comment moderation ───────────── */

app.patch('/posts/:id/hide', async (c) => {
  const db = getDb(c);
  const actor = c.var.user!;
  const post = await getPostById(db, c.req.param('id'));
  if (!post) return c.json({ error: 'not_found' }, 404);
  const body = (await c.req.json().catch(() => null)) as { hidden?: unknown; reason?: unknown; note?: unknown } | null;
  const hidden = body?.hidden !== false; // default to hiding
  const reason = typeof body?.reason === 'string' ? body.reason : '';
  const note = typeof body?.note === 'string' ? body.note : '';
  await setPostHidden(db, post.id, hidden, reason);
  if (hidden) await resolveReportsForTarget(db, 'post', post.id, actor.id, note || 'post hidden');
  await logAdminAction(db, { actorId: actor.id, action: hidden ? 'hide_post' : 'unhide_post', targetType: 'post', targetId: post.id, detail: { slug: post.slug, reason, note } });
  return c.json({ ok: true, isHidden: hidden });
});

app.delete('/posts/:id', async (c) => {
  const db = getDb(c);
  const actor = c.var.user!;
  const dbody = (await c.req.json().catch(() => null)) as { note?: unknown } | null;
  const note = typeof dbody?.note === 'string' ? dbody.note : '';
  const post = await getPostById(db, c.req.param('id'));
  if (!post) return c.json({ error: 'not_found' }, 404);
  // Free the cover's R2 object (cascades handle likes/saves/comments/featured rows).
  if (post.cover) {
    const key = post.cover.split('/media/')[1];
    if (key) await c.env.MEDIA.delete(key).catch(() => {});
  }
  // Resolve the case BEFORE the post row goes (reports keep the targetId as history).
  await resolveReportsForTarget(db, 'post', post.id, actor.id, note || 'post deleted');
  await deletePost(db, post.id);
  await logAdminAction(db, { actorId: actor.id, action: 'delete_post', targetType: 'post', targetId: post.id, detail: { slug: post.slug, title: post.titleEn || post.titleJa, note } });
  return c.json({ ok: true });
});

app.patch('/comments/:id/hide', async (c) => {
  const db = getDb(c);
  const actor = c.var.user!;
  const cm = await getComment(db, c.req.param('id'));
  if (!cm) return c.json({ error: 'not_found' }, 404);
  const body = (await c.req.json().catch(() => null)) as { hidden?: unknown; note?: unknown } | null;
  const hidden = body?.hidden !== false;
  const note = typeof body?.note === 'string' ? body.note : '';
  await setCommentHidden(db, cm.id, hidden);
  if (hidden) await resolveReportsForTarget(db, 'comment', cm.id, actor.id, note || 'comment hidden');
  await logAdminAction(db, { actorId: actor.id, action: hidden ? 'hide_comment' : 'unhide_comment', targetType: 'comment', targetId: cm.id, detail: { note } });
  return c.json({ ok: true, isHidden: hidden });
});

app.delete('/comments/:id', async (c) => {
  const db = getDb(c);
  const actor = c.var.user!;
  const body = (await c.req.json().catch(() => null)) as { note?: unknown } | null;
  const note = typeof body?.note === 'string' ? body.note : '';
  const cm = await getComment(db, c.req.param('id'));
  if (!cm) return c.json({ error: 'not_found' }, 404);
  await resolveReportsForTarget(db, 'comment', cm.id, actor.id, note || 'comment deleted');
  await deleteComment(db, cm);
  await logAdminAction(db, { actorId: actor.id, action: 'delete_comment', targetType: 'comment', targetId: cm.id, detail: { note } });
  return c.json({ ok: true });
});

/* ───────────── bans ───────────── */

app.post('/users/:id/ban', async (c) => {
  const db = getDb(c);
  const actor = c.var.user!;
  const body = (await c.req.json().catch(() => null)) as { reason?: unknown; duration?: unknown } | null;
  const reason = typeof body?.reason === 'string' ? body.reason.trim() : '';
  const duration = body?.duration as BanDuration;
  if (!reason) return c.json({ error: 'reason_required' }, 400);
  if (!DURATIONS.includes(duration)) return c.json({ error: 'invalid_duration' }, 400);
  const target = await getUserById(db, c.req.param('id'));
  if (!target) return c.json({ error: 'not_found' }, 404);
  if (target.id === actor.id) return c.json({ error: 'cannot_ban_self' }, 400);
  if (target.role === 'admin') return c.json({ error: 'cannot_ban_admin' }, 403);
  const expiresAt = duration === 'permanent' ? null : Date.now() + (duration === '24h' ? DAY : 7 * DAY);
  await applyBan(db, { userId: target.id, issuedBy: actor.id, reason, duration, expiresAt });
  await logAdminAction(db, { actorId: actor.id, action: 'ban', targetType: 'user', targetId: target.id, detail: { duration, reason } });
  return c.json({ ok: true });
});

app.post('/users/:id/unban', async (c) => {
  const db = getDb(c);
  const actor = c.var.user!;
  const target = await getUserById(db, c.req.param('id'));
  if (!target) return c.json({ error: 'not_found' }, 404);
  await liftBan(db, target.id, actor.id);
  await logAdminAction(db, { actorId: actor.id, action: 'unban', targetType: 'user', targetId: target.id });
  return c.json({ ok: true });
});

/* ───────────── users (search + history + role) ───────────── */

app.get('/users', async (c) => {
  const db = getDb(c);
  const q = c.req.query('q')?.trim() || undefined;
  const sort = c.req.query('sort') === 'posts' ? 'posts' : 'recent';
  const bannedOnly = c.req.query('banned') === '1';
  const offset = Math.max(0, Number(c.req.query('offset')) || 0);
  const rows = await searchUsersAdmin(db, { q, sort, bannedOnly, limit: 50, offset });
  return c.json({ users: rows, nextOffset: rows.length === 50 ? offset + 50 : null });
});

app.get('/users/:id/history', async (c) => {
  const db = getDb(c);
  const id = c.req.param('id');
  const [bans, reps] = await Promise.all([listUserBans(db, id), reportsAgainstUser(db, id)]);
  return c.json({ bans, reports: reps });
});

app.post('/users/:id/role', async (c) => {
  const db = getDb(c);
  const actor = c.var.user!;
  const body = (await c.req.json().catch(() => null)) as { role?: unknown } | null;
  const role = body?.role;
  if (role !== 'admin' && role !== 'user') return c.json({ error: 'invalid_role' }, 400);
  const target = await getUserById(db, c.req.param('id'));
  if (!target) return c.json({ error: 'not_found' }, 404);
  if (target.id === actor.id) return c.json({ error: 'cannot_change_own_role' }, 400);
  await setUserRole(db, target.id, role);
  await logAdminAction(db, { actorId: actor.id, action: role === 'admin' ? 'grant_admin' : 'revoke_admin', targetType: 'user', targetId: target.id });
  return c.json({ ok: true, role });
});

/* ───────────── media library (R2 orphan finder) ───────────── */

// Pull the bare R2 key out of a stored media URL (`<origin>/media/<key>`).
function keyFromUrl(url: string | null): string | null {
  if (!url) return null;
  const k = url.split('/media/')[1];
  return k ? k.trim() : null;
}

// Every R2 key a live DB row points at → who points at it.
type MediaRef = { type: 'post' | 'user'; id: string; title: string };
async function collectReferencedKeys(db: ReturnType<typeof getDb>): Promise<Map<string, MediaRef>> {
  const map = new Map<string, MediaRef>();
  const add = (url: string | null, ref: MediaRef) => { const k = keyFromUrl(url); if (k && !map.has(k)) map.set(k, ref); };
  // Only rows that actually carry a media URL — most users have no avatar and many
  // posts no cover, so this keeps the scan from loading the whole users/posts tables.
  const [ps, us] = await Promise.all([
    db.select({ id: posts.id, title: posts.titleEn, titleJa: posts.titleJa, cover: posts.cover }).from(posts).where(isNotNull(posts.cover)),
    db.select({ id: users.id, handle: users.handle, avatarUrl: users.avatarUrl }).from(users).where(isNotNull(users.avatarUrl)),
  ]);
  for (const p of ps) add(p.cover, { type: 'post', id: p.id, title: p.title || p.titleJa });
  for (const u of us) add(u.avatarUrl, { type: 'user', id: u.id, title: u.handle });
  return map;
}

const MEDIA_SCAN_CAP = 10000;
app.get('/media', async (c) => {
  const db = getDb(c);
  const refs = await collectReferencedKeys(db);
  const objects: { key: string; size: number; uploaded: number; referenced: boolean; ref: MediaRef | null }[] = [];
  const present = new Set<string>();
  let cursor: string | undefined;
  let truncated = false;
  do {
    const page = await c.env.MEDIA.list({ cursor, limit: 1000 });
    for (const o of page.objects) {
      present.add(o.key);
      if (objects.length < MEDIA_SCAN_CAP) {
        objects.push({
          key: o.key, size: o.size,
          uploaded: o.uploaded instanceof Date ? o.uploaded.getTime() : Number(o.uploaded) || 0,
          referenced: refs.has(o.key), ref: refs.get(o.key) ?? null,
        });
      }
    }
    cursor = page.truncated ? page.cursor : undefined;
    if (objects.length >= MEDIA_SCAN_CAP && cursor) { truncated = true; break; }
  } while (cursor);
  // DB rows pointing at a key R2 no longer has (the ghost-cover bug).
  const dangling = Array.from(refs.entries()).filter(([k]) => !present.has(k)).map(([key, ref]) => ({ key, ref }));
  const orphanBytes = objects.filter((o) => !o.referenced).reduce((s, o) => s + o.size, 0);
  return c.json({ objects, dangling, truncated, orphanBytes });
});

// Bulk-delete. Still-referenced keys are SKIPPED (never force here) so a click
// can't orphan a live cover/avatar.
app.post('/media/bulk-delete', async (c) => {
  const db = getDb(c);
  const actor = c.var.user!;
  const body = (await c.req.json().catch(() => null)) as { keys?: unknown } | null;
  const keys = Array.isArray(body?.keys) ? body!.keys.filter((k): k is string => typeof k === 'string') : null;
  if (!keys || keys.length === 0) return c.json({ error: 'keys_required' }, 400);
  const refs = await collectReferencedKeys(db);
  const toDelete = Array.from(new Set(keys)).filter((k) => !refs.has(k));
  const skipped = keys.length - toDelete.length;
  for (let i = 0; i < toDelete.length; i += 1000) await c.env.MEDIA.delete(toDelete.slice(i, i + 1000));
  await logAdminAction(db, { actorId: actor.id, action: 'delete_media', targetType: 'media', targetId: `bulk:${toDelete.length}`, detail: { deleted: toDelete.length, skipped } });
  return c.json({ ok: true, deleted: toDelete.length, skipped });
});

/* ───────────── featured (home curation) ───────────── */

app.get('/featured', async (c) => {
  const grouped = await listFeatured(getDb(c));
  return c.json({
    hero: grouped.hero.map(publicPostCard),
    feature: grouped.feature.map(publicPostCard),
    picks: grouped.picks.map(publicPostCard),
  });
});

// Replace the whole curation. body: { slots: [{ section, rank, postId }] }.
app.put('/featured', async (c) => {
  const db = getDb(c);
  const actor = c.var.user!;
  const body = (await c.req.json().catch(() => null)) as { slots?: unknown } | null;
  if (!body || !Array.isArray(body.slots)) return c.json({ error: 'invalid_body' }, 400);
  const seen = new Set<string>();              // section:rank uniqueness
  const perSection: Record<string, number> = {};
  const clean: { section: FeaturedSection; rank: number; postId: string }[] = [];
  for (const s of body.slots as { section?: unknown; rank?: unknown; postId?: unknown }[]) {
    if (!SECTIONS.includes(s.section as FeaturedSection)) return c.json({ error: `invalid section` }, 400);
    const section = s.section as FeaturedSection;
    if (typeof s.rank !== 'number' || s.rank < 1) return c.json({ error: 'invalid rank' }, 400);
    if (typeof s.postId !== 'string' || !s.postId) return c.json({ error: 'invalid postId' }, 400);
    const key = `${section}:${s.rank}`;
    if (seen.has(key)) return c.json({ error: `duplicate ${key}` }, 400);
    seen.add(key);
    perSection[section] = (perSection[section] ?? 0) + 1;
    if (perSection[section] > SECTION_CAP[section]) return c.json({ error: `${section} holds at most ${SECTION_CAP[section]}` }, 400);
    const p = await getPostById(db, s.postId);
    if (!p || p.status !== 'published') return c.json({ error: `post not publishable: ${s.postId}` }, 400);
    clean.push({ section, rank: s.rank, postId: s.postId });
  }
  await setFeatured(db, clean);
  await logAdminAction(db, { actorId: actor.id, action: 'set_featured', targetType: 'featured', targetId: '', detail: { count: clean.length } });
  const grouped = await listFeatured(db);
  return c.json({ hero: grouped.hero.map(publicPostCard), feature: grouped.feature.map(publicPostCard), picks: grouped.picks.map(publicPostCard) });
});

// Admin post search (incl. hidden) — powers the Featured picker + post moderation.
app.get('/posts', async (c) => {
  const rows = await searchPostsAdmin(getDb(c), c.req.query('q'), Math.min(50, Math.max(1, Number(c.req.query('limit')) || 30)));
  return c.json({ posts: rows.map(publicPostCard) });
});

/* ───────────── audit log ───────────── */
app.get('/audit', async (c) => {
  const db = getDb(c);
  const before = Number(c.req.query('before'));
  const beforeMs = Number.isFinite(before) && before > 0 ? before : null;
  const action = c.req.query('action')?.trim() || null;
  const actions = await listAdminActions(db, 50, beforeMs, action);
  const actorIds = Array.from(new Set(actions.map((a) => a.actorId).filter((v): v is string => !!v)));
  const names = await getDisplayNamesByIds(db, actorIds);
  return c.json({
    actions: actions.map((a) => ({ ...a, actorName: a.actorId ? names.get(a.actorId) ?? null : null })),
    nextBefore: actions.length === 50 ? actions[actions.length - 1].createdAt : null,
  });
});

export default app;
