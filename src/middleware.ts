import { NextRequest, NextResponse } from 'next/server'

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  const isAuthEnabled = process.env.NEXT_PUBLIC_AUTH_ENABLED === 'true'

  // Skip auth if disabled
  if (!isAuthEnabled) {
    return NextResponse.next()
  }

  // Define route categories
  const isAuthPage = pathname.startsWith('/login') || pathname.startsWith('/signup') || pathname.startsWith('/forgot-password')
  const isDashboardPage = pathname.startsWith('/dashboard')
  const isApiRoute = pathname.startsWith('/api/')
  const isAuthCallback = pathname.startsWith('/auth/callback')
  const isPublicAsset = pathname.startsWith('/_next/') || pathname.startsWith('/favicon') || pathname.endsWith('.ico') || pathname.endsWith('.png') || pathname.endsWith('.svg')

  // Skip middleware for public assets, auth callbacks, and API routes
  if (isPublicAsset || isAuthCallback || isApiRoute) {
    return NextResponse.next()
  }

  // Check for Supabase auth cookies (lightweight check - just see if cookie exists)
  const hasAccessToken = request.cookies.has('sb-access-token') ||
                         request.cookies.has('sb-efibhnxfapdjlowkrudc-auth-token') ||
                         request.cookies.has('sb-efibhnxfapdjlowkrudc-auth-token.0')

  // If authenticated and trying to access auth pages, redirect to dashboard
  if (hasAccessToken && isAuthPage) {
    const redirectUrl = request.nextUrl.clone()
    redirectUrl.pathname = '/dashboard'
    redirectUrl.search = ''
    return NextResponse.redirect(redirectUrl)
  }

  // If not authenticated and trying to access protected pages, redirect to login
  if (!hasAccessToken && isDashboardPage) {
    const redirectUrl = request.nextUrl.clone()
    redirectUrl.pathname = '/login'
    redirectUrl.search = `redirect=${encodeURIComponent(pathname)}`
    return NextResponse.redirect(redirectUrl)
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
