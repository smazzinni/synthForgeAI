import * as XLSX from 'xlsx'
import type { ImportResult, SchemaTable } from './import-parser'

function stripExtension(fileName: string): string {
  return fileName.replace(/\.[^.]+$/, '')
}

function sanitizeTableName(name: string): string {
  const cleaned = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '')
  return cleaned || 'sheet'
}

function inferColumnType(value: unknown): string {
  if (value === null || value === undefined) return 'varchar(255)'
  if (typeof value === 'number') {
    return Number.isInteger(value) ? 'integer' : 'decimal'
  }
  if (typeof value === 'boolean') return 'boolean'
  if (value instanceof Date) return 'timestamp'
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
      const normalized =
        val instanceof Date ? val.toISOString() : val
      const type = inferColumnType(normalized)
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

function normalizeRow(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(row)) {
    const col = String(key).trim()
    if (!col) continue
    if (value instanceof Date) {
      out[col] = value.toISOString()
    } else {
      out[col] = value
    }
  }
  return out
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

export function parseXlsxBuffer(
  buffer: ArrayBuffer | Buffer,
  fileName: string,
): ImportResult {
  const workbook = XLSX.read(buffer, { type: 'array', cellDates: true })
  const dataJson: Record<string, unknown[]> = {}
  const usedNames = new Set<string>()

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName]
    if (!sheet) continue

    const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
      defval: null,
      raw: false,
    })
    if (rawRows.length === 0) continue

    let tableName = sanitizeTableName(sheetName)
    if (usedNames.has(tableName)) {
      let i = 2
      while (usedNames.has(`${tableName}_${i}`)) i++
      tableName = `${tableName}_${i}`
    }
    usedNames.add(tableName)

    dataJson[tableName] = rawRows.map(normalizeRow)
  }

  if (Object.keys(dataJson).length === 0) {
    throw new Error('No data rows found in Excel workbook')
  }

  return {
    dataJson,
    schemaJson: buildSchemaFromData(dataJson),
    suggestedName: stripExtension(fileName),
  }
}
