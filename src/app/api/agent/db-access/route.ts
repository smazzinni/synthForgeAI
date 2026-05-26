import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/admin'

// ─── AI Agent Database Access Endpoint ───
// Allows AI agents to query current DB structure, data, and chat history for context-aware generation
// Supports CRUD operations on generated databases and conversations

interface AgentDbQuery {
  action:
    | 'list_databases'
    | 'get_database'
    | 'get_tables'
    | 'get_conversation'
    | 'list_messages'
    | 'validate_schema'
    | 'list_snapshots'
    | 'get_snapshot'
    | 'create_snapshot'
    | 'restore_snapshot'
  databaseId?: string
  snapshotId?: string
  name?: string
  conversationId?: string
  limit?: number
  offset?: number
}

export async function POST(request: NextRequest) {
  try {
    const admin = getSupabaseAdmin()
    if (!admin) {
      return NextResponse.json({ error: 'Database not configured' }, { status: 503 })
    }

    const body: AgentDbQuery = await request.json()
    const { action, databaseId, conversationId, limit = 100, offset = 0 } = body

    // ─── List all available synthetic databases ───
    if (action === 'list_databases') {
      const { data, error } = await admin
        .from('synthetic_databases')
        .select('id, name, db_type, status, row_count, quality_score, schema_json, created_at, updated_at')
        .order('updated_at', { ascending: false })
        .limit(Math.min(limit, 100))
        .offset(offset)

      if (error) {
        console.error('[Agent DB] List databases error:', error.message)
        return NextResponse.json({ error: error.message }, { status: 500 })
      }

      return NextResponse.json({
        databases: data || [],
        count: data?.length || 0,
      })
    }

    // ─── Get single database with full data ───
    if (action === 'get_database') {
      if (!databaseId) {
        return NextResponse.json({ error: 'databaseId required' }, { status: 400 })
      }

      const { data, error } = await admin
        .from('synthetic_databases')
        .select('*')
        .eq('id', databaseId)
        .single()

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 })
      }

      if (!data) {
        return NextResponse.json({ error: 'Database not found' }, { status: 404 })
      }

      return NextResponse.json({ database: data })
    }

    // ─── Extract and return table structure ───
    if (action === 'get_tables') {
      if (!databaseId) {
        return NextResponse.json({ error: 'databaseId required' }, { status: 400 })
      }

      const { data, error } = await admin
        .from('synthetic_databases')
        .select('schema_json, data_json')
        .eq('id', databaseId)
        .single()

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 })
      }

      if (!data) {
        return NextResponse.json({ error: 'Database not found' }, { status: 404 })
      }

      const schemaJson = data.schema_json as Array<{ name: string; columns: Array<{ name: string; type: string }> }> | null
      const dataJson = data.data_json as Record<string, unknown[]> | null

      // Enrich schema with sample data and column statistics
      const enrichedTables = (schemaJson || []).map((table) => {
        const rows = (dataJson?.[table.name] as Record<string, unknown>[] | undefined) || []
        const sampleRows = rows.slice(0, 5)

        // Calculate column statistics
        const columnStats = table.columns.map((col) => {
          const values = rows
            .map((r) => r[col.name])
            .filter((v) => v !== null && v !== undefined)

          return {
            name: col.name,
            type: col.type,
            nullCount: rows.length - values.length,
            sampleValues: values.slice(0, 3),
            uniqueCount: new Set(values.map((v) => String(v))).size,
          }
        })

        return {
          name: table.name,
          rowCount: rows.length,
          columns: table.columns,
          columnStats,
          sampleRows,
        }
      })

      return NextResponse.json({ tables: enrichedTables })
    }

    // ─── Get conversation with full message history ───
    if (action === 'get_conversation') {
      if (!conversationId) {
        return NextResponse.json({ error: 'conversationId required' }, { status: 400 })
      }

      // Get conversation metadata
      const { data: conv, error: convErr } = await admin
        .from('conversations')
        .select('*')
        .eq('id', conversationId)
        .single()

      if (convErr) {
        return NextResponse.json({ error: convErr.message }, { status: 500 })
      }

      // Get all messages in conversation
      const { data: messages, error: msgErr } = await admin
        .from('messages')
        .select('*')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: true })

      if (msgErr) {
        return NextResponse.json({ error: msgErr.message }, { status: 500 })
      }

      return NextResponse.json({
        conversation: conv,
        messages: messages || [],
      })
    }

    // ─── List recent messages ───
    if (action === 'list_messages') {
      let query = admin
        .from('messages')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(Math.min(limit, 100))
        .offset(offset)

      if (conversationId) {
        query = query.eq('conversation_id', conversationId)
      }

      const { data, error } = await query

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 })
      }

      return NextResponse.json({ messages: data || [] })
    }

    // ─── List saved snapshots for a database ───
    if (action === 'list_snapshots') {
      if (!databaseId) {
        return NextResponse.json({ error: 'databaseId required' }, { status: 400 })
      }

      const { data, error } = await admin
        .from('datasets')
        .select('id, name, version, row_count, quality_score, created_at')
        .eq('database_id', databaseId)
        .order('version', { ascending: false })
        .limit(Math.min(limit, 100))
        .offset(offset)

      if (error) {
        console.error('[Agent DB] List snapshots error:', error.message)
        return NextResponse.json({ error: error.message }, { status: 500 })
      }

      return NextResponse.json({ snapshots: data || [], count: data?.length || 0 })
    }

    // ─── Get a saved snapshot by ID ───
    if (action === 'get_snapshot') {
      if (!body.snapshotId) {
        return NextResponse.json({ error: 'snapshotId required' }, { status: 400 })
      }

      const { data, error } = await admin
        .from('datasets')
        .select('*')
        .eq('id', body.snapshotId)
        .single()

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 })
      }

      if (!data) {
        return NextResponse.json({ error: 'Snapshot not found' }, { status: 404 })
      }

      return NextResponse.json({ snapshot: data })
    }

    // ─── Create a snapshot of the current database state ───
    if (action === 'create_snapshot') {
      if (!databaseId) {
        return NextResponse.json({ error: 'databaseId required' }, { status: 400 })
      }

      const { data: currentDb, error: currentDbErr } = await admin
        .from('synthetic_databases')
        .select('id, schema_json, data_json, row_count, quality_score')
        .eq('id', databaseId)
        .single()

      if (currentDbErr) {
        return NextResponse.json({ error: currentDbErr.message }, { status: 500 })
      }

      if (!currentDb) {
        return NextResponse.json({ error: 'Database not found' }, { status: 404 })
      }

      const { data: latestSnapshot, error: latestErr } = await admin
        .from('datasets')
        .select('version')
        .eq('database_id', databaseId)
        .order('version', { ascending: false })
        .limit(1)
        .maybeSingle()

      const nextVersion = ((latestSnapshot?.version as number | null) || 0) + 1
      const snapshotName = body.name || `snapshot-${new Date().toISOString()}`

      const { data: inserted, error: insertErr } = await admin
        .from('datasets')
        .insert({
          database_id: databaseId,
          name: snapshotName,
          version: nextVersion,
          format: 'json',
          data_json: currentDb.data_json,
          schema_json: currentDb.schema_json,
          row_count: currentDb.row_count ?? 0,
          quality_score: currentDb.quality_score ?? null,
        })
        .select()
        .single()

      if (insertErr) {
        console.error('[Agent DB] Create snapshot error:', insertErr.message)
        return NextResponse.json({ error: insertErr.message }, { status: 500 })
      }

      return NextResponse.json({ snapshot: inserted })
    }

    // ─── Restore a database from a saved snapshot ───
    if (action === 'restore_snapshot') {
      if (!body.snapshotId) {
        return NextResponse.json({ error: 'snapshotId required' }, { status: 400 })
      }

      const { data: snapshot, error: snapshotErr } = await admin
        .from('datasets')
        .select('*')
        .eq('id', body.snapshotId)
        .single()

      if (snapshotErr) {
        return NextResponse.json({ error: snapshotErr.message }, { status: 500 })
      }
      // Snapshot restore functionality is disabled per project requirements.
      return NextResponse.json({ error: 'Rollback functionality is disabled' }, { status: 403 })
    }

    // ─── Validate schema against data ───
    if (action === 'validate_schema') {
      if (!databaseId) {
        return NextResponse.json({ error: 'databaseId required' }, { status: 400 })
      }

      const { data, error } = await admin
        .from('synthetic_databases')
        .select('schema_json, data_json')
        .eq('id', databaseId)
        .single()

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 })
      }

      const schemaJson = data?.schema_json as Array<{ name: string; columns: Array<{ name: string; type: string }> }> | null
      const dataJson = data?.data_json as Record<string, unknown[]> | null

      const validationIssues: Array<{ table: string; column: string; issue: string; count: number }> = []

      for (const table of schemaJson || []) {
        const rows = dataJson?.[table.name] as Record<string, unknown>[] | undefined
        if (!rows) {
          validationIssues.push({ table: table.name, column: '', issue: 'No data found for table', count: 0 })
          continue
        }

        for (const col of table.columns) {
          const values = rows.map((r) => r[col.name])
          const nullCount = values.filter((v) => v === null || v === undefined).length

          // Check for completely null columns
          if (nullCount === rows.length) {
            validationIssues.push({
              table: table.name,
              column: col.name,
              issue: 'Column contains all NULL values',
              count: rows.length,
            })
          }

          // Type-specific validation
          if (col.type.toLowerCase().includes('date') || col.type.toLowerCase().includes('timestamp')) {
            const invalidDates = values.filter((v) => {
              if (v === null || v === undefined) return false
              const d = new Date(v as string)
              return isNaN(d.getTime())
            }).length

            if (invalidDates > 0) {
              validationIssues.push({
                table: table.name,
                column: col.name,
                issue: `Invalid date values found (${col.type})`,
                count: invalidDates,
              })
            }
          }

          // UUID validation for _id columns
          if ((col.name === 'id' || col.name.endsWith('_id')) && col.type.toLowerCase().includes('uuid')) {
            const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
            const invalidUuids = values.filter((v) => {
              if (v === null || v === undefined) return false
              return !uuidRe.test(String(v))
            }).length

            if (invalidUuids > 0) {
              validationIssues.push({
                table: table.name,
                column: col.name,
                issue: `Invalid UUID format`,
                count: invalidUuids,
              })
            }
          }
        }
      }

      return NextResponse.json({
        isValid: validationIssues.length === 0,
        issues: validationIssues,
      })
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  } catch (err) {
    console.error('[Agent DB] Error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
