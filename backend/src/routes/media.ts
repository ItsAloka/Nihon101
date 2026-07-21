/* Image uploads → R2. Keeps base64 data URLs out of the post body (blobs don't
 * belong in Postgres rows), so posts with images stay lean. Upload is owner-only;
 * serving is public and edge-cached. */
import { Hono } from 'hono';
import type { AppEnv } from '../types';
import { requireAuth } from '../middleware/requireAuth';
import { limits } from '../middleware/rateLimit';

const app = new Hono<AppEnv>();

const MAX_BYTES = 8 * 1024 * 1024; // 8MB per image
const EXT: Record<string, string> = {
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/gif': 'gif',
  'image/webp': 'webp', 'image/avif': 'avif',
};

/** Sniff the real image type from the leading bytes — the client-supplied MIME is
 *  untrusted, so we never let it decide what we store. Returns the canonical ext
 *  the bytes actually are, or null if they're not one of our allowed formats. A
 *  non-image (HTML, script, polyglot) renamed to .png is rejected here. */
export function sniffExt(b: Uint8Array): string | null {
  const u32 = (i: number) => b[i] !== undefined;
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpg';
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'png';
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38) return 'gif'; // GIF8
  // RIFF....WEBP
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return 'webp';
  // ISO-BMFF "ftyp" box at offset 4 with an AVIF/HEIF brand at offset 8.
  if (u32(11) && b[4] === 0x66 && b[5] === 0x74 && b[6] === 0x79 && b[7] === 0x70) {
    const brand = String.fromCharCode(b[8], b[9], b[10], b[11]);
    if (brand === 'avif' || brand === 'avis' || brand === 'mif1' || brand === 'heic' || brand === 'heix') return 'avif';
  }
  return null;
}

// Upload one image. Returns a public URL pointing back at GET /media/:key.
app.post('/', requireAuth, limits.upload, async (c) => {
  const form = await c.req.formData().catch(() => null);
  // Workers/DOM File typings clash here, so treat the entry structurally.
  const file = form?.get('file') as unknown as
    { type: string; size: number; arrayBuffer: () => Promise<ArrayBuffer> } | string | null;
  if (!file || typeof file === 'string' || typeof file.arrayBuffer !== 'function')
    return c.json({ error: 'no_file' }, 400);

  if (!EXT[file.type]) return c.json({ error: 'unsupported_type' }, 415);
  if (file.size > MAX_BYTES) return c.json({ error: 'too_large' }, 413);

  // Read once (already capped at 8MB) and trust the BYTES, not the declared type.
  let buf = new Uint8Array(await file.arrayBuffer());
  if (buf.byteLength > MAX_BYTES) return c.json({ error: 'too_large' }, 413);
  let ext = sniffExt(buf);
  if (!ext) return c.json({ error: 'not_an_image' }, 415);

  // Backup re-encode: normal uploads arrive as client-shrunk WebP (shrinkImage,
  // maxEdge 2000, q82) and skip this — only a browser-bypass POSTing a raw
  // jpeg/png (or an oversized webp) burns a transformation. GIFs pass through
  // (animation), AVIF passes through (already compact, not a supported input).
  // Fail-open: a binding error/absence stores the original — cost, not security.
  if (c.env.IMAGES && (ext === 'jpg' || ext === 'png' || (ext === 'webp' && buf.byteLength > 2 * 1024 * 1024))) {
    try {
      const out = await c.env.IMAGES.input(new Blob([buf]).stream())
        .transform({ width: 2000, height: 2000, fit: 'scale-down' })
        .output({ format: 'image/webp', quality: 82 });
      const encoded = new Uint8Array(await new Response(out.image()).arrayBuffer());
      // Keep the original if the re-encode somehow came out bigger (tiny inputs).
      if (encoded.byteLength > 0 && encoded.byteLength < buf.byteLength) { buf = encoded; ext = 'webp'; }
    } catch (e) {
      console.error('[media] re-encode failed, storing original', e);
    }
  }
  const contentType = Object.keys(EXT).find((m) => EXT[m] === ext) || 'application/octet-stream';

  const key = `${c.var.user!.id}/${crypto.randomUUID()}.${ext}`;
  await c.env.MEDIA.put(key, buf, {
    httpMetadata: { contentType, cacheControl: 'public, max-age=31536000, immutable' },
  });

  const url = `${new URL(c.req.url).origin}/media/${key}`;
  return c.json({ url, key }, 201);
});

/* Responsive derivatives. Covers are stored at up to 2000px, but a phone card
 * paints them into a ~370px box — Lighthouse measured 118 KB of pure waste on the
 * home page alone, and the LCP image spent 2.1 s just downloading. `?w=` returns
 * a resized WebP.
 *
 * The widths are an ALLOWLIST, not a free parameter: each distinct (key, width)
 * is one billed transformation, so an open `?w=` would let anyone mint unbounded
 * transformations by walking the integers. Five sizes × the number of covers is a
 * bounded, cacheable universe. Everything else falls through to the original. */
const WIDTHS = [320, 480, 640, 960, 1280] as const;
const parseWidth = (raw: string | undefined): number | null => {
  const n = Number(raw);
  return (WIDTHS as readonly number[]).includes(n) ? n : null;
};

// Serve an uploaded image (public). Key can contain a "/" (userId/uuid.ext).
// Edge-cached via the Cache API: Cloudflare does NOT auto-cache Worker responses,
// so without this every avatar/cover render is a Worker invocation + an R2 read —
// at 50k users that's the biggest read bill on the platform. Keys are immutable
// UUIDs (a changed image is a NEW key), so cached entries never need invalidation.
app.get('/:key{.+}', limits.media, async (c) => {
  const url = new URL(c.req.url);
  const width = parseWidth(url.searchParams.get('w') ?? undefined);
  const cache = (caches as unknown as { default: Cache }).default;
  // Normalised key: only the allowlisted width survives, so `?w=640&junk=1` can't
  // spawn a second cache entry (or a second transformation) for the same bytes.
  const cacheKey = new Request(`${url.origin}${url.pathname}${width ? `?w=${width}` : ''}`, { method: 'GET' });
  const hit = await cache.match(cacheKey).catch(() => undefined);
  // Re-wrap: a cache.match Response has immutable headers, and the security-header
  // middleware mutates headers after next() — returning it raw would throw.
  if (hit) return new Response(hit.body, hit);

  const obj = await c.env.MEDIA.get(c.req.param('key'));
  if (!obj) return c.json({ error: 'not_found' }, 404);
  const headers = new Headers();
  obj.writeHttpMetadata(headers);
  headers.set('etag', obj.httpEtag);
  headers.set('cache-control', 'public, max-age=31536000, immutable');

  // Resize on the way out. Fail-open: any binding/decode problem serves the
  // original — a heavier image is a cost problem, never a broken page.
  //
  // Only formats the Images binding can DECODE are attempted. GIF is excluded so
  // animation survives; AVIF because the binding doesn't take it as an input (the
  // upload path above passes AVIF through untouched for the same reason). Trying
  // anyway would just burn the failure path on every request for those covers.
  const type = headers.get('content-type') ?? '';
  const resizable = type === 'image/jpeg' || type === 'image/png' || type === 'image/webp';
  if (width && c.env.IMAGES && resizable) {
    try {
      const out = await c.env.IMAGES.input(obj.body as ReadableStream)
        .transform({ width, fit: 'scale-down' })
        .output({ format: 'image/webp', quality: 80 });
      const resized = new Response(out.image(), { headers: new Headers(headers) });
      resized.headers.set('content-type', 'image/webp');
      resized.headers.delete('content-length');
      resized.headers.set('etag', `${obj.httpEtag.replace(/"$/, '')}-w${width}"`);
      c.executionCtx.waitUntil(cache.put(cacheKey, resized.clone()).catch(() => {}));
      return resized;
    } catch (e) {
      console.error('[media] resize failed, serving original', e);
      // obj.body is consumed by the failed transform — re-read before falling back.
      const again = await c.env.MEDIA.get(c.req.param('key'));
      if (!again) return c.json({ error: 'not_found' }, 404);
      // Cache the original UNDER THE ?w= KEY. Without this, a persistent failure
      // (binding outage, transformation quota) means every single cover request
      // forever costs two R2 reads plus a doomed transform, uncached — the exact
      // shape of bill this route's Cache API layer exists to prevent.
      const fallback = new Response(again.body, { headers });
      c.executionCtx.waitUntil(cache.put(cacheKey, fallback.clone()).catch(() => {}));
      return fallback;
    }
  }

  const res = new Response(obj.body, { headers });
  // cache.put consumes the body — clone, and don't block the response on the write.
  c.executionCtx.waitUntil(cache.put(cacheKey, res.clone()).catch(() => {}));
  return res;
});

export default app;
