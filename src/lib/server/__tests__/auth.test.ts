import { afterEach, describe, expect, it } from 'vitest'
import { NextRequest } from 'next/server'
import { DEMO_USER_ID, extractSessionToken, isAuthRequired, isCrossSiteWrite, resolveUser } from '../auth'
import { hashPassword, passwordProblem, verifyPassword } from '../password'

const req = (init: { method?: string; headers?: Record<string, string> } = {}) =>
  new NextRequest('http://app.test/api/x', { method: init.method || 'GET', headers: init.headers })

const env = { ...process.env }
afterEach(() => { process.env = { ...env } })

describe('passwords', () => {
  it('hashes with a random salt and verifies', async () => {
    const a = await hashPassword('correct horse battery')
    const b = await hashPassword('correct horse battery')
    expect(a).not.toBe(b)
    expect(a.startsWith('scrypt$')).toBe(true)
    expect(await verifyPassword('correct horse battery', a)).toBe(true)
    expect(await verifyPassword('wrong horse battery', a)).toBe(false)
    expect(await verifyPassword('anything', 'garbage')).toBe(false)
  })

  it('enforces the password policy', () => {
    expect(passwordProblem('short')).toMatch(/at least 8/)
    expect(passwordProblem(' padded password ')).toMatch(/space/)
    expect(passwordProblem('x'.repeat(200))).toMatch(/at most/)
    expect(passwordProblem(undefined)).toBeTruthy()
    expect(passwordProblem('a good password')).toBeNull()
  })
})

describe('request auth', () => {
  it('reads the session token from Bearer header or cookie', () => {
    expect(extractSessionToken(req({ headers: { authorization: 'Bearer abc123' } }))).toBe('abc123')
    expect(extractSessionToken(req({ headers: { cookie: 'sf_session=tok; other=1' } }))).toBe('tok')
    expect(extractSessionToken(req())).toBeNull()
  })

  it('blocks cross-site writes but allows same-origin and non-browser calls', () => {
    expect(isCrossSiteWrite(req({ method: 'POST', headers: { origin: 'https://evil.example', host: 'app.test' } }))).toBe(true)
    expect(isCrossSiteWrite(req({ method: 'POST', headers: { origin: 'http://app.test', host: 'app.test' } }))).toBe(false)
    expect(isCrossSiteWrite(req({ method: 'POST' }))).toBe(false)
    expect(isCrossSiteWrite(req({ method: 'GET', headers: { origin: 'https://evil.example', host: 'app.test' } }))).toBe(false)
  })

  it('accepts the configured public URL and allow-listed origins behind a proxy', () => {
    process.env['NEXT_PUBLIC_APP_URL'] = 'https://synthforge.up.railway.app'
    process.env.ALLOWED_ORIGINS = 'https://admin.example.com, https://staging.example.com'
    const post = (origin: string) => req({ method: 'POST', headers: { origin, host: '10.0.0.5:3000' } })
    expect(isCrossSiteWrite(post('https://synthforge.up.railway.app'))).toBe(false)
    expect(isCrossSiteWrite(post('https://staging.example.com'))).toBe(false)
    expect(isCrossSiteWrite(post('https://evil.example'))).toBe(true)
  })

  it('auth mode: explicit flag wins, otherwise required only in production', () => {
    process.env.AUTH_REQUIRED = 'true'
    expect(isAuthRequired()).toBe(true)
    process.env.AUTH_REQUIRED = 'false'
    expect(isAuthRequired()).toBe(false)
    delete process.env.AUTH_REQUIRED
    expect(isAuthRequired()).toBe(process.env.NODE_ENV === 'production')
  })

  it('anonymous callers get the demo user only when auth is not required', async () => {
    process.env.AUTH_REQUIRED = 'false'
    expect((await resolveUser(req()))?.userId).toBe(DEMO_USER_ID)
    process.env.AUTH_REQUIRED = 'true'
    expect(await resolveUser(req())).toBeNull()
  })
})
