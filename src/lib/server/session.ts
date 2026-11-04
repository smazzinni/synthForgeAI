/**
 * Database-backed sessions (PostgreSQL via Prisma).
 *
 * - Token: 32 random bytes (base64url) in the `sf_session` httpOnly cookie.
 * - Storage: SHA-256 of the token in the Session table → revocable, and a
 *   leaked table can't be replayed.
 * - Lifetime: 30 days, sliding (lastSeenAt/expiry refreshed at most daily).
 * - Lookups are cached in-process for 30 s to keep API calls cheap.
 */
import { createHash, randomBytes } from 'node:crypto'
import type { NextRequest } from 'next/server'
import { db } from '@/lib/db'

export const SESSION_COOKIE = 'sf_session'
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000
const REFRESH_AFTER_MS = 24 * 60 * 60 * 1000
const CACHE_TTL_MS = 30_000

export interface SessionUser {
  id: string
  email: string
  name: string | null
  role: string
}

const hashToken = (token: string) => createHash('sha256').update(token).digest('hex')

const g = globalThis as unknown as { __sfSessionCache?: Map<string, { user: SessionUser | null; until: number }> }
const cache: Map<string, { user: SessionUser | null; until: number }> = g.__sfSessionCache ?? (g.__sfSessionCache = new Map())

function clientIp(request: NextRequest): string | null {
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || request.headers.get('x-real-ip') || null
}

export async function createSession(userId: string, request: NextRequest): Promise<{ token: string; expiresAt: Date }> {
  const token = randomBytes(32).toString('base64url')
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS)
  await db.session.create({
    data: {
      userId,
      tokenHash: hashToken(token),
      expiresAt,
      userAgent: request.headers.get('user-agent')?.slice(0, 300) ?? null,
      ip: clientIp(request),
    },
  })
  // Opportunistic cleanup of expired sessions (cheap, indexed).
  if (Math.random() < 0.05) db.session.deleteMany({ where: { expiresAt: { lt: new Date() } } }).catch(() => {})
  return { token, expiresAt }
}

export async function getSessionUser(token: string): Promise<SessionUser | null> {
  if (!token || token.length > 200) return null
  const key = hashToken(token)
  const hit = cache.get(key)
  if (hit && hit.until > Date.now()) return hit.user

  const session = await db.session.findUnique({
    where: { tokenHash: key },
    include: { user: { select: { id: true, email: true, name: true, role: true } } },
  })
  let user: SessionUser | null = null
  if (session && session.expiresAt.getTime() > Date.now()) {
    user = session.user
    if (Date.now() - session.lastSeenAt.getTime() > REFRESH_AFTER_MS) {
      db.session.update({
        where: { id: session.id },
        data: { lastSeenAt: new Date(), expiresAt: new Date(Date.now() + SESSION_TTL_MS) },
      }).catch(() => {})
    }
  }
  if (cache.size > 5000) cache.clear()
  cache.set(key, { user, until: Date.now() + CACHE_TTL_MS })
  return user
}

export async function revokeSession(token: string): Promise<void> {
  const key = hashToken(token)
  cache.delete(key)
  await db.session.deleteMany({ where: { tokenHash: key } })
}

/** Sign out everywhere (optionally keeping the current session). */
export async function revokeAllSessions(userId: string, exceptToken?: string): Promise<void> {
  const keep = exceptToken ? hashToken(exceptToken) : undefined
  await db.session.deleteMany({ where: { userId, ...(keep ? { NOT: { tokenHash: keep } } : {}) } })
  cache.clear()
}

export function sessionCookie(token: string, expiresAt: Date) {
  return {
    name: SESSION_COOKIE,
    value: token,
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production' && process.env.INSECURE_COOKIES !== 'true',
    sameSite: 'lax' as const,
    path: '/',
    expires: expiresAt,
  }
}

export function clearedSessionCookie() {
  return { ...sessionCookie('', new Date(0)), maxAge: 0 }
}

export const hashResetToken = hashToken
