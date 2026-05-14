'use client'

import { createBrowserClient } from '@supabase/ssr'
import type { Database } from './types'

export function getSupabaseBrowserClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!url || !key) {
    console.warn('[Supabase] Missing env vars - client not initialized')
    return null
  }

  return createBrowserClient<Database>(url, key)
}
