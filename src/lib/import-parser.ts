export type SchemaTable = {
  name: string
  columns: Array<{ name: string; type: string }>
}

export type ImportResult = {
  dataJson: Record<string, unknown[]>
  schemaJson: SchemaTable[]
  suggestedName: string
}

function inferColumnType(value: unknown): string {
  if (value === null || value === undefined) return 'varchar(255)'

  if (typeof value === 'number') {
    return Number.isInteger(value) ? 'integer' : 'decimal'
  }

  if (typeof value === 'boolean') return 'boolean'

  if (typeof value === 'string') {
    const uuidRe =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (uuidRe.test(value)) return 'uuid'
    if (/^\d{4}-\d{2}-\d{2}/.test(value)) return 'timestamp'
  }

  if (typeof value === 'object') return 'jsonb'

  return 'varchar(255)'
}

function inferColumnsFromRows(
  colNames: string[],
  sampleRows: Record<string, unknown>[],
): Array<{ name: string; type: string }> {
  const colTypeMap: Record<string, Record<string, number>> = {}

  for (const row of sampleRows) {
    for (const colName of colNames) {
      const val = row[colName]
      if (val === null || val === undefined) continue
      const type = inferColumnType(val)
      if (!colTypeMap[colName]) colTypeMap[colName] = {}
      colTypeMap[colName][type] = (colTypeMap[colName][type] || 0) + 1
    }
  }

  return colNames.map((k) => {
    const typeCounts = colTypeMap[k] || {}
    const bestType =
      Object.entries(typeCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ??
      'varchar(255)'
    return { name: k, type: bestType }
  })
}

function buildSchemaFromData(
  dataJson: Record<string, unknown[]>,
): SchemaTable[] {
  const schemaJson: SchemaTable[] = []
  for (const [tName, rows] of Object.entries(dataJson)) {
    if (!Array.isArray(rows) || rows.length === 0) continue
    const sampleRows = rows.slice(0, 5) as Record<string, unknown>[]
    const colNames = Object.keys(rows[0] as Record<string, unknown>)
    schemaJson.push({
      name: tName,
      columns: inferColumnsFromRows(colNames, sampleRows),
    })
  }
  return schemaJson
}

function stripExtension(fileName: string): string {
  return fileName.replace(/\.[^.]+$/, '')
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function isRowArray(value: unknown): value is Record<string, unknown>[] {
  return (
    Array.isArray(value) &&
    value.every(
      (row) => row === null || (typeof row === 'object' && !Array.isArray(row)),
    )
  )
}

export function parseJsonImport(
  content: string,
  fileName: string,
): ImportResult {
  let parsed: unknown
  try {
    parsed = JSON.parse(content)
  } catch {
    throw new Error('Invalid JSON file')
  }

  let dataJson: Record<string, unknown[]> = {}

  if (isRecord(parsed) && isRecord(parsed.tables)) {
    for (const [name, rows] of Object.entries(parsed.tables)) {
      if (isRowArray(rows)) dataJson[name] = rows
    }
  } else if (Array.isArray(parsed)) {
    const tName = stripExtension(fileName)
    dataJson[tName] = parsed as Record<string, unknown>[]
  } else if (isRecord(parsed)) {
    const tableEntries = Object.entries(parsed).filter(([, v]) => isRowArray(v))
    if (tableEntries.length === 0) {
      throw new Error(
        'Unsupported JSON structure. Use { "tables": { ... } }, a top-level array, or { "table_name": [ rows ] }.',
      )
    }
    for (const [name, rows] of tableEntries) {
      dataJson[name] = rows
    }
  } else {
    throw new Error('Unsupported JSON structure')
  }

  if (Object.keys(dataJson).length === 0) {
    throw new Error('No table data found in JSON file')
  }

  return {
    dataJson,
    schemaJson: buildSchemaFromData(dataJson),
    suggestedName: stripExtension(fileName),
  }
}

/** Parse simple CREATE TABLE + INSERT SQL exports. */
export function parseSqlImport(content: string, fileName: string): ImportResult {
  const dataJson: Record<string, unknown[]> = {}
  const schemaJson: SchemaTable[] = []

  const createRegex =
    /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?[`"']?(\w+)[`"']?\s*\(([\s\S]*?)\)\s*;/gi
  const insertRegex =
    /INSERT\s+INTO\s+[`"']?(\w+)[`"']?\s*\(([^)]+)\)\s*VALUES\s*\(([\s\S]*?)\)\s*;/gi

  let createMatch: RegExpExecArray | null
  createRegex.lastIndex = 0
  while ((createMatch = createRegex.exec(content)) !== null) {
    const tableName = createMatch[1]
    const body = createMatch[2]
    const columns: Array<{ name: string; type: string }> = []
    for (const part of body.split(',')) {
      const trimmed = part.trim()
      if (!trimmed) continue
      const colMatch = trimmed.match(
        /^[`"']?(\w+)[`"']?\s+([A-Za-z][\w()]*)/,
      )
      if (colMatch) {
        columns.push({
          name: colMatch[1],
          type: colMatch[2].toLowerCase(),
        })
      }
    }
    if (columns.length > 0) {
      schemaJson.push({ name: tableName, columns })
      if (!dataJson[tableName]) dataJson[tableName] = []
    }
  }

  let insertMatch: RegExpExecArray | null
  insertRegex.lastIndex = 0
  while ((insertMatch = insertRegex.exec(content)) !== null) {
    const tableName = insertMatch[1]
    const colNames = insertMatch[2]
      .split(',')
      .map((c) => c.trim().replace(/^[`"']|[`"']$/g, ''))
    const valuesRaw = insertMatch[3]
    const values = splitSqlValues(valuesRaw)
    if (colNames.length !== values.length) continue

    const row: Record<string, unknown> = {}
    for (let i = 0; i < colNames.length; i++) {
      row[colNames[i]] = parseSqlValue(values[i])
    }

    if (!dataJson[tableName]) dataJson[tableName] = []
    dataJson[tableName].push(row)
  }

  if (schemaJson.length === 0 && Object.keys(dataJson).length === 0) {
    throw new Error('No CREATE TABLE or INSERT statements found in SQL file')
  }

  for (const table of Object.keys(dataJson)) {
    if (!schemaJson.find((s) => s.name === table)) {
      const rows = dataJson[table]
      if (rows.length > 0) {
        const sampleRows = rows.slice(0, 5) as Record<string, unknown>[]
        const colNames = Object.keys(rows[0] as Record<string, unknown>)
        schemaJson.push({
          name: table,
          columns: inferColumnsFromRows(colNames, sampleRows),
        })
      }
    }
  }

  return {
    dataJson,
    schemaJson,
    suggestedName: stripExtension(fileName),
  }
}

function splitSqlValues(valuesRaw: string): string[] {
  const values: string[] = []
  let current = ''
  let inQuote = false
  let quoteChar = ''

  for (let i = 0; i < valuesRaw.length; i++) {
    const ch = valuesRaw[i]
    if (!inQuote && (ch === "'" || ch === '"')) {
      inQuote = true
      quoteChar = ch
      current += ch
      continue
    }
    if (inQuote && ch === quoteChar) {
      if (valuesRaw[i + 1] === quoteChar) {
        current += ch + ch
        i++
        continue
      }
      inQuote = false
      quoteChar = ''
      current += ch
      continue
    }
    if (!inQuote && ch === ',') {
      values.push(current.trim())
      current = ''
      continue
    }
    current += ch
  }
  if (current.trim()) values.push(current.trim())
  return values
}

function parseSqlValue(raw: string): unknown {
  const trimmed = raw.trim()
  if (/^null$/i.test(trimmed)) return null
  if (/^true$/i.test(trimmed)) return true
  if (/^false$/i.test(trimmed)) return false
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) return Number(trimmed)
  if (
    (trimmed.startsWith("'") && trimmed.endsWith("'")) ||
    (trimmed.startsWith('"') && trimmed.endsWith('"'))
  ) {
    return trimmed.slice(1, -1).replace(/''/g, "'")
  }
  return trimmed
}

export function parseCsvImport(
  content: string,
  fileName: string,
): ImportResult {
  const lines = content
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0)

  if (lines.length < 2) {
    throw new Error('CSV must include a header row and at least one data row')
  }

  const headers = parseCsvLine(lines[0])
  const rows: Record<string, unknown>[] = []

  for (let i = 1; i < lines.length; i++) {
    const cells = parseCsvLine(lines[i])
    const row: Record<string, unknown> = {}
    for (let j = 0; j < headers.length; j++) {
      row[headers[j]] = coerceCsvCell(cells[j] ?? '')
    }
    rows.push(row)
  }

  const tName = stripExtension(fileName)
  const dataJson = { [tName]: rows }

  return {
    dataJson,
    schemaJson: buildSchemaFromData(dataJson),
    suggestedName: tName,
  }
}

function parseCsvLine(line: string): string[] {
  const cells: string[] = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"'
        i++
      } else {
        inQuotes = !inQuotes
      }
      continue
    }
    if (ch === ',' && !inQuotes) {
      cells.push(current)
      current = ''
      continue
    }
    current += ch
  }
  cells.push(current)
  return cells.map((c) => c.trim())
}

function coerceCsvCell(value: string): unknown {
  if (value === '') return null
  if (/^-?\d+$/.test(value)) return Number(value)
  if (/^-?\d+\.\d+$/.test(value)) return Number(value)
  if (/^(true|false)$/i.test(value)) return value.toLowerCase() === 'true'
  return value
}

export function parseImportFile(
  content: string,
  fileName: string,
  fileType?: string,
): ImportResult {
  const lower = fileName.toLowerCase()
  if (fileType === 'application/json' || lower.endsWith('.json')) {
    return parseJsonImport(content, fileName)
  }
  if (
    fileType === 'application/sql' ||
    fileType === 'text/plain' ||
    lower.endsWith('.sql')
  ) {
    return parseSqlImport(content, fileName)
  }
  if (fileType === 'text/csv' || lower.endsWith('.csv')) {
    return parseCsvImport(content, fileName)
  }
  throw new Error('Unsupported file type. Use .json, .sql, .csv, or .xlsx')
}

/** Merge AI table updates into existing data (preserves untouched tables). */
export function mergeTableUpdates(
  existing: Record<string, unknown[]>,
  fromAI: Record<string, unknown[]>,
): Record<string, unknown[]> {
  const existingKeys = Object.keys(existing)
  const aiKeys = Object.keys(fromAI)

  if (existingKeys.length === 0) return { ...fromAI }

  const allExistingPresent = existingKeys.every((k) => k in fromAI)
  if (allExistingPresent && aiKeys.length >= existingKeys.length) {
    return { ...fromAI }
  }

  return { ...existing, ...fromAI }
}
