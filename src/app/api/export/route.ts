import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/admin'
import { Tables } from '@/lib/supabase/types'

// ─── Export API ───
// Exports database data in various formats: SQL, CSV, JSON, XLSX

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { databaseId, format, tableName } = body as {
      databaseId: string
      format: 'sql' | 'csv' | 'json' | 'xlsx'
      tableName?: string
    }

    if (!databaseId) {
      return NextResponse.json({ error: 'Database ID is required' }, { status: 400 })
    }

    if (!format || !['sql', 'csv', 'json', 'xlsx'].includes(format)) {
      return NextResponse.json({ error: 'Format must be one of: sql, csv, json, xlsx' }, { status: 400 })
    }

    const admin = getSupabaseAdmin()
    if (!admin) {
      return NextResponse.json({ error: 'Database service not configured' }, { status: 503 })
    }

    // Fetch the database
    const { data: db, error: dbError } = await admin
      .from('synthetic_databases')
      .select('name, data_json, schema_json')
      .eq('id', databaseId)
      .single() as { data: Pick<Tables<'synthetic_databases'>, 'name' | 'data_json' | 'schema_json'> | null; error: any }

    if (dbError || !db) {
      return NextResponse.json({ error: 'Database not found' }, { status: 404 })
    }

    const dataJson = (db.data_json as Record<string, unknown[]>) || {}
    const schemaJson = db.schema_json as Array<{ name: string; columns: Array<{ name: string; type: string }> }> || []
    const dbName = db.name || 'database'

    // Filter by table name if specified
    const tablesToExport = tableName && dataJson[tableName]
      ? { [tableName]: dataJson[tableName] }
      : dataJson

    let content: string
    let contentType: string
    let filename: string

    switch (format) {
      case 'sql':
        content = generateSQLDump(dbName, tablesToExport, schemaJson)
        contentType = 'application/sql'
        filename = `${dbName}.sql`
        break

      case 'csv':
        content = generateCSV(tablesToExport, tableName)
        contentType = 'text/csv'
        filename = `${dbName}${tableName ? `_${tableName}` : ''}.csv`
        break

      case 'json':
        content = JSON.stringify(tableName ? tablesToExport[tableName] : tablesToExport, null, 2)
        contentType = 'application/json'
        filename = `${dbName}${tableName ? `_${tableName}` : ''}.json`
        break

      case 'xlsx':
        // For XLSX, we return CSV format (can be opened in Excel)
        // A proper XLSX would require a library like exceljs
        content = generateCSV(tablesToExport, tableName)
        contentType = 'application/vnd.ms-excel'
        filename = `${dbName}${tableName ? `_${tableName}` : ''}.xlsx`
        break

      default:
        return NextResponse.json({ error: 'Invalid format' }, { status: 400 })
    }

    return new NextResponse(content, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-cache',
      },
    })
  } catch (err) {
    console.error('[Export API] Error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

function generateSQLDump(
  dbName: string,
  tables: Record<string, unknown[]>,
  schema: Array<{ name: string; columns: Array<{ name: string; type: string }> }>
): string {
  let sql = `-- SynthForge AI Database Export\n-- Database: ${dbName}\n-- Generated: ${new Date().toISOString()}\n\n`

  for (const [tableName, rows] of Object.entries(tables)) {
    const tableSchema = schema.find(s => s.name === tableName)
    const tableRows = rows as Record<string, unknown>[]

    // CREATE TABLE
    sql += `CREATE TABLE ${tableName} (\n`
    if (tableSchema) {
      const colDefs = tableSchema.columns.map(col => {
        let def = `  ${col.name} ${col.type.toUpperCase()}`
        if (col.name === 'id') def += ' PRIMARY KEY'
        return def
      })
      sql += colDefs.join(',\n')
    } else {
      // Infer from data
      if (tableRows.length > 0) {
        const cols = Object.keys(tableRows[0]).map(key => {
          let def = `  ${key} VARCHAR(255)`
          if (key === 'id' || key.endsWith('_id')) def = `  ${key} UUID`
          return def
        })
        sql += cols.join(',\n')
      }
    }
    sql += '\n);\n\n'

    // INSERT statements
    if (tableRows.length > 0) {
      const columns = Object.keys(tableRows[0])
      for (const row of tableRows) {
        const values = columns.map(col => {
          const val = row[col]
          if (val === null || val === undefined) return 'NULL'
          if (typeof val === 'number') return String(val)
          if (typeof val === 'boolean') return val ? 'TRUE' : 'FALSE'
          return `'${String(val).replace(/'/g, "''")}'`
        })
        sql += `INSERT INTO ${tableName} (${columns.join(', ')}) VALUES (${values.join(', ')});\n`
      }
      sql += '\n'
    }
  }

  return sql
}

function generateCSV(tables: Record<string, unknown[]>, singleTable?: string): string {
  const parts: string[] = []

  for (const [tableName, rows] of Object.entries(tables)) {
    const tableRows = rows as Record<string, unknown>[]

    // If single table export, skip table header
    if (!singleTable && Object.keys(tables).length > 1) {
      parts.push(`--- ${tableName} ---`)
    }

    if (tableRows.length > 0) {
      const columns = Object.keys(tableRows[0])

      // Header row
      parts.push(columns.map(c => `"${c}"`).join(','))

      // Data rows
      for (const row of tableRows) {
        const values = columns.map(col => {
          const val = row[col]
          if (val === null || val === undefined) return ''
          if (typeof val === 'object') return `"${JSON.stringify(val).replace(/"/g, '""')}"`
          return `"${String(val).replace(/"/g, '""')}"`
        })
        parts.push(values.join(','))
      }
    }

    parts.push('') // Empty line between tables
  }

  return parts.join('\n')
}
