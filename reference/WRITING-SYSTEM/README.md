# WRITING SYSTEM — reference copy

Snapshot of every file involved in rendering the editor at `/write` (and
`/write?id=<postId>` to edit). These are **copies** — edit the real files under
`frontend/` and `backend/`, not these.

## Core (writing-specific)
- `frontend/src/pages/write.astro` — entry page; mounts `<Page>` in the `editor` route.
- `frontend/src/components/views/EditorView.tsx` — **the editor**. TipTap setup, toolbar, `/` slash menu + `＋` insert, subtitle, category picker, density tool, save-draft / publish / delete, autosave.
- `frontend/src/lib/ResizableImage.tsx` — custom TipTap image node (resize, float, caption, delete).
- `frontend/src/lib/YoutubeNode.tsx` — custom TipTap YouTube embed node.

## Backend (saves the post + media)
- `src/routes/posts.ts` — `POST /posts` (create), `PUT /posts/:id` (update + draft↔published count), `DELETE /posts/:id`.
- `src/routes/media.ts` — `POST /media` uploads images to R2 (fixes the old base64 `SQLITE_TOOBIG`).
- `src/routes/categories.ts` — list / create categories from the picker.
- `src/db/queries/posts.ts` — `createPost`, `updatePost`, `deletePost`, `uniqueSlug`, `publicPost`.
- `src/db/queries/categories.ts`, `src/db/schema.ts` — schema + category bump logic.
- `src/middleware/auth.ts` (`requireAuth`) + `db.ts`, `src/lib/crypto.ts`, `src/lib/ids.ts`, `src/index.ts`, `src/types.ts`, `wrangler.toml`, `migrations/*`.

## Shared chrome (same files appear in READING-SYSTEM)
`Page.tsx` (router), `Header.tsx`, `Footer.tsx`, `ui.tsx`, `Layout.astro`,
`global.css`, `lib/{api,authStore,store,icons,content}.ts`, `data/seed.ts`.
`lib/api.ts` holds `uploadImage`; `lib/content.ts` holds `categoryApi`/`postApi`.

> Note: `Page.tsx` imports every view, so it references ArticleView/Home/etc. too —
> only `EditorView` is exercised on the writing route.
