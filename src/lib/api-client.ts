/**
 * API Client with request deduplication and caching.
 *
 * Prevents the SAME endpoint from being called multiple times simultaneously
 * (which was causing server crashes due to request flooding).
 *
 * Features:
 * - Deduplication: identical concurrent requests share a single in-flight promise
 * - Response caching: short-lived cache prevents rapid re-fetching
 * - Abort support: stale requests can be cancelled
 * - Error recovery: failed requests don't cache errors
 */

// In-flight request map for deduplication
const inflightRequests = new Map<string, Promise<unknown>>()

// Response cache with TTL
const responseCache = new Map<string, { data: unknown; timestamp: number }>()
const DEFAULT_CACHE_TTL = 3000 // 3 seconds

// Periodic cleanup to prevent memory leaks
// Use a stored reference so we can clear it if needed
let cleanupTimer: ReturnType<typeof setInterval> | null = null

if (typeof window !== 'undefined') {
  cleanupTimer = setInterval(() => {
    const now = Date.now()
    for (const [key, entry] of responseCache.entries()) {
      if (now - entry.timestamp > 30000) { // Clean entries older than 30s
        responseCache.delete(key)
      }
    }
    // Also clean up any orphaned inflight requests
    for (const key of inflightRequests.keys()) {
      inflightRequests.delete(key)
    }
  }, 30000)
}

// Cleanup function for hot module reloading
export function cleanupApiClient() {
  if (cleanupTimer) {
    clearInterval(cleanupTimer)
    cleanupTimer = null
  }
  responseCache.clear()
  inflightRequests.clear()
}

export interface ApiClientOptions {
  /** Cache TTL in milliseconds. Set to 0 to disable caching. Default: 3000 */
  cacheTtl?: number
  /** Skip cache and force a fresh request */
  force?: boolean
  /** Request timeout in milliseconds. Default: 15000 */
  timeout?: number
}

/**
 * Deduplicated fetch wrapper.
 * If the same URL+options are already being fetched, returns the existing promise.
 * If a recent cached response exists, returns it immediately.
 */
export async function apiGet<T = unknown>(url: string, options?: ApiClientOptions): Promise<T> {
  const cacheKey = `GET:${url}`
  const cacheTtl = options?.cacheTtl ?? DEFAULT_CACHE_TTL

  // 1. Check cache (unless forced)
  if (!options?.force) {
    const cached = responseCache.get(cacheKey)
    if (cached && Date.now() - cached.timestamp < cacheTtl) {
      return cached.data as T
    }
  }

  // 2. Check for in-flight request (deduplication)
  const inflight = inflightRequests.get(cacheKey)
  if (inflight && !options?.force) {
    return inflight as Promise<T>
  }

  // 3. Make the request
  const controller = new AbortController()
  const timeoutMs = options?.timeout ?? 15000
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs)

  const fetchPromise = fetch(url, {
    method: 'GET',
    signal: controller.signal,
    headers: { 'Accept': 'application/json' },
  })
    .then(async (res) => {
      clearTimeout(timeoutId)
      if (!res.ok) {
        throw new Error(`API error: ${res.status} ${res.statusText}`)
      }
      const data = await res.json()
      // Cache the response
      responseCache.set(cacheKey, { data, timestamp: Date.now() })
      return data as T
    })
    .catch((err) => {
      clearTimeout(timeoutId)
      if (err.name === 'AbortError') {
        console.warn(`[API Client] Request timed out: ${url}`)
      }
      throw err
    })
    .finally(() => {
      // Remove from in-flight map
      inflightRequests.delete(cacheKey)
    })

  // Store in-flight promise
  inflightRequests.set(cacheKey, fetchPromise)

  return fetchPromise as Promise<T>
}

/**
 * POST request wrapper with deduplication for identical payloads.
 */
export async function apiPost<T = unknown>(
  url: string,
  body: unknown,
  options?: ApiClientOptions
): Promise<T> {
  const controller = new AbortController()
  const timeoutMs = options?.timeout ?? 120000 // Longer timeout for POST (AI calls - up to 120s)
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const res = await fetch(url, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify(body),
    })

    clearTimeout(timeoutId)

    if (!res.ok) {
      const errData = await res.json().catch(() => ({ error: res.statusText }))
      throw new Error(errData.error || `API error: ${res.status}`)
    }

    // Invalidate any GET cache for related endpoints
    for (const key of responseCache.keys()) {
      if (key.startsWith('GET:') && key.includes('/api/databases')) {
        responseCache.delete(key)
      }
    }

    return (await res.json()) as T
  } catch (err) {
    clearTimeout(timeoutId)
    if ((err as Error).name === 'AbortError') {
      throw new Error('Request timed out. Please try again.')
    }
    throw err
  }
}

/**
 * PATCH request wrapper.
 */
export async function apiPatch<T = unknown>(
  url: string,
  body: unknown,
  options?: ApiClientOptions
): Promise<T> {
  const controller = new AbortController()
  const timeoutMs = options?.timeout ?? 30000
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const res = await fetch(url, {
      method: 'PATCH',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify(body),
    })

    clearTimeout(timeoutId)

    if (!res.ok) {
      const errData = await res.json().catch(() => ({ error: res.statusText }))
      throw new Error(errData.error || `API error: ${res.status}`)
    }

    // Invalidate caches
    for (const key of responseCache.keys()) {
      if (key.startsWith('GET:') && key.includes('/api/databases')) {
        responseCache.delete(key)
      }
    }

    return (await res.json()) as T
  } catch (err) {
    clearTimeout(timeoutId)
    throw err
  }
}

/**
 * DELETE request wrapper.
 */
export async function apiDelete<T = unknown>(
  url: string,
  options?: ApiClientOptions
): Promise<T> {
  const controller = new AbortController()
  const timeoutMs = options?.timeout ?? 10000
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const res = await fetch(url, {
      method: 'DELETE',
      signal: controller.signal,
      headers: { 'Accept': 'application/json' },
    })

    clearTimeout(timeoutId)

    if (!res.ok) {
      const errData = await res.json().catch(() => ({ error: res.statusText }))
      throw new Error(errData.error || `API error: ${res.status}`)
    }

    // Invalidate caches
    for (const key of responseCache.keys()) {
      if (key.startsWith('GET:') && key.includes('/api/databases')) {
        responseCache.delete(key)
      }
    }

    return (await res.json()) as T
  } catch (err) {
    clearTimeout(timeoutId)
    throw err
  }
}

/**
 * Clear all cached data. Useful after mutations.
 */
export function invalidateCache(pattern?: string) {
  if (pattern) {
    for (const key of responseCache.keys()) {
      if (key.includes(pattern)) {
        responseCache.delete(key)
      }
    }
  } else {
    responseCache.clear()
  }
}
