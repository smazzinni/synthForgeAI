import { NextRequest, NextResponse } from 'next/server'
import { isAuthRequired, resolveUser } from '@/lib/server/auth'

// GET → { user, authenticated, authRequired }. Always 200 so the UI can decide
// whether to show the login screen (authRequired) or run in demo mode.
export async function GET(request: NextRequest) {
  const user = await resolveUser(request)
  const authRequired = isAuthRequired()
  return NextResponse.json(
    {
      authRequired,
      authenticated: !!user?.authenticated,
      user: user?.authenticated ? { id: user.userId, email: user.email, name: user.name ?? null, role: user.role ?? 'member' } : null,
    },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}
