import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/admin'

// Lightweight session check - uses admin client instead of SSR client
// to avoid creating heavy Supabase server instances on every request
function extractAccessToken(request: NextRequest): string | null {
  // Try multiple cookie name patterns that Supabase uses
  const authCookies = request.cookies.getAll().filter(c =>
    c.name.includes('auth-token') ||
    c.name.startsWith('sb-') ||
    c.name.includes('-auth-token')
  )

  for (const cookie of authCookies) {
    try {
      const cookieValue = decodeURIComponent(cookie.value)
      // Try parsing as JSON first (newer Supabase format)
      try {
        const parsed = JSON.parse(cookieValue)
        if (parsed?.access_token) return parsed.access_token
      } catch {
        // Not JSON - might be the access token directly
        if (cookieValue.startsWith('eyJ')) return cookieValue
      }
    } catch {
      continue
    }
  }
  return null
}

export async function GET(request: NextRequest) {
  try {
    const accessToken = extractAccessToken(request)

    if (!accessToken) {
      return NextResponse.json({ user: null, authenticated: false })
    }

    // Use admin client to verify the token (lighter than SSR client)
    const admin = getSupabaseAdmin()
    if (!admin) {
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
