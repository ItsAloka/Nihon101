/* Admin + moderation API. Everything here is gated by requireAdmin (valid access
 * token + role=admin). Each state change writes an audit row. Mounted at /admin. */
import { Hono } from 'hono';
import { isNotNull, or, like } from 'drizzle-orm';
import { getDb } from '../db/client';
import type { AppEnv } from '../types';
import { requireAdmin } from '../middleware/requireAdmin';
import { keyFromUrl, postMediaKeys, deleteMediaKeys } from '../lib/media';
import { users, posts } from '../db/schema';
import { getUserById, getUserByHandle } from '../db/queries/users';
import { getPostById, deletePost, publicPostCard } from '../db/queries/posts';
import { getComment, deleteComment } from '../db/queries/engagement';
import {
  listCategories, getCategoryById, updateCategory, deleteCategory, publicCategory, CATEGORY_TINTS,
} from '../db/queries/categories';
import { listAllTags, getTagById, renameTag, deleteTag } from '../db/queries/tags';
import {
  createReport, listReports, getReportById, resolveReport, reopenReport,
  resolveReportsForTarget, dismissReportsForTarget,
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
import { newsletterStats, listSubscribers } from '../db/queries/newsletter';
import { auditTranslations } from '../lib/translation-audit';

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

/* ───────────── translation audit ───────────── */

// Scan every translated post for source-language segments left in the GENERATED
// locale (see lib/translation-audit.ts for why this is manual). Dry-run by
// default — the report lists offending slugs; body { requeue: true } sends them
// back through the cron translation queue.
app.post('/translation-audit', async (c) => {
  const db = getDb(c);
  const body = await c.req.json().catch(() => null);
  const requeue = body?.requeue === true;
  const res = await auditTranslations(db, requeue);
  if (res.requeued > 0) {
    await logAdminAction(db, {
      actorId: c.var.user!.id,
      action: 'translation_requeue',
      targetType: 'post',
      detail: { count: res.requeued, ids: res.findings.map((f) => f.id) },
    });
  }
  return c.json(res);
});

/* ───────────── reports ───────────── */

app.get('/reports', async (c) => {
  const db = getDb(c);
  const sp = c.req.query('status');
  const status = REPORT_STATUSES.includes(sp as ReportStatus) ? (sp as ReportStatus) : 'open';

  // OPEN reports are returned GROUPED into one case per target. Only cases at or
  // above the distinct-reporter threshold are surfaced; anything below stays
  // hidden entirely until the admin lowers the threshold. Resolved/dismissed are
  // returned as a flat history list (keyset-paginated). Target context is
  // batch-resolved (fixed query count) rather than per-row.
  if (status === 'open') {
    const { reportThreshold } = await getSettings(db);
    const cases = await listReportCases(db, 'open');
    const visible = cases.filter((k: ReportCase) => k.distinctReporters >= reportThreshold);
    const ctx = await resolveReportTargets(db, visible);
    const withCtx = visible.map((k: ReportCase) => ({ ...k, target: ctx.get(`${k.targetType}:${k.targetId}`)! }));
    return c.json({
      mode: 'cases' as const,
      threshold: reportThreshold,
      cases: withCtx,
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

/* Moderation settings (report threshold). */
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
  // Auto-hide is the only no-human takedown, so it can never sit below the surface
  // threshold — a case must at least be admin-visible before it can self-hide.
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
  // Free the post's R2 objects — cover AND every in-body image — so an admin delete
  // can't orphan blobs (cascades handle likes/saves/comments/featured rows).
  const mediaKeys = postMediaKeys(post);
  if (mediaKeys.length) await deleteMediaKeys(c.env, mediaKeys);
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

// Every R2 key a live DB row points at → who points at it.
type MediaRef = { type: 'post' | 'user'; id: string; title: string };
async function collectReferencedKeys(db: ReturnType<typeof getDb>): Promise<Map<string, MediaRef>> {
  const map = new Map<string, MediaRef>();
  const add = (key: string | null, ref: MediaRef) => { if (key && !map.has(key)) map.set(key, ref); };
  // Only rows that actually carry media — most users have no avatar, and we only
  // pull a post's (big) body when it embeds a /media/ URL — so the scan never loads
  // the whole posts/users tables. CRUCIAL: a post references its cover AND every
  // in-body <img> key. Miss the body images and the scanner reports them as orphans;
  // a bulk-delete would then wipe images out of live published posts.
  const [ps, us] = await Promise.all([
    db.select({ id: posts.id, title: posts.titleEn, titleJa: posts.titleJa, cover: posts.cover, bodyEn: posts.bodyEn, bodyJa: posts.bodyJa })
      .from(posts)
      .where(or(isNotNull(posts.cover), like(posts.bodyEn, '%/media/%'), like(posts.bodyJa, '%/media/%'))),
    db.select({ id: users.id, handle: users.handle, avatarUrl: users.avatarUrl }).from(users).where(isNotNull(users.avatarUrl)),
  ]);
  for (const p of ps) {
    const ref: MediaRef = { type: 'post', id: p.id, title: p.title || p.titleJa };
    for (const key of postMediaKeys(p)) add(key, ref);
  }
  for (const u of us) add(keyFromUrl(u.avatarUrl), { type: 'user', id: u.id, title: u.handle });
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

/* ───────────── content: categories + tags ───────────── */

app.get('/categories', async (c) => {
  const rows = await listCategories(getDb(c));
  return c.json({ categories: rows.map(publicCategory) });
});

// Edit a category's bilingual labels, kanji glyph, and/or tint.
app.patch('/categories/:id', async (c) => {
  const db = getDb(c);
  const actor = c.var.user!;
  const id = c.req.param('id');
  const cur = await getCategoryById(db, id);
  if (!cur) return c.json({ error: 'not_found' }, 404);
  const body = (await c.req.json().catch(() => null)) as
    { labelEn?: unknown; labelJa?: unknown; kanji?: unknown; tint?: unknown } | null;
  const patch: { labelEn?: string; labelJa?: string; kanji?: string; tint?: string } = {};
  if (typeof body?.labelEn === 'string') {
    const v = body.labelEn.trim();
    if (v.length < 2 || v.length > 40) return c.json({ error: 'invalid_label' }, 400);
    patch.labelEn = v;
  }
  if (typeof body?.labelJa === 'string') {
    const v = body.labelJa.trim();
    if (v.length < 1 || v.length > 40) return c.json({ error: 'invalid_label' }, 400);
    patch.labelJa = v;
  }
  if (body?.kanji !== undefined) patch.kanji = String(body.kanji).trim().slice(0, 2);
  if (typeof body?.tint === 'string') {
    if (!CATEGORY_TINTS.includes(body.tint)) return c.json({ error: 'invalid_tint' }, 400);
    patch.tint = body.tint;
  }
  const row = await updateCategory(db, id, patch);
  await logAdminAction(db, { actorId: actor.id, action: 'update_category', targetType: 'category', targetId: id, detail: { ...patch } });
  return c.json({ category: row ? publicCategory(row) : null });
});

// Delete a category — only when no posts use it (FK is ON DELETE RESTRICT).
app.delete('/categories/:id', async (c) => {
  const db = getDb(c);
  const actor = c.var.user!;
  const id = c.req.param('id');
  const cur = await getCategoryById(db, id);
  if (!cur) return c.json({ error: 'not_found' }, 404);
  if (cur.postCount > 0) return c.json({ error: 'category_in_use' }, 409);
  await deleteCategory(db, id);
  await logAdminAction(db, { actorId: actor.id, action: 'delete_category', targetType: 'category', targetId: id, detail: { label: cur.labelEn } });
  return c.json({ ok: true });
});

app.get('/tags', async (c) => c.json({ tags: await listAllTags(getDb(c)) }));

// Rename a tag's display label (slug stays fixed).
app.patch('/tags/:id', async (c) => {
  const db = getDb(c);
  const actor = c.var.user!;
  const id = c.req.param('id');
  const cur = await getTagById(db, id);
  if (!cur) return c.json({ error: 'not_found' }, 404);
  const body = (await c.req.json().catch(() => null)) as { label?: unknown } | null;
  const label = typeof body?.label === 'string' ? body.label.trim() : '';
  if (label.length < 1 || label.length > 50) return c.json({ error: 'invalid_label' }, 400);
  const row = await renameTag(db, id, label);
  await logAdminAction(db, { actorId: actor.id, action: 'rename_tag', targetType: 'tag', targetId: id, detail: { label } });
  return c.json({ tag: row });
});

// Delete a tag — only when unused (posts keep tags in jsonb, so it'd reappear).
app.delete('/tags/:id', async (c) => {
  const db = getDb(c);
  const actor = c.var.user!;
  const id = c.req.param('id');
  const cur = await getTagById(db, id);
  if (!cur) return c.json({ error: 'not_found' }, 404);
  if (cur.postCount > 0) return c.json({ error: 'tag_in_use' }, 409);
  await deleteTag(db, id);
  await logAdminAction(db, { actorId: actor.id, action: 'delete_tag', targetType: 'tag', targetId: id, detail: { label: cur.label } });
  return c.json({ ok: true });
});

/* ───────────── sunday letter / newsletter admin ───────────── */

app.get('/newsletter', async (c) => {
  const db = getDb(c);
  const [stats, settings] = await Promise.all([newsletterStats(db), getSettings(db)]);
  const subscribers = await listSubscribers(db, { limit: 50 });
  // Next send = next Sunday 09:00 JST (UTC+9). Pure calculation, no KV needed.
  const now = new Date();
  const dayOfWeek = now.getUTCDay(); // 0=Sun
  const daysUntilSunday = dayOfWeek === 0 ? 7 : 7 - dayOfWeek;
  const nextSunday = new Date(now);
  nextSunday.setUTCDate(now.getUTCDate() + daysUntilSunday);
  nextSunday.setUTCHours(0, 0, 0, 0); // 09:00 JST = 00:00 UTC
  return c.json({
    enabled: settings.newsletterEnabled,
    stats,
    nextSendAt: nextSunday.getTime(),
    subscribers,
  });
});

app.put('/newsletter', async (c) => {
  const db = getDb(c);
  const actor = c.var.user!;
  const body = (await c.req.json().catch(() => null)) as { enabled?: unknown } | null;
  if (typeof body?.enabled !== 'boolean') return c.json({ error: 'invalid_body' }, 400);
  const settings = await updateSettings(db, { newsletterEnabled: body.enabled });
  await invalidateSettingsCache(c.env.TRENDING_KV);
  await logAdminAction(db, { actorId: actor.id, action: body.enabled ? 'newsletter_enable' : 'newsletter_disable', detail: {} });
  return c.json({ enabled: settings.newsletterEnabled });
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
