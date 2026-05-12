import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// GET /api/projects?workspaceId=xxx
export async function GET(request: NextRequest) {
  try {
    const workspaceId = request.nextUrl.searchParams.get('workspaceId')
    if (!workspaceId) {
      return NextResponse.json({ error: 'workspaceId required' }, { status: 400 })
    }

    const projects = await db.project.findMany({
      where: { workspaceId },
      orderBy: { updatedAt: 'desc' },
      include: {
        databases: {
          orderBy: { updatedAt: 'desc' }
        }
      }
    })
    return NextResponse.json({ projects })
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch projects' }, { status: 500 })
  }
}

// POST /api/projects
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { name, description, workspaceId } = body

    const project = await db.project.create({
      data: { name, description: description || '', workspaceId }
    })

    return NextResponse.json({ project }, { status: 201 })
  } catch (error) {
    return NextResponse.json({ error: 'Failed to create project' }, { status: 500 })
  }
}
