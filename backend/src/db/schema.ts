import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core';

export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  email: text('email').notNull(),
  passwordHash: text('password_hash'),
  displayName: text('display_name').notNull(),
  role: text('role').notNull().default('user'),
  emailVerified: integer('email_verified').notNull().default(0),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
});

export const refreshTokens = sqliteTable('refresh_tokens', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  tokenHash: text('token_hash').notNull(),
  familyId: text('family_id').notNull(),
  userAgent: text('user_agent'),
  expiresAt: integer('expires_at').notNull(),
  createdAt: integer('created_at').notNull(),
  revokedAt: integer('revoked_at'),
  replacedBy: text('replaced_by'),
});

export const googleLinks = sqliteTable('google_links', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  googleSub: text('google_sub').notNull(),
  email: text('email'),
  createdAt: integer('created_at').notNull(),
});

export const passwordResets = sqliteTable('password_resets', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  tokenHash: text('token_hash').notNull(),
  expiresAt: integer('expires_at').notNull(),
  usedAt: integer('used_at'),
  createdAt: integer('created_at').notNull(),
});

// ---- Blog: categories + posts (bilingual, Portability-Law compliant) ----

export const categories = sqliteTable('categories', {
  id: text('id').primaryKey(),               // slug, e.g. 'culture'
  labelEn: text('label_en').notNull(),
  labelJa: text('label_ja').notNull(),
  kanji: text('kanji').notNull().default(''), // single-kanji glyph for the chip
  tint: text('tint').notNull(),               // palette key, e.g. 'rose'
  postCount: integer('post_count').notNull().default(0),
  createdBy: text('created_by'),              // null = built-in/system
  createdAt: integer('created_at').notNull(),
});

export const posts = sqliteTable('posts', {
  id: text('id').primaryKey(),
  authorId: text('author_id').notNull(),
  categoryId: text('category_id').notNull(),
  slug: text('slug').notNull(),
  lang: text('lang').notNull().default('en'), // source language: 'en' | 'ja'
  // Bilingual content — both locales stored, both SSR'd. The author writes one
  // language; ChatGPT fills the other in the background on publish.
  // (Translation is stored, never runtime.)
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
  tags: text('tags').notNull().default('[]'),      // JSON array of strings
  likes: integer('likes').notNull().default(0),
  saves: integer('saves').notNull().default(0),
  comments: integer('comments').notNull().default(0),
  publishedAt: integer('published_at'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
});

export type User = typeof users.$inferSelect;
export type Category = typeof categories.$inferSelect;
export type Post = typeof posts.$inferSelect;
