import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') || '/dashboard'

  if (code) {
    try {
      const { createServerClient } = await import('@supabase/ssr')

      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
      const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

      if (supabaseUrl && supabaseAnonKey) {
        // Create a response first so we can set cookies on it
        const response = NextResponse.redirect(new URL(next, request.url))

        const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
          cookies: {
            getAll() {
              return request.cookies.getAll()
            },
            setAll(cookiesToSet) {
              try {
                cookiesToSet.forEach(({ name, value, options }) =>
                  response.cookies.set(name, value, options)
                )
              } catch {
                // Cookie setting can fail in some contexts
              }
            },
          },
        })

        // Exchange the code for a session
        const { error } = await supabase.auth.exchangeCodeForSession(code)
        if (error) {
          console.error('[Auth Callback] Code exchange error:', error.message)
          // Redirect to login with error
          return NextResponse.redirect(new URL('/login?error=auth_callback_failed', request.url))
        }

        // Return the response with cookies properly set
        return response
      }
    } catch (err) {
      console.error('[Auth Callback] Error:', err)
      return NextResponse.redirect(new URL('/login?error=auth_callback_failed', request.url))
    }

    // Fallback redirect if Supabase env vars are missing
    return NextResponse.redirect(new URL(next, request.url))
  }

  // No code in URL - redirect to login
  return NextResponse.redirect(new URL('/login', request.url))
}
