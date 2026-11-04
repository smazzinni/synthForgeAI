/**
 * Server-side request authentication.
 *
 * Every API route resolves the caller through `requireUser()`. The access
 * token is taken from an `Authorization: Bearer` header or from the Supabase
 * auth cookies written by `@supabase/ssr` (`sb-<ref>-auth-token`, optionally
 * split into `.0`, `.1`, ... chunks and prefixed with `base64-`).
 *
 * The token's signature is ALWAYS verified — either locally (HS256 with
 * SUPABASE_JWT_SECRET, no network round-trip) or by asking Supabase Auth
 * (`auth.getUser`, cached briefly). A decoded-but-unverified JWT is never
 * trusted.
 *
 * When auth is not required (NEXT_PUBLIC_AUTH_ENABLED !== 'true', i.e. local
 * demo mode) an anonymous caller is mapped to a single demo user so the app
 * works without Supabase.
 */
import { createHmac, timingSafeEqual } from 'node:crypto'
import type { NextRequest } from 'next/server'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

export const DEMO_USER_ID = '5a784d48-945a-47d3-ae95-d2aa5d9abe8c'

export function isAuthRequired(): boolean {
  return process.env.NEXT_PUBLIC_AUTH_ENABLED === 'true'
}

export interface RequestUser {
  userId: string
  email: string | null
  /** false when the caller is the anonymous demo user */
  authenticated: boolean
}

// ─── Token extraction ───────────────────────────────────────────

function base64UrlDecode(input: string): string {
  const normalized = input.replace(/-/g, '+').replace(/_/g, '/')
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4)
  return Buffer.from(padded, 'base64').toString('utf8')
}

function tokenFromCookieValue(raw: string): string | null {
  let value = raw
  try { value = decodeURIComponent(raw) } catch { /* keep raw */ }
  if (value.startsWith('base64-')) {
    try { value = base64UrlDecode(value.slice(7)) } catch { return null }
  }
  if (value.startsWith('eyJ') && value.split('.').length === 3) return value
  try {
    const parsed = JSON.parse(value)
    if (Array.isArray(parsed) && typeof parsed[0] === 'string') return parsed[0] // legacy [access, refresh]
    if (parsed && typeof parsed.access_token === 'string') return parsed.access_token
  } catch { /* not JSON */ }
  return null
}

export function extractAccessToken(request: NextRequest): string | null {
  const header = request.headers.get('authorization')
  if (header?.toLowerCase().startsWith('bearer ')) {
    const token = header.slice(7).trim()
    if (token) return token
  }

  // Group cookies by base name so chunked cookies can be reassembled.
  const groups = new Map<string, Array<{ idx: number; value: string }>>()
  for (const c of request.cookies.getAll()) {
    const m = c.name.match(/^(sb-.+-auth-token)(?:\.(\d+))?$/)
    if (!m) continue
    const list = groups.get(m[1]) ?? []
    list.push({ idx: m[2] === undefined ? -1 : parseInt(m[2], 10), value: c.value })
    groups.set(m[1], list)
  }
  for (const parts of groups.values()) {
    const whole = parts.find(p => p.idx === -1)
    const joined = whole
      ? whole.value
      : parts.sort((a, b) => a.idx - b.idx).map(p => p.value).join('')
    const token = tokenFromCookieValue(joined)
    if (token) return token
  }
  return null
}

// ─── Verification ───────────────────────────────────────────────

interface JwtClaims { sub?: string; email?: string; exp?: number; role?: string }

function decodeJwt(token: string): { header: { alg?: string }; claims: JwtClaims; signingInput: string; signature: string } | null {
  const parts = token.split('.')
  if (parts.length !== 3) return null
  try {
    return {
      header: JSON.parse(base64UrlDecode(parts[0])),
      claims: JSON.parse(base64UrlDecode(parts[1])),
      signingInput: `${parts[0]}.${parts[1]}`,
      signature: parts[2],
    }
  } catch {
    return null
  }
}

function verifyHs256Locally(token: string, secret: string): JwtClaims | null {
  const decoded = decodeJwt(token)
  if (!decoded || decoded.header.alg !== 'HS256') return null
  const expected = createHmac('sha256', secret).update(decoded.signingInput).digest('base64url')
  const a = Buffer.from(expected)
  const b = Buffer.from(decoded.signature)
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null
  if (!decoded.claims.exp || decoded.claims.exp * 1000 < Date.now()) return null
  if (!decoded.claims.sub) return null
  return decoded.claims
}

let verifierClient: SupabaseClient | null = null
function getVerifierClient(): SupabaseClient | null {
  if (verifierClient) return verifierClient
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) return null
  verifierClient = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
  return verifierClient
}

// Small cache so remote verification costs one round-trip per token per minute.
const verifiedCache = new Map<string, { user: RequestUser; until: number }>()
const CACHE_TTL_MS = 60_000
const CACHE_MAX = 2_000

async function verifyToken(token: string): Promise<RequestUser | null> {
  const cached = verifiedCache.get(token)
  if (cached && cached.until > Date.now()) return cached.user

  const decoded = decodeJwt(token)
  if (!decoded) return null
  const expMs = (decoded.claims.exp ?? 0) * 1000
  if (expMs && expMs < Date.now()) return null

  let user: RequestUser | null = null
  const secret = process.env.SUPABASE_JWT_SECRET
  if (secret && decoded.header.alg === 'HS256') {
    const claims = verifyHs256Locally(token, secret)
    if (claims?.sub) user = { userId: claims.sub, email: claims.email ?? null, authenticated: true }
  } else {
    const client = getVerifierClient()
    if (client) {
      try {
        const { data, error } = await client.auth.getUser(token)
        if (!error && data.user) user = { userId: data.user.id, email: data.user.email ?? null, authenticated: true }
      } catch {
        user = null
      }
    }
  }

  if (user) {
    if (verifiedCache.size >= CACHE_MAX) {
      const firstKey = verifiedCache.keys().next().value
      if (firstKey) verifiedCache.delete(firstKey)
    }
    const until = Math.min(Date.now() + CACHE_TTL_MS, expMs || Date.now() + CACHE_TTL_MS)
    verifiedCache.set(token, { user, until })
  }
  return user
}

// ─── Public API ─────────────────────────────────────────────────

/** Resolve the caller. Returns null only when auth is required and missing/invalid. */
export async function resolveUser(request: NextRequest): Promise<RequestUser | null> {
  const token = extractAccessToken(request)
  if (token) {
    const user = await verifyToken(token)
    if (user) return user
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
  const user = await resolveUser(request)
  if (user) return user
  return Response.json({ error: 'Authentication required' }, { status: 401 })
}
