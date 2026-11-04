/**
 * Server-side request authentication (own auth system, PostgreSQL sessions).
 *
 * Every API route resolves the caller through `requireUser()`. The session
 * token comes from the `sf_session` httpOnly cookie (browser) or an
 * `Authorization: Bearer <token>` header (scripts / API clients), and is
 * checked against the Session table.
 *
 * Auth mode:
 *  - AUTH_REQUIRED=true  → every API call needs a valid session
 *  - AUTH_REQUIRED=false → anonymous callers share one demo user (local demos)
 *  - unset               → required in production, demo mode in development
 *
 * State-changing requests from a different Origin are rejected (CSRF guard on
 * top of SameSite=Lax cookies).
 */
import type { NextRequest } from 'next/server'
import { getSessionUser, SESSION_COOKIE } from './session'

export const DEMO_USER_ID = '5a784d48-945a-47d3-ae95-d2aa5d9abe8c'

export function isAuthRequired(): boolean {
  const v = process.env['AUTH_REQUIRED']
  if (v === 'true') return true
  if (v === 'false') return false
  return process.env.NODE_ENV === 'production'
}

export interface RequestUser {
  userId: string
  email: string | null
  name?: string | null
  role?: string
  /** false when the caller is the anonymous demo user */
  authenticated: boolean
}

export function extractSessionToken(request: NextRequest): string | null {
  const header = request.headers.get('authorization')
  if (header?.toLowerCase().startsWith('bearer ')) {
    const token = header.slice(7).trim()
    if (token) return token
  }
  return request.cookies.get(SESSION_COOKIE)?.value || null
}

/** Reject cross-site state-changing requests (defence in depth with SameSite). */
export function isCrossSiteWrite(request: NextRequest): boolean {
  if (['GET', 'HEAD', 'OPTIONS'].includes(request.method)) return false
  const origin = request.headers.get('origin')
  if (!origin) return false // non-browser clients
  let originHost: string
  try {
    originHost = new URL(origin).host
  } catch {
    return true
  }
  // Behind proxies (Railway, Vercel, Nginx) Host and X-Forwarded-Host can
  // differ from the public domain, so accept any of them plus the configured
  // public URL and an explicit allow-list.
  const allowed = new Set<string>()
  for (const h of [request.headers.get('host'), request.headers.get('x-forwarded-host'), request.nextUrl.host]) {
    if (h) for (const part of h.split(',')) allowed.add(part.trim())
  }
  for (const url of [process.env['NEXT_PUBLIC_APP_URL'], ...(process.env.ALLOWED_ORIGINS || '').split(',')]) {
    if (!url?.trim()) continue
    try { allowed.add(new URL(url.trim()).host) } catch { /* ignore malformed entries */ }
  }
  return !allowed.has(originHost)
}

/** Resolve the caller. Returns null only when auth is required and missing/invalid. */
export async function resolveUser(request: NextRequest): Promise<RequestUser | null> {
  const token = extractSessionToken(request)
  if (token) {
    try {
      const user = await getSessionUser(token)
      if (user) return { userId: user.id, email: user.email, name: user.name, role: user.role, authenticated: true }
    } catch (err) {
      console.error('[auth] session lookup failed:', err instanceof Error ? err.message : err)
    }
  }
  if (!isAuthRequired()) return { userId: DEMO_USER_ID, email: null, authenticated: false }
  return null
}

/**
 * Use in route handlers:
 *   const auth = await requireUser(request)
 *   if (auth instanceof Response) return auth
 */
export async function requireUser(request: NextRequest): Promise<RequestUser | Response> {
  if (isCrossSiteWrite(request)) {
    return Response.json({ error: 'Cross-site request blocked' }, { status: 403 })
  }
  const user = await resolveUser(request)
  if (user) return user
  return Response.json({ error: 'Authentication required' }, { status: 401 })
}
