/**
 * Scales a small set of AI-generated "seed" rows up to large row counts.
 *
 * Asking an LLM for 100k rows is slow and expensive, so generation works in
 * two phases: the model produces a realistic seed sample per table (a few
 * hundred rows), then this expander synthesises the remainder locally:
 *
 *  - ids: new UUIDs (or continuing integer sequences) — always unique
 *  - foreign keys (`<table>_id`, `<singular>_id`, or a column whose values
 *    match a parent table's ids): sampled from the parent table's final ids
 *  - numbers: jittered around values seen in the seed, keeping int/float shape
 *  - dates/timestamps: spread across the seed's observed range
 *  - booleans / low-cardinality categories (status, type, …): sampled with the
 *    seed's empirical distribution
 *  - free text (names, emails, titles): recombined from seed vocabulary, with
 *    a numeric suffix where uniqueness matters (emails, usernames, slugs)
 *
 * Pure and deterministic for a given seed value (mulberry32 PRNG), so tests
 * are stable.
 */

export type Row = Record<string, unknown>

export interface ExpandTable {
  name: string
  columns: Array<{ name: string; type: string }>
}

function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?)?$/
const EMAIL_RE = /^([^@\s]+)@([^@\s]+\.[^@\s]+)$/
const UNIQUE_HINT = /(^|_)(email|username|user_name|login|slug|handle|code|sku|key|token|phone|url)$/i

function uuid(rand: () => number): string {
  const h = Array.from({ length: 32 }, () => Math.floor(rand() * 16).toString(16))
  h[12] = '4'
  h[16] = ((parseInt(h[16], 16) & 0x3) | 0x8).toString(16)
  return `${h.slice(0, 8).join('')}-${h.slice(8, 12).join('')}-${h.slice(12, 16).join('')}-${h.slice(16, 20).join('')}-${h.slice(20).join('')}`
}

function singular(name: string): string {
  if (name.endsWith('ies')) return name.slice(0, -3) + 'y'
  if (name.endsWith('ses')) return name.slice(0, -2)
  if (name.endsWith('s')) return name.slice(0, -1)
  return name
}

/** Detect FK column → parent table using naming and value overlap. */
export function detectForeignKeys(
  table: ExpandTable,
  seedRows: Row[],
  allTables: ExpandTable[],
  idsByTable: Record<string, unknown[]>,
): Record<string, string> {
  const fks: Record<string, string> = {}
  for (const col of table.columns) {
    const c = col.name
    if (c === 'id' || !/_id$|Id$/.test(c)) continue
    const base = c.replace(/_id$|Id$/, '').toLowerCase()
    const byName = allTables.find(t => t.name !== table.name &&
      (t.name.toLowerCase() === base || singular(t.name.toLowerCase()) === base || t.name.toLowerCase() === base + 's'))
    if (byName) { fks[c] = byName.name; continue }
    // Fall back to value overlap with another table's ids.
    const values = new Set(seedRows.map(r => r[c]).filter(v => v != null))
    if (values.size === 0) continue
    let best: string | null = null
    let bestHits = 0
    for (const [t, ids] of Object.entries(idsByTable)) {
      if (t === table.name) continue
      const idSet = new Set(ids)
      let hits = 0
      for (const v of values) if (idSet.has(v)) hits++
      if (hits > bestHits) { best = t; bestHits = hits }
    }
    if (best && bestHits >= Math.max(1, values.size * 0.5)) fks[c] = best
  }
  return fks
}

type ColumnModel =
  | { kind: 'id-uuid' }
  | { kind: 'id-int'; next: number }
  | { kind: 'fk'; parent: string }
  | { kind: 'number'; min: number; max: number; integer: boolean; decimals: number }
  | { kind: 'date'; min: number; max: number; dateOnly: boolean }
  | { kind: 'bool'; pTrue: number }
  | { kind: 'category'; values: unknown[] }
  | { kind: 'email'; locals: string[]; domains: string[] }
  | { kind: 'text'; values: string[]; words: string[]; unique: boolean }
  | { kind: 'json'; values: unknown[] }
  | { kind: 'null' }

function decimalsOf(n: number): number {
  const s = String(n)
  const i = s.indexOf('.')
  return i === -1 ? 0 : Math.min(4, s.length - i - 1)
}

function buildModel(col: string, seed: Row[], fk: string | undefined): ColumnModel {
  const values = seed.map(r => r[col]).filter(v => v !== null && v !== undefined)
  if (fk) return { kind: 'fk', parent: fk }
  if (values.length === 0) return { kind: 'null' }

  if (col === 'id') {
    if (values.every(v => typeof v === 'number' && Number.isInteger(v))) {
      return { kind: 'id-int', next: Math.max(...(values as number[])) + 1 }
    }
    return { kind: 'id-uuid' }
  }
  if (values.every(v => typeof v === 'boolean')) {
    return { kind: 'bool', pTrue: values.filter(Boolean).length / values.length }
  }
  if (values.every(v => typeof v === 'number')) {
    const nums = values as number[]
    return {
      kind: 'number',
      min: Math.min(...nums),
      max: Math.max(...nums),
      integer: nums.every(Number.isInteger),
      decimals: Math.max(...nums.map(decimalsOf)),
    }
  }
  if (values.every(v => typeof v === 'object')) return { kind: 'json', values }
  const strings = values.map(String)
  if (strings.every(s => UUID_RE.test(s))) return { kind: 'id-uuid' }
  if (strings.every(s => ISO_DATE_RE.test(s))) {
    const times = strings.map(s => Date.parse(s)).filter(t => !Number.isNaN(t))
    if (times.length) {
      return { kind: 'date', min: Math.min(...times), max: Math.max(...times), dateOnly: strings.every(s => s.length === 10) }
    }
  }
  const distinct = [...new Set(strings)]
  if (strings.every(s => EMAIL_RE.test(s))) {
    return {
      kind: 'email',
      locals: strings.map(s => s.split('@')[0]),
      domains: [...new Set(strings.map(s => s.split('@')[1]))],
    }
  }
  // Low-cardinality → categorical (keep empirical distribution).
  if (distinct.length <= Math.max(2, Math.min(12, Math.ceil(strings.length * 0.3)))) {
    return { kind: 'category', values }
  }
  const words = [...new Set(strings.flatMap(s => s.split(/\s+/)).filter(Boolean))]
  return { kind: 'text', values: distinct, words, unique: UNIQUE_HINT.test(col) }
}

function pick<T>(arr: T[], rand: () => number): T {
  return arr[Math.floor(rand() * arr.length)]
}

function generateValue(m: ColumnModel, rand: () => number, serial: number, idsByTable: Record<string, unknown[]>): unknown {
  switch (m.kind) {
    case 'id-uuid': return uuid(rand)
    case 'id-int': return m.next++
    case 'fk': {
      const ids = idsByTable[m.parent]
      return ids && ids.length ? pick(ids, rand) : null
    }
    case 'number': {
      const span = m.max - m.min
      const lo = m.min - span * 0.1
      const hi = m.max + span * 0.1
      let v = lo + rand() * (hi - lo)
      if (m.min >= 0) v = Math.max(0, v)
      return m.integer ? Math.round(v) : Number(v.toFixed(m.decimals || 2))
    }
    case 'date': {
      const t = m.min + rand() * Math.max(m.max - m.min, 86_400_000)
      const iso = new Date(t).toISOString()
      return m.dateOnly ? iso.slice(0, 10) : iso
    }
    case 'bool': return rand() < m.pTrue
    case 'category': return pick(m.values, rand)
    case 'email': return `${pick(m.locals, rand).replace(/\d+$/, '')}${serial}@${pick(m.domains, rand)}`
    case 'text': {
      if (m.unique) return `${pick(m.values, rand)}-${serial}`
      // Recombine: mostly reuse whole values, sometimes splice words for variety.
      if (m.words.length > 3 && rand() < 0.35) {
        const base = pick(m.values, rand).split(/\s+/)
        base[Math.floor(rand() * base.length)] = pick(m.words, rand)
        return base.join(' ')
      }
      return pick(m.values, rand)
    }
    case 'json': return structuredClone(pick(m.values, rand))
    case 'null': return null
  }
}

/**
 * Expand every table in `seed` to `targets[table]` rows. Parent tables are
 * expanded before children so foreign keys reference final ids.
 */
export function expandDataset(
  tables: ExpandTable[],
  seed: Record<string, Row[]>,
  targets: Record<string, number>,
  opts: { seed?: number } = {},
): Record<string, Row[]> {
  const rand = mulberry32(opts.seed ?? 0x5eed)
  const out: Record<string, Row[]> = {}
  const idsByTable: Record<string, unknown[]> = {}
  for (const t of tables) {
    out[t.name] = [...(seed[t.name] || [])]
    idsByTable[t.name] = out[t.name].map(r => r.id).filter(v => v != null)
  }

  // FK graph → topological order (parents first; cycles fall back to input order).
  const fksByTable: Record<string, Record<string, string>> = {}
  for (const t of tables) fksByTable[t.name] = detectForeignKeys(t, out[t.name], tables, idsByTable)
  const order: string[] = []
  const visiting = new Set<string>()
  const visit = (name: string) => {
    if (order.includes(name) || visiting.has(name)) return
    visiting.add(name)
    for (const parent of Object.values(fksByTable[name] || {})) if (parent !== name) visit(parent)
    visiting.delete(name)
    order.push(name)
  }
  for (const t of tables) visit(t.name)

  for (const name of order) {
    const table = tables.find(t => t.name === name)!
    const rows = out[name]
    const target = targets[name] ?? rows.length
    if (rows.length >= target || rows.length === 0) continue
    const columns = [...new Set([...table.columns.map(c => c.name), ...rows.flatMap(r => Object.keys(r))])]
    const models: Record<string, ColumnModel> = {}
    for (const c of columns) models[c] = buildModel(c, rows, fksByTable[name][c])
    const seedCount = rows.length
    for (let i = seedCount; i < target; i++) {
      const row: Row = {}
      for (const c of columns) row[c] = generateValue(models[c], rand, i + 1, idsByTable)
      rows.push(row)
      if (row.id != null) idsByTable[name].push(row.id)
    }
  }
  return out
}
