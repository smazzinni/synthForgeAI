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
import { expandDataset } from '@/lib/server/data-expander'

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
const DEEPSEEK_MODEL = process.env.DEEPSEEK_MODEL || 'deepseek-chat'
const DEEPSEEK_MAX_TOKENS = Number.parseInt(process.env.DEEPSEEK_MAX_TOKENS || '', 10) || 32000

const MAX_TABLES = 30
const MAX_ROWS_PER_TABLE = 100_000
const MAX_TOTAL_ROWS = 250_000
/** Rows per table the AI writes itself; the rest are synthesised locally from them. */
const SEED_ROWS_PER_TABLE = Number.parseInt(process.env.GENERATION_SEED_ROWS || '', 10) || 200
const PERSIST_INTERVAL_MS = 2500     // write progress to storage at most this often (scaled up for big datasets)
const PROGRESS_INTERVAL_MS = 300     // emit progress events at most this often
const UPSTREAM_IDLE_TIMEOUT_MS = 120_000
const MAX_CONTINUATION_ROUNDS = 3

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
function buildGenerationPrompt(req: GenerationRequest): string {
  const tableDescriptions = req.schema.map(table => {
    const colDefs = table.columns.map(c => `  ${c.name}: ${c.type}`).join('\n')
    return `Table: ${table.name} (${req.rowCounts[table.name]} rows)\n${colDefs}`
  }).join('\n\n')
  const totalRows = Object.values(req.rowCounts).reduce((sum, n) => sum + n, 0)
  const tableOrder = req.schema.map(s => s.name).join(' → ')

  return `You are a data generation engine. Generate realistic synthetic data for the following database schema.

DATABASE: ${req.databaseName || 'synthetic_db'}

SCHEMA (${req.schema.length} tables):
${tableDescriptions}

${req.instructions ? `ADDITIONAL INSTRUCTIONS:\n${req.instructions}\n` : ''}
CRITICAL REQUIREMENTS:
1. Generate data for ALL ${req.schema.length} tables, in this order: ${tableOrder}
2. After one table's records, IMMEDIATELY output the next ###TABLE:name### marker.
3. Total records to generate: ${totalRows}. Do not stop early.

OUTPUT FORMAT:
- Output ONLY raw NDJSON — one complete JSON object per line.
- No arrays, wrapper keys, markdown, code fences or explanations.
- Before each table's records output a single marker line: ###TABLE:table_name###

DATA QUALITY:
- Realistic values (names, emails, addresses, phones, companies, cities).
- Proper types: numbers for quantities, ISO 8601 for timestamps, UUID strings for ids.
- Always include an "id" column (UUID string) and created_at/updated_at timestamps when relevant.
- Internally consistent data and referential integrity (foreign keys reference existing primary keys).

Example:
###TABLE:users###
{"id":"a1b2c3d4-5678-9012-abcd-ef1234567890","name":"Alice Johnson","email":"alice@example.com","created_at":"2024-01-15T10:30:00Z"}
###TABLE:orders###
{"id":"c3d4e5f6-7890-1234-cdef-123456789012","user_id":"a1b2c3d4-5678-9012-abcd-ef1234567890","total":99.99,"created_at":"2024-02-01T09:15:00Z"}

Start with ###TABLE:${req.schema[0]?.name}###`
}

function buildContinuationPrompt(
  table: GenerationSchema,
  rowCount: number,
  existingSample: unknown[],
  related: Record<string, unknown[]>,
): string {
  const colDefs = table.columns.map(c => `  ${c.name}: ${c.type}`).join('\n')
  const fkHints = Object.entries(related)
    .filter(([, rows]) => rows.length > 0)
    .map(([name, rows]) => {
      const ids = rows.slice(0, 50).map(r => (r as { id?: unknown }).id).filter(Boolean)
      return ids.length ? `- ${name}.id values you may reference: ${JSON.stringify(ids)}` : ''
    })
    .filter(Boolean)
    .join('\n')
  return `Generate ${rowCount} more realistic records for the "${table.name}" table.

COLUMNS:
${colDefs}
${existingSample.length ? `\nEXISTING RECORDS (do not repeat their ids):\n${existingSample.slice(0, 3).map(r => JSON.stringify(r)).join('\n')}\n` : ''}
${fkHints ? `\nFOREIGN KEYS:\n${fkHints}\n` : ''}
RULES:
- Output ONLY raw NDJSON, one complete JSON object per line, no markdown.
- Start with a single marker line: ###TABLE:${table.name}###
- Include a new UUID "id" for every record; ISO 8601 timestamps.
- Generate exactly ${rowCount} records, then stop.`
}

// ─── DeepSeek streaming → content lines ───
async function streamCompletion(
  job: GenerationJob,
  messages: Array<{ role: string; content: string }>,
  onLine: (line: string) => Promise<void>,
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
      body: JSON.stringify({ model: DEEPSEEK_MODEL, messages, stream: true, max_tokens: DEEPSEEK_MAX_TOKENS }),
      signal: ctrl.signal,
    })
    if (!res.ok || !res.body) {
      const text = await res.text().catch(() => '')
      throw new Error(`AI service error (${res.status})${text ? `: ${text.slice(0, 200)}` : ''}`)
    }

    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let sseBuffer = ''
    let content = ''
    let finishReason = ''

    while (true) {
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
          for (const line of lines) await onLine(line)
        }
        if (choice.finish_reason) finishReason = choice.finish_reason
      }
    }
    if (content.trim()) await onLine(content)
    return finishReason
  } finally {
    if (idleTimer) clearTimeout(idleTimer)
    job.abort.signal.removeEventListener('abort', onJobAbort)
  }
}

// ─── The worker ───
async function runGeneration(job: GenerationJob, fullReq: GenerationRequest, seed: Record<string, unknown[]>): Promise<void> {
  const startTime = Date.now()
  // Phase 1 asks the AI for at most SEED_ROWS_PER_TABLE rows per table;
  // phase 2 scales each table up to the requested count locally.
  const finalCounts = fullReq.rowCounts
  const req: GenerationRequest = {
    ...fullReq,
    rowCounts: Object.fromEntries(Object.entries(finalCounts).map(([t, n]) => [t, Math.min(n, SEED_ROWS_PER_TABLE)])),
  }
  const allTableData: Record<string, unknown[]> = {}
  for (const [t, rows] of Object.entries(seed)) if (Array.isArray(rows)) allTableData[t] = [...rows]
  const existingRowCount = countRows(allTableData)
  const baseline: Record<string, number> = Object.fromEntries(req.schema.map(t => [t.name, allTableData[t.name]?.length || 0]))
  const stillTrying = new Set(req.schema.map(t => t.name))
  const knownTables = new Set(req.schema.map(t => t.name))
  const totalTarget = Object.values(finalCounts).reduce((s, n) => s + n, 0)

  let currentTable = ''
  let generatedThisRun = 0
  let malformed = 0
  let lastPersist = Date.now()
  let lastProgress = 0
  let persistChain: Promise<unknown> = Promise.resolve()

  const generatedFor = (t: string) => (allTableData[t]?.length || 0) - (baseline[t] || 0)

  const persist = (final = false) => {
    const snapshot = { ...allTableData }
    persistChain = persistChain.then(() =>
      updateDatabase(job.userId, job.databaseId, {
        data_json: snapshot,
        row_count: countRows(snapshot),
        ...(final ? { status: 'ready', schema_json: req.schema, quality_score: 0.85 } : {}),
      }).catch(err => console.warn('[generate] persist failed:', err instanceof Error ? err.message : err)),
    )
    return persistChain
  }

  const progress = (force = false, message?: string) => {
    const now = Date.now()
    if (!force && now - lastProgress < PROGRESS_INTERVAL_MS) return
    lastProgress = now
    emit(job, {
      type: 'progress',
      table: currentTable,
      rowsInserted: currentTable ? generatedFor(currentTable) : 0,
      totalInserted: generatedThisRun,
      targetRows: currentTable ? req.rowCounts[currentTable] || 0 : totalTarget,
      message,
    })
    // Persisting rewrites the whole dataset, so slow down for big ones.
    const interval = PERSIST_INTERVAL_MS * Math.max(1, Math.ceil(generatedThisRun / 20_000))
    if (now - lastPersist >= interval) {
      lastPersist = now
      void persist()
    }
  }

  const resolveTableName = (name: string): string => {
    const trimmed = name.trim()
    if (knownTables.has(trimmed)) return trimmed
    const lower = trimmed.toLowerCase()
    for (const t of knownTables) if (t.toLowerCase() === lower) return t
    return trimmed
  }

  const onLine = async (rawLine: string) => {
    if (job.cancelRequested) return
    const line = rawLine.trim().replace(/,$/, '')
    if (!line || line.startsWith('```')) return
    const marker = line.match(/^#{2,3}\s*TABLE\s*:\s*(.+?)\s*#{2,3}$/i)
    if (marker) {
      if (currentTable) emit(job, { type: 'table_complete', table: currentTable, totalRows: allTableData[currentTable]?.length || 0 })
      currentTable = resolveTableName(marker[1])
      progress(true, `Streaming records into [${currentTable}]`)
      return
    }
    if (!currentTable) return
    // Ignore surplus rows beyond what was requested for this table.
    if (generatedFor(currentTable) >= (req.rowCounts[currentTable] ?? Infinity)) return
    try {
      const record = JSON.parse(line)
      if (record && typeof record === 'object' && !Array.isArray(record)) {
        ;(allTableData[currentTable] ||= []).push(record)
        generatedThisRun++
        progress()
      }
    } catch {
      if (++malformed <= 5) console.warn('[generate] malformed NDJSON line:', line.slice(0, 120))
    }
  }

  try {
    emit(job, { type: 'progress', table: '', message: 'Generating data…', rowsInserted: 0, totalInserted: 0, targetRows: totalTarget })

    const messages: Array<{ role: string; content: string }> = [{ role: 'system', content: buildGenerationPrompt(req) }]
    for (const m of req.conversationHistory || []) messages.push(m)
    messages.push({
      role: 'user',
      content: `Generate the data now: ${totalTarget} rows across ${req.schema.length} tables. Begin with ###TABLE:${req.schema[0].name}###`,
    })
    await streamCompletion(job, messages, onLine)
    if (currentTable) emit(job, { type: 'table_complete', table: currentTable, totalRows: allTableData[currentTable]?.length || 0 })

    // ─── Continuation: fill tables that are missing or short ───
    for (let round = 0; round < MAX_CONTINUATION_ROUNDS && !job.cancelRequested; round++) {
      const incomplete = req.schema.filter(t => stillTrying.has(t.name) && generatedFor(t.name) < req.rowCounts[t.name])
      if (incomplete.length === 0) break
      progress(true, `Continuing generation for ${incomplete.length} table${incomplete.length === 1 ? '' : 's'}…`)
      for (const table of incomplete) {
        if (job.cancelRequested) break
        const remaining = req.rowCounts[table.name] - generatedFor(table.name)
        if (remaining <= 0) continue
        const before = generatedFor(table.name)
        currentTable = table.name
        const related = Object.fromEntries(Object.entries(allTableData).filter(([n]) => n !== table.name))
        try {
          await streamCompletion(job, [
            { role: 'system', content: buildContinuationPrompt(table, remaining, allTableData[table.name] || [], related) },
            { role: 'user', content: `Generate ${remaining} more records for ${table.name} now.` },
          ], async (line) => {
            // All continuation output belongs to this table.
            if (/^#{2,3}\s*TABLE/i.test(line.trim())) return
            currentTable = table.name
            await onLine(line)
          })
        } catch (err) {
          if (job.cancelRequested) break
          console.warn(`[generate] continuation failed for ${table.name}:`, err instanceof Error ? err.message : err)
        }
        emit(job, { type: 'table_complete', table: table.name, totalRows: allTableData[table.name]?.length || 0 })
        // No progress this round → the model is stuck; stop retrying this table.
        if (generatedFor(table.name) === before) stillTrying.delete(table.name)
      }
    }
  } catch (err) {
    if (!job.cancelRequested) {
      console.error('[generate] job failed:', err)
      await persist(true)
      failJob(job, generatedThisRun > 0
        ? `Generation stopped early (${err instanceof Error ? err.message : 'stream interrupted'}). ${generatedThisRun} rows were saved.`
        : (err instanceof Error ? err.message : 'Generation failed'))
      return
    }
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
    emit(job, { type: 'progress', table: '', message: 'Saving…', totalInserted: generatedThisRun, targetRows: totalTarget })
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

  if (!DEEPSEEK_API_KEY) return json({ error: 'AI service is not configured (DEEPSEEK_API_KEY missing)' }, 503)

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
  cancelJob(job)
  return json({ success: true })
}
