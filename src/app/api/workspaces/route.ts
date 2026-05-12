import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// GET /api/workspaces - List all workspaces
export async function GET() {
  try {
    const workspaces = await db.workspace.findMany({
      orderBy: { updatedAt: 'desc' },
      include: {
        projects: {
          include: {
            _count: { select: { databases: true } }
          }
        },
        _count: { select: { conversations: true } }
      }
    })
    return NextResponse.json({ workspaces })
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch workspaces' }, { status: 500 })
  }
}

// POST /api/workspaces - Create workspace
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { name, agentInstructions } = body

    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

    const workspace = await db.workspace.create({
      data: {
        name,
        slug: slug + '-' + Date.now().toString(36),
        agentInstructions: agentInstructions || ''
      }
    })

    // Create a default project
    await db.project.create({
      data: {
        name: 'Default Project',
        description: 'Default project for ' + name,
        workspaceId: workspace.id
      }
    })

    return NextResponse.json({ workspace }, { status: 201 })
  } catch (error) {
    return NextResponse.json({ error: 'Failed to create workspace' }, { status: 500 })
  }
}
