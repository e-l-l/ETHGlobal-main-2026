// Fixed-window in-memory limiter. It is per serverless instance only: fine for a demo. For
// anything real, use Upstash Redis or a Vercel WAF rate-limit rule on POST /api/auth/login.
const buckets = new Map<string, { count: number; resetAt: number }>();

export function loginLimits() {
  return {
    max: Number(process.env.LOGIN_RATE_LIMIT_MAX ?? 10),
    windowMs: Number(process.env.LOGIN_RATE_LIMIT_WINDOW_SEC ?? 300) * 1000,
  };
}

/** Counts one attempt for `key`. Returns true if it is still within the limit. */
export function hit(key: string, max: number, windowMs: number, now = Date.now()): boolean {
  const b = buckets.get(key);
  if (!b || b.resetAt <= now) {
    if (buckets.size > 10_000) {
      for (const [k, v] of buckets) if (v.resetAt <= now) buckets.delete(k);
    }
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  b.count += 1;
  return b.count <= max;
}

export function resetRateLimits(): void {
  buckets.clear();
}

export function clientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}
