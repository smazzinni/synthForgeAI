import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getAuthenticatedUser, AuthError, verifyProjectAccess } from '@/lib/auth'

// GET /api/databases - List databases (tenant-scoped)
export async function GET(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request)
    const projectId = request.nextUrl.searchParams.get('projectId')

    if (projectId) {
      // Verify project belongs to user
      const hasAccess = await verifyProjectAccess(projectId, user.userId)
      if (!hasAccess) {
        return NextResponse.json({ error: 'Project not found or access denied' }, { status: 403 })
      }

      const databases = await db.database.findMany({
        where: { projectId },
        orderBy: { updatedAt: 'desc' }
      })
      const databasesWithCounts = await Promise.all(databases.map(async (db_item) => {
        const [datasetCount, conversationCount] = await Promise.all([
          db.dataset.count({ where: { databaseId: db_item.id } }),
          db.conversation.count({ where: { databaseId: db_item.id } })
        ])
        return { ...db_item, _count: { datasets: datasetCount, conversations: conversationCount } }
      }))
      return NextResponse.json({ databases: databasesWithCounts })
    }

    // No projectId — list all databases for the user
    const databases = await db.database.findMany({
      where: { project: { workspace: { userId: user.userId } } },
      orderBy: { updatedAt: 'desc' }
    })
    const databasesWithCounts = await Promise.all(databases.map(async (db_item) => {
      const [datasetCount, conversationCount] = await Promise.all([
        db.dataset.count({ where: { databaseId: db_item.id } }),
        db.conversation.count({ where: { databaseId: db_item.id } })
      ])
      return { ...db_item, _count: { datasets: datasetCount, conversations: conversationCount } }
    }))
    return NextResponse.json({ databases: databasesWithCounts })
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode })
    }
    console.error('[Databases API] Error:', error)
    return NextResponse.json({ error: 'Failed to fetch databases' }, { status: 500 })
  }
}

// POST /api/databases - Create database (tenant-scoped)
export async function POST(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request)

    let body: Record<string, unknown>
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    const { name, dbType = 'postgresql', schemaJson = {}, dataJson = {}, projectId } = body as {
      name?: string; dbType?: string; schemaJson?: unknown; dataJson?: unknown; projectId?: string
    }

    if (!name || typeof name !== 'string' || !name.trim()) {
      return NextResponse.json({ error: 'Name required' }, { status: 400 })
    }
    if (!projectId || typeof projectId !== 'string') {
      return NextResponse.json({ error: 'projectId required' }, { status: 400 })
    }

    // Verify project belongs to user
    const hasAccess = await verifyProjectAccess(projectId, user.userId)
    if (!hasAccess) {
      return NextResponse.json({ error: 'Project not found or access denied' }, { status: 403 })
    }

    const database = await db.database.create({
      data: {
        name,
        dbType,
        schemaJson: typeof schemaJson === 'string' ? schemaJson : JSON.stringify(schemaJson),
        dataJson: typeof dataJson === 'string' ? dataJson : JSON.stringify(dataJson),
        projectId
      }
    })

    // Create initial schema version
    await db.schemaVersion.create({
      data: {
        schemaJson: typeof schemaJson === 'string' ? schemaJson : JSON.stringify(schemaJson),
        description: 'Initial schema',
        databaseId: database.id
      }
    })

    return NextResponse.json({ database })
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode })
    }
    return NextResponse.json({ error: 'Failed to create database' }, { status: 500 })
  }
}

// PATCH /api/databases - Update database (tenant-scoped)
export async function PATCH(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request)

    let body: Record<string, unknown>
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    const { id, name, schemaJson, dataJson } = body as {
      id?: string; name?: string; schemaJson?: unknown; dataJson?: unknown
    }

    if (!id || typeof id !== 'string') {
      return NextResponse.json({ error: 'Database ID required' }, { status: 400 })
    }

    // Verify database belongs to user
    const dbAccess = await db.database.findFirst({
      where: { id, project: { workspace: { userId: user.userId } } },
    })
    if (!dbAccess) {
      return NextResponse.json({ error: 'Database not found or access denied' }, { status: 403 })
    }

    const updateData: Record<string, unknown> = {}
    if (name) updateData.name = name
    if (schemaJson !== undefined) updateData.schemaJson = typeof schemaJson === 'string' ? schemaJson : JSON.stringify(schemaJson)
    if (dataJson !== undefined) updateData.dataJson = typeof dataJson === 'string' ? dataJson : JSON.stringify(dataJson)

    const database = await db.database.update({
      where: { id },
      data: updateData
    })

    // Create schema version if schema changed
    if (schemaJson !== undefined) {
      await db.schemaVersion.create({
        data: {
          schemaJson: typeof schemaJson === 'string' ? schemaJson : JSON.stringify(schemaJson),
          description: 'Schema update',
          databaseId: id
        }
      })
    }

    return NextResponse.json({ database })
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode })
    }
    return NextResponse.json({ error: 'Failed to update database' }, { status: 500 })
  }
}

// DELETE /api/databases - Delete database (tenant-scoped)
export async function DELETE(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request)
    const id = request.nextUrl.searchParams.get('id')
    if (!id) {
      return NextResponse.json({ error: 'Database ID required' }, { status: 400 })
    }

    // Verify database belongs to user
    const dbAccess = await db.database.findFirst({
      where: { id, project: { workspace: { userId: user.userId } } },
    })
    if (!dbAccess) {
      return NextResponse.json({ error: 'Database not found or access denied' }, { status: 403 })
    }

    await db.database.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode })
    }
    return NextResponse.json({ error: 'Failed to delete database' }, { status: 500 })
  }
}
