import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { dummyPasswordHash, verifyPassword } from '@/lib/server/password'
import { createSession, sessionCookie } from '@/lib/server/session'
import { clientIp, limited, normaliseEmail, publicUser, readJsonBody } from '@/lib/server/auth-http'
import { isCrossSiteWrite } from '@/lib/server/auth'

// POST { email, password } → { user } + session cookie (token also returned
// for API clients that use `Authorization: Bearer`). Never reveals whether
// an email is registered.
export async function POST(request: NextRequest) {
  if (isCrossSiteWrite(request)) return NextResponse.json({ error: 'Cross-site request blocked' }, { status: 403 })
  const body = await readJsonBody(request)
  if (!body) return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  const email = normaliseEmail(body.email)
  const password = typeof body.password === 'string' ? body.password : ''
  if (!email || !password) return NextResponse.json({ error: 'Email and password are required' }, { status: 400 })

  const tooMany = limited([
    [`login:email:${email}`, 5, 60_000],
    [`login:ip:${clientIp(request)}`, 30, 60_000],
  ])
  if (tooMany) return tooMany

  try {
    const user = await db.user.findUnique({ where: { email } })
    const ok = user?.passwordHash
      ? await verifyPassword(password, user.passwordHash)
      : (await verifyPassword(password, await dummyPasswordHash()), false)
    if (!user || !ok) return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 })

    const { token, expiresAt } = await createSession(user.id, request)
    db.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } }).catch(() => {})
    const res = NextResponse.json({ user: publicUser(user), token, expiresAt: expiresAt.toISOString() })
    res.cookies.set(sessionCookie(token, expiresAt))
    return res
  } catch (err) {
    console.error('[auth/login] failed:', err)
    return NextResponse.json({ error: 'Sign-in is temporarily unavailable. Please try again.' }, { status: 500 })
  }
}
