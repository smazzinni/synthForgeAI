import { NextRequest } from 'next/server'
import { isAuthEnabled } from '@/lib/supabase/admin'
import { getSupabaseAdmin } from '@/lib/supabase/admin'
import { mockUser } from '@/lib/mock-data'

export interface AuthenticatedUser {
  userId: string
  email: string
  supabaseId: string
  name: string
  role: string
}

// ─── Get authenticated user from request ───────────────────────
export async function getAuthenticatedUser(request: NextRequest): Promise<AuthenticatedUser> {
  const authEnabled = isAuthEnabled()

  // Dev mode: skip auth, return demo user
  if (!authEnabled) {
    return getDevUser()
  }

  // Extract user info from request (headers, cookies, or Bearer token)
  const supabaseId = request.headers.get('x-user-id')
  const bearerToken = request.headers.get('authorization')?.replace('Bearer ', '')
  const email = request.headers.get('x-user-email')

  // Try to get user from Supabase admin using token or ID
  let userId = supabaseId
  let userEmail = email || ''

  if (bearerToken) {
    try {
      const admin = getSupabaseAdmin()
      if (admin) {
        const { data: { user } } = await admin.auth.getUser(bearerToken)
        if (user) {
          userId = user.id
          userEmail = user.email || userEmail
        }
      }
    } catch {
      // Token verification failed
    }
  }

  if (!userId && !userEmail) {
    throw new AuthError('Authentication required', 401)
  }

  // Try Supabase profiles table
  try {
    const admin = getSupabaseAdmin()
    if (admin) {
      const query = userId
        ? admin.from('profiles').select('*').eq('id', userId).single()
        : admin.from('profiles').select('*').eq('email', userEmail).single()

      const { data: profile } = await query
      if (profile) {
        return {
          userId: profile.id,
          email: profile.email || userEmail,
          supabaseId: profile.id,
          name: profile.full_name || 'User',
          role: profile.role || 'member',
        }
      }

      // If no profile exists, create a basic one from auth user info
      if (userId) {
        return {
          userId,
          email: userEmail,
          supabaseId: userId,
          name: userEmail.split('@')[0],
          role: 'member',
        }
      }
    }
  } catch {
    // Supabase profile lookup failed
  }

  throw new AuthError('User not found. Please register first.', 401)
}

// ─── Dev mode fallback ─────────────────────────────────────────
function getDevUser(): AuthenticatedUser {
  return {
    userId: mockUser.id,
    email: mockUser.email,
    supabaseId: 'dev-supabase-id',
    name: mockUser.full_name || 'Demo User',
    role: mockUser.role || 'owner',
  }
}

// ─── Custom auth error ─────────────────────────────────────────
export class AuthError extends Error {
  statusCode: number

  constructor(message: string, statusCode: number = 401) {
    super(message)
    this.name = 'AuthError'
    this.statusCode = statusCode
  }
}

// ─── Verify database belongs to user ──────────────────────────
export async function verifyDatabaseAccess(databaseId: string, userId: string): Promise<boolean> {
  if (!isAuthEnabled()) return true

  try {
    const admin = getSupabaseAdmin()
    if (!admin) return true
    const { data } = await admin.from('synthetic_databases').select('id, user_id').eq('id', databaseId).single()
    // For individual user mode: check if the database belongs to the user
    return !!data && (!data.user_id || data.user_id === userId)
  } catch {
    return true
  }
}

// ─── Verify conversation belongs to user ───────────────────────
export async function verifyConversationAccess(conversationId: string, userId: string): Promise<boolean> {
  if (!isAuthEnabled()) return true

  try {
    const admin = getSupabaseAdmin()
    if (!admin) return true
    const { data } = await admin.from('conversations').select('id, user_id').eq('id', conversationId).single()
    return !!data && (!data.user_id || data.user_id === userId)
  } catch {
    return true
  }
}
