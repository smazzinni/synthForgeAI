/**
 * Simple fixed-window rate limiter keyed by user id (not by the spoofable
 * X-Forwarded-For header). Per-instance memory: good enough to stop runaway
 * clients and accidental loops; use an edge/WAF limiter for abuse protection
 * across many instances.
 */
const g = globalThis as unknown as { __synthRateLimits?: Map<string, { count: number; resetAt: number }> }
const buckets: Map<string, { count: number; resetAt: number }> = g.__synthRateLimits ?? (g.__synthRateLimits = new Map())
let lastSweep = 0

export function rateLimit(key: string, limit: number, windowMs: number): { ok: true } | { ok: false; retryAfterSec: number } {
  const now = Date.now()
  if (now - lastSweep > 60_000) {
    lastSweep = now
    for (const [k, b] of buckets) if (b.resetAt <= now) buckets.delete(k)
  }
  const bucket = buckets.get(key)
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs })
    return { ok: true }
  }
  if (bucket.count >= limit) return { ok: false, retryAfterSec: Math.ceil((bucket.resetAt - now) / 1000) }
  bucket.count++
  return { ok: true }
}

/** Returns a 429 Response when the limit is exceeded, otherwise null. */
export function enforceRateLimit(userId: string, scope: string, limit: number, windowMs = 60_000): Response | null {
  const r = rateLimit(`${scope}:${userId}`, limit, windowMs)
  if (r.ok) return null
  return Response.json(
    { error: 'Too many requests — please slow down.' },
    { status: 429, headers: { 'Retry-After': String(r.retryAfterSec) } },
  )
}
