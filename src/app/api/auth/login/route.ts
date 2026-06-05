import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { resolveSupabasePublicConfig } from '@/lib/supabase/env'
import { checkRateLimit, type RateLimitEntry } from '@/lib/in-memory-rate-limit'

// ─── Rate limiter: max 5 login attempts per minute (bounded map) ───
const loginRateLimiter = new Map<string, RateLimitEntry>()
const LOGIN_RATE_LIMIT = 5
const LOGIN_RATE_WINDOW = 60_000

function getClientId(request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-for')
  const realIp = request.headers.get('x-real-ip')
  if (forwarded) return forwarded.split(',')[0]?.trim() || 'unknown'
  if (realIp) return realIp.trim()
  return 'unknown'
}

// NOTE: Primary login is client-side via useAuth().signIn() with the browser client.
// This route verifies email/password server-side via Supabase Auth (anon key).
export async function POST(request: NextRequest) {
  const clientId = getClientId(request)
  if (
    !checkRateLimit(
      loginRateLimiter,
      'login',
      clientId,
      LOGIN_RATE_LIMIT,
      LOGIN_RATE_WINDOW,
    )
  ) {
    return NextResponse.json(
      { error: 'Too many login attempts. Please wait a moment.' },
      { status: 429 },
    )
  }

  try {
    const body = await request.json()
    const { email, password } = body as { email?: string; password?: string }

    if (!email || !password) {
      return NextResponse.json(
        { error: 'Email and password are required' },
        { status: 400 },
      )
    }

    const { url, anonKey } = resolveSupabasePublicConfig()
    if (!url || !anonKey) {
      return NextResponse.json(
        { error: 'Auth service not configured' },
        { status: 503 },
      )
    }

    const supabase = createClient(url, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (error || !data.user) {
      return NextResponse.json(
        { error: 'Invalid email or password' },
        { status: 401 },
      )
    }

    const user = data.user
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
