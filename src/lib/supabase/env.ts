/**
 * Resolves Supabase URL and anon key for server / config.
 * Supports either NEXT_PUBLIC_* (required for client bundles) or common
 * Supabase CLI / dashboard aliases SUPABASE_URL and SUPABASE_ANON_KEY.
 */
export function resolveSupabasePublicConfig(): { url: string; anonKey: string } {
  const url =
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ||
    process.env.SUPABASE_URL?.trim() ||
    ''
  const anonKey =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ||
    process.env.SUPABASE_ANON_KEY?.trim() ||
    ''
  return { url, anonKey }
}
