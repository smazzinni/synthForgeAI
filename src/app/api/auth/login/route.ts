import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { email, password } = body

    if (!email || !password) {
      return NextResponse.json({ error: 'Email and password are required' }, { status: 400 })
    }

    // Create a response object that will carry the session cookies
    const response = NextResponse.json({ authenticated: true })

    // Use the SSR client to sign in, which properly sets session cookies
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

    if (!supabaseUrl || !supabaseAnonKey) {
      return NextResponse.json({ error: 'Auth service not configured' }, { status: 503 })
    }

    const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, {
              ...options,
              sameSite: 'lax',
              secure: request.nextUrl.protocol === 'https:',
              path: '/',
            })
          })
        },
      },
    })

    const { data, error } = await supabase.auth.signInWithPassword({ email, password })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 401 })
    }

    // Update the response with user info (cookies are already set by setAll)
    return NextResponse.json({
      user: {
        id: data.user.id,
        email: data.user.email,
        name: data.user.user_metadata?.full_name,
      },
      authenticated: true,
    }, {
      headers: response.headers,
    })
  } catch (err) {
    console.error('[Auth Login] Error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
