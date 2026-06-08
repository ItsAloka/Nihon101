/* Image uploads → R2. Keeps base64 data URLs out of the post body (D1 rows have
 * a hard size cap), so posts with images actually save. Upload is owner-only;
 * serving is public and cached. */
import { Hono } from 'hono';
import type { AppEnv } from '../types';
import { requireAuth } from '../middleware/auth';

const app = new Hono<AppEnv>();

const MAX_BYTES = 8 * 1024 * 1024; // 8MB per image
const EXT: Record<string, string> = {
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/gif': 'gif',
  'image/webp': 'webp', 'image/avif': 'avif',
};

// Upload one image. Returns a public URL pointing back at GET /media/:key.
app.post('/', requireAuth, async (c) => {
  const form = await c.req.formData().catch(() => null);
  // Workers/DOM File typings clash here, so treat the entry structurally.
  const file = form?.get('file') as unknown as
    { type: string; size: number; stream: () => ReadableStream } | string | null;
  if (!file || typeof file === 'string' || typeof file.stream !== 'function')
    return c.json({ error: 'no_file' }, 400);

  const ext = EXT[file.type];
  if (!ext) return c.json({ error: 'unsupported_type' }, 415);
  if (file.size > MAX_BYTES) return c.json({ error: 'too_large' }, 413);

  const key = `${c.var.user.id}/${crypto.randomUUID()}.${ext}`;
  await c.env.MEDIA.put(key, file.stream(), {
    httpMetadata: { contentType: file.type, cacheControl: 'public, max-age=31536000, immutable' },
  });

  const url = `${new URL(c.req.url).origin}/media/${key}`;
  return c.json({ url, key }, 201);
});

// Serve an uploaded image (public). Key can contain a "/" (userId/uuid.ext).
app.get('/:key{.+}', async (c) => {
  const obj = await c.env.MEDIA.get(c.req.param('key'));
  if (!obj) return c.json({ error: 'not_found' }, 404);
  const headers = new Headers();
  obj.writeHttpMetadata(headers);
  headers.set('etag', obj.httpEtag);
  headers.set('cache-control', 'public, max-age=31536000, immutable');
  return new Response(obj.body, { headers });
});

export default app;
