import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// GET /api/datasets?databaseId=xxx
export async function GET(request: NextRequest) {
  try {
    const databaseId = request.nextUrl.searchParams.get('databaseId')
    if (!databaseId) {
      return NextResponse.json({ error: 'databaseId required' }, { status: 400 })
    }

    const datasets = await db.dataset.findMany({
      where: { databaseId },
      orderBy: { createdAt: 'desc' }
    })

    return NextResponse.json({ datasets })
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch datasets' }, { status: 500 })
  }
}
