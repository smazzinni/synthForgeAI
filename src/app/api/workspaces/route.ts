import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getAuthenticatedUser, AuthError } from '@/lib/auth'

// GET /api/workspaces - List workspaces for authenticated user
export async function GET(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request)

    const workspaces = await db.workspace.findMany({
      where: { userId: user.userId },
      include: { _count: { select: { projects: true } } },
      orderBy: { updatedAt: 'desc' }
    })

    // Create default workspace if none exists
    if (workspaces.length === 0) {
      const workspace = await db.workspace.create({
        data: {
          name: `${user.name}'s Workspace`,
          slug: `${user.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-workspace`,
          userId: user.userId,
        }
      })
      const project = await db.project.create({
        data: {
          name: 'Default Project',
          description: 'Default project for synthetic data generation',
          workspaceId: workspace.id
        }
      })
      return NextResponse.json({
        workspaces: [{ ...workspace, _count: { projects: 1 } }],
        defaultProject: project
      })
    }

    return NextResponse.json({ workspaces })
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode })
    }
    return NextResponse.json({ error: 'Failed to fetch workspaces' }, { status: 500 })
  }
}

// POST /api/workspaces - Create workspace for authenticated user
export async function POST(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request)

    let body: Record<string, unknown>
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    const { name, agentInstructions = '' } = body as { name?: string; agentInstructions?: string }

    if (!name || typeof name !== 'string' || !name.trim()) {
      return NextResponse.json({ error: 'Name required' }, { status: 400 })
    }

    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

    const workspace = await db.workspace.create({
      data: { name, slug, agentInstructions, userId: user.userId }
    })

    // Create default project
    await db.project.create({
      data: {
        name: 'Default Project',
        description: `Default project for ${name}`,
        workspaceId: workspace.id
      }
    })

    return NextResponse.json({ workspace })
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode })
    }
    return NextResponse.json({ error: 'Failed to create workspace' }, { status: 500 })
  }
}
