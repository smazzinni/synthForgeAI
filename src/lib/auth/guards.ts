import { getSupabaseServerClient } from '@/lib/supabase/server'
import { getSupabaseAdmin } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import type { Tables } from '@/lib/supabase/types'

export interface AuthUser {
  id: string
  email: string
  full_name: string | null
  avatar_url: string | null
  role: string
}

export interface AuthOrg {
  id: string
  name: string
  slug: string
  role: string
  plan: string
}

export async function getCurrentUser(): Promise<AuthUser | null> {
  try {
    const supabase = await getSupabaseServerClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) return null

    const { data: profile } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single()

    return {
      id: user.id,
      email: user.email ?? '',
      full_name: profile?.full_name ?? user.user_metadata?.full_name ?? null,
      avatar_url: profile?.avatar_url ?? null,
      role: profile?.role ?? 'member',
    }
  } catch {
    return null
  }
}

export async function requireAuth(): Promise<AuthUser> {
  const user = await getCurrentUser()
  if (!user) redirect('/login')
  return user
}

export async function getUserOrganizations(userId: string): Promise<AuthOrg[]> {
  try {
    const admin = getSupabaseAdmin()
    const { data: memberships } = await admin
      .from('organization_members')
      .select('role, organizations(id, name, slug, plan)')
      .eq('user_id', userId)

    if (!memberships) return []

    return memberships
      .filter((m): m is typeof m & { organizations: NonNullable<typeof m.organizations> } => !!m.organizations)
      .map((m) => ({
        id: m.organizations.id,
        name: m.organizations.name,
        slug: m.organizations.slug,
        role: m.role,
        plan: m.organizations.plan,
      }))
  } catch {
    return []
  }
}

export function isAuthEnabled(): boolean {
  return process.env.NEXT_PUBLIC_AUTH_ENABLED === 'true'
}

// Dev mode: auto-login with demo user
export async function getDevUser(): Promise<AuthUser | null> {
  if (isAuthEnabled()) return null
  return {
    id: 'dev-user-id',
    email: 'demo@synthforge.ai',
    full_name: 'Demo User',
    avatar_url: null,
    role: 'owner',
  }
}
