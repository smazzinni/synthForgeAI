import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/admin'

// Lightweight user info endpoint — uses admin client with cookie-based token extraction
// instead of the heavy SSR client approach that creates a new server instance per request.
export async function GET(request: NextRequest) {
  try {
    // Try to get the auth token from cookies
    const authCookie = request.cookies.getAll().find(c =>
      c.name.includes('auth-token')
    )

    if (!authCookie) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const admin = getSupabaseAdmin()
    if (!admin) {
      return NextResponse.json({ error: 'Auth service not configured' }, { status: 503 })
    }

    // Extract the access token from the cookie value
    let accessToken = ''
    try {
      const cookieValue = decodeURIComponent(authCookie.value)
      const parsed = JSON.parse(cookieValue)
      accessToken = parsed?.access_token || ''
    } catch {
      return NextResponse.json({ error: 'Invalid auth token' }, { status: 401 })
    }

    if (!accessToken) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
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
    const authCookie = request.cookies.getAll().find(c =>
      c.name.includes('auth-token')
    )

    if (!authCookie) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const admin = getSupabaseAdmin()
    if (!admin) {
      return NextResponse.json({ error: 'Auth service not configured' }, { status: 503 })
    }

    let accessToken = ''
    try {
      const cookieValue = decodeURIComponent(authCookie.value)
      const parsed = JSON.parse(cookieValue)
      accessToken = parsed?.access_token || ''
    } catch {
      return NextResponse.json({ error: 'Invalid auth token' }, { status: 401 })
    }

    const { data: { user }, error } = await admin.auth.getUser(accessToken)
    if (error || !user) {
      return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401 })
    }

    const body = await request.json() as { name?: string; avatarUrl?: string }

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
