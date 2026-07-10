import { pgTable, text, integer, bigint, boolean, real, jsonb, index, uniqueIndex, type AnyPgColumn } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

// Postgres-native schema. IDs are text `<prefix>_<nanoid21>`. Timestamps are
// epoch-ms stored as bigint (native, numeric — keeps Date.now() math and the
// API's ms contract). Booleans are real booleans; tags are jsonb.

const ms = (name: string) => bigint(name, { mode: 'number' });

export const users = pgTable('users', {
  id: text('id').primaryKey(),
  email: text('email').notNull(),
  passwordHash: text('password_hash'),
  displayName: text('display_name').notNull(),          // EN / romaji name
  displayNameJa: text('display_name_ja').notNull().default(''), // author-written JA name, '' = fall back to EN
  handle: text('handle').notNull(),           // public slug, e.g. 'kage-loom' — never translated
  bio: text('bio').notNull().default(''),                // EN bio
  bioJa: text('bio_ja').notNull().default(''),           // JA bio (auto-translated at edit time, author-reviewable)
  location: text('location').notNull().default(''),
  avatarUrl: text('avatar_url'),              // R2 url via /media, null = initials
  bannerUrl: text('banner_url'),              // R2 url via /media, null = tint gradient
  role: text('role').notNull().default('user'),  // 'user' | 'admin'
  // Ban state mirrored onto the user row for a fast O(1) check at login/refresh;
  // the full history (who/why/when) lives in `bans`. bannedUntil null + isBanned
  // true = permanent; isBanned false = active.
  isBanned: boolean('is_banned').notNull().default(false),
  bannedUntil: ms('banned_until'),
  emailVerified: boolean('email_verified').notNull().default(false),
  createdAt: ms('created_at').notNull(),
  updatedAt: ms('updated_at').notNull(),
}, (t) => [
  uniqueIndex('ux_users_email').on(t.email),
  uniqueIndex('ux_users_handle').on(t.handle),
]);

export const refreshTokens = pgTable('refresh_tokens', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  tokenHash: text('token_hash').notNull(),
  familyId: text('family_id').notNull(),
  userAgent: text('user_agent'),
  expiresAt: ms('expires_at').notNull(),
  createdAt: ms('created_at').notNull(),
  revokedAt: ms('revoked_at'),
  replacedBy: text('replaced_by'),
}, (t) => [
  uniqueIndex('ux_rt_hash').on(t.tokenHash),
  index('ix_rt_user').on(t.userId),
  index('ix_rt_family').on(t.familyId),
]);

export const googleLinks = pgTable('google_links', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  googleSub: text('google_sub').notNull(),
  email: text('email'),
  createdAt: ms('created_at').notNull(),
}, (t) => [
  uniqueIndex('ux_google_sub').on(t.googleSub),
  index('ix_google_user').on(t.userId),
]);

export const passwordResets = pgTable('password_resets', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  tokenHash: text('token_hash').notNull(),
  expiresAt: ms('expires_at').notNull(),
  usedAt: ms('used_at'),
  createdAt: ms('created_at').notNull(),
}, (t) => [
  uniqueIndex('ux_pr_hash').on(t.tokenHash),
  index('ix_pr_user').on(t.userId),
]);

// Email-verification tokens. Same shape/lifecycle as password resets: opaque token
// emailed, only its sha256(+pepper) hash stored, single-use, expiring. Consuming one
// flips users.email_verified true (which the auto-hide trust gate depends on).
export const emailVerifications = pgTable('email_verifications', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  tokenHash: text('token_hash').notNull(),
  expiresAt: ms('expires_at').notNull(),
  usedAt: ms('used_at'),
  createdAt: ms('created_at').notNull(),
}, (t) => [
  uniqueIndex('ux_ev_hash').on(t.tokenHash),
  index('ix_ev_user').on(t.userId),
]);

// Login OTP (second factor for email+password logins). A 6-digit code is mailed
// at login; only its sha256(+pepper) hash is stored. One pending per user (old
// rows cleared on issue). Single-use, short-lived, attempt-capped. Google logins
// and trusted devices skip this entirely.
export const loginOtps = pgTable('login_otps', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  codeHash: text('code_hash').notNull(),
  attempts: integer('attempts').notNull().default(0),
  expiresAt: ms('expires_at').notNull(),
  usedAt: ms('used_at'),
  createdAt: ms('created_at').notNull(),
}, (t) => [
  index('ix_login_otps_user').on(t.userId),
]);

// "Remember this device" tokens. After passing OTP a user can mark the device
// trusted for 30 days; the opaque token rides in an HttpOnly cookie, only its
// hash is stored, and a live match lets that device skip OTP on next login.
export const trustedDevices = pgTable('trusted_devices', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  tokenHash: text('token_hash').notNull(),
  userAgent: text('user_agent'),
  expiresAt: ms('expires_at').notNull(),
  createdAt: ms('created_at').notNull(),
}, (t) => [
  uniqueIndex('ux_td_hash').on(t.tokenHash),
  index('ix_td_user').on(t.userId),
]);

// ---- Blog: categories + posts (bilingual) ----

export const categories = pgTable('categories', {
  id: text('id').primaryKey(),               // slug, e.g. 'culture'
  labelEn: text('label_en').notNull(),
  labelJa: text('label_ja').notNull(),
  kanji: text('kanji').notNull().default(''), // single-kanji glyph for the chip
  tint: text('tint').notNull(),               // palette key, e.g. 'rose'
  postCount: integer('post_count').notNull().default(0),
  createdBy: text('created_by').references(() => users.id, { onDelete: 'set null' }), // null = built-in/system
  createdAt: ms('created_at').notNull(),
}, (t) => [
  index('categories_count_idx').on(t.postCount),
]);

// Tag counters: posts keep their jsonb `tags` as the source of truth; this table
// is a denormalized per-label published-post counter (free-form, not translated —
// stored as written). Feeds the search "top tags" chips + tag-autocomplete counts.
export const tags = pgTable('tags', {
  id: text('id').primaryKey(),            // slug of the label
  label: text('label').notNull(),         // display label, as first written
  postCount: integer('post_count').notNull().default(0),
  createdAt: ms('created_at').notNull(),
}, (t) => [
  index('tags_count_idx').on(t.postCount),
]);

export const posts = pgTable('posts', {
  id: text('id').primaryKey(),
  authorId: text('author_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  categoryId: text('category_id').notNull().references(() => categories.id, { onDelete: 'restrict' }),
  slug: text('slug').notNull(),
  lang: text('lang').notNull().default('en'), // source language: 'en' | 'ja'
  // Bilingual content — both locales stored, both SSR'd. The author writes one
  // language; ChatGPT fills the other in the background on publish.
  titleEn: text('title_en').notNull().default(''),
  titleJa: text('title_ja').notNull().default(''),
  excerptEn: text('excerpt_en').notNull().default(''),
  excerptJa: text('excerpt_ja').notNull().default(''),
  bodyEn: text('body_en').notNull().default(''),   // sanitized HTML
  bodyJa: text('body_ja').notNull().default(''),   // sanitized HTML
  cover: text('cover'),                            // R2 url, null = none
  coverLabel: text('cover_label').notNull().default(''),   // PHOTO tag on the cover
  coverCredit: text('cover_credit').notNull().default(''), // credit line under it
  status: text('status').notNull().default('draft'),   // 'draft' | 'published'
  // Background auto-translate bookkeeping: 'none' (never scheduled) | 'pending'
  // (job scheduled/running — also what a killed Worker leaves behind, so pending
  // is retryable) | 'done' | 'failed'. Owner surfaces show pending/failed with
  // a retry; readers never see this.
  translationStatus: text('translation_status').notNull().default('none'),
  // Moderator hide: a published post can be hidden (drops from every public read)
  // without losing its 'published' status, so unhiding restores it cleanly.
  isHidden: boolean('is_hidden').notNull().default(false),
  hiddenReason: text('hidden_reason').notNull().default(''),
  density: text('density').notNull().default('compact'), // line spacing
  score: real('score'),                            // optional review score 0–10
  tags: jsonb('tags').$type<string[]>().notNull().default([]),
  likes: integer('likes').notNull().default(0),
  saves: integer('saves').notNull().default(0),
  comments: integer('comments').notNull().default(0),
  // Engagement-decayed trending score, recomputed hourly by the scheduled() cron
  // (Phase 6 / Step 2). Null until first computed. Powers the Trending page.
  trendScore: real('trend_score'),
  publishedAt: ms('published_at'),
  createdAt: ms('created_at').notNull(),
  updatedAt: ms('updated_at').notNull(),
}, (t) => [
  uniqueIndex('posts_slug_idx').on(t.slug),
  index('posts_author_idx').on(t.authorId),
  index('posts_category_idx').on(t.categoryId),
  index('posts_status_idx').on(t.status),
  index('posts_trend_idx').on(t.trendScore),
]);

// ---- Engagement: per-user likes + flat comments ----

export const postLikes = pgTable('post_likes', {
  id: text('id').primaryKey(),
  postId: text('post_id').notNull().references(() => posts.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  createdAt: ms('created_at').notNull(),
}, (t) => [
  uniqueIndex('post_likes_post_user_idx').on(t.postId, t.userId),
  index('post_likes_user_idx').on(t.userId),
  // The per-minute trending recompute filters by created_at across all engagement
  // tables; without a created_at-leading index that's a full seq-scan every run.
  index('post_likes_created_idx').on(t.createdAt),
]);

export const postComments = pgTable('post_comments', {
  id: text('id').primaryKey(),
  postId: text('post_id').notNull().references(() => posts.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  parentId: text('parent_id').references((): AnyPgColumn => postComments.id, { onDelete: 'cascade' }), // null = top-level; else the top-level comment it replies to
  body: text('body').notNull().default(''),
  likes: integer('likes').notNull().default(0),
  isHidden: boolean('is_hidden').notNull().default(false), // moderator-hidden comment
  createdAt: ms('created_at').notNull(),
  updatedAt: ms('updated_at').notNull(),
}, (t) => [
  index('post_comments_post_idx').on(t.postId, t.createdAt),
  index('post_comments_user_idx').on(t.userId),
  index('post_comments_parent_idx').on(t.parentId),
  index('post_comments_created_idx').on(t.createdAt), // trending recompute window scan
]);

export const commentLikes = pgTable('comment_likes', {
  id: text('id').primaryKey(),
  commentId: text('comment_id').notNull().references(() => postComments.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  createdAt: ms('created_at').notNull(),
}, (t) => [
  uniqueIndex('comment_likes_comment_user_idx').on(t.commentId, t.userId),
  index('comment_likes_user_idx').on(t.userId),
]);

// One row per (post, user) save (bookmark). Unique pair keeps it idempotent.
// Backs the profile "Saved" tab and the save×2 For You affinity signal.
export const postSaves = pgTable('post_saves', {
  id: text('id').primaryKey(),
  postId: text('post_id').notNull().references(() => posts.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  createdAt: ms('created_at').notNull(),
}, (t) => [
  uniqueIndex('post_saves_post_user_idx').on(t.postId, t.userId),
  index('post_saves_user_idx').on(t.userId, t.createdAt),
  index('post_saves_created_idx').on(t.createdAt), // trending recompute window scan
]);

// ---- Social graph: follows, reads, affinity, notifications (Phase 4) ----

// Directed follow edge. follower follows followee. Unique pair; indexed both
// directions (followee_id → "my followers", follower_id → "who I follow").
export const follows = pgTable('follows', {
  id: text('id').primaryKey(),
  followerId: text('follower_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  followeeId: text('followee_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  createdAt: ms('created_at').notNull(),
}, (t) => [
  uniqueIndex('follows_pair_idx').on(t.followerId, t.followeeId),
  index('follows_followee_idx').on(t.followeeId),
]);

// One row per (post, user) read — the affinity signal for the For You feed.
// Refreshed (createdAt bumped) on re-read.
export const postReads = pgTable('post_reads', {
  id: text('id').primaryKey(),
  postId: text('post_id').notNull().references(() => posts.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  createdAt: ms('created_at').notNull(),
}, (t) => [
  uniqueIndex('post_reads_post_user_idx').on(t.postId, t.userId),
  index('post_reads_user_idx').on(t.userId, t.createdAt),
  index('post_reads_created_idx').on(t.createdAt), // trending recompute window scan
]);

// Cached per-user taste snapshot (normalized 0–1 within each dimension),
// recomputed at most once per TTL instead of running the engagement UNION every
// feed request. dimension ∈ 'cat' | 'tag'; key='' weight=0 is a no-engagement
// sentinel so we don't recompute on every request for a user with no signal.
export const userAffinity = pgTable('user_affinity', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  dimension: text('dimension').notNull(), // 'cat' | 'tag'
  key: text('key').notNull(),             // category id / tag slug ('' = sentinel)
  weight: real('weight').notNull().default(0),
  updatedAt: ms('updated_at').notNull(),
}, (t) => [
  index('user_affinity_user_idx').on(t.userId),
]);

// Negative engagement events for the For You taste profile. When a user REVERSES
// a positive (unlike, unsave) the original row is deleted, leaving no trace — so we
// drop a timestamped negative here instead. base is a negative weight (e.g. −3
// unlike, −2 unsave); computeAffinity folds it into the same decayed event stream,
// so reversing engagement pushes that taste below baseline. Decays out with WINDOW.
export const userSignals = pgTable('user_signals', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  postId: text('post_id').notNull().references(() => posts.id, { onDelete: 'cascade' }),
  base: real('base').notNull(), // negative weight (−3 unlike, −2 unsave)
  createdAt: ms('created_at').notNull(),
}, (t) => [
  index('user_signals_user_idx').on(t.userId, t.createdAt),
]);

// In-app notification. type ∈ like | comment | reply | follow | post. actor is
// who triggered it; post/comment are the target (nullable for follow). read_at
// null = unread. Indexed by recipient + recency for the bell panel.
export const notifications = pgTable('notifications', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  type: text('type').notNull(), // 'like' | 'comment' | 'reply' | 'follow' | 'post'
  actorId: text('actor_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  postId: text('post_id').references(() => posts.id, { onDelete: 'cascade' }),
  commentId: text('comment_id').references(() => postComments.id, { onDelete: 'cascade' }),
  readAt: ms('read_at'),
  createdAt: ms('created_at').notNull(),
}, (t) => [
  index('notifications_user_idx').on(t.userId, t.createdAt),
]);

// ---- Moderation + admin (Phase 8) ----

// A user-filed report against a post, comment, or another user. targetId is
// polymorphic (resolved per targetType) so it can't be a real FK — every other
// id column here is. Kept after the reporter deletes (set null) for the record.
export const reports = pgTable('reports', {
  id: text('id').primaryKey(),
  reporterId: text('reporter_id').references(() => users.id, { onDelete: 'set null' }),
  targetType: text('target_type').notNull(),       // 'post' | 'comment' | 'user'
  targetId: text('target_id').notNull(),
  reason: text('reason').notNull().default(''),    // short category, e.g. 'spam'
  detail: text('detail').notNull().default(''),    // reporter's free-text
  status: text('status').notNull().default('open'), // 'open' | 'resolved' | 'dismissed'
  resolvedBy: text('resolved_by').references(() => users.id, { onDelete: 'set null' }),
  resolvedAt: ms('resolved_at'),
  resolutionNote: text('resolution_note').notNull().default(''), // what the admin did / why
  createdAt: ms('created_at').notNull(),
}, (t) => [
  index('reports_status_idx').on(t.status, t.createdAt),
  index('reports_target_idx').on(t.targetType, t.targetId),
]);

// Ban history. The live state is mirrored on users.isBanned/bannedUntil for the
// hot login check; this is the audit trail (who issued, why, how long, when lifted).
export const bans = pgTable('bans', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  issuedBy: text('issued_by').references(() => users.id, { onDelete: 'set null' }),
  reason: text('reason').notNull().default(''),
  duration: text('duration').notNull(),  // '24h' | '7d' | 'permanent'
  expiresAt: ms('expires_at'),           // null = permanent
  liftedAt: ms('lifted_at'),
  liftedBy: text('lifted_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: ms('created_at').notNull(),
}, (t) => [
  index('bans_user_idx').on(t.userId, t.createdAt),
]);

// Immutable audit log: one row per admin action (hide, ban, delete, pick edit…).
export const adminActions = pgTable('admin_actions', {
  id: text('id').primaryKey(),
  actorId: text('actor_id').references(() => users.id, { onDelete: 'set null' }),
  action: text('action').notNull(),
  targetType: text('target_type').notNull().default(''),
  targetId: text('target_id').notNull().default(''),
  detail: jsonb('detail').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: ms('created_at').notNull(),
}, (t) => [
  index('admin_actions_actor_idx').on(t.actorId, t.createdAt),
  index('admin_actions_created_idx').on(t.createdAt),
]);

// Admin-curated home promotion. Each row pins a published post to a home slot
// (section = 'hero' | 'feature' | 'picks', rank = order within it). Cascade so a
// deleted post drops out of the curation automatically; home falls back to
// recency when a section has no rows.
export const featuredSlots = pgTable('featured_slots', {
  id: text('id').primaryKey(),
  section: text('section').notNull(),  // 'hero' | 'feature' | 'picks'
  rank: integer('rank').notNull(),     // order within section (1-based)
  postId: text('post_id').notNull().references(() => posts.id, { onDelete: 'cascade' }),
  updatedAt: ms('updated_at').notNull(),
}, (t) => [
  uniqueIndex('featured_section_rank_idx').on(t.section, t.rank),
  index('featured_post_idx').on(t.postId),
]);

// Singleton moderation config (one row, id = 'singleton'). reportThreshold = how
// many DISTINCT reporters a target needs before its case surfaces in the admin
// "needs action" queue (anti flood/abuse). autoHideThreshold = distinct TRUSTED
// reporters at which a post/comment is auto-hidden pending review (enforced ≥
// reportThreshold by the settings route).
export const adminSettings = pgTable('admin_settings', {
  id: text('id').primaryKey(),               // always 'singleton'
  reportThreshold: integer('report_threshold').notNull().default(3),
  autoHideThreshold: integer('auto_hide_threshold').notNull().default(6),
  // Kill switch for the entire Sunday Letter newsletter system. When false the
  // public signup endpoint rejects new subscribers and the send cron is a no-op.
  newsletterEnabled: boolean('newsletter_enabled').notNull().default(true),
  updatedAt: ms('updated_at').notNull(),
});

// Pre-launch newsletter list (capture only — the weekly digest sender ships later,
// once the list is worth sending to). One row per email; userId links the row to a
// signed-in subscriber when present, but signup is open to logged-out visitors too.
export const newsletterSubscribers = pgTable('newsletter_subscribers', {
  id: text('id').primaryKey(),
  email: text('email').notNull(),
  locale: text('locale').notNull().default('ja'),  // which language to send in
  userId: text('user_id').references(() => users.id, { onDelete: 'set null' }),
  createdAt: ms('created_at').notNull(),
  // Idempotency checkpoint for the weekly send: the issue number this row was last
  // sent. The send only picks rows with lastSentIssue < currentIssue and stamps it
  // after each batch, so a cron that's killed + retried mid-run never re-mails the
  // batches it already delivered. 0 = never sent.
  lastSentIssue: integer('last_sent_issue').notNull().default(0),
  // Double opt-in: null = signed up but never proved inbox ownership (the Sunday
  // sender skips these; the hourly cron prunes them after 7 days). The pending
  // 6-digit confirm code lives here peppered-hashed, same scheme as login_otps.
  confirmedAt: ms('confirmed_at'),
  codeHash: text('code_hash'),
  codeExpiresAt: ms('code_expires_at'),
  attempts: integer('attempts').notNull().default(0),
}, (t) => [
  uniqueIndex('ux_newsletter_email').on(t.email),
  // Partial index: the hourly unconfirmed-prune only ever touches this tiny slice.
  index('ix_newsletter_unconfirmed').on(t.createdAt).where(sql`confirmed_at is null`),
]);

export type User = typeof users.$inferSelect;
export type AdminSettings = typeof adminSettings.$inferSelect;
export type Report = typeof reports.$inferSelect;
export type Ban = typeof bans.$inferSelect;
export type AdminAction = typeof adminActions.$inferSelect;
export type FeaturedSlot = typeof featuredSlots.$inferSelect;
export type Category = typeof categories.$inferSelect;
export type Tag = typeof tags.$inferSelect;
export type Post = typeof posts.$inferSelect;
export type PostComment = typeof postComments.$inferSelect;
export type Follow = typeof follows.$inferSelect;
export type PostRead = typeof postReads.$inferSelect;
export type Notification = typeof notifications.$inferSelect;
export type NewsletterSubscriber = typeof newsletterSubscribers.$inferSelect;
