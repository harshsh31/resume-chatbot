export type RateLimitResult = { allowed: boolean; retryAfterSec: number };

// ponytail: in-memory, best-effort on serverless (instances don't share memory);
// real backstop is the Anthropic spend limit.
// r[impl abuse-protection.rate-limits-per-ip]
export function createRateLimiter(opts: {
  limit: number;
  windowMs: number;
  now?: () => number;
}) {
  const { limit, windowMs, now = Date.now } = opts;
  const hits = new Map<string, { count: number; resetAt: number }>();

  return {
    check(ip: string): RateLimitResult {
      const t = now();
      // Prune expired entries so the map cannot grow unbounded.
      for (const [key, entry] of hits) {
        if (entry.resetAt <= t) hits.delete(key);
      }
      let entry = hits.get(ip);
      if (!entry) {
        entry = { count: 0, resetAt: t + windowMs };
        hits.set(ip, entry);
      }
      entry.count++;
      if (entry.count > limit) {
        return {
          allowed: false,
          retryAfterSec: Math.max(1, Math.ceil((entry.resetAt - t) / 1000)),
        };
      }
      return { allowed: true, retryAfterSec: 0 };
    },
    size: () => hits.size,
  };
}
