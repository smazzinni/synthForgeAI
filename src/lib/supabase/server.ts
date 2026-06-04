import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { resolveSupabasePublicConfig } from './env'
import type { Database } from './types'

export async function getSupabaseServerClient() {
  const { url, anonKey: key } = resolveSupabasePublicConfig()

  if (!url || !key) {
    console.warn('[Supabase Server] Missing env vars - server client not initialized')
    return null
  }

  const cookieStore = await cookies()

  return createServerClient<Database>(url, key, {
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
