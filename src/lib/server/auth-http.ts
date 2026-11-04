import type { NextRequest } from 'next/server'
import { rateLimit } from './rate-limit'

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

export function clientIp(request: NextRequest): string {
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || request.headers.get('x-real-ip') || 'unknown'
}

export async function readJsonBody(request: NextRequest): Promise<Record<string, unknown> | null> {
  try {
    const body = await request.json()
    return body && typeof body === 'object' && !Array.isArray(body) ? body : null
  } catch {
    return null
  }
}

export function normaliseEmail(v: unknown): string {
  return typeof v === 'string' ? v.trim().toLowerCase() : ''
}

/** 429 response if any of the keys is over its limit. */
export function limited(checks: Array<[key: string, limit: number, windowMs: number]>): Response | null {
  for (const [key, limit, windowMs] of checks) {
    const r = rateLimit(key, limit, windowMs)
    if (!r.ok) {
      return Response.json({ error: 'Too many attempts. Please wait a moment and try again.' }, { status: 429, headers: { 'Retry-After': String(r.retryAfterSec) } })
    }
  }
  return null
}

export function publicUser(u: { id: string; email: string; name: string | null; role: string; createdAt?: Date }) {
  return { id: u.id, email: u.email, name: u.name, role: u.role, ...(u.createdAt ? { createdAt: u.createdAt.toISOString() } : {}) }
}
