import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/admin'

// Lightweight user info endpoint — uses admin client with cookie-based token extraction
// instead of the heavy SSR client approach that creates a new server instance per request.
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
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const admin = getSupabaseAdmin()
    if (!admin) {
      return NextResponse.json({ error: 'Auth service not configured' }, { status: 503 })
    }

    // Verify the token with Supabase admin
    const { data: { user }, error } = await admin.auth.getUser(accessToken)

    if (error || !user) {
      return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401 })
    }

    return NextResponse.json({
      user: {
        id: user.id,
        email: user.email,
        full_name: user.user_metadata?.full_name || user.email?.split('@')[0],
        role: 'owner',
      },
    })
  } catch (err) {
    console.error('[Auth User API] Error:', err)
    return NextResponse.json({ error: 'Authentication failed' }, { status: 401 })
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const accessToken = extractAccessToken(request)

    if (!accessToken) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const admin = getSupabaseAdmin()
    if (!admin) {
      return NextResponse.json({ error: 'Auth service not configured' }, { status: 503 })
    }

    const { data: { user }, error } = await admin.auth.getUser(accessToken)
    if (error || !user) {
      return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401 })
    }

    const body = await request.json() as { name?: string; avatarUrl?: string }

    // Update user metadata
    if (body.name) {
      await admin.auth.admin.updateUserById(user.id, {
        user_metadata: { full_name: body.name },
      })
    }

    return NextResponse.json({
      user: {
        id: user.id,
        email: user.email,
        full_name: body.name || user.user_metadata?.full_name || user.email?.split('@')[0],
        role: 'owner',
      },
    })
  } catch (err) {
    console.error('[Auth User PATCH] Error:', err)
    return NextResponse.json({ error: 'Update failed' }, { status: 500 })
  }
}
