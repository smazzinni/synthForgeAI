import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { hashPassword, passwordProblem } from '@/lib/server/password'
import { createSession, sessionCookie } from '@/lib/server/session'
import { EMAIL_RE, clientIp, limited, normaliseEmail, publicUser, readJsonBody } from '@/lib/server/auth-http'
import { isCrossSiteWrite } from '@/lib/server/auth'

// POST { email, password, name? } → 201 { user } + session cookie
export async function POST(request: NextRequest) {
  if (isCrossSiteWrite(request)) return NextResponse.json({ error: 'Cross-site request blocked' }, { status: 403 })
  const tooMany = limited([[`register:ip:${clientIp(request)}`, 10, 60 * 60 * 1000]])
  if (tooMany) return tooMany

  const body = await readJsonBody(request)
  if (!body) return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  const email = normaliseEmail(body.email)
  const name = typeof body.name === 'string' ? body.name.trim().slice(0, 100) || null : null
  if (!EMAIL_RE.test(email) || email.length > 254) return NextResponse.json({ error: 'Please enter a valid email address' }, { status: 400 })
  const problem = passwordProblem(body.password)
  if (problem) return NextResponse.json({ error: problem }, { status: 400 })

  try {
    const existing = await db.user.findUnique({ where: { email } })
    if (existing) return NextResponse.json({ error: 'An account with this email already exists. Sign in instead.' }, { status: 409 })
    const user = await db.user.create({
      data: { email, name, passwordHash: await hashPassword(body.password as string), lastLoginAt: new Date() },
    })
    const { token, expiresAt } = await createSession(user.id, request)
    const res = NextResponse.json({ user: publicUser(user) }, { status: 201 })
    res.cookies.set(sessionCookie(token, expiresAt))
    return res
  } catch (err) {
    // Unique violation from a concurrent registration
    if ((err as { code?: string }).code === 'P2002') {
      return NextResponse.json({ error: 'An account with this email already exists. Sign in instead.' }, { status: 409 })
    }
    console.error('[auth/register] failed:', err)
    return NextResponse.json({ error: 'Could not create the account. Please try again.' }, { status: 500 })
  }
}
