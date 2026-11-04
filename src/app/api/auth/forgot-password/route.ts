import { randomBytes } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { hashResetToken } from '@/lib/server/session'
import { sendMail } from '@/lib/server/mailer'
import { clientIp, limited, normaliseEmail, readJsonBody } from '@/lib/server/auth-http'

const RESET_TTL_MS = 60 * 60 * 1000

// POST { email } → always { ok: true } (never reveals whether the email exists).
// Sends a one-hour reset link by email (SMTP_URL) or logs it on the server.
export async function POST(request: NextRequest) {
  const body = await readJsonBody(request)
  const email = normaliseEmail(body?.email)
  if (!email) return NextResponse.json({ error: 'Email is required' }, { status: 400 })
  const tooMany = limited([[`forgot:email:${email}`, 3, 15 * 60_000], [`forgot:ip:${clientIp(request)}`, 10, 15 * 60_000]])
  if (tooMany) return tooMany

  const response: Record<string, unknown> = { ok: true }
  try {
    const user = await db.user.findUnique({ where: { email } })
    if (user) {
      const token = randomBytes(32).toString('base64url')
      await db.passwordResetToken.create({
        data: { userId: user.id, tokenHash: hashResetToken(token), expiresAt: new Date(Date.now() + RESET_TTL_MS) },
      })
      const origin = process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin
      const link = `${origin}/forgot-password?token=${encodeURIComponent(token)}`
      const how = await sendMail(email, 'Reset your SynthForge AI password',
        `Someone asked to reset the password for ${email}.\n\nOpen this link within one hour to choose a new password:\n${link}\n\nIf this wasn't you, ignore this email.`)
      // Without SMTP in development, hand the link back so the flow is testable.
      if (how === 'logged' && process.env.NODE_ENV !== 'production') response.devResetUrl = link
    }
  } catch (err) {
    console.error('[auth/forgot-password] failed:', err)
  }
  return NextResponse.json(response)
}
