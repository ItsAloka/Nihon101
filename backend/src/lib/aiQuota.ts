/* Per-user daily ceiling on paid OpenAI calls. The per-minute rate limits
 * (limits.translate / limits.category) stop bursts; this stops a logged-in abuser
 * slowly grinding the bill up all day. One KV counter per (user, UTC day), TTL'd
 * to ~25h so it self-expires. KV-less dev → no quota (always allows). */
import type { Context } from 'hono';
import type { AppEnv } from '../types';

const DAILY_LIMIT = 100; // OpenAI calls per user per day — the hard cost cap

/** True if the user has spent their daily AI budget. Increments on each allowed
 *  call, so call this exactly once per intended OpenAI request. */
export async function overAiQuota(c: Context<AppEnv>, userId: string): Promise<boolean> {
  const kv = c.env.TRENDING_KV as KVNamespace | undefined;
  if (!kv) return false;
  const day = Math.floor(Date.now() / 86_400_000);
  const key = `aiq:${userId}:${day}`;
  const n = Number(await kv.get(key)) || 0;
  if (n >= DAILY_LIMIT) return true;
  await kv.put(key, String(n + 1), { expirationTtl: 90_000 });
  return false;
}
