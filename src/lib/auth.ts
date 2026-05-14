import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getUserFromRequest, isAuthEnabled } from '@/lib/supabase'
import { getSupabaseAdmin } from '@/lib/supabase/admin'
import { mockUser, mockWorkspaces, mockProjects } from '@/lib/mock-data'

export interface AuthenticatedUser {
  userId: string
  tenantId: string
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

  const userInfo = await getUserFromRequest(request)

  if (!userInfo) {
    throw new AuthError('Authentication required', 401)
  }

  // Try Prisma first if available
  if (db) {
    // If we already have the local userId from headers, use it
    if (userInfo.userId && userInfo.userId !== '') {
      const localUser = await db.user.findUnique({ where: { id: userInfo.userId } })
      if (localUser) {
        return {
          userId: localUser.id,
          tenantId: localUser.tenantId,
          email: localUser.email,
          supabaseId: localUser.supabaseId,
          name: localUser.name,
          role: localUser.role,
        }
      }
    }

    // Look up local user by Supabase ID
    if (userInfo.supabaseId) {
      const localUser = await db.user.findUnique({ where: { supabaseId: userInfo.supabaseId } })
      if (localUser) {
        return {
          userId: localUser.id,
          tenantId: localUser.tenantId,
          email: localUser.email,
          supabaseId: localUser.supabaseId,
          name: localUser.name,
          role: localUser.role,
        }
      }
    }

    // Look up by email as last resort
    if (userInfo.email) {
      const localUser = await db.user.findUnique({ where: { email: userInfo.email } })
      if (localUser) {
        return {
          userId: localUser.id,
          tenantId: localUser.tenantId,
          email: localUser.email,
          supabaseId: localUser.supabaseId,
          name: localUser.name,
          role: localUser.role,
        }
      }
    }
  }

  // Try Supabase profiles table
  if (userInfo.supabaseId || userInfo.email) {
    try {
      const admin = getSupabaseAdmin()
      const query = userInfo.supabaseId
        ? admin.from('profiles').select('*').eq('id', userInfo.supabaseId).single()
        : admin.from('profiles').select('*').eq('email', userInfo.email).single()

      const { data: profile } = await query
      if (profile) {
        return {
          userId: profile.id,
          tenantId: 'default',
          email: profile.email,
          supabaseId: profile.id,
          name: profile.full_name || 'User',
          role: profile.role || 'member',
        }
      }
    } catch {
      // Supabase profile lookup failed
    }
  }

  throw new AuthError('User not found. Please register first.', 401)
}

// ─── Dev mode fallback ─────────────────────────────────────────
function getDevUser(): AuthenticatedUser {
  return {
    userId: mockUser.id,
    tenantId: 'demo-tenant',
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

// ─── Verify workspace belongs to user ──────────────────────────
export async function verifyWorkspaceAccess(workspaceId: string, _userId: string): Promise<boolean> {
  if (!isAuthEnabled()) return true

  if (db) {
    const workspace = await db.workspace.findFirst({
      where: { id: workspaceId },
    })
    return !!workspace
  }

  // Supabase check
  try {
    const admin = getSupabaseAdmin()
    const { data } = await admin.from('workspaces').select('id').eq('id', workspaceId).single()
    return !!data
  } catch {
    return true // Allow in dev mode
  }
}

// ─── Verify project belongs to user via workspace ──────────────
export async function verifyProjectAccess(projectId: string, _userId: string): Promise<boolean> {
  if (!isAuthEnabled()) return true

  if (db) {
    const project = await db.project.findFirst({
      where: { id: projectId },
    })
    return !!project
  }

  try {
    const admin = getSupabaseAdmin()
    const { data } = await admin.from('projects').select('id').eq('id', projectId).single()
    return !!data
  } catch {
    return true
  }
}

// ─── Verify database belongs to user via project -> workspace ──
export async function verifyDatabaseAccess(databaseId: string, _userId: string): Promise<boolean> {
  if (!isAuthEnabled()) return true

  if (db) {
    const database = await db.database.findFirst({
      where: { id: databaseId },
    })
    return !!database
  }

  try {
    const admin = getSupabaseAdmin()
    const { data } = await admin.from('synthetic_databases').select('id').eq('id', databaseId).single()
    return !!data
  } catch {
    return true
  }
}

// ─── Verify conversation belongs to user via workspace ─────────
export async function verifyConversationAccess(conversationId: string, _userId: string): Promise<boolean> {
  if (!isAuthEnabled()) return true

  if (db) {
    const conversation = await db.conversation.findFirst({
      where: { id: conversationId },
    })
    return !!conversation
  }

  try {
    const admin = getSupabaseAdmin()
    const { data } = await admin.from('conversations').select('id').eq('id', conversationId).single()
    return !!data
  } catch {
    return true
  }
}
