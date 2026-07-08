// Fixed-window rate limiting on D1 — one UPSERT per request, no extra services.
// Deliberately simple: per-(route, ip) counters in windowed buckets. This is the
// abuse throttle, not a precision limiter; Cloudflare's own DDoS layer sits in
// front of everything anyway.

export interface RateRule {
  limit: number; // max requests …
  windowSec: number; // … per this window
}

export async function rateLimit(db: D1Database, route: string, ip: string, rule: RateRule): Promise<boolean> {
  const now = Math.floor(Date.now() / 1000);
  const windowStart = now - (now % rule.windowSec);
  const key = `${route}:${ip}:${windowStart}`;
  const row = await db
    .prepare(
      `INSERT INTO rate_limits (rl_key, window_start, count) VALUES (?1, ?2, 1)
       ON CONFLICT(rl_key) DO UPDATE SET count = count + 1
       RETURNING count`,
    )
    .bind(key, windowStart)
    .first<{ count: number }>();
  // Opportunistic prune (~1% of requests): drop buckets older than a day.
  if (now % 97 === 0) {
    await db.prepare('DELETE FROM rate_limits WHERE window_start < ?1').bind(now - 86_400).run();
  }
  return (row?.count ?? 1) <= rule.limit;
}
