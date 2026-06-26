// ─── Streaming Database Generation API — stream processing ───
//
// Encapsulates the stateful NDJSON parsing + SSE emission logic that the
// `/api/generate-stream` route needs to:
//   1. Read a true SSE stream from the DeepSeek chat-completions endpoint.
//   2. Extract delta.content chunks and accumulate them line-by-line.
//   3. Recognise `###TABLE:xxx###` markers and switch the active table.
//   4. Parse each non-marker line as a JSON record, batching inserts.
//   5. Periodically flush batches to the database via a caller-supplied
//      `persistBatch` callback (so this module stays storage-agnostic).
//   6. After the main stream ends, detect any tables that received zero
//      rows and issue focused follow-up "continuation" requests for each.
//
// The route retains responsibility for:
//   - HTTP request validation and the DeepSeek fetch call.
//   - Database record creation / status updates (creating/updating the
//     `synthetic_databases` row, marking it `ready` in the finally block).
//   - Wiring the SSE `ReadableStream` and translating `emit()` calls into
//     `controller.enqueue()` bytes.

import type { GenerationRequest, SSEEvent } from './types'
import { BATCH_SIZE, FLUSH_INTERVAL_MS } from './config'
import {
  DEEPSEEK_API_KEY,
  DEEPSEEK_BASE_URL,
  DEEPSEEK_MODEL,
  DEEPSEEK_MAX_TOKENS,
} from './config'
import { buildContinuationPrompt } from './prompts'

/**
 * Callbacks the processor uses to interact with the outside world.
 * Keeping these as injected dependencies makes the processor trivial to
 * reason about (no hidden globals) and keeps it storage-agnostic.
 */
export interface StreamProcessorDeps {
  /** Emit an SSE event to the client. Must be safe to call after cancel. */
  emit: (event: SSEEvent) => void
  /**
   * Persist a batch of records for `tableName` to durable storage.
   *
   * Called AFTER the processor has already mutated its in-memory
   * `allTableData` to include `records`. Implementations should perform
   * only the DB write (Supabase / Prisma / in-memory fallback).
   */
  persistBatch: (params: {
    tableName: string
    records: unknown[]
    /** `totalInserted` value AFTER this batch is counted in. */
    newTotalCount: number
    /** Reference to the processor's in-memory table data (already mutated). */
    allTableData: Record<string, unknown[]>
  }) => Promise<void>
  /** Whether the downstream client has cancelled the SSE stream. */
  isCancelled: () => boolean
}

export interface StreamProcessorOptions {
  body: GenerationRequest
  /** When set, `persistBatch` is invoked; otherwise batches stay in memory. */
  databaseId?: string
  deps: StreamProcessorDeps
}

export interface ProcessReaderOptions {
  /**
   * Resolve the target row count for a given table name. Used to populate
   * the `targetRows` field of `progress` SSE events.
   *
   * For the main stream this is `(t) => body.rowCounts[t] || 0`.
   * For a continuation stream this is `() => rowCount` (constant).
   */
  targetRowCountFor: (tableName: string) => number
  /**
   * Whether to emit a "Streaming records into [t]" progress event when a
   * new table marker is encountered. The main stream sets this to `true`
   * (matches the original behavior); the continuation sets it to `false`
   * because it only emits a single progress event up-front.
   */
  emitOnTableMarker?: boolean
}

/** Table-marker regex — matches lines like `###TABLE:users###`. */
const TABLE_MARKER_RE = /^###TABLE:(.+?)###$/

/**
 * Stateful processor for a single generation request.
 *
 * A new instance is created per HTTP request. The route drives it by:
 *   1. `await processor.processReader(mainReader, mainOpts)`
 *   2. `await processor.flushRemaining()`
 *   3. (emit `table_complete` for the last main-stream table)
 *   4. `await processor.runContinuation(totalRows)`
 *   5. (in finally) `await processor.flushRemaining()` + final DB status update
 */
export class StreamProcessor {
  // ── Public state (read by the route in its finally block) ──
  /** All records accumulated so far, keyed by table name. */
  allTableData: Record<string, unknown[]> = {}
  /** Name of the table currently being streamed into. */
  currentTable = ''
  /** Total rows inserted across all tables. */
  totalInserted = 0
  /** Rows inserted into the current table only. */
  currentTableInserted = 0
  /** Finish reason reported by the most recently completed upstream stream. */
  lastFinishReason = ''

  // ── Private state ──
  private insertQueue: unknown[] = []
  private lastFlushTime = Date.now()
  private malformedLines = 0

  constructor(private readonly opts: StreamProcessorOptions) {}

  private get body(): GenerationRequest {
    return this.opts.body
  }

  private get deps(): StreamProcessorDeps {
    return this.opts.deps
  }

  private get databaseId(): string | undefined {
    return this.opts.databaseId
  }

  // ─────────────────────────────────────────────────────────────
  // Public API
  // ─────────────────────────────────────────────────────────────

  /**
   * Read a DeepSeek SSE stream from `reader`, parse the NDJSON content
   * deltas, and dispatch table-marker / record / flush events.
   *
   * Returns when the upstream stream is exhausted (`done === true`) or
   * when the client cancels (`isCancelled()` returns true).
   */
  async processReader(
    reader: ReadableStreamDefaultReader<Uint8Array>,
    options: ProcessReaderOptions,
  ): Promise<void> {
    const { targetRowCountFor, emitOnTableMarker = true } = options
    const decoder = new TextDecoder()
    let aiBuffer = ''
    let contentBuffer = ''

    while (true) {
      if (this.deps.isCancelled()) break
      const { done, value } = await reader.read()
      if (done) break

      aiBuffer += decoder.decode(value, { stream: true })
      const aiLines = aiBuffer.split('\n')
      // Keep the trailing partial line for the next iteration.
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
              if (this.deps.isCancelled()) break
              await this.processContentLine(
                contentLine,
                targetRowCountFor,
                emitOnTableMarker,
              )
            }
          }

          // Handle finish reason — drain any residual content as a single
          // (best-effort) record. No flush check, no marker switch.
          if (choice.finish_reason) {
            this.lastFinishReason = choice.finish_reason
            console.log(
              `[Generate-Stream] Stream finished. Reason: ${choice.finish_reason}`,
            )

            if (contentBuffer.trim()) {
              const line = contentBuffer.trim()
              const tableMarker = line.match(TABLE_MARKER_RE)
              if (!tableMarker && this.currentTable) {
                try {
                  const record = JSON.parse(line)
                  if (
                    typeof record === 'object' &&
                    record !== null &&
                    !Array.isArray(record)
                  ) {
                    this.insertQueue.push(record)
                  }
                } catch {
                  // skip — malformed trailing line
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
  }

  /** Flush whatever is queued for the current table. Safe to call anytime. */
  async flushRemaining(): Promise<void> {
    if (this.insertQueue.length > 0 && this.currentTable) {
      await this.flushBatch(this.currentTable, this.insertQueue.splice(0))
    }
  }

  /**
   * Continuation mechanism: after the main stream ends, detect any tables
   * that received zero rows and issue focused follow-up API calls for each
   * missing table, streaming the resulting records through the same SSE
   * stream.
   *
   * `totalRows` is the grand total target across all tables — used only for
   * the initial "Continuing generation for N remaining tables..." progress
   * event.
   */
  async runContinuation(totalRows: number): Promise<void> {
    if (this.deps.isCancelled()) return

    const expectedTables = this.body.schema.map(s => s.name)
    const generatedTables = Object.keys(this.allTableData)
    const missingTables = expectedTables.filter(
      t =>
        !generatedTables.includes(t) ||
        (this.allTableData[t]?.length || 0) === 0,
    )

    console.log(
      `[Generate-Stream] Expected tables: [${expectedTables.join(', ')}]`,
    )
    console.log(
      `[Generate-Stream] Generated tables: [${generatedTables.join(', ')}] (rows: ${generatedTables
        .map(t => `${t}=${this.allTableData[t]?.length || 0}`)
        .join(', ')})`,
    )

    if (missingTables.length === 0) {
      console.log(
        `[Generate-Stream] ✓ All ${expectedTables.length} table(s) generated in main pass — no continuation needed.`,
      )
      return
    }

    console.warn(
      `[Generate-Stream] ⚠️ ${missingTables.length} table(s) missing data. Triggering continuation: [${missingTables.join(', ')}]`,
    )

    this.deps.emit({
      type: 'progress',
      table: '',
      message: `Continuing generation for ${missingTables.length} remaining table${missingTables.length === 1 ? '' : 's'}...`,
      totalInserted: this.totalInserted,
      targetRows: totalRows,
    })

    // Wrap the entire continuation phase in a top-level try/catch so a
    // failure never propagates to the outer catch (best-effort).
    try {
      for (const missingTable of missingTables) {
        if (this.deps.isCancelled()) break

        const tableSchema = this.body.schema.find(s => s.name === missingTable)
        if (!tableSchema) {
          console.warn(
            `[Generate-Stream] Continuation: schema not found for ${missingTable}, skipping.`,
          )
          continue
        }

        const rowCount = this.body.rowCounts[missingTable] || 10
        console.log(
          `[Generate-Stream] Continuation: generating ${rowCount} rows for [${missingTable}]`,
        )

        const continuationPrompt = buildContinuationPrompt(
          missingTable,
          rowCount,
          tableSchema.columns,
        )

        let contResponse: Response
        try {
          contResponse = await fetch(`${DEEPSEEK_BASE_URL}/chat/completions`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${DEEPSEEK_API_KEY}`,
            },
            body: JSON.stringify({
              model: DEEPSEEK_MODEL,
              messages: [
                { role: 'system', content: continuationPrompt },
                {
                  role: 'user',
                  content: `Generate ${rowCount} records for ${missingTable} now.`,
                },
              ],
              stream: true,
              max_tokens: DEEPSEEK_MAX_TOKENS,
              stream_options: { include_usage: true },
            }),
          })
        } catch (fetchErr) {
          console.warn(
            `[Generate-Stream] Continuation fetch failed for ${missingTable}:`,
            fetchErr,
          )
          continue
        }

        if (!contResponse.ok) {
          const contErrText = await contResponse
            .text()
            .catch(() => 'Unknown error')
          console.warn(
            `[Generate-Stream] Continuation HTTP ${contResponse.status} for ${missingTable}:`,
            contErrText,
          )
          continue
        }

        const contReader = contResponse.body?.getReader()
        if (!contReader) {
          console.warn(
            `[Generate-Stream] Continuation: no response body for ${missingTable}`,
          )
          continue
        }

        // Set currentTable to the missing table and reset counters.
        this.currentTable = missingTable
        this.currentTableInserted =
          this.allTableData[missingTable]?.length || 0
        this.lastFlushTime = Date.now()

        this.deps.emit({
          type: 'progress',
          table: missingTable,
          message: `Streaming records into [${missingTable}]`,
          rowsInserted: 0,
          totalInserted: this.totalInserted,
          targetRows: rowCount,
        })

        // Process the continuation stream — same NDJSON parsing logic as
        // the main stream, but with a constant targetRowCountFor and no
        // "Streaming records into" emit on marker switch.
        try {
          await this.processReader(contReader, {
            targetRowCountFor: () => rowCount,
            emitOnTableMarker: false,
          })
        } catch (contErr) {
          console.warn(
            `[Generate-Stream] Continuation stream error for ${missingTable}:`,
            contErr,
          )
        }

        // Flush any remaining records queued for this table
        try {
          await this.flushRemaining()
        } catch {
          // best effort
        }

        const finalCount = this.allTableData[missingTable]?.length || 0
        console.log(
          `[Generate-Stream] Continuation complete for [${missingTable}]: ${finalCount} rows (finish_reason: ${this.lastFinishReason || 'n/a'})`,
        )

        // Mark this continuation table complete
        this.deps.emit({
          type: 'table_complete',
          table: missingTable,
          totalRows: finalCount,
        })

        try {
          contReader.cancel()
        } catch {
          /* already released */
        }
        try {
          contReader.releaseLock()
        } catch {
          /* already released */
        }
      }

      console.log(`[Generate-Stream] Continuation phase finished.`)
    } catch (contOuterErr) {
      console.warn(
        '[Generate-Stream] Continuation phase encountered an error (continuing with what we have):',
        contOuterErr,
      )
    }
  }

  // ─────────────────────────────────────────────────────────────
  // Internals
  // ─────────────────────────────────────────────────────────────

  /**
   * Handle a single completed content line: either a table marker or a
   * JSON record for the current table.
   */
  private async processContentLine(
    contentLine: string,
    targetRowCountFor: (tableName: string) => number,
    emitOnTableMarker: boolean,
  ): Promise<void> {
    const line = contentLine.trim()
    if (!line) return

    // Check for table marker
    const tableMarker = line.match(TABLE_MARKER_RE)
    if (tableMarker) {
      // Flush any pending records for the previous table
      if (this.insertQueue.length > 0 && this.currentTable) {
        await this.flushBatch(this.currentTable, this.insertQueue.splice(0))
        this.deps.emit({
          type: 'progress',
          table: this.currentTable,
          rowsInserted: this.currentTableInserted,
          totalInserted: this.totalInserted,
          targetRows: targetRowCountFor(this.currentTable),
        })
      }

      // Switch to new table
      this.currentTable = tableMarker[1]
      this.currentTableInserted =
        this.allTableData[this.currentTable]?.length || 0

      if (emitOnTableMarker) {
        this.deps.emit({
          type: 'progress',
          table: this.currentTable,
          rowsInserted: 0,
          totalInserted: this.totalInserted,
          targetRows: targetRowCountFor(this.currentTable),
          message: `Streaming records into [${this.currentTable}]`,
        })
      }
      return
    }

    // Try to parse as NDJSON record
    if (!this.currentTable) return

    try {
      const record = JSON.parse(line)
      if (
        typeof record === 'object' &&
        record !== null &&
        !Array.isArray(record)
      ) {
        this.insertQueue.push(record)

        // Flush if batch is full or interval elapsed
        const now = Date.now()
        if (
          this.insertQueue.length >= BATCH_SIZE ||
          now - this.lastFlushTime >= FLUSH_INTERVAL_MS
        ) {
          await this.flushBatch(this.currentTable, this.insertQueue.splice(0))
          this.lastFlushTime = now

          this.deps.emit({
            type: 'progress',
            table: this.currentTable,
            rowsInserted: this.currentTableInserted,
            totalInserted: this.totalInserted,
            targetRows: targetRowCountFor(this.currentTable),
          })
        }
      }
    } catch {
      // Malformed line — skip and continue
      this.malformedLines++
      if (this.malformedLines <= 5) {
        console.warn(
          '[Generate-Stream] Malformed NDJSON line:',
          line.substring(0, 100),
        )
      }
    }
  }

  /**
   * Persist a batch of records for `tableName`. Mutates in-memory state
   * (allTableData, totalInserted, currentTableInserted) and delegates the
   * actual DB write to the caller-supplied `persistBatch` callback.
   */
  async flushBatch(tableName: string, records: unknown[]): Promise<void> {
    if (records.length === 0) return

    // Add to in-memory data
    if (!this.allTableData[tableName]) {
      this.allTableData[tableName] = []
    }
    this.allTableData[tableName].push(...records)

    // Update database record periodically
    if (this.databaseId) {
      const newTotalCount = this.totalInserted + records.length
      try {
        await this.deps.persistBatch({
          tableName,
          records,
          newTotalCount,
          allTableData: this.allTableData,
        })
      } catch (err) {
        console.warn('[Generate-Stream] DB update failed:', err)
      }
    }

    this.totalInserted += records.length
    this.currentTableInserted += records.length
  }
}
