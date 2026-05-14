import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextRequest } from 'next/server'

// ─── Auth enabled check ─────────────────────────────────────────
export function isAuthEnabled(): boolean {
  return process.env.NEXT_PUBLIC_AUTH_ENABLED === 'true'
}

// ─── Server-side admin client (full access, use carefully) ──────
let _adminClient: SupabaseClient | null = null
export function getSupabaseAdmin(): SupabaseClient | null {
  if (!_adminClient) {
    const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.SUPABASE_SERVICE_KEY
    if (!url || !key) {
      console.warn('[Supabase] Missing SUPABASE_URL or SUPABASE_SERVICE_KEY env vars')
      return null
    }
    _adminClient = createClient(url, key, {
      auth: { autoRefreshToken: false, persistSession: false }
    })
  }
  return _adminClient
}

// ─── Client-side public client (limited access via anon key) ────
let _publicClient: SupabaseClient | null = null
export function getSupabaseClient(): SupabaseClient | null {
  if (!_publicClient) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    if (!url || !key) {
      console.warn('[Supabase] Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY env vars')
      return null
    }
    _publicClient = createClient(url, key)
  }
  return _publicClient
}

// ─── Server-side client with cookie-based auth ──────────────────
export async function getSupabaseServerClient(_request?: NextRequest) {
  const cookieStore = await cookies()
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!url || !key) {
    throw new Error('[Supabase] Missing env vars for server client')
  }

  return createServerClient(url, key, {
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
}

// ─── Get user info from request (headers or cookies) ────────────
export interface UserInfo {
  userId?: string
  supabaseId?: string
  email?: string
  tenantId?: string
}

export async function getUserFromRequest(request: NextRequest): Promise<UserInfo | null> {
  if (!isAuthEnabled()) return null

  try {
    // Check for user info headers set by middleware
    const headerUserId = request.headers.get('x-user-id')
    const headerSupabaseId = request.headers.get('x-supabase-id')
    const headerEmail = request.headers.get('x-user-email')
    const headerTenantId = request.headers.get('x-tenant-id')

    if (headerUserId) {
      return {
        userId: headerUserId,
        supabaseId: headerSupabaseId || undefined,
        email: headerEmail || undefined,
        tenantId: headerTenantId || undefined,
      }
    }

    // Check for Bearer token in Authorization header
    const authHeader = request.headers.get('authorization')
    const token = authHeader?.replace('Bearer ', '')

    // Check for access token in cookies
    const cookieToken = request.cookies.get('sb-access-token')?.value

    const accessToken = token || cookieToken
    if (!accessToken) return null

    // Verify token with Supabase
    const admin = getSupabaseAdmin()
    if (!admin) return null

    const { data: { user }, error } = await admin.auth.getUser(accessToken)
    if (error || !user) return null

    return {
      supabaseId: user.id,
      email: user.email || undefined,
    }
  } catch (err) {
    console.error('[Supabase] Error getting user from request:', err)
    return null
  }
}

// ─── Authenticated user interface ───────────────────────────────
export interface AuthenticatedUser {
  userId: string
  supabaseId: string
  email: string
  tenantId: string
  name: string
  role: string
}

// ─── Require authentication (throws UNAUTHORIZED if not auth'd) ─
export async function requireAuth(request: NextRequest): Promise<AuthenticatedUser> {
  const { getAuthenticatedUser } = await import('@/lib/auth')
  return getAuthenticatedUser(request)
}
