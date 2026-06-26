import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/admin'
import { executeSqlOnExternalConnection } from '@/lib/db-connections/executor'
import { isDestructiveSQL, stripSqlComments } from '@/lib/ai-agents'

// ─── SQL Execution API ───
// Executes SQL against either:
//   (a) the app's synthetic database record stored in Supabase, OR
//   (b) a live external Postgres/MySQL connection the user has saved, OR
//   (c) client-side in-memory data (when no DB id or connection is supplied)
//
// For mutations (INSERT/UPDATE/DELETE/CREATE/ALTER/DROP/TRUNCATE) the route
// applies the change to the underlying store and returns the refreshed
// `data_json` + `schema_json` so the client can update its local state.

const ALLOWED_STATEMENTS = ['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'CREATE', 'ALTER', 'DROP', 'WITH', 'TRUNCATE']
const DANGEROUS_PATTERNS = [
  /;\s*DROP\s+DATABASE/i,
  /;\s*DROP\s+SCHEMA/i,
]

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const {
      sql,
      databaseId,
      data: clientData,
      connectionId,
      skipDangerousCheck = false,
    } = body as {
      sql: string
      databaseId?: string
      data?: Record<string, unknown[]>
      connectionId?: string
      skipDangerousCheck?: boolean
    }

    if (!sql || typeof sql !== 'string') {
      return NextResponse.json({ error: 'SQL query is required' }, { status: 400 })
    }

    const trimmedSql = sql.trim()
    if (trimmedSql.length === 0) {
      return NextResponse.json({ error: 'SQL query cannot be empty' }, { status: 400 })
    }

    if (trimmedSql.length > 100000) {
      return NextResponse.json({ error: 'SQL query too long (max 100,000 characters)' }, { status: 400 })
    }

    // Strip leading SQL line/block comments before classifying the statement.
    // The AI is instructed to prefix destructive statements with explanatory
    // `-- DESTRUCTIVE: ...` comments, so without stripping the firstWord
    // check would always be `--` and reject every AI-generated query.
    const strippedForCheck = stripSqlComments(trimmedSql)
    const firstWord = strippedForCheck.split(/\s+/)[0]?.toUpperCase() || ''
    if (!ALLOWED_STATEMENTS.includes(firstWord)) {
      return NextResponse.json({ error: `Statement type "${firstWord}" is not allowed` }, { status: 400 })
    }

    // Check for catastrophic dangerous patterns (unless caller explicitly skips)
    // Strip single-quoted string literals first so keywords inside string
    // values don't trigger false positives.
    if (!skipDangerousCheck) {
      const literalStripped = strippedForCheck.replace(/'[^']*'/g, "''")
      for (const pattern of DANGEROUS_PATTERNS) {
        if (pattern.test(literalStripped)) {
          return NextResponse.json({
            error: 'This query contains a potentially destructive operation. Please confirm before executing.',
            requiresConfirmation: true,
            sql: trimmedSql,
          }, { status: 200 })
        }
      }
      // Also use the improved isDestructiveSQL which handles comments and
      // multi-statement SQL — surfaces a confirmation dialog to the user.
      if (isDestructiveSQL(strippedForCheck)) {
        return NextResponse.json({
          error: 'This is a destructive operation. Please confirm before executing.',
          requiresConfirmation: true,
          destructive: true,
          sql: trimmedSql,
        }, { status: 200 })
      }
    }

    // ─── External DB path ───
    // If a connectionId is supplied, execute the SQL live against the
    // user-supplied external Postgres/MySQL database.
    if (connectionId) {
      const result = await executeSqlOnExternalConnection(connectionId, trimmedSql)
      return NextResponse.json(result, { status: result.error ? 400 : 200 })
    }

    // ─── Synthetic DB path (existing behavior, enhanced) ───
    const admin = getSupabaseAdmin()
    if (!admin) {
      return NextResponse.json({ error: 'Database service not configured' }, { status: 503 })
    }

    const startTime = Date.now()

    let dataJson: Record<string, unknown[]> = {}
    let schemaJson: Array<{ name: string; columns: Array<{ name: string; type: string }> }> = []
    let liveDatabaseId: string | undefined = databaseId

    if (databaseId) {
      const { data: db, error: dbError } = await admin
        .from('synthetic_databases')
        .select('data_json, schema_json')
        .eq('id', databaseId)
        .single()

      if (dbError || !db) {
        return NextResponse.json({ error: 'Database not found' }, { status: 404 })
      }

      dataJson = (db.data_json as Record<string, unknown[]>) || {}
      schemaJson = (db.schema_json as Array<{ name: string; columns: Array<{ name: string; type: string }> }>) || []
    } else if (clientData && Object.keys(clientData).length > 0) {
      dataJson = clientData
    } else {
      return NextResponse.json({
        error: 'No database selected. Please generate some data first before executing SQL.',
      }, { status: 400 })
    }

    // Execute the SQL against the in-memory data
    const result = executeSQLAgainstData(trimmedSql, dataJson, schemaJson)
    const executionTime = Date.now() - startTime

    // If the statement mutated data, persist the updated data_json back to
    // Supabase so subsequent reads see the new state. We also return the
    // refreshed data so the client can update its local copy.
    if (result.mutated && liveDatabaseId) {
      try {
        const updatePayload: Record<string, unknown> = {
          data_json: result.dataAfter,
          row_count: Object.values(result.dataAfter).reduce((sum, rows) => sum + (Array.isArray(rows) ? rows.length : 0), 0),
        }
        if (result.schemaAfter) {
          updatePayload.schema_json = result.schemaAfter
        }
        await admin
          .from('synthetic_databases')
          .update(updatePayload)
          .eq('id', liveDatabaseId)
      } catch (err) {
        console.warn('[SQL Execute API] Failed to persist mutation:', err)
      }
    }

    return NextResponse.json({
      rows: result.rows,
      columns: result.columns,
      rowCount: result.rows.length,
      affectedRows: result.affectedRows,
      executionTime,
      sql: trimmedSql,
      refreshedData: result.mutated ? result.dataAfter : undefined,
      refreshedSchema: result.mutated ? (result.schemaAfter || schemaJson) : undefined,
    })
  } catch (err) {
    console.error('[SQL Execute API] Error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// ─── In-memory SQL execution (synthetic data mode) ───

interface SqlExecResult {
  rows: Record<string, unknown>[]
  columns: string[]
  affectedRows: number
  mutated: boolean
  dataAfter: Record<string, unknown[]>
  schemaAfter?: Array<{ name: string; columns: Array<{ name: string; type: string }> }>
}

function executeSQLAgainstData(
  sql: string,
  data: Record<string, unknown[]>,
  schema: Array<{ name: string; columns: Array<{ name: string; type: string }> }>,
): SqlExecResult {
  const normalized = sql.trim().toUpperCase()
  const dataCopy: Record<string, unknown[]> = JSON.parse(JSON.stringify(data))

  // SELECT
  if (normalized.startsWith('SELECT') || normalized.startsWith('WITH')) {
    const result = executeSelect(sql, dataCopy)
    return {
      rows: result.rows,
      columns: result.columns,
      affectedRows: 0,
      mutated: false,
      dataAfter: dataCopy,
      schemaAfter: schema,
    }
  }

  // INSERT
  if (normalized.startsWith('INSERT')) {
    const result = executeInsert(sql, dataCopy)
    return {
      rows: [{ message: `Inserted ${result.affectedRows} row(s)`, type: 'info' }],
      columns: ['message', 'type'],
      affectedRows: result.affectedRows,
      mutated: result.affectedRows > 0,
      dataAfter: dataCopy,
      schemaAfter: schema,
    }
  }

  // UPDATE
  if (normalized.startsWith('UPDATE')) {
    const result = executeUpdate(sql, dataCopy)
    return {
      rows: [{ message: `Updated ${result.affectedRows} row(s)`, type: 'info' }],
      columns: ['message', 'type'],
      affectedRows: result.affectedRows,
      // BUGFIX (BUG-32): only mark as mutated if rows actually changed,
      // otherwise we persist an identical data_json back to Supabase.
      mutated: result.affectedRows > 0,
      dataAfter: dataCopy,
      schemaAfter: schema,
    }
  }

  // DELETE
  if (normalized.startsWith('DELETE')) {
    const result = executeDelete(sql, dataCopy)
    return {
      rows: [{ message: `Deleted ${result.affectedRows} row(s)`, type: 'info' }],
      columns: ['message', 'type'],
      affectedRows: result.affectedRows,
      mutated: result.affectedRows > 0,
      dataAfter: dataCopy,
      schemaAfter: schema,
    }
  }

  // CREATE TABLE
  if (normalized.startsWith('CREATE')) {
    const result = executeCreate(sql, dataCopy, schema)
    return {
      rows: [{ message: result.message, type: 'info' }],
      columns: ['message', 'type'],
      affectedRows: 0,
      mutated: result.mutated,
      dataAfter: dataCopy,
      schemaAfter: result.schema,
    }
  }

  // ALTER / DROP / TRUNCATE
  if (normalized.startsWith('ALTER') || normalized.startsWith('DROP') || normalized.startsWith('TRUNCATE')) {
    const result = executeAlterDropTruncate(sql, dataCopy, schema)
    return {
      rows: [{ message: result.message, type: 'info' }],
      columns: ['message', 'type'],
      affectedRows: result.affectedRows,
      mutated: result.mutated,
      dataAfter: dataCopy,
      schemaAfter: result.schema,
    }
  }

  return {
    rows: [{ message: 'Unsupported statement', type: 'error' }],
    columns: ['message', 'type'],
    affectedRows: 0,
    mutated: false,
    dataAfter: dataCopy,
    schemaAfter: schema,
  }
}

function executeSelect(
  sql: string,
  data: Record<string, unknown[]>,
): { rows: Record<string, unknown>[]; columns: string[] } {
  const selectMatch = sql.match(/SELECT\s+(.*?)\s+FROM\s+(\w+)(?:\s+WHERE\s+(.*?))?(?:\s+ORDER\s+BY\s+(.*?))?(?:\s+LIMIT\s+(\d+))?$/is)

  if (!selectMatch) {
    const simpleMatch = sql.match(/SELECT\s+\*\s+FROM\s+(\w+)/i)
    if (simpleMatch) {
      const tableName = simpleMatch[1]
      const tableData = data[tableName]
      if (!tableData) {
        return { rows: [{ error: `Table "${tableName}" not found` }], columns: ['error'] }
      }
      const rows = tableData as Record<string, unknown>[]
      const columns = rows.length > 0 ? Object.keys(rows[0]) : []
      return { rows: rows.slice(0, 500), columns }
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

  if (whereClause) rows = applyWhere(rows, whereClause)
  if (orderByClause) rows = applyOrderBy(rows, orderByClause)

  let columns: string[]
  if (selectCols === '*') {
    columns = rows.length > 0 ? Object.keys(rows[0]) : []
  } else {
    columns = selectCols.split(',').map(c => c.trim())
    rows = rows.map(row => {
      const filtered: Record<string, unknown> = {}
      for (const col of columns) filtered[col] = row[col]
      return filtered
    })
  }

  if (limitClause) {
    const limit = parseInt(limitClause, 10)
    rows = rows.slice(0, limit)
  } else {
    rows = rows.slice(0, 500)
  }

  return { rows, columns }
}

function applyWhere(rows: Record<string, unknown>[], where: string): Record<string, unknown>[] {
  // Strip trailing clauses the main regex didn't capture (ORDER BY / LIMIT)
  const cleaned = where.replace(/\s+ORDER\s+BY\s+.*$/is, '').replace(/\s+LIMIT\s+\d+.*$/is, '').trim()
  const conditions = cleaned.split(/\s+AND\s+/i)

  return rows.filter(row => {
    return conditions.every(cond => {
      const trimmed = cond.trim()

      // IS NULL / IS NOT NULL
      const isNullMatch = trimmed.match(/(\w+)\s+IS\s+NOT\s+NULL$/i)
      if (isNullMatch) {
        return row[isNullMatch[1]] !== null && row[isNullMatch[1]] !== undefined
      }
      const isNotNullMatch = trimmed.match(/(\w+)\s+IS\s+NULL$/i)
      if (isNotNullMatch) {
        return row[isNotNullMatch[1]] === null || row[isNotNullMatch[1]] === undefined
      }

      // IN (v1, v2, ...)
      const inMatch = trimmed.match(/(\w+)\s+IN\s*\(([^)]+)\)/i)
      if (inMatch) {
        const col = inMatch[1]
        const values = inMatch[2].split(',').map(v => parseScalar(v.trim()))
        return values.some(v => row[col] === v || String(row[col]) === String(v))
      }

      // !=, <> (not equal)
      const neMatch = trimmed.match(/(\w+)\s*(?:!=|<>)\s*'?([^']*)'?/)
      if (neMatch) {
        const col = neMatch[1]
        const val = neMatch[2]
        // BUGFIX (BUG-27): previously unrecognized operators fell through to
        // `return true`, which meant `WHERE age != 18` matched ALL rows.
        return String(row[col]) !== val
      }

      // >=, <= (must be checked BEFORE > and <)
      const gteMatch = trimmed.match(/(\w+)\s*>=\s*'?([^']*)'?/)
      if (gteMatch) {
        const col = gteMatch[1]
        const val = Number(gteMatch[2])
        if (!Number.isNaN(val)) {
          return typeof row[col] === 'number' && (row[col] as number) >= val
        }
        return String(row[col]) >= gteMatch[2]
      }
      const lteMatch = trimmed.match(/(\w+)\s*<=\s*'?([^']*)'?/)
      if (lteMatch) {
        const col = lteMatch[1]
        const val = Number(lteMatch[2])
        if (!Number.isNaN(val)) {
          return typeof row[col] === 'number' && (row[col] as number) <= val
        }
        return String(row[col]) <= lteMatch[2]
      }

      const eqMatch = trimmed.match(/(\w+)\s*=\s*'?([^']*)'?/)
      if (eqMatch) {
        const col = eqMatch[1]
        const val = eqMatch[2]
        return String(row[col]) === val
      }
      const gtMatch = trimmed.match(/(\w+)\s*>\s*(\d+)/)
      if (gtMatch) {
        const col = gtMatch[1]
        const val = parseFloat(gtMatch[2])
        return typeof row[col] === 'number' && (row[col] as number) > val
      }
      const ltMatch = trimmed.match(/(\w+)\s*<\s*(\d+)/)
      if (ltMatch) {
        const col = ltMatch[1]
        const val = parseFloat(ltMatch[2])
        return typeof row[col] === 'number' && (row[col] as number) < val
      }
      const likeMatch = trimmed.match(/(\w+)\s+LIKE\s+'%([^']+)%'/i)
      if (likeMatch) {
        const col = likeMatch[1]
        const pattern = likeMatch[2]
        return String(row[col] || '').toLowerCase().includes(pattern.toLowerCase())
      }
      // BUGFIX (BUG-27): previously returned `true` for unrecognized
      // operators, causing `WHERE !=`, `WHERE IN`, etc. to match all rows.
      // Now we return `false` so the row is excluded — safer default that
      // prevents accidental mass-DELETE/UPDATE.
      return false
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
    if (typeof aVal === 'number' && typeof bVal === 'number') return (aVal - bVal) * dir
    return String(aVal).localeCompare(String(bVal)) * dir
  })
}

// ─── INSERT ───
// Supports: INSERT INTO table (col1, col2, ...) VALUES (v1, v2, ...), (v3, v4, ...)
function executeInsert(
  sql: string,
  data: Record<string, unknown[]>,
): { affectedRows: number } {
  const match = sql.match(/INSERT\s+INTO\s+(\w+)\s*(?:\(([^)]+)\))?\s*VALUES\s*([\s\S]+);?$/i)
  if (!match) return { affectedRows: 0 }

  const tableName = match[1]
  const colList = match[2]?.split(',').map(c => c.trim())
  const valuesSection = match[3].trim().replace(/;$/, '')

  // Split into individual tuples — naive but works for typical test data
  const tuples: string[] = []
  let depth = 0
  let current = ''
  let inStr = false
  for (const ch of valuesSection) {
    if (ch === "'" && (current.length === 0 || current[current.length - 1] !== '\\')) inStr = !inStr
    if (!inStr) {
      if (ch === '(') { depth++; if (depth === 1) { current = ''; continue } }
      if (ch === ')') { depth--; if (depth === 0) { tuples.push(current); current = ''; continue } }
    }
    if (depth >= 1) current += ch
  }

  if (!data[tableName]) data[tableName] = []
  const tableRows = data[tableName] as Record<string, unknown>[]

  let inserted = 0
  for (const tuple of tuples) {
    const values = parseValueList(tuple)
    const row: Record<string, unknown> = {}
    if (colList && colList.length > 0) {
      colList.forEach((col, i) => {
        row[col] = values[i] ?? null
      })
    } else if (tableRows.length > 0) {
      // Use the columns from the first existing row
      const existingCols = Object.keys(tableRows[0])
      existingCols.forEach((col, i) => {
        row[col] = values[i] ?? null
      })
    } else {
      values.forEach((v, i) => { row[`col_${i + 1}`] = v })
    }
    // BUGFIX (BUG-34): only auto-generate an `id` column when the table
    // actually has one. The previous version unconditionally added
    // `row.id = crypto.randomUUID()` even for tables that use a different
    // primary key (e.g. `user_id`), polluting the data with a phantom
    // column that doesn't exist in the schema.
    const tableHasIdColumn =
      (colList && colList.includes('id')) ||
      (!colList && tableRows.length > 0 && 'id' in (tableRows[0] as Record<string, unknown>))
    if (tableHasIdColumn && !row.id) {
      row.id = crypto.randomUUID()
    }
    tableRows.push(row)
    inserted++
  }

  return { affectedRows: inserted }
}

function parseValueList(tuple: string): unknown[] {
  const values: unknown[] = []
  let i = 0
  while (i < tuple.length) {
    // Skip whitespace & commas
    while (i < tuple.length && (tuple[i] === ' ' || tuple[i] === ',' || tuple[i] === '\t' || tuple[i] === '\n')) i++
    if (i >= tuple.length) break

    if (tuple[i] === "'") {
      // String literal
      i++
      let str = ''
      while (i < tuple.length) {
        if (tuple[i] === "'" && tuple[i + 1] === "'") { str += "'"; i += 2; continue }
        if (tuple[i] === "'") { i++; break }
        str += tuple[i]; i++
      }
      values.push(str)
    } else if (tuple[i] === '"') {
      i++
      let str = ''
      while (i < tuple.length && tuple[i] !== '"') { str += tuple[i]; i++ }
      i++
      values.push(str)
    } else {
      // Number, boolean, or NULL
      let token = ''
      while (i < tuple.length && tuple[i] !== ',' && tuple[i] !== ' ' && tuple[i] !== '\t' && tuple[i] !== '\n') {
        token += tuple[i]; i++
      }
      if (token.toUpperCase() === 'NULL') values.push(null)
      else if (token.toUpperCase() === 'TRUE') values.push(true)
      else if (token.toUpperCase() === 'FALSE') values.push(false)
      else {
        const num = Number(token)
        values.push(Number.isNaN(num) ? token : num)
      }
    }
  }
  return values
}

// ─── UPDATE ───
// Supports: UPDATE table SET col1 = v1, col2 = v2 WHERE ...
function executeUpdate(
  sql: string,
  data: Record<string, unknown[]>,
): { affectedRows: number } {
  const match = sql.match(/UPDATE\s+(\w+)\s+SET\s+(.*?)(?:\s+WHERE\s+(.*))?$/is)
  if (!match) return { affectedRows: 0 }

  const tableName = match[1]
  const setClause = match[2].trim()
  const whereClause = match[3]?.trim() || ''

  const tableData = data[tableName] as Record<string, unknown>[] | undefined
  if (!tableData) return { affectedRows: 0 }

  // Parse SET assignments — split on commas at paren-depth 0 AND outside
  // single-quoted strings, so values like `name='a, b'` or `coords=(1,2)`
  // don't break the parser.
  const assignments: Array<{ col: string; value: unknown }> = []
  for (const part of splitOnTopLevelCommas(setClause)) {
    const m = part.trim().match(/(\w+)\s*=\s*(.*)$/s)
    if (!m) continue
    const col = m[1]
    const rawVal = m[2].trim().replace(/;$/, '')
    assignments.push({ col, value: parseScalar(rawVal) })
  }

  let updated = 0
  const candidateRows = whereClause ? applyWhere([...tableData], whereClause) : tableData
  const candidateIds = new Set(candidateRows.map(r => (r as { id?: unknown }).id))

  for (const row of tableData) {
    if (whereClause && !candidateIds.has((row as { id?: unknown }).id)) continue
    for (const a of assignments) (row as Record<string, unknown>)[a.col] = a.value
    updated++
  }

  return { affectedRows: updated }
}

/**
 * Split a string on commas that are at paren-depth 0 AND outside
 * single-quoted strings. Used for SET clauses (`a=1, b='x,y', c=(1,2)`)
 * and CREATE TABLE column definitions (`price decimal(10,2), name varchar(255)`).
 */
function splitOnTopLevelCommas(input: string): string[] {
  const parts: string[] = []
  let depth = 0
  let inString = false
  let current = ''
  for (let i = 0; i < input.length; i++) {
    const ch = input[i]
    if (ch === "'" && input[i + 1] === "'") { current += "''"; i++; continue }
    if (ch === "'") { inString = !inString; current += ch; continue }
    if (inString) { current += ch; continue }
    if (ch === '(') { depth++; current += ch; continue }
    if (ch === ')') { depth--; current += ch; continue }
    if (ch === ',' && depth === 0) { parts.push(current); current = ''; continue }
    current += ch
  }
  if (current.trim()) parts.push(current)
  return parts
}

function parseScalar(raw: string): unknown {
  const v = raw.trim()
  if (v.toUpperCase() === 'NULL') return null
  if (v.toUpperCase() === 'TRUE') return true
  if (v.toUpperCase() === 'FALSE') return false
  if (v.startsWith("'") && v.endsWith("'")) return v.slice(1, -1).replace(/''/g, "'")
  if (v.startsWith('"') && v.endsWith('"')) return v.slice(1, -1)
  const num = Number(v)
  if (!Number.isNaN(num) && v !== '') return num
  return v
}

// ─── DELETE ───
// Supports: DELETE FROM table WHERE ...
function executeDelete(
  sql: string,
  data: Record<string, unknown[]>,
): { affectedRows: number } {
  const match = sql.match(/DELETE\s+FROM\s+(\w+)\s*(?:WHERE\s+(.*))?$/is)
  if (!match) return { affectedRows: 0 }

  const tableName = match[1]
  const whereClause = match[2]?.trim() || ''

  const tableData = data[tableName] as Record<string, unknown>[] | undefined
  if (!tableData) return { affectedRows: 0 }

  if (!whereClause) {
    const count = tableData.length
    data[tableName] = []
    return { affectedRows: count }
  }

  // BUGFIX (BUG-26): applyWhere returns rows that MATCH the WHERE clause.
  // For DELETE we want to REMOVE those rows, not keep them. The previous
  // code inverted this logic and kept the matched rows.
  const matchingIds = new Set(applyWhere([...tableData], whereClause).map(r => (r as { id?: unknown }).id))
  const before = tableData.length
  data[tableName] = tableData.filter(r => !matchingIds.has((r as { id?: unknown }).id))
  return { affectedRows: before - (data[tableName] as unknown[]).length }
}

// ─── CREATE TABLE ───
function executeCreate(
  sql: string,
  data: Record<string, unknown[]>,
  schema: Array<{ name: string; columns: Array<{ name: string; type: string }> }>,
): { message: string; mutated: boolean; schema: Array<{ name: string; columns: Array<{ name: string; type: string }> }> } {
  const match = sql.match(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(\w+)\s*\(([\s\S]+)\)\s*;?$/i)
  if (!match) return { message: 'Could not parse CREATE TABLE', mutated: false, schema }

  const tableName = match[1]
  // BUGFIX (BUG-30): previously used `match[2].split(',')` which broke on
  // type definitions like `decimal(10,2)` (the comma inside the parens was
  // treated as a column separator). Use the paren-aware splitter instead.
  const colDefs = splitOnTopLevelCommas(match[2]).map(c => c.trim()).filter(Boolean)

  if (data[tableName]) {
    return { message: `Table "${tableName}" already exists`, mutated: false, schema }
  }

  const columns = colDefs.map(def => {
    // Take the first two whitespace-separated tokens as name and type.
    // The type can include parenthesised args like `varchar(255)` or
    // `decimal(10,2)` — they survive because we already split on top-level
    // commas only.
    const parts = def.split(/\s+/)
    return { name: parts[0].replace(/"/g, ''), type: parts[1] || 'varchar(255)' }
  })

  data[tableName] = []
  const newSchema = [...schema, { name: tableName, columns }]
  return { message: `Table "${tableName}" created with ${columns.length} column(s)`, mutated: true, schema: newSchema }
}

// ─── ALTER / DROP / TRUNCATE ───
function executeAlterDropTruncate(
  sql: string,
  data: Record<string, unknown[]>,
  schema: Array<{ name: string; columns: Array<{ name: string; type: string }> }>,
): { message: string; affectedRows: number; mutated: boolean; schema: Array<{ name: string; columns: Array<{ name: string; type: string }> }> } {
  const normalized = sql.trim().toUpperCase()

  // DROP TABLE
  const dropMatch = sql.match(/DROP\s+TABLE\s+(?:IF\s+EXISTS\s+)?(\w+)/i)
  if (dropMatch) {
    const tableName = dropMatch[1]
    if (!data[tableName]) return { message: `Table "${tableName}" not found`, affectedRows: 0, mutated: false, schema }
    const rowCount = (data[tableName] as unknown[]).length
    delete data[tableName]
    const newSchema = schema.filter(t => t.name !== tableName)
    return { message: `Table "${tableName}" dropped (${rowCount} rows)`, affectedRows: rowCount, mutated: true, schema: newSchema }
  }

  // TRUNCATE TABLE
  const truncMatch = sql.match(/TRUNCATE\s+TABLE\s+(\w+)/i)
  if (truncMatch) {
    const tableName = truncMatch[1]
    if (!data[tableName]) return { message: `Table "${tableName}" not found`, affectedRows: 0, mutated: false, schema }
    const rowCount = (data[tableName] as unknown[]).length
    data[tableName] = []
    return { message: `Table "${tableName}" truncated (${rowCount} rows removed)`, affectedRows: rowCount, mutated: true, schema }
  }

  // ALTER TABLE ... ADD COLUMN
  const addColMatch = sql.match(/ALTER\s+TABLE\s+(\w+)\s+ADD\s+COLUMN\s+(\w+)\s+(\w+(?:\([^)]+\))?)/i)
  if (addColMatch) {
    const [, tableName, colName, colType] = addColMatch
    if (!data[tableName]) return { message: `Table "${tableName}" not found`, affectedRows: 0, mutated: false, schema }
    const newSchema = schema.map(t =>
      t.name === tableName
        ? { ...t, columns: [...t.columns, { name: colName, type: colType }] }
        : t
    )
    return { message: `Column "${colName}" added to "${tableName}"`, affectedRows: 0, mutated: true, schema: newSchema }
  }

  // ALTER TABLE ... DROP COLUMN
  const dropColMatch = sql.match(/ALTER\s+TABLE\s+(\w+)\s+DROP\s+COLUMN\s+(\w+)/i)
  if (dropColMatch) {
    const [, tableName, colName] = dropColMatch
    if (!data[tableName]) return { message: `Table "${tableName}" not found`, affectedRows: 0, mutated: false, schema }
    data[tableName] = (data[tableName] as Record<string, unknown>[]).map(r => {
      const { [colName]: _drop, ...rest } = r
      return rest
    })
    const newSchema = schema.map(t =>
      t.name === tableName
        ? { ...t, columns: t.columns.filter(c => c.name !== colName) }
        : t
    )
    return { message: `Column "${colName}" dropped from "${tableName}"`, affectedRows: 0, mutated: true, schema: newSchema }
  }

  return { message: 'ALTER/DROP/TRUNCATE: statement not recognized', affectedRows: 0, mutated: false, schema }
}
