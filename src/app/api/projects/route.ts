import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// GET /api/projects - List projects for workspace
export async function GET(request: NextRequest) {
  try {
    const workspaceId = request.nextUrl.searchParams.get('workspaceId')
    
    if (!workspaceId) {
      return NextResponse.json({ error: 'workspaceId required' }, { status: 400 })
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
    return NextResponse.json({ error: 'Failed to fetch projects' }, { status: 500 })
  }
}

// POST /api/projects - Create project
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { name, description = '', workspaceId } = body

    if (!name || !workspaceId) {
      return NextResponse.json({ error: 'Name and workspaceId required' }, { status: 400 })
    }

    const project = await db.project.create({
      data: { name, description, workspaceId }
    })

    return NextResponse.json({ project })
  } catch (error) {
    return NextResponse.json({ error: 'Failed to create project' }, { status: 500 })
  }
}
