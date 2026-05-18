import { NextRequest, NextResponse } from 'next/server'

// Rate limiter for registration
const registerRateLimiter = new Map<string, { count: number; resetAt: number }>()
const REGISTER_RATE_LIMIT = 3
const REGISTER_RATE_WINDOW = 60000

function getClientId(request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-for')
  return forwarded ? forwarded.split(',')[0] : 'unknown'
}

export async function POST(request: NextRequest) {
  // Rate limit check
  const clientId = getClientId(request)
  const now = Date.now()
  const entry = registerRateLimiter.get(clientId)

  if (entry && now <= entry.resetAt && entry.count >= REGISTER_RATE_LIMIT) {
    return NextResponse.json(
      { error: 'Too many registration attempts. Please wait a moment.' },
      { status: 429 }
    )
  }

  if (!entry || now > entry.resetAt) {
    registerRateLimiter.set(clientId, { count: 1, resetAt: now + REGISTER_RATE_WINDOW })
  } else {
    entry.count++
  }

  try {
    const body = await request.json()
    const { email, password, full_name } = body

    if (!email || !password) {
      return NextResponse.json({ error: 'Email and password are required' }, { status: 400 })
    }

    if (password.length < 6) {
      return NextResponse.json({ error: 'Password must be at least 6 characters' }, { status: 400 })
    }

    const { getSupabaseAdmin } = await import('@/lib/supabase/admin')
    const admin = getSupabaseAdmin()

    if (!admin) {
      return NextResponse.json({ error: 'Auth service not configured' }, { status: 503 })
    }

    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: full_name || '' },
    })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    return NextResponse.json({
      user: data.user,
      message: 'User created successfully',
    })
  } catch (err) {
    console.error('[Auth Register] Error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
