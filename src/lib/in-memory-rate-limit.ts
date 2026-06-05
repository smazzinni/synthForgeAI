/**
 * Bounded in-memory rate limiting for API routes (serverless-friendly).
 * Evicts expired entries and caps map size to avoid unbounded growth on warm instances.
 */

export type RateLimitEntry = { count: number; resetAt: number }

const DEFAULT_MAX_KEYS = 4096

function sanitizeClientId(clientId: string): string {
  return clientId.replace(/[^a-zA-Z0-9._\-:]/g, '_').slice(0, 128)
}

function pruneExpired(map: Map<string, RateLimitEntry>, now: number): void {
  for (const [key, entry] of map.entries()) {
    if (now > entry.resetAt) map.delete(key)
  }
}

/** If still over max after expiry prune, drop arbitrary keys (prefer expired already gone). */
function enforceMaxKeys(
  map: Map<string, RateLimitEntry>,
  maxKeys: number,
  now: number,
): void {
  if (map.size <= maxKeys) return
  pruneExpired(map, now)
  if (map.size <= maxKeys) return
  const overflow = map.size - maxKeys + 64
  let dropped = 0
  for (const key of map.keys()) {
    map.delete(key)
    dropped++
    if (dropped >= overflow) break
  }
}

export function checkRateLimit(
  map: Map<string, RateLimitEntry>,
  keyPrefix: string,
  clientId: string,
  limit: number,
  windowMs: number,
  options?: { maxKeys?: number; now?: number },
): boolean {
  const now = options?.now ?? Date.now()
  const maxKeys = options?.maxKeys ?? DEFAULT_MAX_KEYS
  const safeId = sanitizeClientId(clientId || 'unknown')
  const key = `${keyPrefix}:${safeId}`

  enforceMaxKeys(map, maxKeys, now)

  const entry = map.get(key)
  if (!entry || now > entry.resetAt) {
    map.set(key, { count: 1, resetAt: now + windowMs })
    return true
  }
  if (entry.count >= limit) return false
  entry.count++
  return true
}

export function periodicCleanup(
  map: Map<string, RateLimitEntry>,
  lastRunAt: { value: number },
  intervalMs: number,
  maxKeys: number = DEFAULT_MAX_KEYS,
  now: number = Date.now(),
): void {
  if (now - lastRunAt.value < intervalMs) return
  lastRunAt.value = now
  pruneExpired(map, now)
  enforceMaxKeys(map, maxKeys, now)
}
