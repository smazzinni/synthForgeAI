import { cleanDisplayText } from '@/lib/ai-agents'

export interface SchemaTable {
  name: string
  columns: { name: string; type: string }[]
}

export function exportAsCSV(data: Record<string, unknown>[], filename: string) {
  if (!data.length) return
  const columns = Object.keys(data[0])
  const csvRows = [
    columns.map((c) => `"${c}"`).join(','),
    ...data.map((row) =>
      columns
        .map((col) => {
          const val = row[col]
          if (val === null || val === undefined) return ''
          if (typeof val === 'object')
            return `"${JSON.stringify(val).replace(/"/g, '""')}"`
          return `"${String(val).replace(/"/g, '""')}"`
        })
        .join(','),
    ),
  ]
  const blob = new Blob([csvRows.join('\n')], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export function exportAsJSON(data: unknown, filename: string) {
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: 'application/json',
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export function exportAsSQL(
  schema: SchemaTable[],
  data: Record<string, unknown[]>,
  filename: string,
) {
  let sql = `-- SynthForge AI Export\n-- Generated: ${new Date().toISOString()}\n\n`
  for (const table of schema) {
    const rows = data[table.name] as Record<string, unknown>[] | undefined
    sql += `CREATE TABLE ${table.name} (\n`
    const colDefs = table.columns.map((col) => {
      let def = `  ${col.name} ${col.type.toUpperCase()}`
      if (col.name === 'id') def += ' PRIMARY KEY'
      return def
    })
    sql += colDefs.join(',\n') + '\n';
    sql += ');\n\n'
    if (rows && rows.length > 0) {
      const columns = Object.keys(rows[0])
      for (const row of rows) {
        const values = columns.map((col) => {
          const val = row[col]
          if (val === null || val === undefined) return 'NULL'
          if (typeof val === 'number') return String(val)
          if (typeof val === 'boolean') return val ? 'TRUE' : 'FALSE'
          return `'${String(val).replace(/'/g, "''")}'`
        })
        sql += `INSERT INTO ${table.name} (${columns.join(',')}) VALUES (${values.join(',')});\n`
      }
      sql += '\n'
    }
  }
  const blob = new Blob([sql], { type: 'application/sql' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

/** Title-case a snake_case column for display next to the raw name. */
export function humanizeColumnName(column: string): string {
  const exact: Record<string, string> = {
    id: 'Row ID',
    sku: 'SKU',
    url: 'URL',
    uri: 'URI',
  }
  if (exact[column]) return exact[column]
  return column
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (ch) => ch.toUpperCase())
    .replace(/ Id\b/g, ' ID')
}

/** Short hint for non-experts (shown under column header). */
export function columnPlainEnglishHint(column: string): string | null {
  const lower = column.toLowerCase()
  const direct: Record<string, string> = {
    id: 'Unique ID for this row',
    created_at: 'When this was created',
    updated_at: 'Last time this was updated',
    deleted_at: 'If set, row is treated as removed',
    email: 'Email address',
    phone: 'Phone number',
    name: 'Name or label',
    title: 'Title or headline',
    description: 'Longer text description',
    status: 'Current state (e.g. active, pending)',
    price: 'Amount in your main currency',
    quantity: 'How many units',
    amount: 'Numeric amount',
  }
  if (direct[column]) return direct[column]
  if (direct[lower]) return direct[lower]
  if (column.endsWith('_id') && column !== 'id')
    return 'Points to another table'
  if (lower.includes('email')) return 'Email address'
  if (lower.includes('phone')) return 'Phone number'
  if (lower.includes('address')) return 'Street or mailing address'
  if (lower.includes('date') || lower.endsWith('_at')) return 'Date or time'
  if (lower.includes('url') || lower.includes('link')) return 'Web link'
  return null
}

function isTablesPayload(
  parsed: unknown,
): parsed is { tables: Record<string, unknown[]>; database_name?: string } {
  if (!parsed || typeof parsed !== 'object') return false
  const p = parsed as Record<string, unknown>
  if (!p.tables || typeof p.tables !== 'object' || Array.isArray(p.tables))
    return false
  for (const v of Object.values(p.tables)) {
    if (!Array.isArray(v)) return false
  }
  return true
}

export function parseAIResponse(content: string): {
  displayText: string
  tables: Record<string, unknown[]> | null
  databaseName: string | null
} {
  let tables: Record<string, unknown[]> | null = null
  let databaseName: string | null = null
  let displayText = content

  const fenceRegex = /```(?:json)?\s*\n?([\s\S]*?)```/gi
  const blocksToStrip: Array<{ start: number; end: number }> = []
  let m: RegExpExecArray | null
  fenceRegex.lastIndex = 0
  while ((m = fenceRegex.exec(content)) !== null) {
    const inner = m[1].trim()
    if (!inner.startsWith('{')) continue
    try {
      const parsed = JSON.parse(inner)
      if (isTablesPayload(parsed)) {
        tables = parsed.tables
        if (typeof parsed.database_name === 'string')
          databaseName = parsed.database_name
        blocksToStrip.push({ start: m.index, end: m.index + m[0].length })
      }
    } catch {
      // ignore invalid JSON in this fence
    }
  }

  if (blocksToStrip.length > 0) {
    let dt = content
    for (const b of blocksToStrip.sort((a, b) => b.start - a.start)) {
      dt = dt.slice(0, b.start) + dt.slice(b.end)
    }
    displayText = dt.trim()
  }

  if (!tables) {
    const jsonMatch = content.match(/\{[\s\S]*"tables"[\s\S]*\}/)
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0])
        if (isTablesPayload(parsed)) {
          tables = parsed.tables
          databaseName =
            typeof parsed.database_name === 'string'
              ? parsed.database_name
              : databaseName
          displayText = content.replace(jsonMatch[0], '').trim()
        }
      } catch {
        // ignore
      }
    }
  }

  displayText = displayText.replace(/<think[\s\S]*?<\/think>/gi, '')
  displayText = displayText.replace(/<thinking[\s\S]*?<\/thinking>/gi, '')
  displayText = cleanDisplayText(displayText)
  displayText = displayText.replace(
    /^\s*\{"type"\s*:\s*"[^"]+"\s*[,\}][^\n]*$/gm,
    '',
  )
  displayText = displayText.replace(/\n{3,}/g, '\n\n')
  displayText = displayText.trim()

  return { displayText, tables, databaseName }
}

export function extractSchema(tables: Record<string, unknown[]>): SchemaTable[] {
  const schema: SchemaTable[] = []
  for (const [tableName, tableData] of Object.entries(tables)) {
    const rows = tableData as Record<string, unknown>[]
    if (Array.isArray(rows) && rows.length > 0) {
      const columns = Object.keys(rows[0]).map((key) => {
        const val = rows[0][key]
        let type = 'varchar(255)'
        if (typeof val === 'number') type = Number.isInteger(val) ? 'integer' : 'decimal'
        else if (typeof val === 'boolean') type = 'boolean'
        else if (typeof val === 'string' && /^\d{4}-\d{2}-\d{2}/.test(val)) type = 'timestamp'
        else if (key === 'id' || key.endsWith('_id')) type = 'uuid'
        return { name: key, type }
      })
      schema.push({ name: tableName, columns })
    }
  }
  return schema
}
