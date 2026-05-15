import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/admin'

// Lightweight session check - uses admin client instead of SSR client
// to avoid creating heavy Supabase server instances on every request
export async function GET(request: NextRequest) {
  try {
    // Try to get the auth token from cookies
    const authCookie = request.cookies.getAll().find(c =>
      c.name.includes('auth-token')
    )

    if (!authCookie) {
      return NextResponse.json({ user: null, authenticated: false })
    }

    // Use admin client to verify the token (lighter than SSR client)
    const admin = getSupabaseAdmin()
    if (!admin) {
      return NextResponse.json({ user: null, authenticated: false })
    }

    // Extract the access token from the cookie value
    let accessToken = ''
    try {
      const cookieValue = decodeURIComponent(authCookie.value)
      const parsed = JSON.parse(cookieValue)
      accessToken = parsed?.access_token || ''
    } catch {
      // Cookie format might be different
      return NextResponse.json({ user: null, authenticated: false })
    }

    if (!accessToken) {
      return NextResponse.json({ user: null, authenticated: false })
    }

    const { data: { user }, error } = await admin.auth.getUser(accessToken)

    if (error || !user) {
      return NextResponse.json({ user: null, authenticated: false })
    }

    return NextResponse.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.user_metadata?.full_name || user.email?.split('@')[0],
      },
      authenticated: true,
    })
  } catch {
    return NextResponse.json({ user: null, authenticated: false })
  }
}
