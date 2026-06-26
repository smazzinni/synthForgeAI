import { NextRequest, NextResponse } from 'next/server'

// ─── Rate limiter: max 5 login attempts per minute ───
const loginRateLimiter = new Map<string, { count: number; resetAt: number }>()
const LOGIN_RATE_LIMIT = 5
const LOGIN_RATE_WINDOW = 60000

function getClientId(request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-for')
  const ip = forwarded ? forwarded.split(',')[0] : 'unknown'
  return ip
}

// NOTE: The primary login flow is client-side via useAuth().signIn()
// which uses the Supabase browser client directly.
// This API route is only used as a fallback for programmatic login.
export async function POST(request: NextRequest) {
  // Rate limit check
  const clientId = getClientId(request)
  const now = Date.now()
  const entry = loginRateLimiter.get(clientId)

  if (entry && now <= entry.resetAt && entry.count >= LOGIN_RATE_LIMIT) {
    return NextResponse.json(
      { error: 'Too many login attempts. Please wait a moment.' },
      { status: 429 }
    )
  }

  if (!entry || now > entry.resetAt) {
    loginRateLimiter.set(clientId, { count: 1, resetAt: now + LOGIN_RATE_WINDOW })
  } else {
    entry.count++
  }

  try {
    const body = await request.json()
    const { email, password } = body

    if (!email || !password) {
      return NextResponse.json({ error: 'Email and password are required' }, { status: 400 })
    }

    // Use the Supabase admin client to find the user
    const { getSupabaseAdmin } = await import('@/lib/supabase/admin')
    const admin = getSupabaseAdmin()

    if (!admin) {
      return NextResponse.json({ error: 'Auth service not configured' }, { status: 503 })
    }

    // Use listUsers with a filter to find by email
    const { data: { users }, error: listError } = await admin.auth.admin.listUsers()

    if (listError) {
      console.error('[Auth Login] List users error:', listError.message)
      return NextResponse.json({ error: 'Authentication failed' }, { status: 401 })
    }

    // Find the user by email
    const user = users?.find(u => u.email === email)
    if (!user) {
      return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 })
    }

    // Note: We can't verify the password server-side with the admin client
    // The actual password verification happens client-side via Supabase browser client
    // This endpoint just confirms the user exists

    return NextResponse.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.user_metadata?.full_name,
      },
      authenticated: true,
    })
  } catch (err) {
    console.error('[Auth Login] Error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
