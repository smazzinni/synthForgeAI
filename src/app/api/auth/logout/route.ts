import { NextRequest, NextResponse } from 'next/server'
import { clearedSessionCookie, revokeAllSessions, revokeSession, getSessionUser } from '@/lib/server/session'
import { extractSessionToken } from '@/lib/server/auth'

// POST [?all=1] → revokes this session (or every session of the user).
export async function POST(request: NextRequest) {
  const token = extractSessionToken(request)
  if (token) {
    try {
      if (request.nextUrl.searchParams.get('all') === '1') {
        const user = await getSessionUser(token)
        if (user) await revokeAllSessions(user.id)
      }
      await revokeSession(token)
    } catch (err) {
      console.error('[auth/logout] failed:', err)
    }
  }
  const res = NextResponse.json({ success: true })
  res.cookies.set(clearedSessionCookie())
  return res
}
