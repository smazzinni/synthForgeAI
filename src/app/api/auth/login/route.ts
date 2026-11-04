import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { rateLimit } from '@/lib/server/rate-limit'

// Programmatic login (the web app signs in client-side via the Supabase
// browser client). The password IS verified here via signInWithPassword, and
// the response never reveals whether an email is registered.

export async function POST(request: NextRequest) {
  let email = ''
  let password = ''
  try {
    const body = await request.json()
    email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : ''
    password = typeof body?.password === 'string' ? body.password : ''
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
  if (!email || !password) {
    return NextResponse.json({ error: 'Email and password are required' }, { status: 400 })
  }

  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
  const byEmail = rateLimit(`login:email:${email}`, 5, 60_000)
  const byIp = rateLimit(`login:ip:${ip}`, 20, 60_000)
  if (!byEmail.ok || !byIp.ok) {
    return NextResponse.json({ error: 'Too many login attempts. Please wait a moment.' }, { status: 429 })
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY
  if (!url || !anonKey) {
    return NextResponse.json({ error: 'Auth service not configured' }, { status: 503 })
  }

  const supabase = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } })
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  if (error || !data.session || !data.user) {
    return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 })
  }

  return NextResponse.json({
    user: { id: data.user.id, email: data.user.email, name: data.user.user_metadata?.full_name ?? null },
    authenticated: true,
    session: {
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
      expires_at: data.session.expires_at,
    },
  })
}
