import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireUser, extractSessionToken } from '@/lib/server/auth'
import { hashPassword, passwordProblem, verifyPassword } from '@/lib/server/password'
import { clearedSessionCookie, revokeAllSessions } from '@/lib/server/session'
import { limited, publicUser, readJsonBody } from '@/lib/server/auth-http'

// GET    → { user }
// PATCH  { name? } | { currentPassword, newPassword } → { user }
//        (changing the password signs out all other sessions)
// DELETE { password } → deletes the account and all its sessions
async function signedIn(request: NextRequest) {
  const auth = await requireUser(request)
  if (auth instanceof Response) return auth
  if (!auth.authenticated) return NextResponse.json({ error: 'Sign in to manage your account' }, { status: 401 })
  const user = await db.user.findUnique({ where: { id: auth.userId } })
  if (!user) return NextResponse.json({ error: 'Account not found' }, { status: 404 })
  return user
}

export async function GET(request: NextRequest) {
  const user = await signedIn(request)
  if (user instanceof Response) return user
  return NextResponse.json({ user: publicUser(user) })
}

export async function PATCH(request: NextRequest) {
  const user = await signedIn(request)
  if (user instanceof Response) return user
  const body = await readJsonBody(request)
  if (!body) return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })

  const data: { name?: string | null; passwordHash?: string } = {}
  if (body.name !== undefined) {
    if (body.name !== null && typeof body.name !== 'string') return NextResponse.json({ error: 'name must be a string' }, { status: 400 })
    data.name = typeof body.name === 'string' ? body.name.trim().slice(0, 100) || null : null
  }
  if (body.newPassword !== undefined) {
    const tooMany = limited([[`pwchange:${user.id}`, 5, 15 * 60_000]])
    if (tooMany) return tooMany
    if (typeof body.currentPassword !== 'string' || !(await verifyPassword(body.currentPassword, user.passwordHash))) {
      return NextResponse.json({ error: 'Current password is incorrect' }, { status: 400 })
    }
    const problem = passwordProblem(body.newPassword)
    if (problem) return NextResponse.json({ error: problem }, { status: 400 })
    data.passwordHash = await hashPassword(body.newPassword as string)
  }
  if (Object.keys(data).length === 0) return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })

  const updated = await db.user.update({ where: { id: user.id }, data })
  if (data.passwordHash) await revokeAllSessions(user.id, extractSessionToken(request) ?? undefined)
  return NextResponse.json({ user: publicUser(updated) })
}

export async function DELETE(request: NextRequest) {
  const user = await signedIn(request)
  if (user instanceof Response) return user
  const body = await readJsonBody(request)
  if (typeof body?.password !== 'string' || !(await verifyPassword(body.password, user.passwordHash))) {
    return NextResponse.json({ error: 'Password is incorrect' }, { status: 400 })
  }
  await db.$transaction([
    db.syntheticDatabase.deleteMany({ where: { userId: user.id } }),
    db.conversation.deleteMany({ where: { userId: user.id } }),
    db.dbConnection.deleteMany({ where: { userId: user.id } }),
    db.user.delete({ where: { id: user.id } }),
  ])
  const res = NextResponse.json({ success: true })
  res.cookies.set(clearedSessionCookie())
  return res
}
