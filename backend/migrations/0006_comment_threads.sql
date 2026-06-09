-- 0006_comment_threads — one level of replies for post comments.
-- parent_id NULL = a top-level comment; otherwise it points at the top-level
-- comment this is a reply to. We allow only ONE level: a reply to a reply is
-- flattened onto the original top-level parent in app code.
-- Hand-written ANSI SQL (portable to Postgres).

ALTER TABLE post_comments ADD COLUMN parent_id TEXT;
CREATE INDEX post_comments_parent_idx ON post_comments (parent_id);
