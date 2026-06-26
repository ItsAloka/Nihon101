/* R2 media bookkeeping — the single source of truth for "which R2 keys does a
 * piece of content own". Every upload is stored under `<userId>/<uuid>.<ext>`
 * (see routes/media.ts), referenced from the DB three ways:
 *   • users.avatar_url     — one key
 *   • posts.cover          — one key
 *   • posts.body{En,Ja}    — any number of <img src=".../media/<key>"> in the HTML
 *
 * The body-image case is the one the original orphan-scanner missed: it only knew
 * about covers + avatars, so every in-body image looked "unreferenced" and a
 * bulk-delete would have wiped images out of LIVE posts. These helpers make the
 * body the source of truth too, and give the delete paths a way to free a post's
 * (or a whole user's) blobs so R2 doesn't fill with orphans. */

// Image URLs we mint always end in one of these extensions (sniffed at upload).
const MEDIA_URL_RE = /\/media\/([^"'\s)<>]+?\.(?:jpe?g|png|gif|webp|avif))/gi;

/** The bare R2 key from a stored media URL (`<origin>/media/<key>`), or null. */
export function keyFromUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const after = url.split('/media/')[1];
  if (!after) return null;
  const key = after.split(/[?#]/)[0]!.trim();
  return key || null;
}

/** Every `/media/<key>` referenced by a chunk of post-body HTML (both locales can
 *  be passed in turn). Deduped by the caller; returns raw keys. */
export function bodyMediaKeys(html: string | null | undefined): string[] {
  if (!html) return [];
  const keys: string[] = [];
  for (const m of html.matchAll(MEDIA_URL_RE)) if (m[1]) keys.push(m[1]);
  return keys;
}

/** All R2 keys a single post owns: its cover plus every in-body image across both
 *  locales, deduped. Used to free a post's blobs when it's deleted. */
export function postMediaKeys(post: {
  cover?: string | null;
  bodyEn?: string | null;
  bodyJa?: string | null;
}): string[] {
  const set = new Set<string>();
  const cover = keyFromUrl(post.cover);
  if (cover) set.add(cover);
  for (const k of bodyMediaKeys(post.bodyEn)) set.add(k);
  for (const k of bodyMediaKeys(post.bodyJa)) set.add(k);
  return [...set];
}

/** Delete a set of R2 keys, chunked to R2's 1000-per-call limit. Best-effort:
 *  a failure on one chunk never throws into the caller (orphans are recoverable
 *  via the admin scanner; a thrown error on a delete path is not worth it). */
export async function deleteMediaKeys(env: { MEDIA: R2Bucket }, keys: string[]): Promise<number> {
  const unique = [...new Set(keys.filter(Boolean))];
  for (let i = 0; i < unique.length; i += 1000) {
    await env.MEDIA.delete(unique.slice(i, i + 1000)).catch(() => {});
  }
  return unique.length;
}

/** Delete EVERY object a user owns (prefix `<userId>/`). Because all of a user's
 *  uploads — avatar, post covers, in-body images — live under that one prefix,
 *  this is the complete blob cleanup for account deletion (GDPR erasure), with no
 *  need to enumerate their posts. Best-effort + paginated. */
export async function deleteUserMedia(env: { MEDIA: R2Bucket }, userId: string): Promise<number> {
  if (!userId) return 0;
  const prefix = `${userId}/`;
  let cursor: string | undefined;
  let deleted = 0;
  do {
    const page = await env.MEDIA.list({ prefix, cursor, limit: 1000 }).catch(() => null);
    if (!page) break;
    const keys = page.objects.map((o) => o.key);
    if (keys.length) { await env.MEDIA.delete(keys).catch(() => {}); deleted += keys.length; }
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);
  return deleted;
}
