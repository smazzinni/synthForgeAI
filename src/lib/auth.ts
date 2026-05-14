import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getUserFromRequest, isAuthEnabled } from '@/lib/supabase'

export interface AuthenticatedUser {
  userId: string       // Local DB User.id
  tenantId: string     // Tenant/org isolation key
  email: string
  supabaseId: string
  name: string
  role: string
}

// ─── Get authenticated user from request ───────────────────────
// Returns the full local User record or throws a 401 response
export async function getAuthenticatedUser(request: NextRequest): Promise<AuthenticatedUser> {
  const authEnabled = isAuthEnabled()

  // Dev mode: skip auth, return first user or create one
  if (!authEnabled) {
    return getDevUser()
  }

  const userInfo = await getUserFromRequest(request)

  if (!userInfo) {
    throw new AuthError('Authentication required', 401)
  }

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

  throw new AuthError('User not found in local database. Please register first.', 401)
}

// ─── Dev mode fallback ─────────────────────────────────────────
async function getDevUser(): Promise<AuthenticatedUser> {
  let user = await db.user.findFirst()

  if (!user) {
    // Create a dev user and workspace
    user = await db.user.create({
      data: {
        email: 'dev@synthforge.ai',
        name: 'Dev User',
        supabaseId: 'dev-supabase-id',
        role: 'admin',
        tenantId: 'dev-tenant',
      },
    })

    const workspace = await db.workspace.create({
      data: {
        name: 'Dev Workspace',
        slug: 'dev-workspace',
        userId: user.id,
      },
    })

    await db.project.create({
      data: {
        name: 'Default Project',
        description: 'Default project for development',
        workspaceId: workspace.id,
      },
    })
  }

  return {
    userId: user.id,
    tenantId: user.tenantId,
    email: user.email,
    supabaseId: user.supabaseId,
    name: user.name,
    role: user.role,
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
export async function verifyWorkspaceAccess(workspaceId: string, userId: string): Promise<boolean> {
  if (!isAuthEnabled()) return true
  const workspace = await db.workspace.findFirst({
    where: { id: workspaceId, userId },
  })
  return !!workspace
}

// ─── Verify project belongs to user via workspace ──────────────
export async function verifyProjectAccess(projectId: string, userId: string): Promise<boolean> {
  if (!isAuthEnabled()) return true
  const project = await db.project.findFirst({
    where: { id: projectId, workspace: { userId } },
  })
  return !!project
}

// ─── Verify database belongs to user via project -> workspace ──
export async function verifyDatabaseAccess(databaseId: string, userId: string): Promise<boolean> {
  if (!isAuthEnabled()) return true
  const database = await db.database.findFirst({
    where: { id: databaseId, project: { workspace: { userId } } },
  })
  return !!database
}

// ─── Verify conversation belongs to user via workspace ─────────
export async function verifyConversationAccess(conversationId: string, userId: string): Promise<boolean> {
  if (!isAuthEnabled()) return true
  const conversation = await db.conversation.findFirst({
    where: { id: conversationId, workspace: { userId } },
  })
  return !!conversation
}
