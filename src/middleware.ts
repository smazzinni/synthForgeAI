import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'

export async function middleware(request: NextRequest) {
  const isAuthEnabled = process.env.NEXT_PUBLIC_AUTH_ENABLED === 'true'
  if (!isAuthEnabled) {
    return NextResponse.next()
  }

  const { pathname } = request.nextUrl
  const isAuthPage = pathname.startsWith('/login') || pathname.startsWith('/signup') || pathname.startsWith('/forgot-password')
  const isDashboardPage = pathname.startsWith('/dashboard')
  const isApiRoute = pathname.startsWith('/api/')
  const isAuthCallback = pathname.startsWith('/auth/callback')
  const isPublicAsset = pathname.startsWith('/_next/') || pathname.startsWith('/favicon') || pathname.endsWith('.ico') || pathname.endsWith('.png') || pathname.endsWith('.svg')

  if (isPublicAsset || isAuthCallback || isApiRoute) {
    return NextResponse.next()
  }

  // Don't protect non-dashboard, non-auth pages (landing, about, etc.)
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
      console.warn('[Middleware] Missing Supabase env vars, skipping auth check')
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

    // Get the authenticated user
    const { data: { user }, error } = await supabase.auth.getUser()

    if (error) {
      console.warn('[Middleware] Auth error:', error.message)
    }

    // If authenticated and trying to access auth pages, redirect to dashboard
    if (user && isAuthPage) {
      const redirectUrl = request.nextUrl.clone()
      redirectUrl.pathname = '/dashboard'
      redirectUrl.search = ''
      const redirectResponse = NextResponse.redirect(redirectUrl)
      // Copy all cookies from supabaseResponse to the redirect response
      try {
        supabaseResponse.cookies.getAll().forEach((cookie) => {
          redirectResponse.cookies.set(cookie.name, cookie.value)
        })
      } catch (err) {
        console.error('[Middleware] Error copying cookies to redirect:', err)
      }
      return redirectResponse
    }

    // If not authenticated and trying to access protected pages, redirect to login
    if (!user && isDashboardPage) {
      const redirectUrl = request.nextUrl.clone()
      redirectUrl.pathname = '/login'
      redirectUrl.search = `redirect=${encodeURIComponent(pathname)}`
      const redirectResponse = NextResponse.redirect(redirectUrl)
      // Copy all cookies from supabaseResponse to the redirect response
      try {
        supabaseResponse.cookies.getAll().forEach((cookie) => {
          redirectResponse.cookies.set(cookie.name, cookie.value)
        })
      } catch (err) {
        console.error('[Middleware] Error copying cookies to redirect:', err)
      }
      return redirectResponse
    }
  } catch (err) {
    console.error('[Middleware] Unexpected error:', err)
    // On error, just pass through - don't block the request
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
