-- Admin user-search trigram index (hand-written; drizzle doesn't model gin_trgm_ops).
-- searchUsersAdmin matches email with ILIKE '%x%'; display_name + handle already
-- have trigram GIN indexes (0006), email did not — so email search full-scanned.
-- Post title admin search (searchPostsAdmin) is already covered by the
-- title_en/title_ja trigram indexes from 0006.
CREATE INDEX IF NOT EXISTS "users_email_trgm_idx" ON "users" USING gin ("email" gin_trgm_ops);
