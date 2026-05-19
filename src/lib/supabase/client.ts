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

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!url || !key) {
    console.warn('[Supabase] Missing env vars - client not initialized')
    return null
  }

  browserClient = createBrowserClient<Database>(url, key)
  return browserClient
}
