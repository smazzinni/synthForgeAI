import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

// Routes that don't require authentication
const PUBLIC_ROUTES = [
  '/api/auth/login',
  '/api/auth/register',
  '/api/auth/session',
  '/api/auth/seed',
  '/api/health',
  '/api/agents',
]

// Route prefixes that are always public
const PUBLIC_PREFIXES = [
  '/api/auth/',
  '/_next/',
]

export async function middleware(request: NextRequest) {
  const authEnabled = process.env.NEXT_PUBLIC_AUTH_ENABLED === 'true'

  // If auth is disabled, skip all auth checks
  if (!authEnabled) {
    return NextResponse.next()
  }

  const { pathname } = request.nextUrl

  // Allow public routes
  if (pathname === '/favicon.ico' || pathname === '/api/health') {
    return NextResponse.next()
  }

  // Allow public prefixes
  for (const prefix of PUBLIC_PREFIXES) {
    if (pathname.startsWith(prefix)) {
      return NextResponse.next()
    }
  }

  // Allow exact public routes
  if (PUBLIC_ROUTES.includes(pathname)) {
    return NextResponse.next()
  }

  // For page routes (non-API), always allow through - the client-side app handles auth UI
  if (!pathname.startsWith('/api/')) {
    return NextResponse.next()
  }

  // For API routes, check for auth token in cookies or headers
  const cookieHeader = request.headers.get('cookie') || ''
  const hasAccessToken = cookieHeader.includes('sb-access-token=')
  const hasAuthHeader = request.headers.get('authorization')?.startsWith('Bearer ')
  const hasUserIdHeader = request.headers.get('x-user-id')

  // If there's any auth credential, let the request through
  // The API route will validate the token properly
  if (hasAccessToken || hasAuthHeader || hasUserIdHeader) {
    return NextResponse.next()
  }

  // No auth credentials found - return 401 for API routes
  return NextResponse.json(
    { error: 'Authentication required', code: 'UNAUTHORIZED' },
    { status: 401 }
  )
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    '/((?!_next/static|_next/image|favicon\\.ico).*)',
  ],
}
