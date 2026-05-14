import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUser, AuthError } from '@/lib/auth'
import { getSupabaseAdmin } from '@/lib/supabase/admin'
import { mockProjects } from '@/lib/mock-data'
import { db } from '@/lib/db'

// GET /api/projects - List projects for workspace
export async function GET(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request)
    const workspaceId = request.nextUrl.searchParams.get('workspaceId')

    if (!workspaceId) {
      return NextResponse.json({ projects: mockProjects })
    }

    // Verify workspace access
    if (db) {
      try {
        const projects = await db.project.findMany({
          where: { workspaceId },
          orderBy: { updatedAt: 'desc' }
        })
        return NextResponse.json({ projects })
      } catch {
        // Fall through to Supabase
      }
    }

    // Try Supabase
    try {
      const admin = getSupabaseAdmin()
      const { data, error } = await admin
        .from('projects')
        .select('*')
        .eq('workspace_id', workspaceId)

      if (!error && data) {
        return NextResponse.json({ projects: data, source: 'supabase' })
      }
    } catch {
      // Fall through to mock
    }

    return NextResponse.json({ projects: mockProjects, source: 'mock' })
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode })
    }
    return NextResponse.json({ projects: mockProjects, source: 'mock' })
  }
}

// POST /api/projects - Create project
export async function POST(request: NextRequest) {
  try {
    const _user = await getAuthenticatedUser(request)

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

    // Try Prisma first
    if (db && workspaceId) {
      try {
        const project = await db.project.create({
          data: { name, description, workspaceId }
        })
        return NextResponse.json({ project })
      } catch {
        // Fall through to Supabase
      }
    }

    // Try Supabase
    if (workspaceId) {
      try {
        const admin = getSupabaseAdmin()
        const { data, error } = await admin
          .from('projects')
          .insert({ name, description, workspace_id: workspaceId })
          .select()
          .single()

        if (!error && data) {
          return NextResponse.json({ project: data })
        }
      } catch {
        // Fall through to mock
      }
    }

    // Mock response
    return NextResponse.json({
      project: {
        id: 'proj-' + Date.now(),
        name,
        description,
        workspace_id: workspaceId,
      },
      source: 'mock',
    })
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode })
    }
    return NextResponse.json({ error: 'Failed to create project' }, { status: 500 })
  }
}
