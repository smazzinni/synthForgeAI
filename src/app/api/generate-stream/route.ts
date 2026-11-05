import { NextRequest, after } from 'next/server'
import { requireUser } from '@/lib/server/auth'
import {
  countRows,
  createDatabase,
  getDatabase,
  updateDatabase,
} from '@/lib/server/synthetic-store'
import {
  cancelJob,
  createJob,
  emit,
  failJob,
  getActiveJobForDatabase,
  getJob,
  streamJob,
  type GenerationJob,
} from '@/lib/server/generation-jobs'
import { expandDataset, synthesizeTable } from '@/lib/server/data-expander'
import { applyPrivacy, privacyMaskingEnabled } from '@/lib/server/data-privacy'
import { dependencyOrder, relationshipsFor, repairDataset, type IntegrityReport } from '@/lib/server/data-integrity'

// ─── Streaming Database Generation API ───
// POST   starts a generation job and streams its progress (SSE).
// GET    ?jobId=… | ?databaseId=…  re-attaches to a running job (SSE when
//        Accept: text/event-stream) or returns its status JSON.
// DELETE ?jobId=… | ?databaseId=…  cancels a running job (explicit "Stop").
//
// The job is decoupled from the HTTP connection: if the client disconnects,
// generation continues, rows keep being persisted, and the database is marked
// `ready` when done. `after()` keeps the serverless function alive until then.

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300 // Vercel plan ceiling; Railway/Docker have no limit

const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY
const DEEPSEEK_BASE_URL = process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com'
/**
 * Model for data generation. Reasoning ("thinking") models are many times
 * slower and add nothing to row generation, so they are never used here
 * unless set explicitly via GENERATION_MODEL.
 */
const CONFIGURED_MODEL = process.env.GENERATION_MODEL ||
  (process.env.DEEPSEEK_MODEL && !/reason|think|\br1\b/i.test(process.env.DEEPSEEK_MODEL) ? process.env.DEEPSEEK_MODEL : 'deepseek-chat')
/** Tried in order when the API rejects a model name (providers rename models). */
const MODEL_FALLBACKS = [CONFIGURED_MODEL, 'deepseek-chat', 'deepseek-flash', 'deepseek-v4-pro']
  .filter((m, i, a) => a.indexOf(m) === i)
/** Output budget per AI call; lowered automatically if the API reports a smaller limit. */
const SEED_MAX_TOKENS = Number.parseInt(process.env.DEEPSEEK_MAX_TOKENS || '', 10) || 8000

const MAX_TABLES = 30
const MAX_ROWS_PER_TABLE = 100_000
const MAX_TOTAL_ROWS = 250_000
/** Rows per table the AI writes itself; the rest are synthesised locally from them. */
const SEED_ROWS_PER_TABLE = Math.max(5, Number.parseInt(process.env.GENERATION_SEED_ROWS || '', 10) || 25)
/** Parallel AI calls (one per table). */
const AI_CONCURRENCY = Math.max(1, Number.parseInt(process.env.GENERATION_CONCURRENCY || '', 10) || 10)
const PERSIST_INTERVAL_MS = 2500     // write progress to storage at most this often (scaled up for big datasets)
const PROGRESS_INTERVAL_MS = 300     // emit progress events at most this often
const UPSTREAM_IDLE_TIMEOUT_MS = 90_000
const MAX_ATTEMPTS_PER_TABLE = 2

// Learned at runtime: the model name and output limit the API accepts.
let workingModel: string | null = null
let workingMaxTokens = SEED_MAX_TOKENS

interface GenerationSchema {
  name: string
  columns: Array<{ name: string; type: string }>
}

interface GenerationRequest {
  databaseId?: string
  databaseName?: string
  schema: GenerationSchema[]
  rowCounts: Record<string, number>
  instructions?: string
  conversationHistory?: Array<{ role: string; content: string }>
}

const json = (body: unknown, status = 200) => Response.json(body, { status })

// ─── Validation ───
function validate(raw: unknown): { ok: true; req: GenerationRequest } | { ok: false; error: string } {
  if (!raw || typeof raw !== 'object') return { ok: false, error: 'Invalid request body' }
  const b = raw as Record<string, unknown>
  if (!Array.isArray(b.schema) || b.schema.length === 0) return { ok: false, error: 'Schema is required' }
  if (b.schema.length > MAX_TABLES) return { ok: false, error: `At most ${MAX_TABLES} tables per generation` }

  const schema: GenerationSchema[] = []
  for (const t of b.schema as unknown[]) {
    const tt = t as { name?: unknown; columns?: unknown }
    if (typeof tt?.name !== 'string' || !tt.name.trim() || !Array.isArray(tt.columns)) {
      return { ok: false, error: 'Each table needs a name and a columns array' }
    }
    schema.push({
      name: tt.name.trim(),
      columns: (tt.columns as Array<{ name?: unknown; type?: unknown }>)
        .filter(c => typeof c?.name === 'string')
        .map(c => ({ name: String(c.name), type: String(c.type ?? 'text') })),
    })
  }

  const rowCounts: Record<string, number> = {}
  const rc = (b.rowCounts && typeof b.rowCounts === 'object' ? b.rowCounts : {}) as Record<string, unknown>
  for (const t of schema) {
    const n = Math.floor(Number(rc[t.name] ?? 10))
    rowCounts[t.name] = Math.min(Math.max(Number.isFinite(n) ? n : 10, 1), MAX_ROWS_PER_TABLE)
  }
  const total = Object.values(rowCounts).reduce((s, n) => s + n, 0)
  if (total > MAX_TOTAL_ROWS) return { ok: false, error: `At most ${MAX_TOTAL_ROWS.toLocaleString()} rows per generation` }

  return {
    ok: true,
    req: {
      databaseId: typeof b.databaseId === 'string' && b.databaseId ? b.databaseId : undefined,
      databaseName: typeof b.databaseName === 'string' ? b.databaseName.slice(0, 200) : undefined,
      schema,
      rowCounts,
      instructions: typeof b.instructions === 'string' ? b.instructions.slice(0, 8000) : undefined,
      conversationHistory: Array.isArray(b.conversationHistory)
        ? (b.conversationHistory as Array<{ role?: unknown; content?: unknown }>)
            .filter(m => (m?.role === 'user' || m?.role === 'assistant') && typeof m.content === 'string')
            .slice(-6)
            .map(m => ({ role: String(m.role), content: String(m.content).slice(0, 4000) }))
        : undefined,
    },
  }
}

// ─── Prompts ───
/** One table, compact output: a header row of column names, then one JSON array per row. */
function buildTablePrompt(
  req: GenerationRequest,
  table: GenerationSchema,
  rowCount: number,
  parentHints: string[],
): string {
  const cols = table.columns.map((c, i) => `${i + 1}. ${c.name} (${c.type})`).join('\n')
  const header = JSON.stringify(table.columns.map(c => c.name))
  const context = (req.conversationHistory || [])
    .filter(m => m.role === 'user')
    .slice(-3)
    .map(m => m.content.slice(0, 600))
    .join('\n')
  return `You generate realistic synthetic rows for ONE table of the database "${req.databaseName || 'synthetic_db'}".
${req.instructions ? `\nINSTRUCTIONS: ${req.instructions}\n` : ''}${context ? `\nWHAT THE USER ASKED FOR:\n${context}\n` : ''}
TABLE: ${table.name}
OTHER TABLES IN THIS DATABASE: ${req.schema.filter(t => t.name !== table.name).map(t => t.name).join(', ') || '(none)'}
COLUMNS, in this exact order:
${cols}
${parentHints.length ? `\nFOREIGN KEYS — use only these existing ids:\n${parentHints.join('\n')}\n` : ''}
OUTPUT FORMAT (strict):
- Line 1: exactly this header: ${header}
- Then exactly ${rowCount} lines, each ONE JSON array with the values in the column order above.
- No markdown, no code fences, no comments, no blank lines, no text before or after.
- ids: UUID strings unless the column type is an integer (then 1, 2, 3…). Dates: ISO 8601.
- Values must be realistic, varied and domain-appropriate (real-looking names, products, amounts, statuses), with sensible distributions.
- Emails: use example.com / example.org domains.`
}

// ─── AI calls: streaming, with model / max_tokens self-healing ───
class AiError extends Error {
  constructor(message: string, readonly status: number, readonly body: string) { super(message) }
}

async function streamOnce(
  job: GenerationJob,
  model: string,
  maxTokens: number,
  messages: Array<{ role: string; content: string }>,
  onLine: (line: string) => void,
): Promise<string> {
  const ctrl = new AbortController()
  const onJobAbort = () => ctrl.abort()
  job.abort.signal.addEventListener('abort', onJobAbort)
  let idleTimer: ReturnType<typeof setTimeout> | null = null
  const resetIdle = () => {
    if (idleTimer) clearTimeout(idleTimer)
    idleTimer = setTimeout(() => ctrl.abort(), UPSTREAM_IDLE_TIMEOUT_MS)
  }
  try {
    resetIdle()
    const res = await fetch(`${DEEPSEEK_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${DEEPSEEK_API_KEY}` },
      // V4 models think by default; row generation must stay fast.
      body: JSON.stringify({ model, thinking: { type: process.env.GENERATION_THINKING === 'true' ? 'enabled' : 'disabled' }, messages, stream: true, max_tokens: maxTokens, temperature: 0.9 }),
      signal: ctrl.signal,
    })
    if (!res.ok || !res.body) {
      const text = await res.text().catch(() => '')
      throw new AiError(`AI service error (${res.status})${text ? `: ${text.slice(0, 200)}` : ''}`, res.status, text)
    }
    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let sseBuffer = ''
    let content = ''
    let finishReason = ''
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      resetIdle()
      sseBuffer += decoder.decode(value, { stream: true })
      const sseLines = sseBuffer.split('\n')
      sseBuffer = sseLines.pop() || ''
      for (const sseLine of sseLines) {
        const t = sseLine.trim()
        if (!t.startsWith('data: ')) continue
        const payload = t.slice(6)
        if (payload === '[DONE]') continue
        let parsed: { choices?: Array<{ delta?: { content?: string }; finish_reason?: string | null }> }
        try { parsed = JSON.parse(payload) } catch { continue }
        const choice = parsed.choices?.[0]
        if (!choice) continue
        if (choice.delta?.content) {
          content += choice.delta.content
          const lines = content.split('\n')
          content = lines.pop() || ''
          for (const line of lines) onLine(line)
        }
        if (choice.finish_reason) finishReason = choice.finish_reason
      }
    }
    if (content.trim()) onLine(content)
    return finishReason
  } finally {
    if (idleTimer) clearTimeout(idleTimer)
    job.abort.signal.removeEventListener('abort', onJobAbort)
  }
}

/** Stream a completion, adapting to the API: unknown model → next candidate; max_tokens too high → lower. */
async function streamCompletion(
  job: GenerationJob,
  messages: Array<{ role: string; content: string }>,
  onLine: (line: string) => void,
): Promise<string> {
  const models = workingModel ? [workingModel, ...MODEL_FALLBACKS.filter(m => m !== workingModel)] : MODEL_FALLBACKS
  let lastErr: unknown = null
  for (const model of models) {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const reason = await streamOnce(job, model, workingMaxTokens, messages, onLine)
        workingModel = model
        return reason
      } catch (err) {
        lastErr = err
        if (!(err instanceof AiError)) throw err
        const body = err.body.toLowerCase()
        if ([400, 422].includes(err.status) && body.includes('max_tokens')) {
          const range = err.body.match(/\[\s*\d+\s*,\s*(\d+)\s*\]/) || err.body.match(/(?:max(?:imum)?|at most|<=?)\D{0,20}(\d{3,7})/i)
          const limit = range ? Number(range[1]) : Math.floor(workingMaxTokens / 2)
          if (limit > 0 && limit < workingMaxTokens) { workingMaxTokens = limit; continue }
        }
        if ([400, 404, 422].includes(err.status) && /model/.test(body)) break // try the next model name
        if ([429, 500, 502, 503, 504].includes(err.status) && attempt < 2) {
          await new Promise(r => setTimeout(r, 1000 * (attempt + 1) ** 2))
          continue
        }
        throw err
      }
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('AI service unavailable')
}

/** Run tasks with at most `limit` in flight. */
async function mapLimit<T>(items: T[], limit: number, fn: (item: T) => Promise<void>): Promise<void> {
  const queue = [...items]
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (let item = queue.shift(); item !== undefined; item = queue.shift()) await fn(item)
  })
  await Promise.all(workers)
}

// ─── The worker ───
async function runGeneration(job: GenerationJob, fullReq: GenerationRequest, seed: Record<string, unknown[]>): Promise<void> {
  const startTime = Date.now()
  // Phase 1 asks the AI for at most SEED_ROWS_PER_TABLE rows per table;
  // phase 2 scales each table up to the requested count locally.
  const finalCounts = fullReq.rowCounts
  const req: GenerationRequest = {
    ...fullReq,
    // Parents first, so children can reference ids that already exist.
    schema: dependencyOrder(fullReq.schema),
    rowCounts: Object.fromEntries(Object.entries(finalCounts).map(([t, n]) => [t, Math.min(n, SEED_ROWS_PER_TABLE)])),
  }
  const allTableData: Record<string, unknown[]> = {}
  for (const [t, rows] of Object.entries(seed)) if (Array.isArray(rows)) allTableData[t] = [...rows]
  const existingRowCount = countRows(allTableData)
  const baseline: Record<string, number> = Object.fromEntries(req.schema.map(t => [t.name, allTableData[t.name]?.length || 0]))
  const totalTarget = Object.values(finalCounts).reduce((s, n) => s + n, 0)

  let generatedThisRun = 0
  let malformed = 0
  let lastPersist = Date.now()
  let lastProgress = 0
  let persistChain: Promise<unknown> = Promise.resolve()

  const generatedFor = (t: string) => (allTableData[t]?.length || 0) - (baseline[t] || 0)

  let qualityScore: number | null = null
  const persist = (final = false) => {
    const snapshot = { ...allTableData }
    persistChain = persistChain.then(() =>
      updateDatabase(job.userId, job.databaseId, {
        data_json: snapshot,
        row_count: countRows(snapshot),
        ...(final ? { status: 'ready', schema_json: req.schema, quality_score: qualityScore } : {}),
      }).catch(err => console.warn('[generate] persist failed:', err instanceof Error ? err.message : err)),
    )
    return persistChain
  }

  const progress = (table: string, force = false, message?: string) => {
    const now = Date.now()
    if (!force && now - lastProgress < PROGRESS_INTERVAL_MS) return
    lastProgress = now
    emit(job, {
      type: 'progress',
      table,
      rowsInserted: table ? generatedFor(table) : 0,
      totalInserted: generatedThisRun,
      targetRows: table ? req.rowCounts[table] || 0 : totalTarget,
      message,
    })
    // Persisting rewrites the whole dataset, so slow down for big ones.
    const interval = PERSIST_INTERVAL_MS * Math.max(1, Math.ceil(generatedThisRun / 20_000))
    if (now - lastPersist >= interval) {
      lastPersist = now
      void persist()
    }
  }

  /** Parse one streamed line for `table` (compact arrays or objects); returns the row or null. */
  const parseRow = (table: GenerationSchema, rawLine: string, state: { header: string[] | null }): Record<string, unknown> | null => {
    const line = rawLine.trim().replace(/,$/, '')
    if (!line || line.startsWith('```') || /^#{2,3}\s*TABLE/i.test(line)) return null
    let parsed: unknown
    try { parsed = JSON.parse(line) } catch { malformed++; return null }
    const cols = table.columns.map(c => c.name)
    if (Array.isArray(parsed)) {
      // Header row: an array of strings that names our columns.
      if (!state.header && parsed.every(v => typeof v === 'string') && parsed.filter(v => cols.includes(v as string)).length >= Math.min(2, cols.length)) {
        state.header = parsed as string[]
        return null
      }
      const values = parsed as unknown[]
      const order = state.header ?? cols
      if (values.length !== order.length) { malformed++; return null }
      const obj: Record<string, unknown> = {}
      order.forEach((c, i) => { obj[c] = values[i] })
      parsed = obj
    }
    if (!parsed || typeof parsed !== 'object') { malformed++; return null }
    const rec = parsed as Record<string, unknown>
    if (cols.length === 0) return rec
    if (cols.filter(c => c in rec).length < Math.min(2, cols.length)) { malformed++; return null }
    return Object.fromEntries(cols.map(c => [c, rec[c] ?? null]))
  }

  const parentHintsFor = (table: GenerationSchema): string[] => {
    const rel = relationshipsFor(req.schema, allTableData as Record<string, Record<string, unknown>[]>)[table.name] || {}
    return Object.entries(rel).map(([col, parent]) => {
      const ids = (allTableData[parent] || []).slice(0, 40).map(r => (r as { id?: unknown }).id).filter(v => v != null)
      return ids.length ? `- ${col} → ${parent}.id, one of: ${JSON.stringify(ids)}` : `- ${col} → ${parent}.id`
    })
  }

  const aiAvailable = !!DEEPSEEK_API_KEY
  let aiFailures = 0
  let lastAiError = ''

  const seedTable = async (table: GenerationSchema) => {
    const target = req.rowCounts[table.name]
    for (let attempt = 0; attempt < MAX_ATTEMPTS_PER_TABLE && aiAvailable && !job.cancelRequested; attempt++) {
      const need = target - generatedFor(table.name)
      if (need <= 0) break
      const state = { header: null as string[] | null }
      progress(table.name, true, `Generating [${table.name}]…`)
      try {
        await streamCompletion(job, [
          { role: 'system', content: buildTablePrompt(req, table, need, parentHintsFor(table)) },
          { role: 'user', content: `Output the header line and ${need} rows for ${table.name} now.` },
        ], line => {
          if (job.cancelRequested || generatedFor(table.name) >= target) return
          const row = parseRow(table, line, state)
          if (!row) return
          ;(allTableData[table.name] ||= []).push(row)
          generatedThisRun++
          progress(table.name)
        })
      } catch (err) {
        if (job.cancelRequested) return
        aiFailures++
        lastAiError = err instanceof Error ? err.message : String(err)
        console.warn(`[generate] AI failed for ${table.name}:`, lastAiError)
        break
      }
      if (generatedFor(table.name) >= Math.ceil(target * 0.6)) break
    }
    // Never leave a table empty: fill any shortfall with the built-in generator.
    const short = target - generatedFor(table.name)
    if (short > 0 && !job.cancelRequested && generatedFor(table.name) === 0) {
      const rows = synthesizeTable(table, Math.min(short, SEED_ROWS_PER_TABLE), { seed: startTime + table.name.length })
      ;(allTableData[table.name] ||= []).push(...rows)
      generatedThisRun += rows.length
    }
    emit(job, { type: 'table_complete', table: table.name, totalRows: allTableData[table.name]?.length || 0 })
  }

  try {
    emit(job, {
      type: 'progress', table: '', totalInserted: 0, targetRows: totalTarget,
      message: aiAvailable
        ? `Generating ${req.schema.length} table${req.schema.length === 1 ? '' : 's'} in parallel…`
        : 'AI is not configured — using the built-in generator',
    })
    await mapLimit(req.schema, AI_CONCURRENCY, seedTable)
    if (aiAvailable && aiFailures > 0) {
      emit(job, {
        type: 'progress', table: '', totalInserted: generatedThisRun, targetRows: totalTarget,
        message: `AI failed for ${aiFailures} table${aiFailures === 1 ? '' : 's'} (${lastAiError.slice(0, 120)}) — filled with the built-in generator`,
      })
    }
    if (malformed > 0) console.warn(`[generate] job ${job.id}: skipped ${malformed} malformed line(s)`)
  } catch (err) {
    if (!job.cancelRequested) {
      console.error('[generate] job failed:', err)
      await persist(true)
      failJob(job, generatedThisRun > 0
        ? `Generation stopped early (${err instanceof Error ? err.message : 'interrupted'}). ${generatedThisRun} rows were saved.`
        : (err instanceof Error ? err.message : 'Generation failed'))
      return
    }
  }

  // ─── Quality Analyst: repair relational integrity of the AI sample ───
  const describeFixes = (r: IntegrityReport) => {
    const fixed = r.issues.filter(i => i.kind !== 'unknown_table').reduce((n, i) => n + i.count, 0)
    return fixed === 0
      ? 'all keys and constraints check out'
      : `repaired ${fixed.toLocaleString('en-US')} value${fixed === 1 ? '' : 's'} so keys and constraints hold (${[...new Set(r.issues.map(i => i.kind.replace(/_/g, ' ')))].join(', ')})`
  }
  if (!job.cancelRequested && generatedThisRun > 0) {
    const { data: repaired, report } = repairDataset(req.schema, allTableData as Record<string, Record<string, unknown>[]>)
    for (const t of req.schema) allTableData[t.name] = repaired[t.name] || []
    qualityScore = report.score
    emit(job, { type: 'progress', table: '', message: `Quality Analyst: ${describeFixes(report)}`, totalInserted: generatedThisRun, targetRows: totalTarget })
  }

  // ─── Phase 2: scale up to the requested row counts ───
  const needsExpansion = !job.cancelRequested && req.schema.some(t => generatedFor(t.name) > 0 && generatedFor(t.name) < finalCounts[t.name])
  if (needsExpansion) {
    const bigTarget = Object.values(finalCounts).reduce((s, n) => s + n, 0)
    emit(job, { type: 'progress', table: '', message: `Scaling up to ${bigTarget.toLocaleString()} rows from the AI-generated sample…`, totalInserted: generatedThisRun, targetRows: totalTarget })
    const newRows: Record<string, unknown[]> = {}
    for (const t of req.schema) newRows[t.name] = (allTableData[t.name] || []).slice(baseline[t.name] || 0)
    const expanded = expandDataset(
      req.schema,
      newRows as Record<string, Record<string, unknown>[]>,
      Object.fromEntries(req.schema.map(t => [t.name, newRows[t.name].length > 0 ? finalCounts[t.name] : 0])),
      { seed: startTime },
    )
    for (const t of req.schema) {
      const before = generatedFor(t.name)
      const existing = (allTableData[t.name] || []).slice(0, baseline[t.name] || 0)
      allTableData[t.name] = [...existing, ...(expanded[t.name] || [])]
      generatedThisRun += generatedFor(t.name) - before
      emit(job, { type: 'table_complete', table: t.name, totalRows: allTableData[t.name].length })
    }
    // Final integrity pass over the full dataset (cheap, linear).
    const { data: repaired, report } = repairDataset(req.schema, allTableData as Record<string, Record<string, unknown>[]>)
    for (const t of req.schema) allTableData[t.name] = repaired[t.name] || []
    if (report.issues.some(i => i.kind !== 'unknown_table')) {
      emit(job, { type: 'progress', table: '', message: `Quality Analyst: ${describeFixes(report)}`, totalInserted: generatedThisRun, targetRows: totalTarget })
    }
    emit(job, { type: 'progress', table: '', message: 'Saving…', totalInserted: generatedThisRun, targetRows: totalTarget })
  }

  // ─── Privacy Officer: no values that could belong to real people ───
  if (!job.cancelRequested && generatedThisRun > 0 && privacyMaskingEnabled()) {
    const { data: masked, report: pr } = applyPrivacy(allTableData as Record<string, Record<string, unknown>[]>)
    for (const t of req.schema) allTableData[t.name] = masked[t.name] || []
    const parts = [pr.emails && `${pr.emails} real-provider email${pr.emails === 1 ? '' : 's'}`, pr.ssns && `${pr.ssns} SSN${pr.ssns === 1 ? '' : 's'}`, pr.cards && `${pr.cards} card number${pr.cards === 1 ? '' : 's'}`].filter(Boolean)
    emit(job, { type: 'progress', table: '', message: parts.length ? `Privacy Officer: anonymised ${parts.join(', ')}` : 'Privacy Officer: no personal data patterns found', totalInserted: generatedThisRun, targetRows: totalTarget })
  }

  await persist(true)

  if (job.cancelRequested) {
    emit(job, { type: 'cancelled', message: `Stopped. ${generatedThisRun} rows were saved.`, totalRows: generatedThisRun })
    return
  }

  const tablesGenerated = req.schema.filter(t => (allTableData[t.name]?.length || 0) > 0).length
  console.log(`[generate] job ${job.id}: ${generatedThisRun} new rows (${existingRowCount} existing) across ${tablesGenerated}/${req.schema.length} tables in ${((Date.now() - startTime) / 1000).toFixed(1)}s`)
  emit(job, { type: 'complete', tablesGenerated, totalRows: generatedThisRun, durationMs: Date.now() - startTime, databaseId: job.databaseId })
}

// ─── Handlers ───
export async function POST(request: NextRequest) {
  const auth = await requireUser(request)
  if (auth instanceof Response) return auth

  const text = await request.text()
  if (text.length > 200_000) return json({ error: 'Request too large' }, 413)
  let raw: unknown
  try { raw = JSON.parse(text) } catch { return json({ error: 'Invalid JSON body' }, 400) }
  const v = validate(raw)
  if (!v.ok) return json({ error: v.error }, 400)
  const req = v.req

  // Without an AI key the built-in generator is used (still fast, schema-driven).

  try {
    // Ensure a database record exists (owner-scoped) and seed existing rows so
    // "add more rows" appends instead of replacing.
    let seed: Record<string, unknown[]> = {}
    let databaseId = req.databaseId
    if (databaseId) {
      const existing = await getDatabase(auth.userId, databaseId)
      if (!existing) return json({ error: 'Database not found' }, 404)
      const running = getActiveJobForDatabase(auth.userId, databaseId)
      if (running) return streamJob(running) // already generating → just attach
      seed = existing.data_json || {}
      await updateDatabase(auth.userId, databaseId, { status: 'generating' })
    } else {
      const created = await createDatabase(auth.userId, {
        name: req.databaseName || req.schema[0]?.name || 'synthetic_db',
        db_type: 'postgresql',
        schema_json: req.schema,
        data_json: {},
        row_count: 0,
        quality_score: null,
        status: 'generating',
      })
      databaseId = created.id
    }

    const job = createJob(auth.userId, databaseId)
    emit(job, { type: 'job_started', databaseId })
    emit(job, { type: 'database_created', databaseId })

    const work = runGeneration(job, req, seed).catch(async (err) => {
      console.error('[generate] unexpected worker error:', err)
      await updateDatabase(job.userId, job.databaseId, { status: 'ready' }).catch(() => {})
      failJob(job, 'Generation failed unexpectedly')
    })
    // Keep the function alive until the job finishes, even after the client leaves.
    after(() => work)

    return streamJob(job)
  } catch (err) {
    console.error('[generate] failed to start:', err)
    return json({ error: 'Failed to start generation' }, 500)
  }
}

export async function GET(request: NextRequest) {
  const auth = await requireUser(request)
  if (auth instanceof Response) return auth

  const jobId = request.nextUrl.searchParams.get('jobId')
  const databaseId = request.nextUrl.searchParams.get('databaseId')
  const job = jobId
    ? getJob(auth.userId, jobId)
    : databaseId ? getActiveJobForDatabase(auth.userId, databaseId) : null

  if (!job) return json({ status: 'none' })
  if (request.headers.get('accept')?.includes('text/event-stream')) return streamJob(job)
  return json({ status: job.status, jobId: job.id, databaseId: job.databaseId, startedAt: job.startedAt })
}

export async function DELETE(request: NextRequest) {
  const auth = await requireUser(request)
  if (auth instanceof Response) return auth
  const jobId = request.nextUrl.searchParams.get('jobId')
  const databaseId = request.nextUrl.searchParams.get('databaseId')
  const job = jobId
    ? getJob(auth.userId, jobId)
    : databaseId ? getActiveJobForDatabase(auth.userId, databaseId) : null
  if (!job) return json({ error: 'No running generation found' }, 404)
  if (job.status !== 'running' || job.cancelRequested) {
    return json({ error: job.cancelRequested ? 'Generation is already stopping' : `Generation already ${job.status}` }, 409)
  }
  cancelJob(job)
  return json({ success: true })
}
