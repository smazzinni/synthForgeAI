import { NextRequest } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/admin'
import {
  DEFAULT_USER_ID,
  DEEPSEEK_API_KEY,
  DEEPSEEK_BASE_URL,
  DEEPSEEK_MAX_TOKENS,
  DEEPSEEK_MODEL,
} from './_lib/config'
import type { GenerationRequest, SSEEvent } from './_lib/types'
import { buildGenerationPrompt } from './_lib/prompts'
import { getUserIdFromCookies } from './_lib/user-utils'
import { StreamProcessor } from './_lib/stream-processor'
import {
  createPersistBatch,
  ensureDatabaseRecord,
  markDatabaseReady,
} from './_lib/db-persistence'

// ─── Streaming Database Generation API ───
// Receives a generation signal (schema + row counts + instructions),
// calls the DeepSeek v4 API to produce NDJSON records, parses them line-by-line,
// batch-inserts into the database, and streams SSE progress to the frontend.
//
// This file is a thin orchestrator. The heavy lifting lives in:
//   - _lib/stream-processor.ts — NDJSON parsing, table markers, continuation
//   - _lib/db-persistence.ts   — Supabase/Prisma/in-memory storage helpers
//   - _lib/prompts.ts          — system/continuation prompt builders
//   - _lib/config.ts           — DeepSeek + batch config constants
//   - _lib/types.ts            — shared TypeScript interfaces
//   - _lib/user-utils.ts       — JWT-decode user-id extraction from cookies

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
    const admin = getSupabaseAdmin()

    // ─── Ensure a database record exists (create or mark generating) ───
    const databaseId = await ensureDatabaseRecord(body, userId, admin)

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

    console.log(
      `[Generate-Stream] Starting generation: ${body.schema.length} tables, ${totalRows} total rows. Tables: [${body.schema.map(s => s.name).join(', ')}]`,
    )

    // ─── Call DeepSeek v4 API with TRUE streaming to generate NDJSON data ───
    if (!DEEPSEEK_API_KEY) {
      return new Response(
        JSON.stringify({ error: 'DeepSeek API key not configured' }),
        {
          status: 503,
          headers: { 'Content-Type': 'application/json' },
        },
      )
    }

    const deepseekResponse = await fetch(`${DEEPSEEK_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${DEEPSEEK_API_KEY}`,
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
      const errorText = await deepseekResponse
        .text()
        .catch(() => 'Unknown error')
      console.error(
        '[Generate-Stream] DeepSeek error:',
        deepseekResponse.status,
        errorText,
      )
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

    // `clientCancelled` lives in the outer scope so the cancel() handler can
    // signal the start() loop to stop processing.
    let clientCancelled = false

    // `emit` is wired to `safeEnqueue` once the stream's `start()` callback
    // runs. Until then it's a no-op (no events are emitted before start()).
    let emit = (_event: SSEEvent): void => {
      /* wired in start() */
    }

    const processor = new StreamProcessor({
      body,
      databaseId,
      deps: {
        emit: (event) => emit(event),
        isCancelled: () => clientCancelled,
        persistBatch: createPersistBatch({ databaseId, userId, admin }),
      },
    })

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

        // Wire the processor's emit() to safeEnqueue now that we have a
        // controller. Every subsequent emit() call will enqueue bytes.
        emit = (event: SSEEvent) => {
          safeEnqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`))
        }

        // Send initial event with databaseId
        safeEnqueue(
          encoder.encode(
            `data: ${JSON.stringify({
              type: 'progress',
              table: '',
              message: `Generating database schema...`,
              rowsInserted: 0,
              totalInserted: 0,
              targetRows: totalRows,
            })}\n\n`,
          ),
        )

        // Send the databaseId so the frontend can track it
        if (databaseId) {
          safeEnqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                type: 'database_created',
                databaseId,
              })}\n\n`,
            ),
          )
        }

        try {
          // ─── Main stream: parse NDJSON content from DeepSeek ───
          await processor.processReader(upstreamReader, {
            targetRowCountFor: (tableName) => body.rowCounts[tableName] || 0,
            emitOnTableMarker: true,
          })

          // Flush remaining records after processing all lines
          await processor.flushRemaining()

          // Mark the last main-stream table complete
          if (processor.currentTable) {
            emit({
              type: 'table_complete',
              table: processor.currentTable,
              totalRows: processor.currentTableInserted,
            })
          }

          // ─── Continuation mechanism: fill in any missing tables ───
          await processor.runContinuation(totalRows)
        } catch (err) {
          console.error('[Generate-Stream] Stream error:', err)

          // Flush remaining records before reporting error
          try {
            await processor.flushRemaining()
          } catch {
            // Best effort
          }

          emit({
            type: 'error',
            message: err instanceof Error ? err.message : 'Stream interrupted',
            recoverable: processor.totalInserted > 0,
          })
        } finally {
          // ─── Final flush ───
          try {
            await processor.flushRemaining()
          } catch {
            // Best effort
          }

          // ─── Update database status to 'ready' ───
          await markDatabaseReady({
            databaseId,
            userId,
            admin,
            allTableData: processor.allTableData,
            schema: body.schema,
            totalInserted: processor.totalInserted,
          })

          const durationMs = Date.now() - startTime
          const tablesGenerated = Object.keys(processor.allTableData).length

          console.log(
            `[Generate-Stream] Generation complete: ${processor.totalInserted} rows across ${tablesGenerated}/${body.schema.length} tables in ${(durationMs / 1000).toFixed(1)}s (finish_reason: ${processor.lastFinishReason || 'n/a'})`,
          )

          // Mark any tables with data as complete (covers tables that were
          // processed by the main stream but not explicitly marked above).
          for (const tableName of Object.keys(processor.allTableData)) {
            if (tableName !== processor.currentTable) {
              emit({
                type: 'table_complete',
                table: tableName,
                totalRows: processor.allTableData[tableName].length,
              })
            }
          }

          emit({
            type: 'complete',
            tablesGenerated,
            totalRows: processor.totalInserted,
            durationMs,
          })

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
        Connection: 'keep-alive',
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
