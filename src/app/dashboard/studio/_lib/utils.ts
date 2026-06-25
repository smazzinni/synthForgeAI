// ─── Studio pure helper functions ───
// Extracted from page.tsx. These functions have no React dependencies and
// can be unit-tested in isolation.

import { cleanDisplayText } from '@/lib/ai-agents'
import type { SchemaTable } from './types'

// ─── Export helpers (client-side) ───

export function exportAsCSV(data: Record<string, unknown>[], filename: string) {
  if (!data.length) return
  const columns = Object.keys(data[0])
  const csvRows = [
    columns.map(c => `"${c}"`).join(','),
    ...data.map(row =>
      columns.map(col => {
        const val = row[col]
        if (val === null || val === undefined) return ''
        if (typeof val === 'object') return `"${JSON.stringify(val).replace(/"/g, '""')}"`
        return `"${String(val).replace(/"/g, '""')}"`
      }).join(',')
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
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export function exportAsSQL(schema: SchemaTable[], data: Record<string, unknown[]>, filename: string) {
  let sql = `-- SynthForge AI Export\n-- Generated: ${new Date().toISOString()}\n\n`
  for (const table of schema) {
    const rows = data[table.name] as Record<string, unknown>[] | undefined
    sql += `CREATE TABLE ${table.name} (\n`
    const colDefs = table.columns.map(col => {
      let def = `  ${col.name} ${col.type.toUpperCase()}`
      if (col.name === 'id') def += ' PRIMARY KEY'
      return def
    })
    sql += colDefs.join(',\n') + '\n);\n\n'
    if (rows && rows.length > 0) {
      const columns = Object.keys(rows[0])
      for (const row of rows) {
        const values = columns.map(col => {
          const val = row[col]
          if (val === null || val === undefined) return 'NULL'
          if (typeof val === 'number') return String(val)
          if (typeof val === 'boolean') return val ? 'TRUE' : 'FALSE'
          return `'${String(val).replace(/'/g, "''")}'`
        })
        sql += `INSERT INTO ${table.name} (${columns.join(', ')}) VALUES (${values.join(', ')});\n`
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

// ─── Parse AI response to extract text and JSON data ───

export function parseAIResponse(content: string): {
  displayText: string
  tables: Record<string, unknown[]> | null
  databaseName: string | null
} {
  let tables: Record<string, unknown[]> | null = null
  let databaseName: string | null = null
  let displayText = content

  // Try to extract JSON code block(s) — match ALL (global flag) so if the
  // AI emits two ```json blocks, both are stripped from displayText.
  const codeBlockRe = /```(?:json)?\s*\n?([\s\S]*?)\n?```/g
  let codeBlockMatch: RegExpExecArray | null
  while ((codeBlockMatch = codeBlockRe.exec(content)) !== null) {
    try {
      const parsed = JSON.parse(codeBlockMatch[1])
      if (parsed?.tables && !tables) {
        tables = parsed.tables
        databaseName = parsed.database_name || null
      }
    } catch {
      // Not valid JSON in code block — leave it alone
    }
  }
  if (tables) {
    displayText = content.replace(/```(?:json)?\s*\n?[\s\S]*?\n?```/g, '').trim()
  }

  // If no code block found, try raw JSON using bracket-counting (non-greedy).
  if (!tables) {
    const marker = '{"tables"'
    let idx = content.indexOf(marker)
    while (idx !== -1) {
      let depth = 0
      let inStr = false
      let escape = false
      let end = -1
      for (let i = idx; i < content.length; i++) {
        const ch = content[i]
        if (escape) { escape = false; continue }
        if (ch === '\\' && inStr) { escape = true; continue }
        if (ch === '"') { inStr = !inStr; continue }
        if (inStr) continue
        if (ch === '{') depth++
        else if (ch === '}') {
          depth--
          if (depth === 0) { end = i; break }
        }
      }
      if (end === -1) break
      const candidate = content.substring(idx, end + 1)
      try {
        const parsed = JSON.parse(candidate)
        if (parsed?.tables) {
          tables = parsed.tables
          databaseName = parsed.database_name || null
          displayText = content.replace(candidate, '').trim()
          break
        }
      } catch {
        // Not parseable — try next occurrence
      }
      idx = content.indexOf(marker, idx + 1)
    }
  }

  // Clean up tags and agent status / options blocks
  displayText = displayText.replace(/<think[\s\S]*?<\/think>/gi, '')
  displayText = displayText.replace(/<thinking[\s\S]*?<\/thinking>/gi, '')
  displayText = cleanDisplayText(displayText)
  displayText = displayText.replace(/^\s*\{"type"\s*:\s*"[^"]+"\s*[,\}][^\n]*$/gm, '')
  displayText = displayText.replace(/\n{3,}/g, '\n\n')
  displayText = displayText.trim()

  return { displayText, tables, databaseName }
}

// ─── Extract schema from table data ───

export function extractSchema(tables: Record<string, unknown[]>): SchemaTable[] {
  const schema: SchemaTable[] = []
  for (const [tableName, tableData] of Object.entries(tables)) {
    const rows = tableData as Record<string, unknown>[]
    if (Array.isArray(rows) && rows.length > 0) {
      const columns = Object.keys(rows[0]).map(key => {
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

// ─── Extract ALL ```sql ... ``` code blocks from AI response content ───
// Returns an array of SQL strings (without fences). Case-insensitive tag.
// Non-SQL code blocks (```json, ```bash, etc.) are NOT included.

export function extractAllSqlBlocks(content: string): string[] {
  const blocks: string[] = []
  const re = /```sql\s*\n([\s\S]*?)\n?```/gi
  let match: RegExpExecArray | null
  while ((match = re.exec(content)) !== null) {
    const body = match[1].trim()
    if (body) blocks.push(body)
  }
  return blocks
}

// Backwards-compat: returns the FIRST sql block (or null).
export function extractSqlBlock(content: string): string | null {
  const blocks = extractAllSqlBlocks(content)
  return blocks.length > 0 ? blocks[0] : null
}

// ─── Generate CREATE TABLE SQL from a schema ───

export function generateSchemaSQL(schema: SchemaTable[], databaseName?: string): string {
  if (!schema.length) return '-- No schema generated yet'
  let sql = `-- SynthForge AI Generated Schema\n-- Database: ${databaseName || 'untitled'}\n\n`
  for (const table of schema) {
    sql += `CREATE TABLE ${table.name} (\n`
    const cols = table.columns.map(col => {
      let def = `  ${col.name} ${col.type.toUpperCase()}`
      if (col.name === 'id') def += ' PRIMARY KEY'
      return def
    })
    sql += cols.join(',\n')
    sql += '\n);\n\n'
  }
  return sql
}

// ─── Compute ER-diagram node positions and FK edges from schema ───

export interface ERNode {
  name: string
  x: number
  y: number
  schema: SchemaTable
  rows: number
}

export interface EREdge {
  from: string
  to: string
  fromCol: string
  toCol: string
  type: string
}

export function computeERLayout(
  generatedData: Record<string, unknown[]>,
  generatedSchema: SchemaTable[],
): { nodes: ERNode[]; edges: EREdge[] } {
  const tableNames = Object.keys(generatedData)
  if (tableNames.length === 0) return { nodes: [], edges: [] }

  const nodes: ERNode[] = []
  const edges: EREdge[] = []

  const colWidth = 220
  const rowHeight = 200
  const cols = Math.ceil(Math.sqrt(tableNames.length))

  tableNames.forEach((name, i) => {
    const col = i % cols
    const row = Math.floor(i / cols)
    const schema = generatedSchema.find(t => t.name === name)
    const rows = (generatedData[name] as unknown[])?.length || 0

    nodes.push({
      name,
      x: 60 + col * (colWidth + 80),
      y: 60 + row * (rowHeight + 40),
      schema: schema || { name, columns: [] },
      rows,
    })

    // Find FK relationships
    if (schema) {
      for (const col of schema.columns) {
        if (col.name.endsWith('_id') && col.name !== 'id') {
          const targetTable = col.name.replace('_id', '')
          if (tableNames.includes(targetTable)) {
            edges.push({
              from: name,
              to: targetTable,
              fromCol: col.name,
              toCol: 'id',
              type: '1:N',
            })
          }
        }
      }
    }
  })

  return { nodes, edges }
}
