import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/admin'
import { mockDatabases } from '@/lib/mock-data'

export async function GET(request: NextRequest) {
  try {
    const admin = getSupabaseAdmin()
    const { data, error } = await admin
      .from('synthetic_databases')
      .select('*')
      .limit(50)

    if (error) {
      // Fallback to mock data if tables don't exist
      return NextResponse.json({ data: mockDatabases, source: 'mock' })
    }

    return NextResponse.json({ data, source: 'supabase' })
  } catch {
    return NextResponse.json({ data: mockDatabases, source: 'mock' })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { name, project_id, db_type = 'postgresql' } = body

    if (!name || !project_id) {
      return NextResponse.json(
        { error: 'Name and project_id are required' },
        { status: 400 }
      )
    }

    try {
      const admin = getSupabaseAdmin()
      const { data, error } = await admin
        .from('synthetic_databases')
        .insert({
          name,
          project_id,
          db_type,
          status: 'draft',
          schema_json: [],
          data_json: {},
        })
        .select()
        .single()

      if (error) throw error
      return NextResponse.json({ data })
    } catch {
      // Mock response
      return NextResponse.json({
        data: {
          id: 'db-' + Date.now(),
          name,
          project_id,
          db_type,
          status: 'draft',
          row_count: 0,
          quality_score: null,
          schema_json: [],
          data_json: {},
        },
        source: 'mock',
      })
    }
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
