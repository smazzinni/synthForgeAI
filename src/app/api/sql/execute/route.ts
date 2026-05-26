import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/admin'
import { executeSQLAgainstData } from '@/lib/sql-executor'

// ─── SQL Execution API ───
// Executes SQL against the Supabase database and returns results

const ALLOWED_STATEMENTS = ['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'CREATE', 'ALTER', 'DROP', 'WITH']
const DANGEROUS_PATTERNS = [
  /;\s*DROP\s+DATABASE/i,
  /;\s*DROP\s+SCHEMA/i,
  /TRUNCATE\s+TABLE/i,
]

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { sql, databaseId, data: clientData } = body as { sql: string; databaseId?: string; data?: Record<string, unknown[]> }

    if (!sql || typeof sql !== 'string') {
      return NextResponse.json({ error: 'SQL query is required' }, { status: 400 })
    }

    const trimmedSql = sql.trim()
    if (trimmedSql.length === 0) {
      return NextResponse.json({ error: 'SQL query cannot be empty' }, { status: 400 })
    }

    if (trimmedSql.length > 10000) {
      return NextResponse.json({ error: 'SQL query too long (max 10,000 characters)' }, { status: 400 })
    }

    // Basic validation: check for allowed statement types
    const firstWord = trimmedSql.split(/\s+/)[0]?.toUpperCase() || ''
    const isWithCTE = firstWord === 'WITH'
    if (!ALLOWED_STATEMENTS.includes(firstWord) && !isWithCTE) {
      return NextResponse.json({ error: `Statement type "${firstWord}" is not allowed` }, { status: 400 })
    }

    // Check for potentially destructive operations and require confirmation
    for (const pattern of DANGEROUS_PATTERNS) {
      if (pattern.test(trimmedSql)) {
        return NextResponse.json({
          error: 'This query contains a potentially destructive operation. Please confirm before executing.',
          requiresConfirmation: true,
          sql: trimmedSql,
        }, { status: 200 })
      }
    }

    // Additional check: DELETE without WHERE should prompt for confirmation
    if (/^\s*DELETE\b/i.test(trimmedSql) && !/\bWHERE\b/i.test(trimmedSql)) {
      return NextResponse.json({
        error: 'DELETE without WHERE detected. Please confirm before executing.',
        requiresConfirmation: true,
        sql: trimmedSql,
      }, { status: 200 })
    }

    const admin = getSupabaseAdmin()
    if (!admin) {
      return NextResponse.json({ error: 'Database service not configured' }, { status: 503 })
    }

    const startTime = Date.now()

    // Try using RPC for raw SQL execution, fall back to data_json based approach
    try {
      // Use Supabase's rpc() or from() based approach
      // Since we can't execute raw SQL directly, we'll work with the stored data

      let dataJson: Record<string, unknown[]> = {}

      if (databaseId) {
        // Fetch the database data from Supabase
        const { data: db, error: dbError } = await admin
          .from('synthetic_databases')
          .select('data_json, schema_json')
          .eq('id', databaseId)
          .single()

        if (dbError || !db) {
          return NextResponse.json({ error: 'Database not found' }, { status: 404 })
        }

        const dbRow: any = db
        dataJson = (dbRow.data_json as Record<string, unknown[]>) || {}
      } else if (clientData && Object.keys(clientData).length > 0) {
        // Use client-side data when no databaseId is available
        dataJson = clientData
      } else {
        return NextResponse.json({
          error: 'No database selected. Please generate some data first before executing SQL.',
        }, { status: 400 })
      }

      const result = executeSQLAgainstData(trimmedSql, dataJson)
      const executionTime = Date.now() - startTime

      return NextResponse.json({
        rows: result.rows,
        columns: result.columns,
        rowCount: result.rows.length,
        executionTime,
        sql: trimmedSql,
      })
    } catch (execError) {
      const executionTime = Date.now() - startTime
      return NextResponse.json({
        error: execError instanceof Error ? execError.message : 'SQL execution failed',
        executionTime,
        sql: trimmedSql,
      }, { status: 200 })
    }
  } catch (err) {
    console.error('[SQL Execute API] Error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// Implementations moved to src/lib/sql-executor.ts for testability
