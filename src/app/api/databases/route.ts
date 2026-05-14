import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/admin'
import { getSupabaseServerClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  try {
    const admin = getSupabaseAdmin()
    if (!admin) {
      return NextResponse.json({ databases: [] })
    }

    // Check if a specific database ID was requested
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    // Get the authenticated user to filter databases
    let userId: string | null = null
    try {
      const supabase = await getSupabaseServerClient()
      const { data: { user } } = await supabase.auth.getUser()
      userId = user?.id || null
    } catch { /* continue without user filter */ }

    // If requesting a specific database by ID
    if (id) {
      let query = admin
        .from('synthetic_databases')
        .select('*')
        .eq('id', id)
        .single()

      const { data, error } = await query

      if (error) {
        console.warn('[Databases API] Query error:', error.message)
        return NextResponse.json({ database: null })
      }

      return NextResponse.json({ database: data })
    }

    // List all databases
    let query = admin
      .from('synthetic_databases')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50)

    // Filter by user_id if available (individual user mode)
    if (userId) {
      query = query.eq('user_id', userId)
    }

    const { data, error } = await query

    if (error) {
      console.warn('[Databases API] Query error:', error.message)
      return NextResponse.json({ databases: [] })
    }

    return NextResponse.json({ databases: data || [] })
  } catch (err) {
    console.error('[Databases API] Error:', err)
    return NextResponse.json({ databases: [] })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { name, db_type = 'postgresql', schema_json = [], data_json = {}, row_count = 0, quality_score = null, status = 'draft' } = body

    if (!name) {
      return NextResponse.json(
        { error: 'Name is required' },
        { status: 400 }
      )
    }

    const admin = getSupabaseAdmin()
    if (!admin) {
      return NextResponse.json({ error: 'Database service not configured' }, { status: 503 })
    }

    // Get the authenticated user
    let userId: string | null = null
    try {
      const supabase = await getSupabaseServerClient()
      const { data: { user } } = await supabase.auth.getUser()
      userId = user?.id || null
    } catch { /* continue without user */ }

    const insertData: Record<string, unknown> = {
      name,
      db_type,
      status,
      schema_json,
      data_json,
      row_count: row_count || 0,
      quality_score,
      ...(userId ? { user_id: userId } : {}),
    }

    const { data, error } = await admin
      .from('synthetic_databases')
      .insert(insertData)
      .select()
      .single()

    if (error) {
      console.error('[Databases API] Insert error:', error.message)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ database: data })
  } catch (err) {
    console.error('[Databases API] Error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json({ error: 'Database ID is required' }, { status: 400 })
    }

    const admin = getSupabaseAdmin()
    if (!admin) {
      return NextResponse.json({ error: 'Database service not configured' }, { status: 503 })
    }

    const { error } = await admin
      .from('synthetic_databases')
      .delete()
      .eq('id', id)

    if (error) {
      console.error('[Databases API] Delete error:', error.message)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[Databases API] Delete error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
