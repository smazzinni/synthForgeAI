// Pure helpers that turn an uploaded file into a compact sample for the AI prompt.

export type UploadKind = 'sql' | 'csv' | 'json' | 'xml' | 'excel'
export interface Sample { content: string; rows?: number; note: string }

const MAX_ROWS = 25
const MAX_CHARS = 20000
const SQL_FULL_LIMIT = 60000
const MAX_SHEETS = 10

export function uploadKind(fileName: string): UploadKind | null {
  const ext = fileName.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1]
  switch (ext) {
    case 'sql': case 'dump': return 'sql'
    case 'csv': case 'tsv': return 'csv'
    case 'json': return 'json'
    case 'xml': return 'xml'
    case 'xlsx': return 'excel'
    default: return null
  }
}

function parseCsv(text: string, delim: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQ = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (inQ) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++ } else inQ = false
      } else field += c
    } else if (c === '"' && field === '') inQ = true
    else if (c === delim) { row.push(field); field = '' }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++
      row.push(field); field = ''
      rows.push(row); row = []
    } else field += c
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row) }
  return rows.filter(r => !(r.length === 1 && r[0] === ''))
}

function toCsv(rows: string[][]): string {
  return rows
    .map(r => r.map(f => (/[",\n\r]/.test(f) ? `"${f.replace(/"/g, '""')}"` : f)).join(','))
    .join('\n')
}

export function sampleCsv(text: string, opts: { complete: boolean }): Sample {
  const header = text.split(/\r?\n/, 1)[0] ?? ''
  const counts = [',', '\t', ';'].map(d => header.split(d).length)
  const delim = [',', '\t', ';'][counts.indexOf(Math.max(...counts))]
  const all = parseCsv(text, delim)
  const total = Math.max(all.length - 1, 0)
  const kept = all.slice(0, MAX_ROWS + 1)
  let note: string
  if (total <= MAX_ROWS) note = opts.complete ? `${total} rows` : `${total} rows of a larger file`
  else note = opts.complete
    ? `first ${MAX_ROWS} of ${total.toLocaleString('en-US')} rows`
    : `first ${MAX_ROWS} rows of a larger file`
  return { content: toCsv(kept), rows: total, note }
}

function capJson(v: unknown): string {
  const s = JSON.stringify(v, null, 2)
  return s.length > MAX_CHARS ? s.slice(0, MAX_CHARS) : s
}

const isObjArray = (v: unknown): v is Record<string, unknown>[] =>
  Array.isArray(v) && v.length > 0 && v.every(x => x && typeof x === 'object' && !Array.isArray(x))

export function sampleJson(text: string): Sample {
  let data: unknown
  try { data = JSON.parse(text) } catch {
    return { content: text.slice(0, MAX_CHARS), note: 'partial file' }
  }
  if (isObjArray(data)) {
    return {
      content: JSON.stringify(data.slice(0, MAX_ROWS), null, 2),
      rows: data.length,
      note: data.length > MAX_ROWS ? `first ${MAX_ROWS} of ${data.length.toLocaleString('en-US')} records` : `${data.length} records`,
    }
  }
  if (data && typeof data === 'object' && !Array.isArray(data)) {
    const entries = Object.entries(data as Record<string, unknown>)
    if (entries.length > 0 && entries.every(([, v]) => isObjArray(v))) {
      const out: Record<string, unknown[]> = {}
      for (const [k, v] of entries) out[k] = (v as unknown[]).slice(0, MAX_ROWS)
      return { content: JSON.stringify(out, null, 2), note: `${entries.length} tables, first ${MAX_ROWS} rows each` }
    }
  }
  return { content: capJson(data), note: 'JSON document' }
}

export function sampleSql(text: string): Sample {
  if (text.length <= SQL_FULL_LIMIT) return { content: text, note: 'full file' }
  // Split into statements on ';' at end of line outside quotes.
  const stmts: string[] = []
  let start = 0
  let inQ = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (c === "'") inQ = !inQ
    else if (c === ';' && !inQ) { stmts.push(text.slice(start, i + 1).trim()); start = i + 1 }
  }
  const keep: string[] = []
  let inserts = 0
  for (const s of stmts) {
    if (/^(?:--[^\n]*\n\s*)*CREATE\s+(?:\w+\s+)*TABLE\b/i.test(s)) keep.push(s)
    else if (/ALTER\s+TABLE\b[\s\S]*FOREIGN\s+KEY/i.test(s) && /^(?:--[^\n]*\n\s*)*ALTER/i.test(s)) keep.push(s)
    else if (/^(?:--[^\n]*\n\s*)*INSERT\b/i.test(s) && inserts < 20) { inserts++; keep.push(s) }
  }
  return { content: keep.join('\n\n'), note: 'schema + first 20 INSERTs' }
}

export function sampleXml(text: string): Sample {
  return { content: text.slice(0, MAX_CHARS), note: text.length > MAX_CHARS ? 'first 20,000 characters' : 'full file' }
}

function cell(v: unknown): string {
  if (v === null || v === undefined) return ''
  if (v instanceof Date) return isNaN(v.getTime()) ? '' : v.toISOString()
  return String(v)
}

export function sampleSheets(sheets: { name: string; rows: unknown[][] }[]): Sample {
  const used = sheets.slice(0, MAX_SHEETS)
  const parts = used.map(s => {
    const rows = s.rows.slice(0, MAX_ROWS + 1).map(r => r.map(cell))
    return `### Sheet: ${s.name}\n${toCsv(rows)}`
  })
  const n = sheets.length
  return { content: parts.join('\n\n'), note: `${n} sheet${n === 1 ? '' : 's'}${n > MAX_SHEETS ? ` (first ${MAX_SHEETS} used)` : ''}` }
}
