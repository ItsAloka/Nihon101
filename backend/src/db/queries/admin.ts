/* Admin + moderation query layer. Reports queue, bans (history + the mirrored
 * user-row flag), hide toggles, the audit log, user search, stats, and the
 * home-curation (featured) slots. Every state-changing admin action is paired
 * with a logAdminAction() row by the route layer. */
import { eq, and, desc, lt, sql, inArray, isNull, count } from 'drizzle-orm';
import type { DB } from '../client';
import {
  users, posts, postComments, reports, bans, adminActions, featuredSlots, adminSettings, contactMessages,
  type Report, type Ban,
} from '../schema';
import { id as newId } from '../../lib/ids';
import { cardCols, type PostCardRow } from './posts';

const now = () => Date.now();

export type ReportStatus = 'open' | 'resolved' | 'dismissed';
export type TargetType = 'post' | 'comment' | 'user';
export type BanDuration = '24h' | '7d' | 'permanent';

/* ---------------- usernames (for report/audit display) ---------------- */

/** Map of id → display name for a set of user ids (one query). */
export async function getDisplayNamesByIds(db: DB, ids: string[]): Promise<Map<string, string>> {
  if (!ids.length) return new Map();
  const rows = await db
    .select({ id: users.id, name: users.displayName, handle: users.handle })
    .from(users)
    .where(inArray(users.id, ids));
  return new Map(rows.map((r) => [r.id, r.name || r.handle]));
}

/* ---------------- reports ---------------- */

export async function createReport(
  db: DB,
  input: { reporterId: string | null; targetType: TargetType; targetId: string; reason: string; detail: string },
): Promise<Report> {
  const row = {
    id: newId('rpt'),
    reporterId: input.reporterId,
    targetType: input.targetType,
    targetId: input.targetId,
    reason: input.reason.slice(0, 60),
    detail: input.detail.slice(0, 1000),
    status: 'open' as const,
    resolvedBy: null,
    resolvedAt: null,
    createdAt: now(),
  };
  await db.insert(reports).values(row);
  return row as Report;
}

/** Has this reporter already an OPEN report against this exact target? Keeps a
 *  user from spamming the same flag (the route returns the existing one as ok). */
export async function existingOpenReport(db: DB, reporterId: string, targetType: TargetType, targetId: string) {
  const [row] = await db
    .select({ id: reports.id })
    .from(reports)
    .where(and(
      eq(reports.reporterId, reporterId),
      eq(reports.targetType, targetType),
      eq(reports.targetId, targetId),
      eq(reports.status, 'open'),
    ));
  return row;
}

/** Reports, newest first, optionally filtered by status, keyset-paginated by
 *  createdAt (`before`). */
export function listReports(db: DB, status: ReportStatus | null, limit = 50, before: number | null = null) {
  const conds = [
    status ? eq(reports.status, status) : undefined,
    before ? lt(reports.createdAt, before) : undefined,
  ].filter(Boolean);
  return db
    .select()
    .from(reports)
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(reports.createdAt))
    .limit(limit);
}

export async function getReportById(db: DB, id: string): Promise<Report | undefined> {
  const [row] = await db.select().from(reports).where(eq(reports.id, id));
  return row;
}

/** How many OPEN reports exist for one target (the dupe badge in the queue). */
export async function countReportsForTarget(db: DB, targetType: string, targetId: string): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(reports)
    .where(and(eq(reports.targetType, targetType), eq(reports.targetId, targetId), eq(reports.status, 'open')));
  return row?.n ?? 0;
}

/** Close a report. Returns false if it was already closed (lost race / double-click). */
export async function resolveReport(db: DB, id: string, resolverId: string, status: 'resolved' | 'dismissed', note = ''): Promise<boolean> {
  const res = await db
    .update(reports)
    .set({ status, resolvedBy: resolverId, resolvedAt: now(), resolutionNote: note.slice(0, 500) })
    .where(and(eq(reports.id, id), eq(reports.status, 'open')))
    .returning({ id: reports.id });
  return res.length > 0;
}

/** Reopen a CLOSED report — flip it back to the Open queue and clear the
 *  resolution stamp. Returns false if it wasn't actually closed (already open). */
export async function reopenReport(db: DB, id: string): Promise<boolean> {
  const res = await db
    .update(reports)
    .set({ status: 'open', resolvedBy: null, resolvedAt: null, resolutionNote: '' })
    .where(and(eq(reports.id, id), inArray(reports.status, ['resolved', 'dismissed'])))
    .returning({ id: reports.id });
  return res.length > 0;
}

/** Resolve every OPEN report against a target (called when an admin hides/deletes
 *  it, so acting on the content clears its queue entries). Optional note records
 *  what the admin did, stamped onto every report in the case. */
export async function resolveReportsForTarget(db: DB, targetType: string, targetId: string, resolverId: string, note = ''): Promise<number> {
  const res = await db
    .update(reports)
    .set({ status: 'resolved', resolvedBy: resolverId, resolvedAt: now(), resolutionNote: note.slice(0, 500) })
    .where(and(eq(reports.targetType, targetType), eq(reports.targetId, targetId), eq(reports.status, 'open')))
    .returning({ id: reports.id });
  return res.length;
}

/** Every report row filed against a target, with each reporter's name + avatar,
 *  newest first. Powers the case "who reported / why" detail view. */
export interface ReportDetailRow {
  id: string; reporterId: string | null; reporterName: string | null; reporterHandle: string | null;
  reporterAvatarUrl: string | null; reason: string; detail: string; status: string; createdAt: number;
}
export function listReportsForTarget(db: DB, targetType: string, targetId: string, status: ReportStatus | null = 'open'): Promise<ReportDetailRow[]> {
  const conds = [
    eq(reports.targetType, targetType),
    eq(reports.targetId, targetId),
    status ? eq(reports.status, status) : undefined,
  ].filter(Boolean);
  return db
    .select({
      id: reports.id,
      reporterId: reports.reporterId,
      reporterName: users.displayName,
      reporterHandle: users.handle,
      reporterAvatarUrl: users.avatarUrl,
      reason: reports.reason,
      detail: reports.detail,
      status: reports.status,
      createdAt: reports.createdAt,
    })
    .from(reports)
    .leftJoin(users, eq(users.id, reports.reporterId))
    .where(and(...conds))
    .orderBy(desc(reports.createdAt))
    .limit(200) as Promise<ReportDetailRow[]>;
}

/** Number of OPEN cases visible to the admin — distinct-reporter groups that meet
 *  the threshold. Matches the Reports tab list exactly, so the tab badge can never
 *  show a count while the list reads empty (below-threshold cases are hidden). */
export async function openReportCount(db: DB, threshold = 1): Promise<number> {
  const rows = await db
    .select({ t: reports.targetType, id: reports.targetId })
    .from(reports)
    .where(eq(reports.status, 'open'))
    .groupBy(reports.targetType, reports.targetId)
    .having(sql`count(distinct ${reports.reporterId}) >= ${threshold}`);
  return rows.length;
}

/** Account age (ms) a reporter must clear before their flag counts toward the
 *  AUTOMATED auto-hide. Auto-hide is the only no-human-in-the-loop takedown, so it
 *  weighs only reporters who are BOTH email-verified AND not brand-new — a wall of
 *  throwaway accounts can't force-hide content. The surface/queue threshold still
 *  counts everyone (see listReportCases). */
const TRUST_MIN_AGE_MS = 7 * 24 * 60 * 60 * 1000;

/** Distinct TRUSTED (email-verified + aged) people with an OPEN report against a
 *  target. This — not the raw count — is what auto-hide compares to its threshold,
 *  so sockpuppet floods can't trip the automated takedown. */
export async function countTrustedDistinctReporters(db: DB, targetType: string, targetId: string): Promise<number> {
  const cutoff = now() - TRUST_MIN_AGE_MS;
  const [row] = await db
    .select({ n: sql<number>`count(distinct ${reports.reporterId})::int` })
    .from(reports)
    .innerJoin(users, eq(users.id, reports.reporterId))
    .where(and(
      eq(reports.targetType, targetType),
      eq(reports.targetId, targetId),
      eq(reports.status, 'open'),
      eq(users.emailVerified, true),
      lt(users.createdAt, cutoff),
    ));
  return row?.n ?? 0;
}

export interface ReportCase {
  targetType: string;
  targetId: string;
  distinctReporters: number;
  totalReports: number;
  reasons: string[];   // every reason filed (client counts the breakdown)
  details: string[];   // non-empty free-text notes
  firstAt: number;
  lastAt: number;
}

/** OPEN reports collapsed into one CASE per target. Ordered by distinct-reporter
 *  count (the trigger metric) then recency, so the most-corroborated cases lead.
 *  The route splits these into "needs action" (≥ threshold) vs "watching". */
export async function listReportCases(db: DB, status: ReportStatus = 'open', limit = 200): Promise<ReportCase[]> {
  const rows = await db
    .select({
      targetType: reports.targetType,
      targetId: reports.targetId,
      distinctReporters: sql<number>`count(distinct ${reports.reporterId})::int`,
      totalReports: sql<number>`count(*)::int`,
      reasons: sql<string[]>`array_agg(${reports.reason})`,
      details: sql<string[]>`array_remove(array_agg(${reports.detail}), '')`,
      firstAt: sql<number>`min(${reports.createdAt})::double precision`,
      lastAt: sql<number>`max(${reports.createdAt})::double precision`,
    })
    .from(reports)
    .where(eq(reports.status, status))
    .groupBy(reports.targetType, reports.targetId)
    .orderBy(sql`count(distinct ${reports.reporterId}) desc`, sql`max(${reports.createdAt}) desc`)
    .limit(limit);
  return rows as ReportCase[];
}

/** Auto-clear stale low-signal "watching" cases: open reports whose target has
 *  FEWER than `threshold` distinct reporters AND whose newest report is older than
 *  `cutoff`. Without this, single-report cases that never reach the threshold pile
 *  up forever. Run hourly from the cron (resolverId null = system); also exposed as
 *  a manual admin sweep. Returns the number of reports dismissed. */
export async function dismissStaleWatchingReports(
  db: DB, threshold: number, cutoff: number, resolverId: string | null = null,
  note = 'auto-dismissed: stale low-signal report',
): Promise<number> {
  const stale = await db
    .select({ targetType: reports.targetType, targetId: reports.targetId })
    .from(reports)
    .where(eq(reports.status, 'open'))
    .groupBy(reports.targetType, reports.targetId)
    .having(and(
      sql`count(distinct ${reports.reporterId}) < ${threshold}`,
      sql`max(${reports.createdAt}) < ${cutoff}`,
    ));
  let n = 0;
  for (const s of stale) {
    const res = await db
      .update(reports)
      .set({ status: 'dismissed', resolvedBy: resolverId, resolvedAt: now(), resolutionNote: note.slice(0, 500) })
      .where(and(eq(reports.targetType, s.targetType), eq(reports.targetId, s.targetId), eq(reports.status, 'open')))
      .returning({ id: reports.id });
    n += res.length;
  }
  return n;
}

/** Display context for one report target (post/comment/user) shown in the queue. */
export interface ReportTargetCtx {
  postSlug: string | null; postTitle: string | null; cover: string | null;
  excerpt: string | null; handle: string | null;
  authorId: string | null; authorName: string | null; authorAvatarUrl: string | null;
  isHidden: boolean;
}
const emptyTargetCtx = (): ReportTargetCtx => ({
  postSlug: null, postTitle: null, cover: null, excerpt: null, handle: null,
  authorId: null, authorName: null, authorAvatarUrl: null, isHidden: false,
});
const ctxKey = (type: string, id: string) => `${type}:${id}`;

/** Batch-resolve display context for a set of report targets in a FIXED number of
 *  queries (replaces the per-row N+1). Returns a map keyed `${targetType}:${id}`;
 *  every input target is present (empty ctx if the row is gone). */
export async function resolveReportTargets(
  db: DB, targets: { targetType: string; targetId: string }[],
): Promise<Map<string, ReportTargetCtx>> {
  const out = new Map<string, ReportTargetCtx>();
  const postIds = new Set<string>();
  const commentIds = new Set<string>();
  const userTargetIds = new Set<string>();
  for (const t of targets) {
    out.set(ctxKey(t.targetType, t.targetId), emptyTargetCtx());
    if (t.targetType === 'post') postIds.add(t.targetId);
    else if (t.targetType === 'comment') commentIds.add(t.targetId);
    else if (t.targetType === 'user') userTargetIds.add(t.targetId);
  }
  if (!out.size) return out;

  // 1) the reported posts + comments themselves.
  const [postRows, commentRows] = await Promise.all([
    postIds.size
      ? db.select({ id: posts.id, slug: posts.slug, titleEn: posts.titleEn, titleJa: posts.titleJa, cover: posts.cover, authorId: posts.authorId, isHidden: posts.isHidden })
          .from(posts).where(inArray(posts.id, [...postIds]))
      : Promise.resolve([] as { id: string; slug: string; titleEn: string; titleJa: string; cover: string | null; authorId: string; isHidden: boolean }[]),
    commentIds.size
      ? db.select({ id: postComments.id, body: postComments.body, userId: postComments.userId, postId: postComments.postId, isHidden: postComments.isHidden })
          .from(postComments).where(inArray(postComments.id, [...commentIds]))
      : Promise.resolve([] as { id: string; body: string; userId: string; postId: string; isHidden: boolean }[]),
  ]);

  // 2) every user we must display (target users + post/comment authors) and every
  //    parent post a reported comment lives under, in one round each.
  const needUserIds = new Set<string>(userTargetIds);
  for (const p of postRows) needUserIds.add(p.authorId);
  for (const cm of commentRows) needUserIds.add(cm.userId);
  const parentPostIds = new Set<string>(commentRows.map((cm) => cm.postId).filter((pid) => !postIds.has(pid)));

  const [userRows, parentPostRows] = await Promise.all([
    needUserIds.size
      ? db.select({ id: users.id, handle: users.handle, displayName: users.displayName, avatarUrl: users.avatarUrl, isBanned: users.isBanned })
          .from(users).where(inArray(users.id, [...needUserIds]))
      : Promise.resolve([] as { id: string; handle: string; displayName: string; avatarUrl: string | null; isBanned: boolean }[]),
    parentPostIds.size
      ? db.select({ id: posts.id, slug: posts.slug, titleEn: posts.titleEn, titleJa: posts.titleJa })
          .from(posts).where(inArray(posts.id, [...parentPostIds]))
      : Promise.resolve([] as { id: string; slug: string; titleEn: string; titleJa: string }[]),
  ]);
  const userById = new Map(userRows.map((u) => [u.id, u]));
  const parentById = new Map<string, { slug: string; titleEn: string; titleJa: string }>();
  for (const p of parentPostRows) parentById.set(p.id, p);
  for (const p of postRows) parentById.set(p.id, p); // a reported post can itself be a comment's parent

  // 3) stitch.
  for (const p of postRows) {
    const ctx = out.get(ctxKey('post', p.id))!;
    ctx.postSlug = p.slug; ctx.postTitle = p.titleEn || p.titleJa; ctx.cover = p.cover ?? null;
    ctx.authorId = p.authorId; ctx.isHidden = !!p.isHidden;
    const a = userById.get(p.authorId);
    if (a) { ctx.authorName = a.displayName; ctx.handle = a.handle; ctx.authorAvatarUrl = a.avatarUrl ?? null; }
  }
  for (const cm of commentRows) {
    const ctx = out.get(ctxKey('comment', cm.id))!;
    ctx.excerpt = cm.body ? cm.body.slice(0, 160) : null; ctx.authorId = cm.userId; ctx.isHidden = !!cm.isHidden;
    const a = userById.get(cm.userId);
    if (a) { ctx.authorName = a.displayName; ctx.handle = a.handle; ctx.authorAvatarUrl = a.avatarUrl ?? null; }
    const pp = parentById.get(cm.postId);
    if (pp) { ctx.postSlug = pp.slug; ctx.postTitle = pp.titleEn || pp.titleJa; }
  }
  for (const uid of userTargetIds) {
    const ctx = out.get(ctxKey('user', uid))!;
    const u = userById.get(uid);
    if (u) { ctx.handle = u.handle; ctx.authorId = u.id; ctx.authorName = u.displayName; ctx.authorAvatarUrl = u.avatarUrl ?? null; ctx.isHidden = !!u.isBanned; }
  }
  return out;
}

/** Open-report counts (the dupe badge) for many targets in one query. Map keyed
 *  `${targetType}:${id}`. */
export async function countOpenReportsForTargets(db: DB, targets: { targetType: string; targetId: string }[]): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  const ids = [...new Set(targets.map((t) => t.targetId))];
  if (!ids.length) return map;
  const rows = await db
    .select({ targetType: reports.targetType, targetId: reports.targetId, n: sql<number>`count(*)::int` })
    .from(reports)
    .where(and(eq(reports.status, 'open'), inArray(reports.targetId, ids)))
    .groupBy(reports.targetType, reports.targetId);
  for (const r of rows) map.set(ctxKey(r.targetType, r.targetId), r.n);
  return map;
}

/** Dismiss every OPEN report against a target (admin judged the case harmless). */
export async function dismissReportsForTarget(db: DB, targetType: string, targetId: string, resolverId: string, note = ''): Promise<number> {
  const res = await db
    .update(reports)
    .set({ status: 'dismissed', resolvedBy: resolverId, resolvedAt: now(), resolutionNote: note.slice(0, 500) })
    .where(and(eq(reports.targetType, targetType), eq(reports.targetId, targetId), eq(reports.status, 'open')))
    .returning({ id: reports.id });
  return res.length;
}

/* ---------------- moderation settings (singleton) ---------------- */

const SETTINGS_ID = 'singleton';
// Defaults for a fresh install. autoHide ≥ report always. autoHide is the count of
// TRUSTED reporters (countTrustedDistinctReporters), so it sits higher than the
// surface threshold to stay conservative about no-human takedowns.
const DEFAULT_REPORT_THRESHOLD = 3;
const DEFAULT_AUTO_HIDE_THRESHOLD = 8;
export interface ModSettings { reportThreshold: number; autoHideThreshold: number; contactEmail: string; }

/** Read the singleton config, lazily creating it with defaults on first access. */
export async function getSettings(db: DB): Promise<ModSettings> {
  const [row] = await db.select().from(adminSettings).where(eq(adminSettings.id, SETTINGS_ID));
  if (row) return { reportThreshold: row.reportThreshold, autoHideThreshold: row.autoHideThreshold, contactEmail: row.contactEmail };
  await db.insert(adminSettings)
    .values({ id: SETTINGS_ID, reportThreshold: DEFAULT_REPORT_THRESHOLD, autoHideThreshold: DEFAULT_AUTO_HIDE_THRESHOLD, contactEmail: '', updatedAt: now() })
    .onConflictDoNothing();
  return { reportThreshold: DEFAULT_REPORT_THRESHOLD, autoHideThreshold: DEFAULT_AUTO_HIDE_THRESHOLD, contactEmail: '' };
}

const SETTINGS_KV_KEY = 'mod:settings';
const SETTINGS_KV_TTL = 60; // seconds — short; PUT also invalidates immediately.

/** Settings read for the hot path (public report POST): KV-cached so a flood of
 *  reports doesn't re-read the singleton row on every flag. Falls back to the DB
 *  (and warms KV). updateSettings's route invalidates via invalidateSettingsCache. */
export async function getSettingsCached(db: DB, kv: KVNamespace | undefined): Promise<ModSettings> {
  if (kv) {
    try {
      const raw = await kv.get(SETTINGS_KV_KEY);
      if (raw) return JSON.parse(raw) as ModSettings;
    } catch { /* miss/parse → live read */ }
  }
  const s = await getSettings(db);
  if (kv) { try { await kv.put(SETTINGS_KV_KEY, JSON.stringify(s), { expirationTtl: SETTINGS_KV_TTL }); } catch { /* noop */ } }
  return s;
}

/** Drop the cached settings so the next read reflects an admin edit at once. */
export async function invalidateSettingsCache(kv: KVNamespace | undefined): Promise<void> {
  if (kv) { try { await kv.delete(SETTINGS_KV_KEY); } catch { /* noop */ } }
}

/** Update the singleton config. Caller clamps/validates first. */
export async function updateSettings(db: DB, patch: Partial<ModSettings>): Promise<ModSettings> {
  await getSettings(db); // ensure the row exists
  await db.update(adminSettings).set({ ...patch, updatedAt: now() }).where(eq(adminSettings.id, SETTINGS_ID));
  return getSettings(db);
}

/** All reports filed against a user (their moderation history). */
export function reportsAgainstUser(db: DB, userId: string) {
  return db
    .select()
    .from(reports)
    .where(and(eq(reports.targetType, 'user'), eq(reports.targetId, userId)))
    .orderBy(desc(reports.createdAt))
    .limit(50);
}

/* ---------------- bans ---------------- */

/** Apply a ban: write the history row AND mirror the live state onto the user row
 *  (isBanned + bannedUntil) for the O(1) login check. */
export async function applyBan(
  db: DB,
  input: { userId: string; issuedBy: string; reason: string; duration: BanDuration; expiresAt: number | null },
): Promise<Ban> {
  const row = {
    id: newId('ban'),
    userId: input.userId,
    issuedBy: input.issuedBy,
    reason: input.reason.slice(0, 500),
    duration: input.duration,
    expiresAt: input.expiresAt,
    liftedAt: null,
    liftedBy: null,
    createdAt: now(),
  };
  await db.insert(bans).values(row);
  await db.update(users).set({ isBanned: true, bannedUntil: input.expiresAt, updatedAt: now() }).where(eq(users.id, input.userId));
  return row as Ban;
}

/** Lift a ban: clear the user-row flag AND mark every still-active ban row lifted. */
export async function liftBan(db: DB, userId: string, liftedBy: string): Promise<void> {
  await db.update(users).set({ isBanned: false, bannedUntil: null, updatedAt: now() }).where(eq(users.id, userId));
  await db
    .update(bans)
    .set({ liftedAt: now(), liftedBy })
    .where(and(eq(bans.userId, userId), isNull(bans.liftedAt)));
}

export function listUserBans(db: DB, userId: string) {
  return db.select().from(bans).where(eq(bans.userId, userId)).orderBy(desc(bans.createdAt));
}

export async function activeBanCount(db: DB): Promise<number> {
  const [row] = await db.select({ n: sql<number>`count(*)::int` }).from(users).where(eq(users.isBanned, true));
  return row?.n ?? 0;
}

/* ---------------- hide toggles ---------------- */

export async function setPostHidden(db: DB, id: string, hidden: boolean, reason = ''): Promise<void> {
  await db.update(posts).set({ isHidden: hidden, hiddenReason: hidden ? reason.slice(0, 300) : '', updatedAt: now() }).where(eq(posts.id, id));
}

export async function setCommentHidden(db: DB, id: string, hidden: boolean): Promise<void> {
  await db.update(postComments).set({ isHidden: hidden, updatedAt: now() }).where(eq(postComments.id, id));
}

/* ---------------- audit log ---------------- */

export async function logAdminAction(
  db: DB,
  input: { actorId: string | null; action: string; targetType?: string; targetId?: string; detail?: Record<string, unknown> },
): Promise<void> {
  await db.insert(adminActions).values({
    id: newId('aud'),
    actorId: input.actorId,
    action: input.action,
    targetType: input.targetType ?? '',
    targetId: input.targetId ?? '',
    detail: input.detail ?? {},
    createdAt: now(),
  });
}

export function listAdminActions(db: DB, limit = 50, before: number | null = null, action: string | null = null) {
  const conds = [
    before ? lt(adminActions.createdAt, before) : undefined,
    action ? eq(adminActions.action, action) : undefined,
  ].filter(Boolean);
  return db
    .select()
    .from(adminActions)
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(adminActions.createdAt))
    .limit(limit);
}

/* ---------------- users (moderation search + role) ---------------- */

export interface AdminUserRow {
  id: string;
  handle: string;
  displayName: string;
  email: string;
  avatarUrl: string | null;
  role: string;
  isBanned: boolean;
  bannedUntil: number | null;
  createdAt: number;
  postCount: number;
}

/** Moderation user search: by name/handle/email (substring), newest or by post
 *  count, optional banned-only. Includes each user's published-post count. */
export function searchUsersAdmin(
  db: DB,
  { q, sort = 'recent', bannedOnly = false, limit = 50, offset = 0 }:
    { q?: string; sort?: 'recent' | 'posts'; bannedOnly?: boolean; limit?: number; offset?: number },
): Promise<AdminUserRow[]> {
  const needle = q?.trim();
  const conds = [
    bannedOnly ? eq(users.isBanned, true) : undefined,
    needle ? sql`(${users.displayName} ILIKE ${'%' + needle + '%'} OR ${users.handle} ILIKE ${'%' + needle + '%'} OR ${users.email} ILIKE ${'%' + needle + '%'})` : undefined,
  ].filter(Boolean);
  const postCount = sql<number>`count(${posts.id})::int`;
  return db
    .select({
      id: users.id,
      handle: users.handle,
      displayName: users.displayName,
      email: users.email,
      avatarUrl: users.avatarUrl,
      role: users.role,
      isBanned: users.isBanned,
      bannedUntil: users.bannedUntil,
      createdAt: users.createdAt,
      postCount,
    })
    .from(users)
    .leftJoin(posts, and(eq(posts.authorId, users.id), eq(posts.status, 'published')))
    .where(conds.length ? and(...conds) : undefined)
    .groupBy(users.id)
    .orderBy(sort === 'posts' ? desc(postCount) : desc(users.createdAt))
    .limit(limit)
    .offset(offset) as Promise<AdminUserRow[]>;
}

export async function setUserRole(db: DB, userId: string, role: 'user' | 'admin'): Promise<void> {
  await db.update(users).set({ role, updatedAt: now() }).where(eq(users.id, userId));
}

/* ---------------- stats ---------------- */

export async function adminStats(db: DB): Promise<{
  openReports: number; activeBans: number; totalUsers: number; newUsersToday: number;
  totalPosts: number; hiddenPosts: number; newContacts: number;
}> {
  const dayAgo = now() - 24 * 60 * 60 * 1000;
  const { reportThreshold } = await getSettings(db);
  const [openReports, activeBans, [u], [pub], [hid], [contacts]] = await Promise.all([
    openReportCount(db, reportThreshold),
    activeBanCount(db),
    db.select({ total: sql<number>`count(*)::int`, today: sql<number>`count(*) FILTER (WHERE ${users.createdAt} > ${dayAgo})::int` }).from(users),
    db.select({ n: sql<number>`count(*)::int` }).from(posts).where(eq(posts.status, 'published')),
    db.select({ n: sql<number>`count(*)::int` }).from(posts).where(and(eq(posts.status, 'published'), eq(posts.isHidden, true))),
    db.select({ n: sql<number>`count(*)::int` }).from(contactMessages).where(eq(contactMessages.status, 'new')),
  ]);
  return {
    openReports, activeBans,
    totalUsers: u?.total ?? 0,
    newUsersToday: u?.today ?? 0,
    totalPosts: pub?.n ?? 0,
    hiddenPosts: hid?.n ?? 0,
    newContacts: contacts?.n ?? 0,
  };
}

/* ---------------- featured slots (home curation) ---------------- */

export type FeaturedSection = 'hero' | 'feature' | 'picks';

/** Current curation as card rows per section, in rank order. Drops slots whose
 *  post is no longer published/visible so the home never renders a dead pick. */
export async function listFeatured(db: DB): Promise<Record<FeaturedSection, PostCardRow[]>> {
  const rows = await db
    .select({ section: featuredSlots.section, rank: featuredSlots.rank, ...cardCols })
    .from(featuredSlots)
    .innerJoin(posts, eq(posts.id, featuredSlots.postId))
    .leftJoin(users, eq(posts.authorId, users.id))
    .where(and(eq(posts.status, 'published'), eq(posts.isHidden, false)))
    .orderBy(featuredSlots.section, featuredSlots.rank);
  const out: Record<FeaturedSection, PostCardRow[]> = { hero: [], feature: [], picks: [] };
  for (const r of rows as (PostCardRow & { section: FeaturedSection })[]) {
    (out[r.section] ??= []).push(r);
  }
  return out;
}

/** Replace the entire curation atomically: clear all slots, insert the new set.
 *  Caller validates sections/ranks/postIds first. */
export async function setFeatured(db: DB, slots: { section: FeaturedSection; rank: number; postId: string }[]): Promise<void> {
  await db.delete(featuredSlots);
  if (!slots.length) return;
  const at = now();
  await db.insert(featuredSlots).values(slots.map((s) => ({
    id: newId('feat'), section: s.section, rank: s.rank, postId: s.postId, updatedAt: at,
  })));
}

/* ---------------- admin post search (incl. hidden) ---------------- */

/** Post search for the admin tools (Featured picker + post moderation): includes
 *  hidden posts, simple title substring, newest first. */
export function searchPostsAdmin(db: DB, q: string | undefined, limit = 30): Promise<PostCardRow[]> {
  const needle = q?.trim();
  const where = and(
    eq(posts.status, 'published'),
    needle ? sql`(${posts.titleEn} ILIKE ${'%' + needle + '%'} OR ${posts.titleJa} ILIKE ${'%' + needle + '%'})` : undefined,
  );
  return db
    .select(cardCols)
    .from(posts)
    .leftJoin(users, eq(posts.authorId, users.id))
    .where(where)
    .orderBy(desc(posts.publishedAt))
    .limit(limit) as Promise<PostCardRow[]>;
}
