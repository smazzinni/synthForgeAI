import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// GET /api/databases?projectId=xxx
export async function GET(request: NextRequest) {
  try {
    const projectId = request.nextUrl.searchParams.get('projectId')
    if (!projectId) {
      return NextResponse.json({ error: 'projectId required' }, { status: 400 })
    }

    const databases = await db.database.findMany({
      where: { projectId },
      orderBy: { updatedAt: 'desc' },
      include: {
        _count: { select: { datasets: true, conversations: true } }
      }
    })
    return NextResponse.json({ databases })
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch databases' }, { status: 500 })
  }
}

// POST /api/databases
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { name, dbType, schemaJson, projectId } = body

    const database = await db.database.create({
      data: {
        name: name || 'Untitled Database',
        dbType: dbType || 'sqlite',
        schemaJson: typeof schemaJson === 'string' ? schemaJson : JSON.stringify(schemaJson || {}),
        projectId
      }
    })

    return NextResponse.json({ database }, { status: 201 })
  } catch (error) {
    return NextResponse.json({ error: 'Failed to create database' }, { status: 500 })
  }
}

// PUT /api/databases - Update schema
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json()
    const { id, schemaJson, name } = body

    const database = await db.database.update({
      where: { id },
      data: {
        ...(schemaJson && { schemaJson: typeof schemaJson === 'string' ? schemaJson : JSON.stringify(schemaJson) }),
        ...(name && { name })
      }
    })

    return NextResponse.json({ database })
  } catch (error) {
    return NextResponse.json({ error: 'Failed to update database' }, { status: 500 })
  }
}
