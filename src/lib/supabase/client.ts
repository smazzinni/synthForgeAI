'use client'

import { createClient } from '@supabase/supabase-js'
import type { Database } from './types'

let supabaseClient: ReturnType<typeof createClient<Database>> | null = null

export function getSupabaseBrowserClient() {
  if (supabaseClient) return supabaseClient

  supabaseClient = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true,
      },
    }
  )

  return supabaseClient
}

export const supabase = getSupabaseBrowserClient()
