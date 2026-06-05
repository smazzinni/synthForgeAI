import { describe, expect, it } from 'vitest'
import { checkRateLimit, periodicCleanup, type RateLimitEntry } from './in-memory-rate-limit'

describe('checkRateLimit', () => {
  it('allows requests under the limit', () => {
    const map = new Map<string, RateLimitEntry>()
    expect(checkRateLimit(map, 't', 'client-a', 3, 60_000)).toBe(true)
    expect(checkRateLimit(map, 't', 'client-a', 3, 60_000)).toBe(true)
    expect(checkRateLimit(map, 't', 'client-a', 3, 60_000)).toBe(true)
  })

  it('blocks after the limit within the window', () => {
    const map = new Map<string, RateLimitEntry>()
    expect(checkRateLimit(map, 't', 'ip1', 2, 60_000)).toBe(true)
    expect(checkRateLimit(map, 't', 'ip1', 2, 60_000)).toBe(true)
    expect(checkRateLimit(map, 't', 'ip1', 2, 60_000)).toBe(false)
  })

  it('resets after the window', () => {
    const map = new Map<string, RateLimitEntry>()
    const t0 = 1_000_000
    expect(
      checkRateLimit(map, 't', 'ip2', 1, 1000, { now: t0 }),
    ).toBe(true)
    expect(
      checkRateLimit(map, 't', 'ip2', 1, 1000, { now: t0 + 1001 }),
    ).toBe(true)
  })
})

describe('periodicCleanup', () => {
  it('removes expired keys', () => {
    const map = new Map<string, RateLimitEntry>()
    const last = { value: 0 }
    map.set('t:x', { count: 5, resetAt: 500 })
    periodicCleanup(map, last, 0, 4096, 1000)
    expect(map.has('t:x')).toBe(false)
  })
})
