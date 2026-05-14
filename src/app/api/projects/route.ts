import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getAuthenticatedUser, AuthError, verifyWorkspaceAccess } from '@/lib/auth'

// GET /api/projects - List projects for workspace (tenant-scoped)
export async function GET(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request)
    const workspaceId = request.nextUrl.searchParams.get('workspaceId')

    if (!workspaceId) {
      return NextResponse.json({ error: 'workspaceId required' }, { status: 400 })
    }

    // Verify workspace belongs to user
    const hasAccess = await verifyWorkspaceAccess(workspaceId, user.userId)
    if (!hasAccess) {
      return NextResponse.json({ error: 'Workspace not found or access denied' }, { status: 403 })
    }

    const projects = await db.project.findMany({
      where: { workspaceId },
      include: {
        databases: {
          include: { _count: { select: { datasets: true, conversations: true } } },
          orderBy: { updatedAt: 'desc' }
        }
      },
      orderBy: { updatedAt: 'desc' }
    })

    return NextResponse.json({ projects })
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode })
    }
    return NextResponse.json({ error: 'Failed to fetch projects' }, { status: 500 })
  }
}

// POST /api/projects - Create project (tenant-scoped)
export async function POST(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request)

    let body: Record<string, unknown>
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    const { name, description = '', workspaceId } = body as { name?: string; description?: string; workspaceId?: string }

    if (!name || typeof name !== 'string' || !name.trim()) {
      return NextResponse.json({ error: 'Name required' }, { status: 400 })
    }
    if (!workspaceId || typeof workspaceId !== 'string') {
      return NextResponse.json({ error: 'Name and workspaceId required' }, { status: 400 })
    }

    // Verify workspace belongs to user
    const hasAccess = await verifyWorkspaceAccess(workspaceId, user.userId)
    if (!hasAccess) {
      return NextResponse.json({ error: 'Workspace not found or access denied' }, { status: 403 })
    }

    const project = await db.project.create({
      data: { name, description, workspaceId }
    })

    return NextResponse.json({ project })
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode })
    }
    return NextResponse.json({ error: 'Failed to create project' }, { status: 500 })
  }
}
