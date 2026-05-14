import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// GET /api/datasets - List datasets
export async function GET(request: NextRequest) {
  try {
    const databaseId = request.nextUrl.searchParams.get('databaseId')
    
    if (databaseId) {
      const datasets = await db.dataset.findMany({
        where: { databaseId },
        orderBy: { createdAt: 'desc' }
      })
      return NextResponse.json({ datasets })
    }

    const datasets = await db.dataset.findMany({ orderBy: { createdAt: 'desc' } })
    return NextResponse.json({ datasets })
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch datasets' }, { status: 500 })
  }
}

// POST /api/datasets - Create/save dataset
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { name, format = 'json', rowCount = 0, dataJson = '[]', schemaJson = '{}', seed = 0, databaseId } = body

    if (!name || !databaseId) {
      return NextResponse.json({ error: 'Name and databaseId required' }, { status: 400 })
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
    return NextResponse.json({ error: 'Failed to create dataset' }, { status: 500 })
  }
}
