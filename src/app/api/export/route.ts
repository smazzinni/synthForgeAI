import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/server/auth'
import { enforceRateLimit } from '@/lib/server/rate-limit'
import { getDatabase } from '@/lib/server/synthetic-store'
import { getConnection } from '@/lib/db-connections/store'
import { fetchExternalSchema, fetchSampleRows } from '@/lib/db-connections/executor'

// ─── Export a synthetic database ───
// POST { databaseId | connectionId, format: 'sql' | 'csv' | 'json' | 'xlsx', tableName? }
// connectionId exports a LIVE external database (up to MAX_LIVE_ROWS per table).
// Returns the file as an attachment. Owner-scoped.

export const dynamic = 'force-dynamic'

type Row = Record<string, unknown>

const MAX_LIVE_ROWS = 50_000
const MAX_LIVE_TABLES = 200
type TableSchema = { name: string; columns: Array<{ name: string; type: string }> }

const SQL_TYPES = /^[A-Z][A-Z0-9_ ]*(\(\s*\d+(\s*,\s*\d+)?\s*\))?(\[\])?$/

function columnsFor(rows: Row[], schema?: TableSchema): string[] {
  const cols = new Set<string>(schema?.columns.map(c => c.name) ?? [])
  for (const r of rows) for (const k of Object.keys(r)) cols.add(k)
  return [...cols]
}

const qi = (name: string) => `"${name.replace(/"/g, '""')}"`

function sqlLiteral(v: unknown): string {
  if (v === null || v === undefined) return 'NULL'
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : 'NULL'
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE'
  const s = typeof v === 'object' ? JSON.stringify(v) : String(v)
  return `'${s.replace(/'/g, "''")}'`
}

function toSql(tables: Record<string, Row[]>, schema: TableSchema[], dbName: string): string {
  const out: string[] = [`-- SynthForge AI export: ${dbName}`, `-- Generated ${new Date().toISOString()}`, '']
  for (const [name, rows] of Object.entries(tables)) {
    const ts = schema.find(s => s.name === name)
    const cols = columnsFor(rows, ts)
    if (cols.length === 0) continue
    const defs = cols.map(c => {
      const declared = ts?.columns.find(x => x.name === c)?.type?.toUpperCase().trim() || 'TEXT'
      const type = SQL_TYPES.test(declared) ? declared : 'TEXT'
      return `  ${qi(c)} ${type}${c === 'id' ? ' PRIMARY KEY' : ''}`
    })
    out.push(`CREATE TABLE IF NOT EXISTS ${qi(name)} (\n${defs.join(',\n')}\n);`, '')
    for (let i = 0; i < rows.length; i += 500) {
      const chunk = rows.slice(i, i + 500)
      const values = chunk.map(r => `  (${cols.map(c => sqlLiteral(r[c])).join(', ')})`).join(',\n')
      out.push(`INSERT INTO ${qi(name)} (${cols.map(qi).join(', ')}) VALUES\n${values};`, '')
    }
  }
  return out.join('\n')
}

function csvCell(v: unknown): string {
  if (v === null || v === undefined) return ''
  let s = typeof v === 'object' ? JSON.stringify(v) : String(v)
  // Neutralise spreadsheet formula injection.
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

function toCsv(rows: Row[], schema?: TableSchema): string {
  const cols = columnsFor(rows, schema)
  return '﻿' + [cols.map(csvCell).join(','), ...rows.map(r => cols.map(c => csvCell(r[c])).join(','))].join('\r\n')
}

const xmlEscape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
  // eslint-disable-next-line no-control-regex
  .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')

/** Excel-native SpreadsheetML workbook (one worksheet per table). */
function toSpreadsheetXml(tables: Record<string, Row[]>, schema: TableSchema[]): string {
  const sheets = Object.entries(tables).map(([name, rows]) => {
    const cols = columnsFor(rows, schema.find(s => s.name === name))
    const cell = (v: unknown) => {
      if (typeof v === 'number' && Number.isFinite(v)) return `<Cell><Data ss:Type="Number">${v}</Data></Cell>`
      if (typeof v === 'boolean') return `<Cell><Data ss:Type="Boolean">${v ? 1 : 0}</Data></Cell>`
      const s = v === null || v === undefined ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v)
      return `<Cell><Data ss:Type="String">${xmlEscape(s)}</Data></Cell>`
    }
    const header = `<Row>${cols.map(c => `<Cell ss:StyleID="h"><Data ss:Type="String">${xmlEscape(c)}</Data></Cell>`).join('')}</Row>`
    const body = rows.map(r => `<Row>${cols.map(c => cell(r[c])).join('')}</Row>`).join('')
    const sheetName = xmlEscape(name.replace(/[\\/?*[\]:]/g, '_').slice(0, 31) || 'Sheet')
    return `<Worksheet ss:Name="${sheetName}"><Table>${header}${body}</Table></Worksheet>`
  })
  return `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
<Styles><Style ss:ID="h"><Font ss:Bold="1"/></Style></Styles>
${sheets.join('\n')}
</Workbook>`
}

function safeFilename(name: string): string {
  return (name || 'export').replace(/[^\w.\- ]+/g, '_').trim().slice(0, 100) || 'export'
}

export async function POST(request: NextRequest) {
  const auth = await requireUser(request)
  if (auth instanceof Response) return auth
  const limited = enforceRateLimit(auth.userId, 'export', 30)
  if (limited) return limited

  let body: { databaseId?: unknown; connectionId?: unknown; format?: unknown; tableName?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
  const databaseId = typeof body.databaseId === 'string' ? body.databaseId : ''
  const connectionId = typeof body.connectionId === 'string' ? body.connectionId : ''
  const format = String(body.format || '')
  const tableName = typeof body.tableName === 'string' && body.tableName ? body.tableName : undefined
  if (!databaseId && !connectionId) return NextResponse.json({ error: 'databaseId or connectionId is required' }, { status: 400 })
  if (!['sql', 'csv', 'json', 'xlsx'].includes(format)) {
    return NextResponse.json({ error: 'format must be one of sql, csv, json, xlsx' }, { status: 400 })
  }

  let db: { name: string; data_json: unknown; schema_json: unknown } | null
  if (connectionId) {
    // ─── Live external database ───
    const conn = await getConnection(auth.userId, connectionId)
    if (!conn) return NextResponse.json({ error: 'Connection not found' }, { status: 404 })
    try {
      const liveSchema = (await fetchExternalSchema(conn)).slice(0, MAX_LIVE_TABLES)
      const wanted = tableName ? liveSchema.filter(t => t.name === tableName) : liveSchema
      const data: Record<string, Row[]> = {}
      for (const t of wanted) {
        data[t.name] = (await fetchSampleRows(conn, t.name, MAX_LIVE_ROWS)).rows
      }
      db = {
        name: conn.database || conn.name,
        data_json: data,
        schema_json: liveSchema.map(t => ({ name: t.name, columns: t.columns.map(c => ({ name: c.name, type: c.type })) })),
      }
    } catch (err) {
      console.error('[api/export] live export failed:', err)
      return NextResponse.json({ error: `Could not read from the database: ${err instanceof Error ? err.message : 'unknown error'}` }, { status: 502 })
    }
  } else {
    try {
      db = await getDatabase(auth.userId, databaseId)
    } catch (err) {
      console.error('[api/export] storage error:', err)
      return NextResponse.json({ error: 'Storage temporarily unavailable' }, { status: 503 })
    }
    if (!db) return NextResponse.json({ error: 'Database not found' }, { status: 404 })
  }

  const all = (db.data_json || {}) as Record<string, Row[]>
  const schema = (Array.isArray(db.schema_json) ? db.schema_json : []) as TableSchema[]
  if (tableName && !all[tableName]) {
    return NextResponse.json({ error: `Table "${tableName}" not found` }, { status: 404 })
  }
  const tables: Record<string, Row[]> = tableName ? { [tableName]: all[tableName] } : all
  if (Object.keys(tables).length === 0) {
    return NextResponse.json({ error: 'This database has no data to export yet' }, { status: 400 })
  }

  const base = safeFilename(tableName ? `${db.name}_${tableName}` : db.name)
  let content: string
  let contentType: string
  let filename: string

  switch (format) {
    case 'sql':
      content = toSql(tables, schema, db.name)
      contentType = 'application/sql; charset=utf-8'
      filename = `${base}.sql`
      break
    case 'csv': {
      const entries = Object.entries(tables)
      if (entries.length === 1) {
        content = toCsv(entries[0][1], schema.find(s => s.name === entries[0][0]))
      } else {
        // Multiple tables: concatenate with a header line per table.
        content = entries.map(([n, rows]) => `# table: ${n}\r\n${toCsv(rows, schema.find(s => s.name === n)).replace(/^﻿/, '')}`).join('\r\n\r\n')
        content = '﻿' + content
      }
      contentType = 'text/csv; charset=utf-8'
      filename = `${base}.csv`
      break
    }
    case 'json':
      content = JSON.stringify(tableName ? tables[tableName] : tables, null, 2)
      contentType = 'application/json; charset=utf-8'
      filename = `${base}.json`
      break
    default:
      content = toSpreadsheetXml(tables, schema)
      contentType = 'application/vnd.ms-excel'
      filename = `${base}.xls`
  }

  return new NextResponse(content, {
    status: 200,
    headers: {
      'Content-Type': contentType,
      'Content-Disposition': `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
      'Cache-Control': 'no-store',
    },
  })
}
