import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

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

export type User = typeof users.$inferSelect;
