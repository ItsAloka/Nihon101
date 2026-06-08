-- 0004_post_lang — records a post's source language ('en'|'ja'). The opposite
-- locale is machine-translated (ChatGPT) in the background on publish.
ALTER TABLE posts ADD COLUMN lang TEXT NOT NULL DEFAULT 'en';
