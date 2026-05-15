import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') || '/dashboard'

  if (code) {
    // Exchange the code for a session using the Supabase SSR client
    try {
      const { createServerClient } = await import('@supabase/ssr')
      const cookieStore = await import('next/headers').then(m => m.cookies())

      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
      const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

      if (supabaseUrl && supabaseAnonKey) {
        const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
          cookies: {
            getAll() {
              return cookieStore.getAll()
            },
            setAll(cookiesToSet) {
              try {
                cookiesToSet.forEach(({ name, value, options }) =>
                  cookieStore.set(name, value, options)
                )
              } catch {
                // Called from Server Component — cannot set cookies
              }
            },
          },
        })

        // Exchange the code for a session
        const { error } = await supabase.auth.exchangeCodeForSession(code)
        if (error) {
          console.error('[Auth Callback] Code exchange error:', error.message)
          // Still redirect to dashboard - client-side auth will handle re-auth
          return NextResponse.redirect(new URL('/login?error=auth_callback_failed', request.url))
        }
      }
    } catch (err) {
      console.error('[Auth Callback] Error:', err)
    }

    // Redirect to the dashboard after successful code exchange
    return NextResponse.redirect(new URL(next, request.url))
  }

  // No code in URL - redirect to login
  return NextResponse.redirect(new URL('/login', request.url))
}
