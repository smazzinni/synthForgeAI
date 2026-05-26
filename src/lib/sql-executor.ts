export function executeSQLAgainstData(
  sql: string,
  data: Record<string, unknown[]>
): { rows: Record<string, unknown>[]; columns: string[] } {
  const trimmedSql = sql.trim()
  const normalized = trimmedSql.toUpperCase()

  if (normalized.startsWith('SELECT') || normalized.startsWith('WITH')) {
    return executeSelect(trimmedSql, data)
  }

  return {
    rows: [{ message: 'DML operations are simulated. Use the AI chat to modify data.', type: 'info' } as any],
    columns: ['message', 'type'],
  }
}

export function executeSelect(
  sql: string,
  data: Record<string, unknown[]>
): { rows: Record<string, unknown>[]; columns: string[] } {
  const normalizedQuery = normalizeSql(sql)
  const { ctes, finalQuery } = extractCTEs(normalizedQuery)

  let workingData = { ...data }
  for (const cte of ctes) {
    const cteResult = executeSelect(cte.query, workingData)
    workingData[cte.name] = cteResult.rows
  }

  const selectMatch = finalQuery.match(/SELECT\s+([\s\S]*?)\s+FROM\s+([A-Za-z0-9_"`\.]+)(?:\s+(?:AS\s+)?[A-Za-z0-9_"`]+)?(?:\s+WHERE\s+([\s\S]*?))?(?:\s+ORDER\s+BY\s+([\s\S]*?))?(?:\s+LIMIT\s+(\d+))?\s*;?$/i)

  if (!selectMatch) {
    return { rows: [{ error: 'Could not parse SQL query. Use a simple SELECT statement, for example: SELECT * FROM table_name' }], columns: ['error'] }
  }

  const selectCols = selectMatch[1].trim()
  const rawTableName = selectMatch[2].replace(/['"`]/g, '')
  const whereClause = selectMatch[3]
  const orderByClause = selectMatch[4]
  const limitClause = selectMatch[5]

  const tableName = rawTableName.split('.').pop() || rawTableName
  let tableData = workingData[rawTableName] || workingData[tableName]

  if (!tableData) {
    return { rows: [{ error: `Table "${rawTableName}" not found. Available tables: ${Object.keys(workingData).join(', ')}` }], columns: ['error'] }
  }

  let rows = Array.isArray(tableData) ? [...(tableData as Record<string, unknown>[])] : []

  if (whereClause) {
    rows = applyWhere(rows, whereClause)
  }

  if (orderByClause) {
    rows = applyOrderBy(rows, orderByClause)
  }

  let columns: string[]
  if (selectCols === '*') {
    columns = rows.length > 0 ? Object.keys(rows[0]) : []
  } else {
    const parsedColumns = parseSelectedColumns(selectCols)
    columns = parsedColumns.map(col => col.alias)
    rows = rows.map(row => {
      const filtered: Record<string, unknown> = {}
      for (const col of parsedColumns) {
        filtered[col.alias] = row[col.source]
      }
      return filtered
    })
  }

  if (limitClause) {
    const limit = parseInt(limitClause, 10)
    if (!Number.isNaN(limit) && limit >= 0) {
      rows = rows.slice(0, limit)
    }
  } else {
    rows = rows.slice(0, 100)
  }

  return { rows, columns }
}

function normalizeSql(sql: string): string {
  return sql.replace(/\s+/g, ' ').trim()
}

function extractCTEs(sql: string): { ctes: Array<{ name: string; query: string }>; finalQuery: string } {
  const trimmed = sql.trim()
  const upper = trimmed.toUpperCase()
  if (!upper.startsWith('WITH')) {
    return { ctes: [], finalQuery: trimmed }
  }

  let depth = 0
  const source = trimmed
  for (let i = 4; i < source.length; i++) {
    const char = source[i]
    if (char === '(') depth += 1
    if (char === ')') depth = Math.max(0, depth - 1)
    if (depth === 0 && source.slice(i).toUpperCase().startsWith(' SELECT')) {
      const cteBlock = source.slice(4, i).trim()
      const finalQuery = source.slice(i + 1).trim()
      return { ctes: parseCTEBlock(cteBlock), finalQuery }
    }
  }

  return { ctes: [], finalQuery: trimmed }
}

function parseCTEBlock(block: string): Array<{ name: string; query: string }> {
  const definitions: string[] = []
  let start = 0
  let depth = 0

  for (let i = 0; i < block.length; i++) {
    const char = block[i]
    if (char === '(') depth += 1
    if (char === ')') depth = Math.max(0, depth - 1)
    if (depth === 0 && char === ',') {
      definitions.push(block.slice(start, i).trim())
      start = i + 1
    }
  }

  definitions.push(block.slice(start).trim())
  return definitions.filter(Boolean).map(def => parseCTEDefinition(def))
}

function parseCTEDefinition(definition: string): { name: string; query: string } {
  const upper = definition.toUpperCase()
  const asIndex = upper.indexOf(' AS ')
  if (asIndex === -1) {
    return { name: '', query: definition }
  }

  const name = definition.slice(0, asIndex).trim().replace(/['"`]/g, '')
  let query = definition.slice(asIndex + 4).trim()
  if (query.startsWith('(') && query.endsWith(')')) {
    query = query.slice(1, -1).trim()
  }

  return { name, query }
}

function stripCTEs(sql: string): string {
  return extractCTEs(sql).finalQuery
}

function parseSelectedColumns(selectCols: string): Array<{ source: string; alias: string }> {
  return selectCols.split(',').map(rawCol => {
    const col = rawCol.trim()
    const aliasMatch = col.match(/^(.*?)\s+AS\s+['"`]?([A-Za-z0-9_]+)['"`]?$/i)
    if (aliasMatch) {
      return {
        source: aliasMatch[1].replace(/['"`]/g, '').split('.').pop() || aliasMatch[1],
        alias: aliasMatch[2],
      }
    }

    const shortName = col.split('.').pop() || col
    return {
      source: shortName.replace(/['"`]/g, ''),
      alias: shortName.replace(/['"`]/g, ''),
    }
  })
}

export function applyWhere(rows: Record<string, unknown>[], where: string): Record<string, unknown>[] {
  const conditions = where.split(/\s+AND\s+/i)

  return rows.filter(row => {
    return conditions.every(cond => {
      const trimmed = cond.trim().replace(/;$/, '')

      const likeMatch = trimmed.match(/^['"`]?([A-Za-z0-9_]+)['"`]?\s+LIKE\s+'([^']*)'$/i)
      if (likeMatch) {
        const col = likeMatch[1]
        const pattern = likeMatch[2].replace(/%/g, '').toLowerCase()
        const val = String(row[col] ?? '').toLowerCase()
        return val.includes(pattern)
      }

      const cmpMatch = trimmed.match(/^['"`]?([A-Za-z0-9_]+)['"`]?\s*(>=|<=|<>|!=|=|>|<)\s*(['"`]?[A-Za-z0-9_.%]+['"`]?)$/i)
      if (cmpMatch) {
        const col = cmpMatch[1]
        const op = cmpMatch[2]
        let value = cmpMatch[3].replace(/^['"`]?|['"`]?$/g, '')
        const cellValue = row[col]

        const numericValue = Number(value)
        const rowNumeric = typeof cellValue === 'number' ? cellValue : Number(cellValue)
        const isNumericComparison = !Number.isNaN(numericValue) && typeof rowNumeric === 'number' && !Number.isNaN(rowNumeric)

        if (isNumericComparison && ['>', '<', '>=', '<=', '=', '!=', '<>'].includes(op)) {
          switch (op) {
            case '>': return rowNumeric > numericValue
            case '<': return rowNumeric < numericValue
            case '>=': return rowNumeric >= numericValue
            case '<=': return rowNumeric <= numericValue
            case '=': return rowNumeric === numericValue
            case '!=': case '<>': return rowNumeric !== numericValue
          }
        }

        switch (op) {
          case '=': return String(cellValue ?? '') === value
          case '!=': case '<>': return String(cellValue ?? '') !== value
          case '>': return String(cellValue ?? '') > value
          case '<': return String(cellValue ?? '') < value
          case '>=': return String(cellValue ?? '') >= value
          case '<=': return String(cellValue ?? '') <= value
        }
      }

      return false
    })
  })
}

export function applyOrderBy(rows: Record<string, unknown>[], orderBy: string): Record<string, unknown>[] {
  const clauses = orderBy.split(',').map(part => {
    const segment = part.trim()
    const [rawColumn, rawDirection] = segment.split(/\s+/)
    return {
      column: rawColumn.replace(/['"`]/g, ''),
      direction: rawDirection?.toUpperCase() === 'DESC' ? -1 : 1,
    }
  })

  return rows.sort((a, b) => {
    for (const clause of clauses) {
      const aVal = a[clause.column]
      const bVal = b[clause.column]
      if (aVal === bVal) continue
      if (aVal == null) return 1
      if (bVal == null) return -1
      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return (aVal - bVal) * clause.direction
      }
      const compare = String(aVal).localeCompare(String(bVal))
      if (compare !== 0) {
        return compare * clause.direction
      }
    }
    return 0
  })
}
