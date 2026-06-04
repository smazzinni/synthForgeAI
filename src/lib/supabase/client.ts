'use client'

import { createBrowserClient } from '@supabase/ssr'
import type { Database } from './types'

// Singleton pattern: prevent creating multiple Supabase clients
// which causes auth state desync and cookie flooding
let browserClient: ReturnType<typeof createBrowserClient<Database>> | null = null

export function getSupabaseBrowserClient() {
  if (browserClient) return browserClient

  // Guard: only create in browser environment
  // During SSR, this should not create a real client
  if (typeof window === 'undefined') {
    return null
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim()

  if (!url || !key) {
    console.warn(
      '[Supabase] Missing URL or anon key — set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local (or SUPABASE_URL + SUPABASE_ANON_KEY), then restart `bun run dev`.'
    )
    return null
  }

  browserClient = createBrowserClient<Database>(url, key)
  return browserClient
}
