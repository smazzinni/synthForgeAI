import { NextRequest } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/admin'

// ─── Streaming Database Generation API ───
// Receives a generation signal (schema + row counts + instructions),
// calls the AI to produce NDJSON records, parses them line-by-line,
// batch-inserts into the database, and streams SSE progress to the frontend.

const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY
const DEEPSEEK_API_URL = process.env.DEEPSEEK_API_URL || 'https://api.deepseek.com'
const DEFAULT_USER_ID = '5a784d48-945a-47d3-ae95-d2aa5d9abe8c'

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

  return `You are a data generation engine. Generate realistic synthetic data for the following database schema.

DATABASE: ${req.databaseName || 'synthetic_db'}

SCHEMA:
${tableDescriptions}

${req.instructions ? `ADDITIONAL INSTRUCTIONS:\n${req.instructions}\n` : ''}

RULES:
- Output ONLY raw NDJSON — one JSON object per line.
- No arrays. No wrapper keys like {"tables":...}. No markdown. No explanation. No code fences.
- Each line must be a complete, valid JSON record for the CURRENT table.
- Generate records for each table sequentially: first ALL records for the first table, then ALL for the next, etc.
- Before each table's records, output a single marker line: ###TABLE:table_name###
- Use realistic values (real-looking names, emails, addresses, phone numbers, cities, companies).
- Use proper data types (numbers for quantities, ISO 8601 dates for timestamps, UUIDs for IDs).
- Always include an "id" column as a UUID string for each record.
- Include timestamps (created_at, updated_at) as ISO 8601 strings.
- Make data internally consistent (e.g., order dates after customer registration).
- Maintain referential integrity between tables (foreign key values must reference existing primary keys).
- For localized data, use appropriate names, phone formats, currencies, and addresses.

Begin immediately. Do not confirm or summarize first.

Example output format:
###TABLE:users###
{"id":"a1b2c3d4-5678-9012-abcd-ef1234567890","name":"Alice Johnson","email":"alice@example.com","created_at":"2024-01-15T10:30:00Z"}
{"id":"b2c3d4e5-6789-0123-bcde-f12345678901","name":"Bob Smith","email":"bob@example.com","created_at":"2024-01-16T14:22:00Z"}
###TABLE:orders###
{"id":"c3d4e5f6-7890-1234-cdef-123456789012","user_id":"a1b2c3d4-5678-9012-abcd-ef1234567890","total":99.99,"created_at":"2024-02-01T09:15:00Z"}

Now generate the data. Start with ###TABLE:${req.schema[0]?.name || 'table1'}###`
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

    if (!DEEPSEEK_API_KEY) {
      return new Response(JSON.stringify({ error: 'DeepSeek API key not configured' }), {
        status: 503,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const userId = getUserIdFromCookies(request) || body.userId || DEFAULT_USER_ID
    const startTime = Date.now()

    // ─── Ensure a database record exists ───
    let databaseId = body.databaseId
    const admin = getSupabaseAdmin()

    if (!databaseId && admin) {
      const dbName = body.databaseName || body.schema[0]?.name || 'synthetic_db'
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
    } else if (databaseId && admin) {
      // Update existing database status
      await admin
        .from('synthetic_databases')
        .update({ status: 'generating' })
        .eq('id', databaseId)
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
      content: `Generate the data now. ${totalRows} total rows across ${body.schema.length} tables. Begin with ###TABLE:${body.schema[0]?.name}###`,
    })

    // ─── Call DeepSeek API with streaming ───
    const deepseekResponse = await fetch(`${DEEPSEEK_API_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${DEEPSEEK_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'deepseek-reasoner',
        messages,
        stream: true,
        max_tokens: 65536,
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
    const reader = deepseekResponse.body?.getReader()

    if (!reader) {
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
      if (admin && databaseId) {
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
      }

      totalInserted += records.length
      currentTableInserted += records.length
    }

    // ─── Create the SSE ReadableStream ───
    const stream = new ReadableStream({
      async start(controller) {
        const decoder = new TextDecoder()
        let aiBuffer = ''
        let contentBuffer = ''    // accumulated AI content (non-reasoning)
        let closed = false

        const safeEnqueue = (data: Uint8Array) => {
          if (closed) return
          try {
            controller.enqueue(data)
          } catch {
            closed = true
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
          while (true) {
            const { done, value } = await reader.read()
            if (done) break

            aiBuffer += decoder.decode(value, { stream: true })
            const aiLines = aiBuffer.split('\n')
            aiBuffer = aiLines.pop() || ''

            for (const aiLine of aiLines) {
              const trimmed = aiLine.trim()
              if (!trimmed || !trimmed.startsWith('data: ')) continue

              const aiData = trimmed.slice(6)
              if (aiData === '[DONE]') continue

              try {
                const parsed = JSON.parse(aiData)
                const choice = parsed.choices?.[0]
                if (!choice) continue

                const delta = choice.delta

                // Only process the main content (skip reasoning)
                if (delta?.content) {
                  contentBuffer += delta.content

                  // Process the content buffer line by line for NDJSON
                  const contentLines = contentBuffer.split('\n')
                  contentBuffer = contentLines.pop() || ''

                  for (const contentLine of contentLines) {
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

                // Handle finish
                if (choice.finish_reason) {
                  // Flush remaining records
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
                }
              } catch {
                // Skip unparseable AI chunks
              }
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
          if (admin && databaseId) {
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
          }

          const durationMs = Date.now() - startTime
          const tablesGenerated = Object.keys(allTableData).length

          // Mark any tables with data as complete
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

          if (!closed) {
            try {
              controller.close()
            } catch {
              // Already closed
            }
          }
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
