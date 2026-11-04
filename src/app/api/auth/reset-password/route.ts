import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { hashPassword, passwordProblem } from '@/lib/server/password'
import { hashResetToken, revokeAllSessions } from '@/lib/server/session'
import { clientIp, limited, readJsonBody } from '@/lib/server/auth-http'

// POST { token, password } → sets a new password, consumes the token and
// signs the account out everywhere.
export async function POST(request: NextRequest) {
  const tooMany = limited([[`reset:ip:${clientIp(request)}`, 10, 15 * 60_000]])
  if (tooMany) return tooMany
  const body = await readJsonBody(request)
  const token = typeof body?.token === 'string' ? body.token : ''
  if (!token) return NextResponse.json({ error: 'Reset token is required' }, { status: 400 })
  const problem = passwordProblem(body?.password)
  if (problem) return NextResponse.json({ error: problem }, { status: 400 })

  const record = await db.passwordResetToken.findUnique({ where: { tokenHash: hashResetToken(token) } })
  if (!record || record.usedAt || record.expiresAt.getTime() < Date.now()) {
    return NextResponse.json({ error: 'This reset link is invalid or has expired. Request a new one.' }, { status: 400 })
  }
  await db.$transaction([
    db.user.update({ where: { id: record.userId }, data: { passwordHash: await hashPassword(body!.password as string) } }),
    db.passwordResetToken.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
  ])
  await revokeAllSessions(record.userId)
  return NextResponse.json({ ok: true })
}
