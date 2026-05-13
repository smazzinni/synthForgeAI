import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// GET /api/workspaces - List workspaces
export async function GET() {
  try {
    const workspaces = await db.workspace.findMany({
      include: { _count: { select: { projects: true } } },
      orderBy: { updatedAt: 'desc' }
    })
    
    // Create default workspace if none exists
    if (workspaces.length === 0) {
      const workspace = await db.workspace.create({
        data: {
          name: 'My Workspace',
          slug: 'my-workspace'
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
    return NextResponse.json({ error: 'Failed to fetch workspaces' }, { status: 500 })
  }
}

// POST /api/workspaces - Create workspace
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { name, agentInstructions = '' } = body

    if (!name) {
      return NextResponse.json({ error: 'Name required' }, { status: 400 })
    }

    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
    
    const workspace = await db.workspace.create({
      data: { name, slug, agentInstructions }
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
    return NextResponse.json({ error: 'Failed to create workspace' }, { status: 500 })
  }
}
