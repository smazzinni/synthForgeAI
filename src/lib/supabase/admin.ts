import { createClient } from '@supabase/supabase-js'
import type { Database } from './types'

let adminClient: ReturnType<typeof createClient<Database>> | null = null

export function getSupabaseAdmin() {
  if (adminClient) return adminClient

  adminClient = createClient<Database>(
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  )

  return adminClient
}
