'use client'

import { createClient } from '@supabase/supabase-js'
import type { Database } from './types'

let supabaseClient: ReturnType<typeof createClient<Database>> | null = null

export function getSupabaseBrowserClient() {
  if (supabaseClient) return supabaseClient

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!url || !key) {
    console.warn('[Supabase] Missing env vars - client not initialized')
    // Return a dummy client that won't crash but will fail gracefully
    return null as unknown as ReturnType<typeof createClient<Database>>
  }

  supabaseClient = createClient<Database>(url, key, {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: true,
    },
  })

  return supabaseClient
}
