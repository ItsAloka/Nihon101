import { pgTable, text, integer, bigint, boolean, real, jsonb, index, uniqueIndex, type AnyPgColumn } from 'drizzle-orm/pg-core';

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
  role: text('role').notNull().default('user'),
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
]);

export const postComments = pgTable('post_comments', {
  id: text('id').primaryKey(),
  postId: text('post_id').notNull().references(() => posts.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  parentId: text('parent_id').references((): AnyPgColumn => postComments.id, { onDelete: 'cascade' }), // null = top-level; else the top-level comment it replies to
  body: text('body').notNull().default(''),
  likes: integer('likes').notNull().default(0),
  createdAt: ms('created_at').notNull(),
  updatedAt: ms('updated_at').notNull(),
}, (t) => [
  index('post_comments_post_idx').on(t.postId, t.createdAt),
  index('post_comments_user_idx').on(t.userId),
  index('post_comments_parent_idx').on(t.parentId),
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

export type User = typeof users.$inferSelect;
export type Category = typeof categories.$inferSelect;
export type Tag = typeof tags.$inferSelect;
export type Post = typeof posts.$inferSelect;
export type PostComment = typeof postComments.$inferSelect;
export type Follow = typeof follows.$inferSelect;
export type PostRead = typeof postReads.$inferSelect;
export type Notification = typeof notifications.$inferSelect;
