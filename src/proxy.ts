import { NextRequest, NextResponse } from 'next/server'

// Lightweight proxy that does NOT create Supabase clients.
// Auth state is handled entirely client-side via the AuthProvider.
// This prevents the proxy from being a bottleneck that causes 502s.

export async function proxy(request: NextRequest) {
  // Just pass through - all auth is handled client-side
  return NextResponse.next()
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
