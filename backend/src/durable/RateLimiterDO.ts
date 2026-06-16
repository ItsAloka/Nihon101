/* ============================================================================
 * RateLimiterDO — exact, atomic fixed-window counter for the brute-force class.
 * ============================================================================
 * KV is eventually consistent (~seconds across regions), so a sudden multi-region
 * burst can leak ~2–3x past a strict cap. That's fine for spam/scrape control but
 * NOT for credential guessing, where the cap must hold exactly. A Durable Object is
 * a single global actor per id, so all requests for one (bucket, subject) serialize
 * through this instance and the count is exact.
 *
 * One DO instance per `idFromName("<bucket>:<subject>")` (e.g. `login:ip:1.2.3.4`).
 * State is one window record persisted to DO storage so it survives eviction within
 * the window. `blockConcurrencyWhile` serializes the read-modify-write so two
 * in-flight requests can't both read the same count. An alarm clears the record one
 * window after the last write, so idle instances don't retain storage forever.
 * ========================================================================== */

interface WindowRec {
  windowId: number;
  count: number;
}

export class RateLimiterDO {
  private state: DurableObjectState;

  constructor(state: DurableObjectState) {
    this.state = state;
  }

  async fetch(req: Request): Promise<Response> {
    const { limit, windowMs } = await req.json<{ limit: number; windowMs: number }>();
    const now = Date.now();
    const windowId = Math.floor(now / windowMs);
    const resetAt = (windowId + 1) * windowMs;

    return this.state.blockConcurrencyWhile(async () => {
      let rec = await this.state.storage.get<WindowRec>('w');
      if (!rec || rec.windowId !== windowId) rec = { windowId, count: 0 };

      if (rec.count >= limit) {
        return Response.json({ ok: false, resetAt });
      }

      rec.count += 1;
      await this.state.storage.put('w', rec);
      // Self-clean: drop the record one window after the latest write.
      await this.state.storage.setAlarm(resetAt + windowMs);
      return Response.json({ ok: true, resetAt });
    });
  }

  async alarm(): Promise<void> {
    await this.state.storage.deleteAll();
  }
}
