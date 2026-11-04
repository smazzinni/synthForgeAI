/**
 * Real SQL engine for synthetic (JSON-stored) databases.
 *
 * Loads `data_json` into an isolated in-memory AlaSQL database, runs the
 * user's SQL (JOINs, GROUP BY, aggregates, subqueries, CTEs, multi-statement,
 * INSERT/UPDATE/DELETE, CREATE/ALTER/DROP TABLE...) and exports the resulting
 * tables back to JSON. The caller's data is never mutated; the result carries
 * `dataAfter` / `schemaAfter` to persist on success.
 */
import alasql from 'alasql'

export interface TableSchema {
  name: string
  columns: Array<{ name: string; type: string }>
}

export interface SyntheticSqlResult {
  rows: Record<string, unknown>[]
  columns: string[]
  affectedRows: number
  mutated: boolean
  dataAfter: Record<string, unknown[]>
  schemaAfter: TableSchema[]
  error?: string
  /** rows matched before the MAX_ROWS cap */
  totalRows?: number
  truncated?: boolean
  /** true when the engine could not parse the SQL at all (caller may fall back) */
  parseError?: boolean
}

const MAX_ROWS = 1000
const READ_VERBS = new Set(['SELECT', 'WITH', 'SHOW', 'DESCRIBE', 'EXPLAIN', 'VALUES'])

let dbCounter = 0

/** Strip Postgres/MySQL-isms AlaSQL doesn't understand but which don't change meaning. */
export function normaliseDialect(sql: string): string {
  return sql
    .replace(/::\s*(?:double\s+precision|character\s+varying|timestamp\s+with(?:out)?\s+time\s+zone|[a-zA-Z_]\w*)(?:\s*\(\s*\d+(?:\s*,\s*\d+)?\s*\))?(?:\[\])?/gi, '') // ::type casts
    .replace(/\bILIKE\b/gi, 'LIKE')
    .replace(/\bgen_random_uuid\(\)|\buuid_generate_v4\(\)/gi, 'NEWID()')
    .replace(/\bNOW\(\)|\bCURRENT_TIMESTAMP\b/gi, 'NOW()')
    .replace(/\bSERIAL\b|\bBIGSERIAL\b/gi, 'INT')
    .replace(/\bAUTO_INCREMENT\b/gi, '')
    .replace(/\bIF NOT EXISTS\b/gi, 'IF NOT EXISTS')
    .replace(/\s+RETURNING\s+[^;]+/gi, '')                                // RETURNING not supported
    .replace(/\bON CONFLICT\b[^;]*/gi, '')
    .replace(/\bENGINE\s*=\s*\w+/gi, '')
    .replace(/\b(DEFAULT\s+)?CHARSET\s*=\s*\w+/gi, '')
    .replace(/`/g, '')
}

/**
 * Quote identifiers so column names that collide with AlaSQL keywords
 * (total, date, value, key, ...) still parse. Converts Postgres "ident" to
 * [ident] and brackets bare words matching a known table/column name.
 * String literals and comments are left untouched.
 */
export function quoteKnownIdentifiers(sql: string, known: Set<string>): string {
  // Column names declared by CREATE TABLE in this same script are also known.
  for (const m of sql.matchAll(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?["`\[]?(\w+)["`\]]?\s*\(([\s\S]*?)\)\s*(?:;|$)/gi)) {
    known.add(m[1])
    for (const part of m[2].split(',')) {
      const col = part.trim().match(/^["`\[]?(\w+)/)
      if (col && !/^(PRIMARY|FOREIGN|UNIQUE|CONSTRAINT|CHECK|KEY|INDEX)$/i.test(col[1])) known.add(col[1])
    }
  }
  let out = ''
  let i = 0
  while (i < sql.length) {
    const ch = sql[i]
    if (ch === "'") {                                   // string literal
      let j = i + 1
      while (j < sql.length && !(sql[j] === "'" && sql[j + 1] !== "'")) j += sql[j] === "'" ? 2 : 1
      out += sql.slice(i, j + 1); i = j + 1; continue
    }
    if (ch === '-' && sql[i + 1] === '-') {             // line comment
      const j = sql.indexOf('\n', i); const end = j === -1 ? sql.length : j
      out += sql.slice(i, end); i = end; continue
    }
    if (ch === '/' && sql[i + 1] === '*') {             // block comment
      const j = sql.indexOf('*/', i + 2); const end = j === -1 ? sql.length : j + 2
      out += sql.slice(i, end); i = end; continue
    }
    if (ch === '"') {                                   // "quoted identifier"
      const j = sql.indexOf('"', i + 1)
      if (j > i) { out += `[${sql.slice(i + 1, j)}]`; i = j + 1; continue }
    }
    if (ch === '[') {                                   // already bracketed
      const j = sql.indexOf(']', i + 1); const end = j === -1 ? sql.length : j + 1
      out += sql.slice(i, end); i = end; continue
    }
    if (/[A-Za-z_]/.test(ch)) {
      let j = i + 1
      while (j < sql.length && /\w/.test(sql[j])) j++
      const word = sql.slice(i, j)
      const isUpperKeyword = word === word.toUpperCase() && /[A-Z]/.test(word) && !known.has(word)
      const nextNonSpace = sql.slice(j).match(/^\s*(.)/)?.[1]
      const isFunctionCall = nextNonSpace === '(' && !known.has(word)
      out += known.has(word) && !isUpperKeyword && !isFunctionCall ? `[${word}]` : word
      i = j; continue
    }
    out += ch; i++
  }
  return out
}

function firstVerb(stmt: string): string {
  return stmt.replace(/^\s*(--[^\n]*\n|\/\*[\s\S]*?\*\/|\s)+/, '').split(/\s+/)[0]?.toUpperCase() || ''
}

function safeIdent(name: string): string {
  return name.replace(/[^\w]/g, '_')
}

export function runSyntheticSql(
  sql: string,
  data: Record<string, unknown[]>,
  schema: TableSchema[],
): SyntheticSqlResult {
  const dbName = `synth_${Date.now()}_${dbCounter++}`
  const db = new alasql.Database(dbName)
  const clone = <T,>(v: T): T => structuredClone(v)

  const empty = (error: string, parseError = false): SyntheticSqlResult => ({
    rows: [], columns: [], affectedRows: 0, mutated: false,
    dataAfter: data, schemaAfter: schema, error, parseError,
  })

  try {
    // ─── Load tables ───
    const tableNames = new Set<string>([...Object.keys(data), ...schema.map(s => s.name)])
    for (const name of tableNames) {
      const ident = safeIdent(name)
      db.exec(`CREATE TABLE IF NOT EXISTS [${ident}]`)
      const rows = Array.isArray(data[name]) ? clone(data[name]) : []
      ;(db.tables as Record<string, { data: unknown[] }>)[ident].data = rows
    }

    // ─── Execute ───
    const known = new Set<string>()
    for (const name of tableNames) known.add(name)
    for (const t of schema) for (const c of t.columns || []) known.add(c.name)
    for (const rows of Object.values(data)) {
      const first = Array.isArray(rows) ? rows[0] : null
      if (first && typeof first === 'object') for (const k of Object.keys(first)) known.add(k)
    }
    const prepared = quoteKnownIdentifiers(normaliseDialect(sql), known)
    let raw: unknown
    try {
      raw = db.exec(prepared)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      const isParse = /parse error|Expecting|Unexpected|Lexical error/i.test(msg)
      return empty(msg, isParse)
    }

    // AlaSQL returns an array of results for multi-statement input.
    const statements = prepared.split(/;\s*(?=(?:[^']*'[^']*')*[^']*$)/).map(s => s.trim()).filter(Boolean)
    const results: unknown[] = statements.length > 1 && Array.isArray(raw) ? raw : [raw]

    let affected = 0
    let lastRows: Record<string, unknown>[] | null = null
    let mutated = false
    results.forEach((res, i) => {
      const verb = firstVerb(statements[i] ?? statements[statements.length - 1] ?? '')
      if (READ_VERBS.has(verb)) {
        if (Array.isArray(res)) lastRows = res as Record<string, unknown>[]
      } else {
        mutated = true
        if (typeof res === 'number') affected += res
      }
    })

    // ─── Export tables back ───
    const tables = db.tables as Record<string, { data: unknown[]; columns?: Array<{ columnid: string; dbtypeid?: string }> }>
    const dataAfter: Record<string, unknown[]> = {}
    const schemaAfter: TableSchema[] = []
    const originalByIdent = new Map([...tableNames].map(n => [safeIdent(n), n]))
    for (const [ident, table] of Object.entries(tables)) {
      const name = originalByIdent.get(ident) ?? ident
      dataAfter[name] = (table.data || []).map(r => ({ ...(r as Record<string, unknown>) }))
      const prior = schema.find(s => s.name === name)
      let columns: TableSchema['columns']
      if (table.columns && table.columns.length > 0) {
        columns = table.columns.map(c => ({
          name: c.columnid,
          type: (c.dbtypeid || prior?.columns.find(pc => pc.name === c.columnid)?.type || 'text').toLowerCase(),
        }))
      } else if (prior) {
        columns = [...prior.columns]
        const first = dataAfter[name][0] as Record<string, unknown> | undefined
        for (const key of Object.keys(first || {})) {
          if (!columns.some(c => c.name === key)) columns.push({ name: key, type: 'text' })
        }
      } else {
        const first = dataAfter[name][0] as Record<string, unknown> | undefined
        columns = Object.keys(first || {}).map(k => ({ name: k, type: typeof first?.[k] === 'number' ? 'numeric' : 'text' }))
      }
      schemaAfter.push({ name, columns })
    }

    const rows = (lastRows ?? []) as Record<string, unknown>[]
    return {
      rows: rows.slice(0, MAX_ROWS),
      columns: rows.length > 0 ? Object.keys(rows[0]) : [],
      totalRows: rows.length,
      truncated: rows.length > MAX_ROWS,
      affectedRows: affected,
      mutated,
      dataAfter: mutated ? dataAfter : data,
      schemaAfter: mutated ? schemaAfter : schema,
    }
  } catch (err) {
    return empty(err instanceof Error ? err.message : String(err))
  } finally {
    try { delete (alasql.databases as Record<string, unknown>)[dbName] } catch { /* ignore */ }
  }
}
