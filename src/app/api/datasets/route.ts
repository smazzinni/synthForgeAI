import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUser, AuthError } from '@/lib/auth'
import { getSupabaseAdmin } from '@/lib/supabase/admin'
import { db } from '@/lib/db'

// GET /api/datasets - List datasets
export async function GET(request: NextRequest) {
  try {
    const _user = await getAuthenticatedUser(request)
    const databaseId = request.nextUrl.searchParams.get('databaseId')

    if (db) {
      try {
        if (databaseId) {
          const datasets = await db.dataset.findMany({
            where: { databaseId },
            orderBy: { createdAt: 'desc' }
          })
          return NextResponse.json({ datasets })
        }
      } catch {
        // Fall through to Supabase
      }
    }

    // Try Supabase
    try {
      const admin = getSupabaseAdmin()
      const query = databaseId
        ? admin.from('datasets').select('*').eq('database_id', databaseId)
        : admin.from('datasets').select('*').limit(50)

      const { data, error } = await query
      if (!error && data) {
        return NextResponse.json({ datasets: data, source: 'supabase' })
      }
    } catch {
      // Fall through to mock
    }

    return NextResponse.json({ datasets: [], source: 'mock' })
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode })
    }
    return NextResponse.json({ datasets: [], source: 'mock' })
  }
}

// POST /api/datasets - Create/save dataset
export async function POST(request: NextRequest) {
  try {
    const _user = await getAuthenticatedUser(request)

    let body: Record<string, unknown>
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    const { name, format = 'json', rowCount = 0, dataJson = '[]', schemaJson = '{}', databaseId } = body as {
      name?: string; format?: string; rowCount?: number; dataJson?: unknown; schemaJson?: unknown; databaseId?: string
    }

    if (!name || typeof name !== 'string' || !name.trim()) {
      return NextResponse.json({ error: 'Name required' }, { status: 400 })
    }

    // Try Prisma first
    if (db && databaseId) {
      try {
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
            databaseId
          }
        })
        return NextResponse.json({ dataset })
      } catch {
        // Fall through to Supabase
      }
    }

    // Try Supabase
    if (databaseId) {
      try {
        const admin = getSupabaseAdmin()
        const { data, error } = await admin
          .from('datasets')
          .insert({
            name,
            format,
            row_count: rowCount,
            data_json: typeof dataJson === 'string' ? dataJson : JSON.stringify(dataJson),
            schema_json: typeof schemaJson === 'string' ? schemaJson : JSON.stringify(schemaJson),
            database_id: databaseId,
          })
          .select()
          .single()

        if (!error && data) {
          return NextResponse.json({ dataset: data })
        }
      } catch {
        // Fall through to mock
      }
    }

    // Mock response
    return NextResponse.json({
      dataset: {
        id: 'ds-' + Date.now(),
        name,
        format,
        rowCount,
        databaseId,
        version: 1,
      },
      source: 'mock',
    })
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode })
    }
    return NextResponse.json({ error: 'Failed to create dataset' }, { status: 500 })
  }
}
