import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// GET /api/databases - List databases
export async function GET(request: NextRequest) {
  try {
    const projectId = request.nextUrl.searchParams.get('projectId')
    
    if (projectId) {
      const databases = await db.database.findMany({
        where: { projectId },
        include: { _count: { select: { datasets: true, conversations: true } } },
        orderBy: { updatedAt: 'desc' }
      })
      return NextResponse.json({ databases })
    }

    const databases = await db.database.findMany({
      include: { _count: { select: { datasets: true, conversations: true } } },
      orderBy: { updatedAt: 'desc' }
    })
    return NextResponse.json({ databases })
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch databases' }, { status: 500 })
  }
}

// POST /api/databases - Create database
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { name, dbType = 'postgresql', schemaJson = {}, dataJson = {}, projectId } = body

    if (!name || !projectId) {
      return NextResponse.json({ error: 'Name and projectId required' }, { status: 400 })
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
    return NextResponse.json({ error: 'Failed to create database' }, { status: 500 })
  }
}

// PATCH /api/databases - Update database
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json()
    const { id, name, schemaJson, dataJson } = body

    if (!id) {
      return NextResponse.json({ error: 'Database ID required' }, { status: 400 })
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
    return NextResponse.json({ error: 'Failed to update database' }, { status: 500 })
  }
}

// DELETE /api/databases - Delete database
export async function DELETE(request: NextRequest) {
  try {
    const id = request.nextUrl.searchParams.get('id')
    if (!id) {
      return NextResponse.json({ error: 'Database ID required' }, { status: 400 })
    }

    await db.database.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (error) {
    return NextResponse.json({ error: 'Failed to delete database' }, { status: 500 })
  }
}
