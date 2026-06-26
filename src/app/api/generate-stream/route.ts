import { NextRequest } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/admin'
import {
  createDatabaseInMemory,
  updateDatabaseInMemory,
} from '@/lib/in-memory-store'
import {
  createDatabasePrisma,
  updateDatabasePrisma,
} from '@/lib/prisma-store'

// ─── Streaming Database Generation API ───
// Receives a generation signal (schema + row counts + instructions),
// calls the DeepSeek v4 API to produce NDJSON records, parses them line-by-line,
// batch-inserts into the database, and streams SSE progress to the frontend.

const DEFAULT_USER_ID = '5a784d48-945a-47d3-ae95-d2aa5d9abe8c'

// ─── DeepSeek v4 API configuration ───
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY
const DEEPSEEK_BASE_URL = process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com'
const DEEPSEEK_MODEL = process.env.DEEPSEEK_MODEL || 'deepseek-chat'
const DEEPSEEK_MAX_TOKENS = parseInt(process.env.DEEPSEEK_MAX_TOKENS || '32000', 10)

const BATCH_SIZE = 200          // rows per batch insert
const FLUSH_INTERVAL_MS = 300   // flush batch at least every 300ms

// ─── Types ───
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
  userId?: string
}

interface SSEEvent {
  type: 'progress' | 'table_complete' | 'complete' | 'error' | 'database_created'
  table?: string
  rowsInserted?: number
  totalInserted?: number
  targetRows?: number
  totalRows?: number
  tablesGenerated?: number
  durationMs?: number
  message?: string
  recoverable?: boolean
  databaseId?: string
}

// ─── Lightweight user extraction ───
function getUserIdFromCookies(request: NextRequest): string | null {
  try {
    const supabaseCookies = request.cookies.getAll().filter(c =>
      c.name.includes('-auth-token')
    )
    for (const cookie of supabaseCookies) {
      try {
        const rawValue = decodeURIComponent(cookie.value)
        let accessToken: string | null = null
        try {
          const parsed = JSON.parse(rawValue)
          accessToken = parsed?.access_token || null
        } catch {
          accessToken = rawValue
        }
        if (!accessToken) continue
        const parts = accessToken.split('.')
        if (parts.length !== 3) continue
        const payload = JSON.parse(atob(parts[1]))
        if (payload?.sub) return payload.sub
      } catch {
        continue
      }
    }
    return null
  } catch {
    return null
  }
}

// ─── Build NDJSON generation prompt ───
function buildGenerationPrompt(req: GenerationRequest): string {
  const tableDescriptions = req.schema.map(table => {
    const colDefs = table.columns.map(c => `  ${c.name}: ${c.type}`).join('\n')
    const rowCount = req.rowCounts[table.name] || 10
    return `Table: ${table.name} (${rowCount} rows)\n${colDefs}`
  }).join('\n\n')

  const totalRows = Object.values(req.rowCounts).reduce((sum, n) => sum + n, 0)
  const tableOrder = req.schema.map(s => s.name).join(' → ')

  return `You are a data generation engine. Generate realistic synthetic data for the following database schema.

DATABASE: ${req.databaseName || 'synthetic_db'}

SCHEMA (${req.schema.length} tables):
${tableDescriptions}

${req.instructions ? `ADDITIONAL INSTRUCTIONS:\n${req.instructions}\n` : ''}

═══════════════════════════════════════════════════════════
CRITICAL REQUIREMENTS — READ CAREFULLY:
═══════════════════════════════════════════════════════════
1. You MUST generate data for ALL ${req.schema.length} tables listed above. Do NOT stop after the first table.
2. Table generation order: ${tableOrder}
3. After completing one table's records, IMMEDIATELY output the next ###TABLE:xxx### marker and continue with that table's records.
4. Do NOT end your response until EVERY table has been generated.
5. Total tables to generate: ${req.schema.length}
6. Total records to generate: ${totalRows}
═══════════════════════════════════════════════════════════

OUTPUT FORMAT:
- Output ONLY raw NDJSON — one JSON object per line.
- No arrays. No wrapper keys like {"tables":...}. No markdown. No explanation. No code fences.
- Each line must be a complete, valid JSON record for the CURRENT table.
- Generate records for each table sequentially: first ALL records for the first table, then ALL for the next, etc.
- Before each table's records, output a single marker line: ###TABLE:table_name###
- After the last record of the final table, you may stop.

DATA QUALITY:
- Use realistic values (real-looking names, emails, addresses, phone numbers, cities, companies).
- Use proper data types (numbers for quantities, ISO 8601 dates for timestamps, UUIDs for IDs).
- Always include an "id" column as a UUID string for each record.
- Include timestamps (created_at, updated_at) as ISO 8601 strings.
- Make data internally consistent (e.g., order dates after customer registration).
- Maintain referential integrity between tables (foreign key values must reference existing primary keys).
- For localized data, use appropriate names, phone formats, currencies, and addresses.

Begin immediately. Do not confirm or summarize first. Generate ALL ${req.schema.length} tables in this single response.

Example output format (2-table example):
###TABLE:users###
{"id":"a1b2c3d4-5678-9012-abcd-ef1234567890","name":"Alice Johnson","email":"alice@example.com","created_at":"2024-01-15T10:30:00Z"}
{"id":"b2c3d4e5-6789-0123-bcde-f12345678901","name":"Bob Smith","email":"bob@example.com","created_at":"2024-01-16T14:22:00Z"}
###TABLE:orders###
{"id":"c3d4e5f6-7890-1234-cdef-123456789012","user_id":"a1b2c3d4-5678-9012-abcd-ef1234567890","total":99.99,"created_at":"2024-02-01T09:15:00Z"}

REMINDER: You MUST generate ALL ${req.schema.length} tables. Do NOT stop early.

Now generate the data. Start with ###TABLE:${req.schema[0]?.name || 'table1'}###`
}

// ─── Build a focused continuation prompt for a single table ───
function buildContinuationPrompt(
  tableName: string,
  rowCount: number,
  columns: Array<{ name: string; type: string }>,
): string {
  const colDefs = columns.map(c => `  ${c.name}: ${c.type}`).join('\n')
  return `Generate ${rowCount} realistic records for the "${tableName}" table.

COLUMNS:
${colDefs}

RULES:
- Output ONLY raw NDJSON — one JSON object per line.
- No arrays. No wrapper keys. No markdown. No explanation. No code fences.
- Start with a single marker line: ###TABLE:${tableName}###
- Each line after the marker must be a complete, valid JSON record.
- Use realistic values. Include UUIDs for IDs and ISO 8601 timestamps.
- Always include an "id" column as a UUID string for each record.
- Generate exactly ${rowCount} records — no more, no less.
- Do not output anything after the last record.

Begin now:`
}

export async function POST(request: NextRequest) {
  try {
    const text = await request.text()
    if (text.length > 200000) {
      return new Response(JSON.stringify({ error: 'Request too large' }), {
        status: 413,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const body: GenerationRequest = JSON.parse(text)

    if (!body.schema || body.schema.length === 0) {
      return new Response(JSON.stringify({ error: 'Schema is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const userId = getUserIdFromCookies(request) || body.userId || DEFAULT_USER_ID
    const startTime = Date.now()

    // ─── Ensure a database record exists ───
    let databaseId = body.databaseId
    const admin = getSupabaseAdmin()

    if (!databaseId) {
      const dbName = body.databaseName || body.schema[0]?.name || 'synthetic_db'
      if (admin) {
        const { data: newDb, error: dbError } = await admin
          .from('synthetic_databases')
          .insert({
            name: dbName,
            db_type: 'postgresql',
            schema_json: body.schema,
            data_json: {},
            row_count: 0,
            quality_score: 0.85,
            status: 'generating',
            user_id: userId,
          })
          .select()
          .single()

        if (!dbError && newDb) {
          databaseId = newDb.id
        }
      } else {
        // Prisma-backed durable storage (survives server restarts)
        try {
          const newDb = await createDatabasePrisma(userId, {
            name: dbName,
            db_type: 'postgresql',
            schema_json: body.schema,
            data_json: {},
            row_count: 0,
            quality_score: 0.85,
            status: 'generating',
          })
          databaseId = newDb.id
        } catch (err) {
          console.warn('[Generate-Stream] Prisma create failed, falling back to in-memory:', err)
          const newDb = createDatabaseInMemory(userId, {
            name: dbName,
            db_type: 'postgresql',
            schema_json: body.schema,
            data_json: {},
            row_count: 0,
            quality_score: 0.85,
            status: 'generating',
          })
          databaseId = newDb.id
        }
      }
    } else if (databaseId) {
      // Update existing database status
      if (admin) {
        await admin
          .from('synthetic_databases')
          .update({ status: 'generating' })
          .eq('id', databaseId)
      } else {
        try {
          await updateDatabasePrisma(userId, databaseId, { status: 'generating' })
        } catch {
          updateDatabaseInMemory(userId, databaseId, { status: 'generating' })
        }
      }
    }

    // ─── Build messages for the AI ───
    const generationPrompt = buildGenerationPrompt(body)

    const messages: Array<{ role: string; content: string }> = [
      { role: 'system', content: generationPrompt },
    ]

    // Include relevant conversation history for context
    if (body.conversationHistory && body.conversationHistory.length > 0) {
      const recentHistory = body.conversationHistory.slice(-6)
      for (const msg of recentHistory) {
        if (msg.role === 'user' || msg.role === 'assistant') {
          messages.push({ role: msg.role, content: msg.content })
        }
      }
    }

    // Add the final generation instruction
    const totalRows = Object.values(body.rowCounts).reduce((sum, n) => sum + n, 0)
    messages.push({
      role: 'user',
      content: `Generate the data now. ${totalRows} total rows across ${body.schema.length} tables. You MUST generate ALL ${body.schema.length} tables — do not stop after the first. Begin with ###TABLE:${body.schema[0]?.name}###`,
    })

    console.log(`[Generate-Stream] Starting generation: ${body.schema.length} tables, ${totalRows} total rows. Tables: [${body.schema.map(s => s.name).join(', ')}]`)

    // ─── Call DeepSeek v4 API with TRUE streaming to generate NDJSON data ───
    if (!DEEPSEEK_API_KEY) {
      return new Response(JSON.stringify({ error: 'DeepSeek API key not configured' }), {
        status: 503,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const deepseekResponse = await fetch(`${DEEPSEEK_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${DEEPSEEK_API_KEY}`,
      },
      body: JSON.stringify({
        model: DEEPSEEK_MODEL,
        messages: messages as Array<{ role: string; content: string }>,
        stream: true,
        max_tokens: DEEPSEEK_MAX_TOKENS,
        stream_options: { include_usage: true },
      }),
    })

    if (!deepseekResponse.ok) {
      const errorText = await deepseekResponse.text().catch(() => 'Unknown error')
      console.error('[Generate-Stream] DeepSeek error:', deepseekResponse.status, errorText)
      return new Response(JSON.stringify({ error: 'AI service error' }), {
        status: deepseekResponse.status,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // ─── Set up SSE stream ───
    const encoder = new TextEncoder()
    const upstreamReader = deepseekResponse.body?.getReader()

    if (!upstreamReader) {
      return new Response(JSON.stringify({ error: 'No response stream' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // ─── Data accumulation state ───
    const allTableData: Record<string, unknown[]> = {}
    let currentTable = ''
    let insertQueue: unknown[] = []
    let totalInserted = 0
    let currentTableInserted = 0
    let lastFlushTime = Date.now()
    let malformedLines = 0
    let lastFinishReason = ''

    const sendSSE = (event: SSEEvent): Uint8Array => {
      return encoder.encode(`data: ${JSON.stringify(event)}\n\n`)
    }

    // ─── Flush batch insert ───
    const flushBatch = async (tableName: string, records: unknown[]): Promise<void> => {
      if (records.length === 0) return

      // Add to in-memory data
      if (!allTableData[tableName]) {
        allTableData[tableName] = []
      }
      allTableData[tableName].push(...records)

      // Update database record periodically
      if (databaseId) {
        if (admin) {
          try {
            const { data: db } = await admin
              .from('synthetic_databases')
              .select('data_json')
              .eq('id', databaseId)
              .single()

            const existingData = (db?.data_json as Record<string, unknown[]>) || {}
            if (!existingData[tableName]) {
              existingData[tableName] = []
            }
            existingData[tableName] = [...existingData[tableName], ...records]

            await admin
              .from('synthetic_databases')
              .update({
                data_json: existingData,
                row_count: totalInserted + records.length,
              })
              .eq('id', databaseId)
          } catch (err) {
            console.warn('[Generate-Stream] DB update failed:', err)
          }
        } else {
          // Prisma-backed durable storage (with in-memory fallback)
          try {
            const merged: Record<string, unknown[]> = {}
            for (const [t, rows] of Object.entries(allTableData)) {
              merged[t] = rows
            }
            try {
              updateDatabasePrisma(userId, databaseId, {
                data_json: merged,
                row_count: totalInserted + records.length,
              }).catch(() => {})
            } catch {
              updateDatabaseInMemory(userId, databaseId, {
                data_json: merged,
                row_count: totalInserted + records.length,
              })
            }
          } catch (err) {
            console.warn('[Generate-Stream] DB update failed:', err)
          }
        }
      }

      totalInserted += records.length
      currentTableInserted += records.length
    }

    // ─── Create the SSE ReadableStream ───
    // `clientCancelled` lives in the outer scope so the cancel() handler can
    // signal the start() loop to stop processing.
    let clientCancelled = false
    const stream = new ReadableStream({
      async start(controller) {
        const safeEnqueue = (data: Uint8Array) => {
          if (clientCancelled) return
          try {
            controller.enqueue(data)
          } catch {
            // controller already closed
          }
        }

        // Send initial event with databaseId
        safeEnqueue(sendSSE({
          type: 'progress',
          table: '',
          message: `Generating database schema...`,
          rowsInserted: 0,
          totalInserted: 0,
          targetRows: totalRows,
        }))

        // Send the databaseId so the frontend can track it
        if (databaseId) {
          safeEnqueue(encoder.encode(`data: ${JSON.stringify({ type: 'database_created', databaseId })}\n\n`))
        }

        try {
          // ─── Stream NDJSON content line-by-line from DeepSeek ───
          // DeepSeek returns a true SSE stream. We read it chunk by chunk,
          // accumulate a content buffer, split on newlines, and process each
          // complete line as either a table marker or an NDJSON record.
          const decoder = new TextDecoder()
          let aiBuffer = ''
          let contentBuffer = ''

          while (true) {
            if (clientCancelled) break
            const { done, value } = await upstreamReader.read()
            if (done) break

            aiBuffer += decoder.decode(value, { stream: true })
            const aiLines = aiBuffer.split('\n')
            aiBuffer = aiLines.pop() || ''

            for (const aiLine of aiLines) {
              const trimmedAiLine = aiLine.trim()
              if (!trimmedAiLine || !trimmedAiLine.startsWith('data: ')) continue

              const aiData = trimmedAiLine.slice(6)
              if (aiData === '[DONE]') continue

              try {
                const parsed = JSON.parse(aiData)
                const choice = parsed.choices?.[0]
                if (!choice) continue

                const delta = choice.delta
                if (delta?.content) {
                  contentBuffer += delta.content

                  // Process complete lines from the content buffer
                  const contentLines = contentBuffer.split('\n')
                  contentBuffer = contentLines.pop() || ''

                  for (const contentLine of contentLines) {
                    if (clientCancelled) break
                    const line = contentLine.trim()
                    if (!line) continue

                    // Check for table marker
                    const tableMarker = line.match(/^###TABLE:(.+?)###$/)
                    if (tableMarker) {
                      // Flush any pending records for the previous table
                      if (insertQueue.length > 0 && currentTable) {
                        await flushBatch(currentTable, insertQueue.splice(0))
                        safeEnqueue(sendSSE({
                          type: 'progress',
                          table: currentTable,
                          rowsInserted: currentTableInserted,
                          totalInserted,
                          targetRows: body.rowCounts[currentTable] || 0,
                        }))
                      }

                      // Switch to new table
                      currentTable = tableMarker[1]
                      currentTableInserted = (allTableData[currentTable]?.length) || 0
                      safeEnqueue(sendSSE({
                        type: 'progress',
                        table: currentTable,
                        rowsInserted: 0,
                        totalInserted,
                        targetRows: body.rowCounts[currentTable] || 0,
                        message: `Streaming records into [${currentTable}]`,
                      }))
                      continue
                    }

                    // Try to parse as NDJSON record
                    if (currentTable) {
                      try {
                        const record = JSON.parse(line)
                        if (typeof record === 'object' && record !== null && !Array.isArray(record)) {
                          insertQueue.push(record)

                          // Flush if batch is full or interval elapsed
                          const now = Date.now()
                          if (insertQueue.length >= BATCH_SIZE || now - lastFlushTime >= FLUSH_INTERVAL_MS) {
                            await flushBatch(currentTable, insertQueue.splice(0))
                            lastFlushTime = now

                            safeEnqueue(sendSSE({
                              type: 'progress',
                              table: currentTable,
                              rowsInserted: currentTableInserted,
                              totalInserted,
                              targetRows: body.rowCounts[currentTable] || 0,
                            }))
                          }
                        }
                      } catch {
                        // Malformed line — skip and continue
                        malformedLines++
                        if (malformedLines <= 5) {
                          console.warn('[Generate-Stream] Malformed NDJSON line:', line.substring(0, 100))
                        }
                      }
                    }
                  }
                }

                // Handle finish reason
                if (choice.finish_reason) {
                  lastFinishReason = choice.finish_reason
                  console.log(`[Generate-Stream] Main stream finished. Reason: ${choice.finish_reason}`)

                  // Process any remaining content in the buffer
                  if (contentBuffer.trim()) {
                    const line = contentBuffer.trim()
                    const tableMarker = line.match(/^###TABLE:(.+?)###$/)
                    if (!tableMarker && currentTable) {
                      try {
                        const record = JSON.parse(line)
                        if (typeof record === 'object' && record !== null && !Array.isArray(record)) {
                          insertQueue.push(record)
                        }
                      } catch {
                        // skip
                      }
                    }
                    contentBuffer = ''
                  }
                }
              } catch {
                // Skip unparseable AI chunks
              }
            }
          }

          // Flush remaining records after processing all lines
          if (insertQueue.length > 0 && currentTable) {
            await flushBatch(currentTable, insertQueue.splice(0))
          }

          // Mark current table complete
          if (currentTable) {
            safeEnqueue(sendSSE({
              type: 'table_complete',
              table: currentTable,
              totalRows: currentTableInserted,
            }))
          }

          // ═══════════════════════════════════════════════════════════
          // CONTINUATION MECHANISM (Fix 2)
          // After the main stream ends, check if all expected tables got
          // data. If any are missing OR got fewer rows than requested,
          // make focused follow-up API calls for each incomplete table.
          // ═══════════════════════════════════════════════════════════
          if (!clientCancelled) {
            const expectedTables = body.schema.map(s => s.name)
            const generatedTables = Object.keys(allTableData)

            // Check for both completely missing tables AND tables with
            // fewer rows than requested (partial generation due to token limits)
            const incompleteTables = expectedTables.filter(t => {
              const generated = allTableData[t]?.length || 0
              const requested = body.rowCounts[t] || 0
              return generated === 0 || (requested > 0 && generated < requested)
            })

            console.log(`[Generate-Stream] Expected tables: [${expectedTables.join(', ')}]`)
            console.log(`[Generate-Stream] Generated tables: [${generatedTables.join(', ')}] (rows: ${generatedTables.map(t => `${t}=${allTableData[t]?.length || 0}/${body.rowCounts[t] || 0}`).join(', ')})`)

            if (incompleteTables.length > 0) {
              console.warn(`[Generate-Stream] ⚠️ ${incompleteTables.length} table(s) need more data. Triggering continuation: [${incompleteTables.join(', ')}]`)

              safeEnqueue(sendSSE({
                type: 'progress',
                table: '',
                message: `Continuing generation for ${incompleteTables.length} table${incompleteTables.length === 1 ? '' : 's'} that need more rows...`,
                totalInserted,
                targetRows: totalRows,
              }))

              // Wrap the entire continuation phase in a top-level try/catch
              // so a failure never propagates to the outer catch (best-effort).
              try {
                for (const incompleteTable of incompleteTables) {
                  if (clientCancelled) break

                  const tableSchema = body.schema.find(s => s.name === incompleteTable)
                  if (!tableSchema) {
                    console.warn(`[Generate-Stream] Continuation: schema not found for ${incompleteTable}, skipping.`)
                    continue
                  }

                  const requestedRows = body.rowCounts[incompleteTable] || 10
                  const alreadyGenerated = allTableData[incompleteTable]?.length || 0
                  const remainingRows = Math.max(0, requestedRows - alreadyGenerated)
                  console.log(`[Generate-Stream] Continuation: generating ${remainingRows} more rows for [${incompleteTable}] (${alreadyGenerated}/${requestedRows} already generated)`)

                  const continuationPrompt = buildContinuationPrompt(
                    incompleteTable,
                    remainingRows,
                    tableSchema.columns,
                  )

                  let contResponse: Response
                  try {
                    contResponse = await fetch(`${DEEPSEEK_BASE_URL}/chat/completions`, {
                      method: 'POST',
                      headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${DEEPSEEK_API_KEY}`,
                      },
                      body: JSON.stringify({
                        model: DEEPSEEK_MODEL,
                        messages: [
                          { role: 'system', content: continuationPrompt },
                          { role: 'user', content: `Generate ${remainingRows} more records for ${incompleteTable} now.` },
                        ],
                        stream: true,
                        max_tokens: DEEPSEEK_MAX_TOKENS,
                        stream_options: { include_usage: true },
                      }),
                    })
                  } catch (fetchErr) {
                    console.warn(`[Generate-Stream] Continuation fetch failed for ${incompleteTable}:`, fetchErr)
                    continue
                  }

                  if (!contResponse.ok) {
                    const contErrText = await contResponse.text().catch(() => 'Unknown error')
                    console.warn(`[Generate-Stream] Continuation HTTP ${contResponse.status} for ${incompleteTable}:`, contErrText)
                    continue
                  }

                  const contReader = contResponse.body?.getReader()
                  if (!contReader) {
                    console.warn(`[Generate-Stream] Continuation: no response body for ${incompleteTable}`)
                    continue
                  }

                  // Set currentTable to the missing table and reset counters
                  currentTable = incompleteTable
                  currentTableInserted = (allTableData[incompleteTable]?.length) || 0
                  lastFlushTime = Date.now()

                  safeEnqueue(sendSSE({
                    type: 'progress',
                    table: incompleteTable,
                    message: `Streaming records into [${incompleteTable}]`,
                    rowsInserted: 0,
                    totalInserted,
                    targetRows: rowCount,
                  }))

                  // Process the continuation stream (same NDJSON parsing logic)
                  const contDecoder = new TextDecoder()
                  let contAiBuffer = ''
                  let contContentBuffer = ''
                  let contFinishReason = ''

                  try {
                    while (true) {
                      if (clientCancelled) break
                      const { done: contDone, value: contValue } = await contReader.read()
                      if (contDone) break

                      contAiBuffer += contDecoder.decode(contValue, { stream: true })
                      const contAiLines = contAiBuffer.split('\n')
                      contAiBuffer = contAiLines.pop() || ''

                      for (const contAiLine of contAiLines) {
                        const trimmedCont = contAiLine.trim()
                        if (!trimmedCont || !trimmedCont.startsWith('data: ')) continue
                        const contData = trimmedCont.slice(6)
                        if (contData === '[DONE]') continue

                        try {
                          const parsed = JSON.parse(contData)
                          const choice = parsed.choices?.[0]
                          if (!choice) continue
                          const delta = choice.delta
                          if (delta?.content) {
                            contContentBuffer += delta.content
                            const contentLines = contContentBuffer.split('\n')
                            contContentBuffer = contentLines.pop() || ''

                            for (const contentLine of contentLines) {
                              if (clientCancelled) break
                              const line = contentLine.trim()
                              if (!line) continue

                              const tableMarker = line.match(/^###TABLE:(.+?)###$/)
                              if (tableMarker) {
                                // Flush the current queue before switching tables
                                if (insertQueue.length > 0 && currentTable) {
                                  await flushBatch(currentTable, insertQueue.splice(0))
                                  safeEnqueue(sendSSE({
                                    type: 'progress',
                                    table: currentTable,
                                    rowsInserted: currentTableInserted,
                                    totalInserted,
                                    targetRows: rowCount,
                                  }))
                                }
                                currentTable = tableMarker[1]
                                currentTableInserted = (allTableData[currentTable]?.length) || 0
                                continue
                              }

                              if (currentTable) {
                                try {
                                  const record = JSON.parse(line)
                                  if (typeof record === 'object' && record !== null && !Array.isArray(record)) {
                                    insertQueue.push(record)
                                    const now = Date.now()
                                    if (insertQueue.length >= BATCH_SIZE || now - lastFlushTime >= FLUSH_INTERVAL_MS) {
                                      await flushBatch(currentTable, insertQueue.splice(0))
                                      lastFlushTime = now
                                      safeEnqueue(sendSSE({
                                        type: 'progress',
                                        table: currentTable,
                                        rowsInserted: currentTableInserted,
                                        totalInserted,
                                        targetRows: rowCount,
                                      }))
                                    }
                                  }
                                } catch {
                                  // skip malformed line in continuation
                                }
                              }
                            }
                          }

                          if (choice.finish_reason) {
                            contFinishReason = choice.finish_reason
                            // Process any remaining content in the buffer
                            if (contContentBuffer.trim()) {
                              const line = contContentBuffer.trim()
                              const tableMarker = line.match(/^###TABLE:(.+?)###$/)
                              if (!tableMarker && currentTable) {
                                try {
                                  const record = JSON.parse(line)
                                  if (typeof record === 'object' && record !== null && !Array.isArray(record)) {
                                    insertQueue.push(record)
                                  }
                                } catch {
                                  // skip
                                }
                              }
                              contContentBuffer = ''
                            }
                          }
                        } catch {
                          // skip unparseable chunk
                        }
                      }
                    }
                  } catch (contErr) {
                    console.warn(`[Generate-Stream] Continuation stream error for ${incompleteTable}:`, contErr)
                  }

                  // Flush any remaining records queued for this table
                  if (insertQueue.length > 0 && currentTable) {
                    try {
                      await flushBatch(currentTable, insertQueue.splice(0))
                    } catch {
                      // best effort
                    }
                  }

                  const finalCount = allTableData[incompleteTable]?.length || 0
                  console.log(`[Generate-Stream] Continuation complete for [${incompleteTable}]: ${finalCount} rows (finish_reason: ${contFinishReason || 'n/a'})`)

                  // Mark this continuation table complete
                  safeEnqueue(sendSSE({
                    type: 'table_complete',
                    table: incompleteTable,
                    totalRows: finalCount,
                  }))

                  try { contReader.cancel() } catch { /* already released */ }
                  try { contReader.releaseLock() } catch { /* already released */ }
                }

                console.log(`[Generate-Stream] Continuation phase finished.`)
              } catch (contOuterErr) {
                console.warn('[Generate-Stream] Continuation phase encountered an error (continuing with what we have):', contOuterErr)
              }
            } else {
              console.log(`[Generate-Stream] ✓ All ${expectedTables.length} table(s) generated in main pass — no continuation needed.`)
            }
          }
        } catch (err) {
          console.error('[Generate-Stream] Stream error:', err)

          // Flush remaining records before reporting error
          if (insertQueue.length > 0 && currentTable) {
            try {
              await flushBatch(currentTable, insertQueue.splice(0))
            } catch {
              // Best effort
            }
          }

          safeEnqueue(sendSSE({
            type: 'error',
            message: err instanceof Error ? err.message : 'Stream interrupted',
            recoverable: totalInserted > 0,
          }))
        } finally {
          // ─── Final flush ───
          if (insertQueue.length > 0 && currentTable) {
            try {
              await flushBatch(currentTable, insertQueue.splice(0))
            } catch {
              // Best effort
            }
          }

          // ─── Update database status ───
          if (databaseId) {
            if (admin) {
              try {
                await admin
                  .from('synthetic_databases')
                  .update({
                    status: 'ready',
                    data_json: allTableData,
                    schema_json: body.schema,
                    row_count: totalInserted,
                    quality_score: 0.85,
                  })
                  .eq('id', databaseId)
              } catch (err) {
                console.warn('[Generate-Stream] Final DB update failed:', err)
              }
            } else {
              // Prisma-backed durable storage — persist the final data so the
              // studio can load it via /api/databases?id=... (with in-memory fallback)
              try {
                try {
                  await updateDatabasePrisma(userId, databaseId, {
                    status: 'ready',
                    data_json: allTableData,
                    schema_json: body.schema,
                    row_count: totalInserted,
                    quality_score: 0.85,
                  })
                } catch {
                  updateDatabaseInMemory(userId, databaseId, {
                    status: 'ready',
                    data_json: allTableData,
                    schema_json: body.schema,
                    row_count: totalInserted,
                    quality_score: 0.85,
                  })
                }
              } catch (err) {
                console.warn('[Generate-Stream] Final DB update failed:', err)
              }
            }
          }

          const durationMs = Date.now() - startTime
          const tablesGenerated = Object.keys(allTableData).length

          console.log(`[Generate-Stream] Generation complete: ${totalInserted} rows across ${tablesGenerated}/${body.schema.length} tables in ${(durationMs / 1000).toFixed(1)}s (finish_reason: ${lastFinishReason || 'n/a'})`)

          // Mark any tables with data as complete (covers tables that were
          // processed by the main stream but not explicitly marked above).
          for (const tableName of Object.keys(allTableData)) {
            if (tableName !== currentTable) {
              safeEnqueue(sendSSE({
                type: 'table_complete',
                table: tableName,
                totalRows: allTableData[tableName].length,
              }))
            }
          }

          safeEnqueue(sendSSE({
            type: 'complete',
            tablesGenerated,
            totalRows: totalInserted,
            durationMs,
          }))

          if (!clientCancelled) {
            try {
              controller.close()
            } catch {
              // Already closed
            }
          }
        }
      },
      // Cancel the upstream DeepSeek stream when the client disconnects so
      // tokens don't keep being billed after navigation/tab close.
      async cancel() {
        clientCancelled = true
        try {
          await upstreamReader.cancel()
        } catch {
          // already released
        }
        try {
          await upstreamReader.releaseLock()
        } catch {
          // already released
        }
      },
    })

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no',
      },
    })
  } catch (err) {
    console.error('[Generate-Stream] Unhandled error:', err)
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}
