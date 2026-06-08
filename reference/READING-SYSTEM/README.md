# READING SYSTEM — reference copy

Snapshot of every file involved in rendering a published post at
`/read?id=<postId>` (and the prerendered `/post/<id>`). These are **copies** —
edit the real files under `frontend/` and `backend/`, not these.

## Core (reading-specific)
- `frontend/src/pages/read.astro` — entry page for `/read?id=`; mounts `<Page>` in `article` route.
- `frontend/src/pages/post/[id].astro` — prerendered `/post/<id>` variant (seed-driven).
- `frontend/src/components/views/ArticleView.tsx` — **the reader**. Fetches the API post, renders HTML body + density, cover, author, like/save/share/comment bar, owner Edit/Delete controls.
- `frontend/src/components/cards.tsx` — related-post / grid cards shown around the article.

## Backend (serves the post)
- `src/routes/posts.ts` — `GET /posts/:id` and `GET /posts` (published = public, drafts owner-only).
- `src/routes/media.ts` — `GET /media/:key` serves R2-stored images.
- `src/routes/categories.ts` — category lookups used by the chrome.
- `src/db/queries/posts.ts` — `getPostWithAuthor`, `listPosts`, `publicPost` shape.
- `src/db/queries/categories.ts`, `src/db/schema.ts` — schema + category queries.
- `src/middleware/auth.ts` + `db.ts`, `src/lib/crypto.ts` (JWT verify), `src/lib/ids.ts`, `src/index.ts`, `src/types.ts`, `wrangler.toml`, `migrations/*`.

## Shared chrome (same files appear in WRITING-SYSTEM)
`Page.tsx` (router), `Header.tsx`, `Footer.tsx`, `ui.tsx`, `Layout.astro`,
`global.css`, `lib/{api,authStore,store,icons,content}.ts`, `data/seed.ts`,
`lib/{ResizableImage,YoutubeNode}.tsx` (custom nodes whose HTML appears in the body).

> Note: `Page.tsx` imports every view, so it references EditorView/Home/etc. too —
> only `ArticleView` is exercised on the reading route.
