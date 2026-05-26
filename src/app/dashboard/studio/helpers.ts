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

export function parseAIResponse(content: string): {
  displayText: string
  tables: Record<string, unknown[]> | null
  databaseName: string | null
} {
  let tables: Record<string, unknown[]> | null = null
  let databaseName: string | null = null
  let displayText = content

  const codeBlockMatch = content.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/)
  if (codeBlockMatch) {
    try {
      const parsed = JSON.parse(codeBlockMatch[1])
      if (parsed?.tables) {
        tables = parsed.tables
        databaseName = parsed.database_name || null
        displayText = content
          .replace(/```(?:json)?\s*\n?[\s\S]*?\n?```/, '')
          .trim()
      }
    } catch {
      // ignore
    }
  }

  if (!tables) {
    const jsonMatch = content.match(/\{[\s\S]*"tables"[\s\S]*\}/)
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0])
        if (parsed?.tables) {
          tables = parsed.tables
          databaseName = parsed.database_name || null
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
