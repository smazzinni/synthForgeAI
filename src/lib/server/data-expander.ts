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

import { Faker, en } from '@faker-js/faker'

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
const PERSON_NAME_COL = /^(name|full_?name|customer_?name|user_?name_?full|contact_?name|employee_?name|author|patient_?name|student_?name|owner_?name|display_?name)$/i
const FAKER_COLUMNS: Array<[RegExp, (f: Faker) => string]> = [
  [/^first_?name$/i, f => f.person.firstName()],
  [/^last_?name$|^surname$/i, f => f.person.lastName()],
  [/^(full_?)?name$/i, f => f.person.fullName()],
  [/company|organi[sz]ation|employer/i, f => f.company.name()],
  [/phone|mobile|tel/i, f => f.phone.number()],
  [/^(street|address|address_?line_?1)$/i, f => f.location.streetAddress()],
  [/^city$/i, f => f.location.city()],
  [/^(state|province|region)$/i, f => f.location.state()],
  [/^country$/i, f => f.location.country()],
  [/zip|postal|postcode/i, f => f.location.zipCode()],
  [/job_?title|position|role_?title/i, f => f.person.jobTitle()],
  [/product(_?name)?$|item_?name/i, f => f.commerce.productName()],
  [/description|bio|summary|notes?$|comment/i, f => f.lorem.sentence()],
  [/url|website|homepage/i, f => f.internet.url()],
  [/^username$|^handle$|^login$/i, f => f.internet.username()],
]
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
  | { kind: 'person-name'; firsts: string[]; lasts: string[]; unique: boolean }
  | { kind: 'digits-pattern'; patterns: string[]; unique: boolean }
  | { kind: 'faker'; gen: (f: Faker) => string; unique: boolean }
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
  const unique = UNIQUE_HINT.test(col)
  // Person names: recombine first/last tokens from the seed (keeps the locale
  // the AI chose — e.g. Indian or German names stay Indian or German).
  if (PERSON_NAME_COL.test(col) && distinct.length >= 2 && strings.filter(s => s.trim().split(/\s+/).length >= 2).length >= strings.length * 0.8) {
    const parts = strings.map(s => s.trim().split(/\s+/))
    return { kind: 'person-name', firsts: parts.map(p => p[0]), lasts: parts.map(p => p.slice(1).join(' ')), unique }
  }
  // Phone numbers, postcodes, codes: keep the format, randomise the digits.
  if (strings.every(s => /\d/.test(s) && s.replace(/[\d\s()+\-./#]/g, '').length <= 3)) {
    return { kind: 'digits-pattern', patterns: distinct, unique: false }
  }
  // Few distinct seed values for a well-known column → fall back to Faker.
  const fakerGen = FAKER_COLUMNS.find(([re]) => re.test(col))?.[1]
  if (fakerGen && distinct.length < 5) return { kind: 'faker', gen: fakerGen, unique }
  // Low-cardinality → categorical (keep empirical distribution).
  if (distinct.length <= Math.max(2, Math.min(12, Math.ceil(strings.length * 0.3)))) {
    return { kind: 'category', values }
  }
  const words = [...new Set(strings.flatMap(s => s.split(/\s+/)).filter(Boolean))]
  return { kind: 'text', values: distinct, words, unique }
}

function pick<T>(arr: T[], rand: () => number): T {
  return arr[Math.floor(rand() * arr.length)]
}

function generateValue(m: ColumnModel, rand: () => number, serial: number, idsByTable: Record<string, unknown[]>, faker: Faker): unknown {
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
    case 'person-name': {
      const v = `${pick(m.firsts, rand)} ${pick(m.lasts, rand)}`.trim()
      return m.unique ? `${v} ${serial}` : v
    }
    case 'digits-pattern': {
      const v = pick(m.patterns, rand).replace(/\d/g, (d, i: number) => (i === 0 && d !== '0' ? String(1 + Math.floor(rand() * 9)) : String(Math.floor(rand() * 10))))
      return m.unique ? `${v}${serial}` : v
    }
    case 'faker': {
      const v = m.gen(faker)
      return m.unique ? `${v}-${serial}` : v
    }
    case 'json': return structuredClone(pick(m.values, rand))
    case 'null': return null
  }
}

const CREATED_COL = /^(created_at|createdat|created|signup_date|registered_at|joined_at|order_date|date|timestamp|placed_at)$/i

/** id → row lookup that stays valid while the parent table grows (parents are finished first). */
function rowIndex(rows: Row[] = []): Map<unknown, Row> {
  const m = new Map<unknown, Row>()
  for (const r of rows) if (r.id != null) m.set(r.id, r)
  return m
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
  const faker = new Faker({ locale: [en] })
  faker.seed(opts.seed ?? 0x5eed)
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
    // Temporal order: a child row is created after the parent it points to.
    const dateCol = columns.find(c => CREATED_COL.test(c))
    const parentLinks = Object.entries(fksByTable[name] || {})
      .filter(([, parent]) => parent !== name)
      .map(([col, parent]) => {
        const parentDate = Object.keys(out[parent]?.[0] || {}).find(k => CREATED_COL.test(k))
        return parentDate ? { col, parent, parentDate, byId: rowIndex(out[parent]) } : null
      })
      .filter((x): x is { col: string; parent: string; parentDate: string; byId: Map<unknown, Row> } => !!x)
    for (let i = seedCount; i < target; i++) {
      const row: Row = {}
      for (const c of columns) row[c] = generateValue(models[c], rand, i + 1, idsByTable, faker)
      if (dateCol && typeof row[dateCol] === 'string') {
        let earliest = Number.NEGATIVE_INFINITY
        for (const link of parentLinks) {
          const t = Date.parse(String(link.byId.get(row[link.col])?.[link.parentDate] ?? ''))
          if (!Number.isNaN(t) && t > earliest) earliest = t
        }
        const own = Date.parse(String(row[dateCol]))
        if (Number.isFinite(earliest) && !Number.isNaN(own) && own < earliest) {
          const shifted = new Date(earliest + Math.floor(rand() * 30 * 86_400_000))
          const iso = new Date(Math.min(shifted.getTime(), Date.now())).toISOString()
          row[dateCol] = String(row[dateCol]).length === 10 ? iso.slice(0, 10) : iso
        }
      }
      rows.push(row)
      if (row.id != null) idsByTable[name].push(row.id)
    }
  }
  return out
}

// ─── Schema-only synthesis (no AI) ───────────────────────────────────────────
// Used when the AI is not configured, fails for a table, or returns nothing:
// builds realistic seed rows from column names and declared types alone, so a
// generation never comes back empty. Foreign keys are left null here and are
// pointed at real parent rows by the integrity repair that runs afterwards.

function typeOf(t: string): 'int' | 'float' | 'bool' | 'date' | 'datetime' | 'uuid' | 'json' | 'text' {
  const s = (t || '').toLowerCase()
  if (/uuid/.test(s)) return 'uuid'
  if (/\b(serial|bigserial|int|integer|bigint|smallint|tinyint)\b/.test(s)) return 'int'
  if (/\b(numeric|decimal|float|double|real|money)\b/.test(s)) return 'float'
  if (/\b(bool|boolean)\b/.test(s)) return 'bool'
  if (/\btimestamp|datetime\b/.test(s)) return 'datetime'
  if (/\bdate\b/.test(s)) return 'date'
  if (/\bjsonb?\b/.test(s)) return 'json'
  return 'text'
}

const SEMANTIC: Array<[RegExp, (f: Faker, i: number) => unknown]> = [
  [/^email$|_email$/i, (f, i) => `${f.internet.username().toLowerCase().replace(/[^a-z0-9._]/g, '')}${i}@example.com`],
  [/^first_?name$/i, f => f.person.firstName()],
  [/^last_?name$|^surname$/i, f => f.person.lastName()],
  [/^(full_?|customer_?|user_?|contact_?|employee_?|patient_?|student_?|author_?|owner_?|display_?|person_?|member_?|guest_?|driver_?|doctor_?|teacher_?)?name$/i, f => f.person.fullName()],
  [/username|^login$|^handle$/i, (f, i) => `${f.internet.username()}${i}`],
  [/phone|mobile/i, f => f.phone.number()],
  [/company|organi[sz]ation|employer|vendor|supplier/i, f => f.company.name()],
  [/^(street|address|address_?line_?1)$/i, f => f.location.streetAddress()],
  [/^city$/i, f => f.location.city()],
  [/^(state|province|region)$/i, f => f.location.state()],
  [/^country$/i, f => f.location.country()],
  [/^country_?code$/i, f => f.location.countryCode()],
  [/zip|postal|postcode/i, f => f.location.zipCode()],
  [/^(lat|latitude)$/i, f => f.location.latitude()],
  [/^(lng|lon|longitude)$/i, f => f.location.longitude()],
  [/job_?title|position|designation/i, f => f.person.jobTitle()],
  [/department|dept/i, f => f.commerce.department()],
  [/product(_?name)?$|item_?name/i, f => f.commerce.productName()],
  [/^title$|subject|headline/i, f => f.lorem.sentence({ min: 3, max: 7 }).replace(/\.$/, '')],
  [/description|bio|summary|notes?$|comment|body|content/i, f => f.lorem.sentence()],
  [/url|website|homepage|link/i, f => f.internet.url()],
  [/^(sku|code|reference|ref)$|_code$|_number$/i, (f, i) => `${f.string.alpha({ length: 3, casing: 'upper' })}-${String(1000 + i)}`],
  [/currency/i, f => f.finance.currencyCode()],
  [/^(price|amount|total|cost|salary|balance|subtotal|tax|fee)/i, f => Number(f.finance.amount({ min: 5, max: 2000, dec: 2 }))],
  [/quantity|qty|count|stock/i, f => f.number.int({ min: 1, max: 50 })],
  [/rating|score/i, f => f.number.int({ min: 1, max: 5 })],
  [/^age$/i, f => f.number.int({ min: 18, max: 80 })],
  [/^gender$/i, f => f.helpers.arrayElement(['female', 'male', 'non-binary'])],
  [/status$/i, f => f.helpers.arrayElement(['active', 'active', 'active', 'pending', 'inactive'])],
  [/^(type|category|kind|tier|level|priority)$/i, f => f.helpers.arrayElement(['standard', 'premium', 'basic', 'enterprise'])],
  [/color|colour/i, f => f.color.human()],
  [/ip(_?address)?$/i, f => f.internet.ipv4()],
]

export function synthesizeTable(table: ExpandTable, count: number, opts: { seed?: number } = {}): Row[] {
  const faker = new Faker({ locale: [en] })
  faker.seed(opts.seed ?? 0xc0ffee)
  const now = Date.now()
  const rows: Row[] = []
  for (let i = 0; i < count; i++) {
    const row: Row = {}
    for (const col of table.columns) {
      const name = col.name
      const t = typeOf(col.type)
      if (name === 'id') { row.id = t === 'int' ? i + 1 : faker.string.uuid(); continue }
      if (/_id$|Id$/.test(name)) { row[name] = null; continue } // repaired to a real parent later
      const sem = SEMANTIC.find(([re]) => re.test(name))?.[1]
      if (/^(created|updated|deleted)_?at$|_at$|_date$|^date$/i.test(name) || t === 'date' || t === 'datetime') {
        const d = new Date(now - faker.number.int({ min: 0, max: 730 }) * 86_400_000 - faker.number.int({ min: 0, max: 86_399 }) * 1000)
        row[name] = /^deleted/i.test(name) ? null : t === 'date' ? d.toISOString().slice(0, 10) : d.toISOString()
        continue
      }
      if (sem && t !== 'bool') { row[name] = sem(faker, i + 1); continue }
      switch (t) {
        case 'uuid': row[name] = faker.string.uuid(); break
        case 'int': row[name] = faker.number.int({ min: 0, max: 1000 }); break
        case 'float': row[name] = Number(faker.number.float({ min: 0, max: 1000, fractionDigits: 2 })); break
        case 'bool': row[name] = faker.datatype.boolean({ probability: 0.7 }); break
        case 'json': row[name] = { note: faker.lorem.words(3) }; break
        default: row[name] = faker.lorem.words({ min: 1, max: 3 })
      }
    }
    // updated_at never before created_at
    if (typeof row.created_at === 'string' && typeof row.updated_at === 'string' && row.updated_at < row.created_at) row.updated_at = row.created_at
    rows.push(row)
  }
  return rows
}
