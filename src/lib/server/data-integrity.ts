/**
 * Relational integrity for generated datasets — the "Quality Analyst".
 *
 * LLMs regularly emit seed data with subtle relational bugs: a child row
 * pointing at a parent id that was never generated, two rows sharing an id,
 * an order created before its customer, "42" in a numeric column. This module
 * detects those problems (validateDataset) and fixes them deterministically
 * (repairDataset), and turns the result into a real quality score.
 *
 * Rules (applied parents-before-children):
 *  1. Primary keys: missing or duplicate `id` values are replaced (UUID or
 *     next integer, matching the column's existing shape).
 *  2. Types: numeric/boolean/date columns (by declared type) are coerced from
 *     strings; values that cannot be coerced become null.
 *  3. Foreign keys: values that don't reference an existing parent row are
 *     re-pointed to an existing parent (stable choice by row index), or set
 *     to null when the parent table is empty.
 *  4. Temporal order: a child's created_at/date column is moved to at or after
 *     its parent's created_at (a parent can't be younger than its children).
 *  5. Unique columns (email, username, slug, sku, code…): duplicates get a
 *     numeric suffix.
 */
import { detectForeignKeys, type ExpandTable, type Row } from './data-expander'

export interface IntegrityIssue {
  table: string
  column: string
  kind: 'missing_pk' | 'duplicate_pk' | 'dangling_fk' | 'temporal_order' | 'duplicate_unique' | 'type_mismatch' | 'unknown_table'
  count: number
}

export interface IntegrityReport {
  issues: IntegrityIssue[]
  /** Detected relationships: child table → { column: parent table } */
  relationships: Record<string, Record<string, string>>
  totalRows: number
  /** 0..1 — share of cells/rows that were already correct */
  score: number
}

const UNIQUE_COL = /(^|_)(email|username|user_name|login|slug|handle|sku|code|token|url)$/i
const CREATED_COL = /^(created_at|createdat|created|signup_date|registered_at|joined_at|order_date|date|timestamp|placed_at)$/i
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

type ColType = 'int' | 'float' | 'bool' | 'date' | 'other'
function declaredType(t: string): ColType {
  const s = (t || '').toLowerCase()
  if (/\b(int|integer|bigint|smallint|serial|bigserial)\b/.test(s)) return 'int'
  if (/\b(numeric|decimal|float|double|real|money)\b/.test(s)) return 'float'
  if (/\b(bool|boolean)\b/.test(s)) return 'bool'
  if (/\b(date|timestamp|timestamptz|datetime)\b/.test(s)) return 'date'
  return 'other'
}

/** Explicit FK declared in the type string, e.g. "uuid references users(id)" or "FK → users.id". */
function declaredReference(type: string): string | null {
  const m = (type || '').match(/references\s+["`]?(\w+)["`]?|fk\s*(?:→|->|to)?\s*["`]?(\w+)["`]?/i)
  return m ? (m[1] || m[2]) : null
}

function fnv1a(s: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) }
  return h >>> 0
}

function newUuid(seed: string): string {
  let hex = ''
  let h = fnv1a(seed)
  while (hex.length < 32) { h = Math.imul(h ^ (h >>> 13), 0x5bd1e995) >>> 0; hex += h.toString(16).padStart(8, '0') }
  const c = hex.slice(0, 32).split('')
  c[12] = '4'
  c[16] = ((parseInt(c[16], 16) & 0x3) | 0x8).toString(16)
  const s = c.join('')
  return `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20)}`
}

export function relationshipsFor(tables: ExpandTable[], data: Record<string, Row[]>): Record<string, Record<string, string>> {
  const idsByTable: Record<string, unknown[]> = {}
  for (const t of tables) idsByTable[t.name] = (data[t.name] || []).map(r => r.id).filter(v => v != null)
  const rel: Record<string, Record<string, string>> = {}
  const names = new Set(tables.map(t => t.name))
  for (const t of tables) {
    const fks = detectForeignKeys(t, data[t.name] || [], tables, idsByTable)
    for (const c of t.columns) {
      const ref = declaredReference(c.type)
      if (ref && names.has(ref) && c.name !== 'id') fks[c.name] = ref
    }
    rel[t.name] = fks
  }
  return rel
}

function topoOrder(tables: ExpandTable[], rel: Record<string, Record<string, string>>): string[] {
  const order: string[] = []
  const state = new Map<string, 1 | 2>()
  const visit = (n: string) => {
    if (state.get(n) === 2 || state.get(n) === 1) return
    state.set(n, 1)
    for (const p of Object.values(rel[n] || {})) if (p !== n) visit(p)
    state.set(n, 2)
    order.push(n)
  }
  for (const t of tables) visit(t.name)
  return order
}

function coerce(value: unknown, type: ColType): { value: unknown; changed: boolean } {
  if (value === null || value === undefined) return { value, changed: false }
  switch (type) {
    case 'int':
    case 'float': {
      if (typeof value === 'number') return { value: type === 'int' && !Number.isInteger(value) ? Math.round(value) : value, changed: type === 'int' && !Number.isInteger(value) }
      const n = Number(String(value).replace(/[$,\s]/g, ''))
      return Number.isFinite(n) ? { value: type === 'int' ? Math.round(n) : n, changed: true } : { value: null, changed: true }
    }
    case 'bool': {
      if (typeof value === 'boolean') return { value, changed: false }
      const s = String(value).toLowerCase()
      if (['true', 't', 'yes', 'y', '1'].includes(s)) return { value: true, changed: true }
      if (['false', 'f', 'no', 'n', '0'].includes(s)) return { value: false, changed: true }
      return { value: null, changed: true }
    }
    case 'date': {
      if (typeof value === 'string' && !Number.isNaN(Date.parse(value))) return { value, changed: false }
      if (typeof value === 'number') return { value: new Date(value > 1e12 ? value : value * 1000).toISOString(), changed: true }
      return { value: null, changed: true }
    }
    default:
      return { value, changed: false }
  }
}

/**
 * Validate and repair in one pass. Returns a NEW dataset (input untouched) and
 * the report of what was wrong before repair.
 */
export function repairDataset(
  tables: ExpandTable[],
  input: Record<string, Row[]>,
): { data: Record<string, Row[]>; report: IntegrityReport } {
  const data: Record<string, Row[]> = {}
  for (const [t, rows] of Object.entries(input)) data[t] = (rows || []).map(r => ({ ...r }))
  const issues: IntegrityIssue[] = []
  const add = (table: string, column: string, kind: IntegrityIssue['kind'], n: number) => { if (n > 0) issues.push({ table, column, kind, count: n }) }

  const known = new Set(tables.map(t => t.name))
  for (const t of Object.keys(data)) if (!known.has(t)) add(t, '*', 'unknown_table', data[t].length)

  const rel = relationshipsFor(tables, data)
  const order = topoOrder(tables, rel)
  const totalRows = tables.reduce((s, t) => s + (data[t.name]?.length || 0), 0)
  const totalCells = tables.reduce((s, t) => s + (data[t.name]?.length || 0) * Math.max(1, t.columns.length), 0)
  let badCells = 0

  for (const name of order) {
    const table = tables.find(t => t.name === name)!
    const rows = data[name] || (data[name] = [])
    const colTypes = Object.fromEntries(table.columns.map(c => [c.name, declaredType(c.type)]))

    // 1. Primary keys
    const hasId = table.columns.some(c => c.name === 'id') || rows.some(r => 'id' in r)
    if (hasId) {
      const intIds = rows.length > 0 && rows.every(r => r.id == null || (typeof r.id === 'number' && Number.isInteger(r.id)))
      let nextInt = intIds ? Math.max(0, ...rows.map(r => (typeof r.id === 'number' ? r.id : 0))) + 1 : 0
      const seen = new Set<unknown>()
      let missing = 0, dups = 0
      rows.forEach((r, i) => {
        if (r.id == null || r.id === '') { missing++; r.id = intIds ? nextInt++ : newUuid(`${name}:${i}:missing`) }
        else if (seen.has(r.id)) { dups++; r.id = intIds ? nextInt++ : newUuid(`${name}:${i}:${String(r.id)}`) }
        seen.add(r.id)
      })
      add(name, 'id', 'missing_pk', missing)
      add(name, 'id', 'duplicate_pk', dups)
      badCells += missing + dups
    }

    // 2. Types
    for (const [col, type] of Object.entries(colTypes)) {
      if (type === 'other' || col === 'id' || rel[name][col]) continue
      let changed = 0
      for (const r of rows) {
        if (!(col in r)) continue
        const c = coerce(r[col], type)
        if (c.changed) { changed++; r[col] = c.value }
      }
      add(name, col, 'type_mismatch', changed)
      badCells += changed
    }

    // 3. Foreign keys + 4. temporal order
    for (const [col, parent] of Object.entries(rel[name])) {
      const parentRows = data[parent] || []
      const parentById = new Map(parentRows.map(p => [p.id, p]))
      const parentIds = parentRows.map(p => p.id).filter(v => v != null)
      // Self-references may only point at rows that exist in the same table.
      let dangling = 0
      rows.forEach((r, i) => {
        const v = r[col]
        // Self-references may be null (tree roots); other FKs in generated
        // data must point at a parent.
        if (v == null && parent === name) return
        if (v == null || !parentById.has(v)) {
          dangling++
          const candidates = parent === name ? parentIds.filter(id => id !== r.id) : parentIds
          r[col] = candidates.length ? candidates[fnv1a(`${name}:${col}:${i}`) % candidates.length] : null
        }
      })
      add(name, col, 'dangling_fk', dangling)
      badCells += dangling

      if (parent === name) continue
      const childDateCol = Object.keys(rows[0] || {}).find(k => CREATED_COL.test(k))
      const parentDateCol = Object.keys(parentRows[0] || {}).find(k => CREATED_COL.test(k))
      if (!childDateCol || !parentDateCol) continue
      let moved = 0
      rows.forEach((r, i) => {
        const p = parentById.get(r[col])
        if (!p) return
        const pt = Date.parse(String(p[parentDateCol]))
        const ct = Date.parse(String(r[childDateCol]))
        if (Number.isNaN(pt) || Number.isNaN(ct) || ct >= pt) return
        moved++
        const later = new Date(pt + (1 + (fnv1a(`${name}:${i}`) % 30)) * 86_400_000 * (Math.min(1, (Date.now() - pt) / (31 * 86_400_000)) || 0.01))
        const s = String(r[childDateCol])
        r[childDateCol] = s.length === 10 ? later.toISOString().slice(0, 10) : later.toISOString()
      })
      add(name, childDateCol, 'temporal_order', moved)
      badCells += moved
    }

    // 5. Unique-ish columns
    const uniqueCols = [...new Set([...table.columns.map(c => c.name), ...Object.keys(rows[0] || {})])].filter(c => UNIQUE_COL.test(c))
    for (const col of uniqueCols) {
      const seen = new Map<string, number>()
      let dups = 0
      for (const r of rows) {
        if (r[col] == null) continue
        const v = String(r[col])
        const n = seen.get(v.toLowerCase()) || 0
        if (n > 0) {
          dups++
          const at = v.indexOf('@')
          r[col] = at > 0 ? `${v.slice(0, at)}+${n}${v.slice(at)}` : `${v}-${n}`
        }
        seen.set(v.toLowerCase(), n + 1)
      }
      add(name, col, 'duplicate_unique', dups)
      badCells += dups
    }
  }

  const relationships = Object.fromEntries(Object.entries(rel).filter(([, v]) => Object.keys(v).length > 0))
  const score = totalCells === 0 ? 1 : Math.max(0, Math.min(1, 1 - badCells / totalCells))
  return { data, report: { issues, relationships, totalRows, score: Math.round(score * 100) / 100 } }
}

/** Tables ordered parents-before-children (FK dependencies; cycles keep input order). */
export function dependencyOrder<T extends ExpandTable>(tables: T[], data: Record<string, Row[]> = {}): T[] {
  const order = topoOrder(tables, relationshipsFor(tables, data))
  return order.map(n => tables.find(t => t.name === n)!).filter(Boolean)
}

export function validateDataset(tables: ExpandTable[], data: Record<string, Row[]>): IntegrityReport {
  return repairDataset(tables, data).report
}

export function isUuid(v: unknown): boolean {
  return typeof v === 'string' && UUID_RE.test(v)
}
