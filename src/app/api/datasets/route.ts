import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getAuthenticatedUser, AuthError, verifyDatabaseAccess } from '@/lib/auth'

// GET /api/datasets - List datasets (tenant-scoped)
export async function GET(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request)
    const databaseId = request.nextUrl.searchParams.get('databaseId')

    if (databaseId) {
      // Verify database belongs to user
      const dbAccess = await verifyDatabaseAccess(databaseId, user.userId)
      if (!dbAccess) {
        return NextResponse.json({ error: 'Database not found or access denied' }, { status: 403 })
      }

      const datasets = await db.dataset.findMany({
        where: { databaseId },
        orderBy: { createdAt: 'desc' }
      })
      return NextResponse.json({ datasets })
    }

    // List all datasets for user
    const datasets = await db.dataset.findMany({
      where: { database: { project: { workspace: { userId: user.userId } } } },
      orderBy: { createdAt: 'desc' }
    })
    return NextResponse.json({ datasets })
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode })
    }
    return NextResponse.json({ error: 'Failed to fetch datasets' }, { status: 500 })
  }
}

// POST /api/datasets - Create/save dataset (tenant-scoped)
export async function POST(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request)

    let body: Record<string, unknown>
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    const { name, format = 'json', rowCount = 0, dataJson = '[]', schemaJson = '{}', seed = 0, databaseId } = body as {
      name?: string; format?: string; rowCount?: number; dataJson?: unknown; schemaJson?: unknown; seed?: number; databaseId?: string
    }

    if (!name || typeof name !== 'string' || !name.trim()) {
      return NextResponse.json({ error: 'Name required' }, { status: 400 })
    }
    if (!databaseId || typeof databaseId !== 'string') {
      return NextResponse.json({ error: 'Name and databaseId required' }, { status: 400 })
    }

    // Verify database belongs to user
    const dbAccess = await verifyDatabaseAccess(databaseId, user.userId)
    if (!dbAccess) {
      return NextResponse.json({ error: 'Database not found or access denied' }, { status: 403 })
    }

    // Get current version count
    const existing = await db.dataset.count({ where: { name, databaseId } })
    const version = existing + 1

    const dataset = await db.dataset.create({
      data: {
        name,
        version,
        format,
        rowCount,
        dataJson: typeof dataJson === 'string' ? dataJson : JSON.stringify(dataJson),
        schemaJson: typeof schemaJson === 'string' ? schemaJson : JSON.stringify(schemaJson),
        seed,
        databaseId
      }
    })

    return NextResponse.json({ dataset })
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode })
    }
    return NextResponse.json({ error: 'Failed to create dataset' }, { status: 500 })
  }
}
