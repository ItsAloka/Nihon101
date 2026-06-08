/* Drizzle schema (D1/SQLite). Portable column types only — see stack.txt:
 * text IDs (<prefix>_nanoid21), timestamp_ms integers, boolean via integer mode. */
import { sqliteTable, text, integer, real, uniqueIndex, index } from 'drizzle-orm/sqlite-core';

export const users = sqliteTable(
  'users',
  {
    id: text('id').primaryKey(),
    username: text('username').notNull(),
    email: text('email').notNull(),
    // null for OAuth-only accounts that never set a password.
    passwordHash: text('password_hash'),
    displayName: text('display_name').notNull(),
    avatarColor: text('avatar_color').notNull().default('var(--teal)'),
    bio: text('bio').notNull().default(''),
    role: text('role').notNull().default('user'),
    emailVerified: integer('email_verified', { mode: 'boolean' }).notNull().default(false),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (t) => ({
    usernameIdx: uniqueIndex('users_username_idx').on(t.username),
    emailIdx: uniqueIndex('users_email_idx').on(t.email),
  }),
);

export const refreshTokens = sqliteTable(
  'refresh_tokens',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull(),
    // sha256(token + REFRESH_PEPPER) — raw token is never stored.
    tokenHash: text('token_hash').notNull(),
    familyId: text('family_id').notNull(),
    replacedBy: text('replaced_by'),
    revoked: integer('revoked', { mode: 'boolean' }).notNull().default(false),
    userAgent: text('user_agent'),
    expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (t) => ({
    hashIdx: uniqueIndex('refresh_tokens_hash_idx').on(t.tokenHash),
    userIdx: index('refresh_tokens_user_idx').on(t.userId),
    familyIdx: index('refresh_tokens_family_idx').on(t.familyId),
  }),
);

export const googleLinks = sqliteTable(
  'google_links',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull(),
    googleSub: text('google_sub').notNull(),
    email: text('email').notNull(),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (t) => ({
    subIdx: uniqueIndex('google_links_sub_idx').on(t.googleSub),
    userIdx: index('google_links_user_idx').on(t.userId),
  }),
);

export const categories = sqliteTable(
  'categories',
  {
    id: text('id').primaryKey(), // slug
    label: text('label').notNull(),
    colorVar: text('color_var').notNull(),
    postCount: integer('post_count').notNull().default(0),
    createdBy: text('created_by'), // null for built-in defaults
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (t) => ({
    countIdx: index('categories_count_idx').on(t.postCount),
  }),
);

export const posts = sqliteTable(
  'posts',
  {
    id: text('id').primaryKey(),
    authorId: text('author_id').notNull(),
    categoryId: text('category_id').notNull(),
    title: text('title').notNull(),
    slug: text('slug').notNull(),
    excerpt: text('excerpt').notNull().default(''),
    cover: text('cover'),
    body: text('body').notNull().default(''), // markdown
    status: text('status', { enum: ['draft', 'published'] }).notNull().default('draft'),
    density: text('density', { enum: ['compact', 'normal', 'relaxed'] }).notNull().default('compact'),
    score: real('score'),
    tags: text('tags', { mode: 'json' }).notNull().$type<string[]>().default([]),
    likes: integer('likes').notNull().default(0),
    saves: integer('saves').notNull().default(0),
    comments: integer('comments').notNull().default(0),
    publishedAt: integer('published_at', { mode: 'timestamp_ms' }),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (t) => ({
    slugIdx: uniqueIndex('posts_slug_idx').on(t.slug),
    authorIdx: index('posts_author_idx').on(t.authorId),
    categoryIdx: index('posts_category_idx').on(t.categoryId),
    statusIdx: index('posts_status_idx').on(t.status),
  }),
);

// One-way subscribe (YouTube style): follower subscribes to following. No back-link.
export const userFollows = sqliteTable(
  'user_follows',
  {
    id: text('id').primaryKey(),
    followerId: text('follower_id').notNull(),
    followingId: text('following_id').notNull(),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (t) => ({
    pairIdx: uniqueIndex('user_follows_pair_idx').on(t.followerId, t.followingId),
    followingIdx: index('user_follows_following_idx').on(t.followingId),
  }),
);
