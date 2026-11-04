import { createHmac } from 'node:crypto'
import { beforeEach, describe, expect, it } from 'vitest'
import { NextRequest } from 'next/server'
import { DEMO_USER_ID, extractAccessToken, resolveUser } from '../auth'

const SECRET = 'jwt-secret-for-tests'
const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url')
function sign(claims: object, secret = SECRET) {
  const head = b64({ alg: 'HS256', typ: 'JWT' })
  const body = b64(claims)
  const sig = createHmac('sha256', secret).update(`${head}.${body}`).digest('base64url')
  return `${head}.${body}.${sig}`
}
const exp = () => Math.floor(Date.now() / 1000) + 3600
const req = (headers: Record<string, string> = {}) => new NextRequest('http://localhost/api/x', { headers })

beforeEach(() => {
  process.env.SUPABASE_JWT_SECRET = SECRET
  process.env.NEXT_PUBLIC_AUTH_ENABLED = 'true'
  delete process.env.SUPABASE_URL
  delete process.env.NEXT_PUBLIC_SUPABASE_URL
})

describe('extractAccessToken', () => {
  it('reads Bearer headers', () => {
    expect(extractAccessToken(req({ authorization: 'Bearer abc.def.ghi' }))).toBe('abc.def.ghi')
  })

  it('reassembles chunked base64 @supabase/ssr cookies', () => {
    const token = sign({ sub: 'u1', exp: exp() })
    const value = 'base64-' + Buffer.from(JSON.stringify({ access_token: token })).toString('base64url')
    const mid = Math.floor(value.length / 2)
    const r = req({ cookie: `sb-proj-auth-token.0=${value.slice(0, mid)}; sb-proj-auth-token.1=${value.slice(mid)}` })
    expect(extractAccessToken(r)).toBe(token)
  })
})

describe('resolveUser', () => {
  it('accepts a correctly signed token', async () => {
    const user = await resolveUser(req({ authorization: `Bearer ${sign({ sub: 'user-1', email: 'a@b.c', exp: exp() })}` }))
    expect(user).toEqual({ userId: 'user-1', email: 'a@b.c', authenticated: true })
  })

  it('rejects forged, expired and unsigned tokens when auth is required', async () => {
    expect(await resolveUser(req({ authorization: `Bearer ${sign({ sub: 'x', exp: exp() }, 'wrong')}` }))).toBeNull()
    expect(await resolveUser(req({ authorization: `Bearer ${sign({ sub: 'x', exp: 1 })}` }))).toBeNull()
    expect(await resolveUser(req())).toBeNull()
  })

  it('falls back to the demo user only when auth is disabled', async () => {
    process.env.NEXT_PUBLIC_AUTH_ENABLED = 'false'
    expect((await resolveUser(req()))?.userId).toBe(DEMO_USER_ID)
  })
})
