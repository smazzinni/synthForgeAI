// Schema extraction utilities — client-safe (no server-only imports)
// These functions are also re-exported from @/lib/ai for server-side use

export function extractSchemaFromSQL(sql: string): Record<string, { columns: Record<string, string> }> {
  const tables: Record<string, { columns: Record<string, string> }> = {}
  const regex = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?[`"]?(\w+)[`"]?\s*\(([\s\S]*?)\)\s*;/gi
  let match
  while ((match = regex.exec(sql)) !== null) {
    const tableName = match[1]
    const columnsStr = match[2]
    const columns: Record<string, string> = {}
    const colRegex = /\s*[`"]?(\w+)[`"]?\s+([\w()]+(?:\[\])?)/g
    let colMatch
    while ((colMatch = colRegex.exec(columnsStr)) !== null) {
      if (['PRIMARY','FOREIGN','CONSTRAINT','UNIQUE','INDEX','KEY','CHECK'].includes(colMatch[1].toUpperCase())) continue
      columns[colMatch[1]] = colMatch[2]
    }
    if (Object.keys(columns).length > 0) tables[tableName] = { columns }
  }
  return tables
}

export function extractSchemaFromCSV(csvText: string, filename: string): Record<string, { columns: Record<string, string> }> {
  const lines = csvText.trim().split('\n')
  if (lines.length === 0) return {}
  const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''))
  const columns: Record<string, string> = {}
  for (const header of headers) {
    const samples = lines.slice(1, 5).map(l => l.split(',')[headers.indexOf(header)]?.trim().replace(/"/g, '')).filter(Boolean)
    if (samples.every(v => /^-?\d+$/.test(v))) columns[header] = 'INTEGER'
    else if (samples.every(v => /^-?\d+\.\d+$/.test(v))) columns[header] = 'DECIMAL'
    else columns[header] = 'VARCHAR(255)'
  }
  return { [filename.replace(/\.(csv|tsv)$/i, '').replace(/[^a-zA-Z0-9_]/g, '_').toLowerCase()]: { columns } }
}

export function extractSchemaFromJSON(jsonStr: string): Record<string, { columns: Record<string, string> }> {
  try {
    const data = JSON.parse(jsonStr)
    const tables: Record<string, { columns: Record<string, string> }> = {}
    if (Array.isArray(data) && data.length > 0 && typeof data[0] === 'object') {
      const columns: Record<string, string> = {}
      for (const [k, v] of Object.entries(data[0])) columns[k] = inferType(v)
      tables['imported_data'] = { columns }
    } else if (typeof data === 'object') {
      for (const [tn, td] of Object.entries(data)) {
        if (Array.isArray(td) && td.length > 0 && typeof td[0] === 'object') {
          const columns: Record<string, string> = {}
          for (const [k, v] of Object.entries(td[0] as Record<string, unknown>)) columns[k] = inferType(v)
          tables[tn] = { columns }
        }
      }
    }
    return tables
  } catch { return {} }
}

function inferType(v: unknown): string {
  if (v === null || v === undefined) return 'VARCHAR(255)'
  if (typeof v === 'number') return Number.isInteger(v) ? 'INTEGER' : 'DECIMAL'
  if (typeof v === 'boolean') return 'BOOLEAN'
  if (typeof v === 'object') return 'JSON'
  if (typeof v === 'string') return /^\d{4}-\d{2}-\d{2}/.test(v) ? 'TIMESTAMP' : 'VARCHAR(255)'
  return 'VARCHAR(255)'
}
