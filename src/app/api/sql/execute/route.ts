import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/admin'

// ─── SQL Execution API ───
// Executes SQL against the Supabase database and returns results

const ALLOWED_STATEMENTS = ['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'CREATE', 'ALTER', 'DROP', 'WITH']
const DANGEROUS_PATTERNS = [
  /;\s*DROP\s+DATABASE/i,
  /;\s*DROP\s+SCHEMA/i,
  /TRUNCATE\s+TABLE/i,
  /DELETE\s+FROM\s+\w+\s*;/i, // DELETE without WHERE
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

    // Check for dangerous patterns
    for (const pattern of DANGEROUS_PATTERNS) {
      if (pattern.test(trimmedSql)) {
        return NextResponse.json({
          error: 'This query contains a potentially destructive operation. Please confirm before executing.',
          requiresConfirmation: true,
          sql: trimmedSql,
        }, { status: 200 })
      }
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

        dataJson = db.data_json as Record<string, unknown[]> || {}
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

/**
 * Execute simplified SQL against in-memory data.
 * Supports: SELECT * FROM table, SELECT col1, col2 FROM table, WHERE clauses, LIMIT, ORDER BY
 */
function executeSQLAgainstData(
  sql: string,
  data: Record<string, unknown[]>
): { rows: Record<string, unknown>[]; columns: string[] } {
  const normalized = sql.trim().toUpperCase()

  // Parse SELECT statements
  if (normalized.startsWith('SELECT') || normalized.startsWith('WITH')) {
    return executeSelect(sql, data)
  }

  // For INSERT/UPDATE/DELETE, we return a message
  return {
    rows: [{ message: 'DML operations are simulated. Use the AI chat to modify data.', type: 'info' }],
    columns: ['message', 'type'],
  }
}

function executeSelect(
  sql: string,
  data: Record<string, unknown[]>
): { rows: Record<string, unknown>[]; columns: string[] } {
  // Simple SQL parser for SELECT statements
  const selectMatch = sql.match(/SELECT\s+(.*?)\s+FROM\s+(\w+)(?:\s+WHERE\s+(.*?))?(?:\s+ORDER\s+BY\s+(.*?))?(?:\s+LIMIT\s+(\d+))?$/is)

  if (!selectMatch) {
    // Try SELECT * FROM table
    const simpleMatch = sql.match(/SELECT\s+\*\s+FROM\s+(\w+)/i)
    if (simpleMatch) {
      const tableName = simpleMatch[1]
      const tableData = data[tableName]
      if (!tableData) {
        return { rows: [{ error: `Table "${tableName}" not found` }], columns: ['error'] }
      }
      const rows = tableData as Record<string, unknown>[]
      const columns = rows.length > 0 ? Object.keys(rows[0]) : []
      return { rows: rows.slice(0, 100), columns }
    }
    return { rows: [{ error: 'Could not parse SQL query. Try: SELECT * FROM table_name' }], columns: ['error'] }
  }

  const selectCols = selectMatch[1].trim()
  const tableName = selectMatch[2]
  const whereClause = selectMatch[3]
  const orderByClause = selectMatch[4]
  const limitClause = selectMatch[5]

  const tableData = data[tableName]
  if (!tableData) {
    return { rows: [{ error: `Table "${tableName}" not found. Available tables: ${Object.keys(data).join(', ')}` }], columns: ['error'] }
  }

  let rows = [...(tableData as Record<string, unknown>[])]

  // Apply WHERE
  if (whereClause) {
    rows = applyWhere(rows, whereClause)
  }

  // Apply ORDER BY
  if (orderByClause) {
    rows = applyOrderBy(rows, orderByClause)
  }

  // Apply column selection
  let columns: string[]
  if (selectCols === '*') {
    columns = rows.length > 0 ? Object.keys(rows[0]) : []
  } else {
    columns = selectCols.split(',').map(c => c.trim())
    rows = rows.map(row => {
      const filtered: Record<string, unknown> = {}
      for (const col of columns) {
        filtered[col] = row[col]
      }
      return filtered
    })
  }

  // Apply LIMIT
  if (limitClause) {
    const limit = parseInt(limitClause, 10)
    rows = rows.slice(0, limit)
  } else {
    rows = rows.slice(0, 100) // Default limit
  }

  return { rows, columns }
}

function applyWhere(rows: Record<string, unknown>[], where: string): Record<string, unknown>[] {
  // Simple WHERE parser: col = 'value', col > number, col LIKE '%pattern%'
  const conditions = where.split(/\s+AND\s+/i)

  return rows.filter(row => {
    return conditions.every(cond => {
      const trimmed = cond.trim()

      // col = 'value' or col = number
      const eqMatch = trimmed.match(/(\w+)\s*=\s*'?([^']*)'?/)
      if (eqMatch) {
        const col = eqMatch[1]
        const val = eqMatch[2]
        return String(row[col]) === val
      }

      // col > number
      const gtMatch = trimmed.match(/(\w+)\s*>\s*(\d+)/)
      if (gtMatch) {
        const col = gtMatch[1]
        const val = parseFloat(gtMatch[2])
        return typeof row[col] === 'number' && (row[col] as number) > val
      }

      // col < number
      const ltMatch = trimmed.match(/(\w+)\s*<\s*(\d+)/)
      if (ltMatch) {
        const col = ltMatch[1]
        const val = parseFloat(ltMatch[2])
        return typeof row[col] === 'number' && (row[col] as number) < val
      }

      // col LIKE '%pattern%'
      const likeMatch = trimmed.match(/(\w+)\s+LIKE\s+'%([^']+)%'/i)
      if (likeMatch) {
        const col = likeMatch[1]
        const pattern = likeMatch[2]
        return String(row[col] || '').toLowerCase().includes(pattern.toLowerCase())
      }

      return true
    })
  })
}

function applyOrderBy(rows: Record<string, unknown>[], orderBy: string): Record<string, unknown>[] {
  const parts = orderBy.trim().split(/\s+/)
  const col = parts[0]
  const dir = parts[1]?.toUpperCase() === 'DESC' ? -1 : 1

  return rows.sort((a, b) => {
    const aVal = a[col]
    const bVal = b[col]
    if (aVal === bVal) return 0
    if (aVal == null) return 1
    if (bVal == null) return -1
    if (typeof aVal === 'number' && typeof bVal === 'number') {
      return (aVal - bVal) * dir
    }
    return String(aVal).localeCompare(String(bVal)) * dir
  })
}
