// ─── Streaming Database Generation API — user utilities ───

import type { NextRequest } from 'next/server'

/**
 * Lightweight user-ID extraction from Supabase auth cookies.
 *
 * Avoids pulling in the full Supabase client (and its network/refresh calls)
 * for what is really just a JWT-decode operation. Returns `null` if no valid
 * auth cookie is found.
 */
export function getUserIdFromCookies(request: NextRequest): string | null {
  try {
    const supabaseCookies = request.cookies.getAll().filter(c =>
      c.name.includes('-auth-token'),
    )
    for (const cookie of supabaseCookies) {
      try {
        const rawValue = decodeURIComponent(cookie.value)
        let accessToken: string | null = null
        try {
          const parsed = JSON.parse(rawValue)
          accessToken = parsed?.access_token || null
        } catch {
          accessToken = rawValue
        }
        if (!accessToken) continue
        const parts = accessToken.split('.')
        if (parts.length !== 3) continue
        const payload = JSON.parse(atob(parts[1]))
        if (payload?.sub) return payload.sub
      } catch {
        continue
      }
    }
    return null
  } catch {
    return null
  }
}
