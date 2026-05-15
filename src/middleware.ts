import { NextRequest, NextResponse } from 'next/server'

// Lightweight middleware that does NOT create Supabase clients
// Auth state is handled entirely client-side via the AuthProvider
// This prevents the middleware from being a bottleneck that causes 502s

export async function middleware(request: NextRequest) {
  // Just pass through - all auth is handled client-side
  // The AuthProvider in the root layout handles:
  //   - Checking session on page load
  //   - Redirecting to /login if not authenticated
  //   - Redirecting to /dashboard if already authenticated on login page
  //
  // Previous versions created Supabase server clients here which:
  //   - Made network calls to Supabase on EVERY request
  //   - Caused request queuing under load
  //   - Led to 502 Bad Gateway errors
  return NextResponse.next()
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
