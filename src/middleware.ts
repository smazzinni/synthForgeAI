import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'

export async function middleware(request: NextRequest) {
  const isAuthEnabled = process.env.NEXT_PUBLIC_AUTH_ENABLED === 'true'
  if (!isAuthEnabled) {
    return NextResponse.next()
  }

  const { pathname } = request.nextUrl

  // Skip middleware for API routes, auth callback, and static assets
  const isApiRoute = pathname.startsWith('/api/')
  const isAuthCallback = pathname.startsWith('/auth/callback')
  const isPublicAsset = pathname.startsWith('/_next/') || pathname.startsWith('/favicon') || pathname.endsWith('.ico') || pathname.endsWith('.png') || pathname.endsWith('.svg')

  if (isPublicAsset || isAuthCallback || isApiRoute) {
    return NextResponse.next()
  }

  // Only refresh session cookies for dashboard and auth pages
  // Do NOT redirect - let client-side auth handle redirects
  // This prevents the redirect loop between middleware and client-side auth
  const isAuthPage = pathname.startsWith('/login') || pathname.startsWith('/signup') || pathname.startsWith('/forgot-password')
  const isDashboardPage = pathname.startsWith('/dashboard')

  if (!isAuthPage && !isDashboardPage) {
    return NextResponse.next()
  }

  let supabaseResponse = NextResponse.next({
    request,
  })

  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

    if (!supabaseUrl || !supabaseAnonKey) {
      return supabaseResponse
    }

    const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              request.cookies.set(name, value)
            )
            cookiesToSet.forEach(({ name, value, options }) =>
              supabaseResponse.cookies.set(name, value, options)
            )
          } catch (err) {
            console.error('[Middleware] Error setting cookies:', err)
          }
        },
      },
    })

    // Just refresh the session - don't redirect
    // Client-side auth (AuthProvider + DashboardLayout) handles redirects
    await supabase.auth.getUser()
  } catch (err) {
    console.error('[Middleware] Unexpected error:', err)
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
