// ─── Generation helper functions ───
// Pure helpers extracted from the studio page's `startStreamingGeneration`
// function. The main streaming loop itself stays in the studio page because it
// is tightly coupled to React state setters (setMessages, setGeneratedSchema,
// setGeneratedData, setGenerationProgress, setCurrentDatabaseId,
// setDatabaseName), refs (messagesRef, generationAbortRef), and async fetch
// logic — extracting it would require passing 10+ setters/refs, blowing past
// the prop-count threshold. Instead, the pure derivations (initial progress
// state, SSE event message formatting, completion summary message) live here.

import type { BeginGenerationSignal } from '@/lib/ai-agents'
import type { GenerationProgress } from './types'

// ─── Initial progress state ───

/**
 * Build the initial GenerationProgress object from a BEGIN_GENERATION signal.
 * Sums the per-table row counts to compute `targetRows`, seeds an empty
 * `currentTable` and a "Generating database schema..." status message.
 */
export function buildInitialGenerationProgress(
  signal: BeginGenerationSignal,
  databaseId?: string,
): GenerationProgress {
  return {
    isGenerating: true,
    currentTable: '',
    rowsInserted: 0,
    totalInserted: 0,
    targetRows: Object.values(signal.rowCounts).reduce((s, n) => s + n, 0),
    tablesGenerated: 0,
    statusMessages: ['Generating database schema...'],
    databaseId,
  }
}

// ─── SSE event message formatters ───

/**
 * Shape of a `progress` SSE event from /api/generate-stream. Only the fields
 * this helper cares about are typed; the studio page consumes the full event.
 */
export interface ProgressStreamEvent {
  type: 'progress'
  table?: string
  rowsInserted?: number
  totalInserted?: number
  targetRows?: number
  message?: string
}

/**
 * Format the human-readable status message shown in the generation progress UI
 * for a `progress` SSE event. Falls back through:
 *   1. The event's own `message` (server-provided narrative)
 *   2. "Streaming records into [table] — N rows" when a table is named
 *   3. "N rows inserted" as a last-resort numeric summary
 */
export function formatProgressMessage(event: ProgressStreamEvent): string {
  if (event.message) return event.message
  if (event.table) {
    return `Streaming records into [${event.table}] — ${event.totalInserted || 0} rows`
  }
  return `${event.totalInserted || 0} rows inserted`
}

// ─── Shape of a `complete` SSE event ───

export interface CompleteStreamEvent {
  type: 'complete'
  durationMs?: number
  totalRows?: number
  tablesGenerated?: number
}

/**
 * Format the final "Generation complete — N rows across M tables (Xs)" message
 * shown when the streaming generation pipeline finishes successfully.
 */
export function formatCompleteMessage(event: CompleteStreamEvent): string {
  const durationSec = ((event.durationMs || 0) / 1000).toFixed(1)
  const totalRows = event.totalRows || 0
  const tablesGen = event.tablesGenerated || 0
  return `Generation complete — ${totalRows.toLocaleString()} rows across ${tablesGen} tables (${durationSec}s)`
}

/**
 * Shape of a `table_complete` SSE event.
 */
export interface TableCompleteStreamEvent {
  type: 'table_complete'
  table?: string
  totalRows?: number
}

/**
 * Format the "[table] — N rows inserted" message shown when one table finishes
 * streaming. Used to append to the rolling statusMessages list.
 */
export function formatTableCompleteMessage(event: TableCompleteStreamEvent): string {
  const tableName = event.table || ''
  const tableRows = event.totalRows || 0
  return `[${tableName}] — ${tableRows.toLocaleString()} rows inserted`
}

// ─── Apply a `complete` event to a GenerationProgress object (pure) ───

/**
 * Build the final GenerationProgress object after a `complete` event.
 * Preserves the existing statusMessages (capped at the last 5) and appends the
 * completion summary message.
 */
export function buildCompletedProgress(
  prev: GenerationProgress,
  event: CompleteStreamEvent,
): GenerationProgress {
  const tablesGen = event.tablesGenerated || 0
  const totalRows = event.totalRows || 0
  const finalMsg = formatCompleteMessage(event)
  return {
    ...prev,
    isGenerating: false,
    tablesGenerated: tablesGen,
    totalInserted: totalRows,
    statusMessages: [...prev.statusMessages.slice(-5), finalMsg],
  }
}

// ─── Apply a `progress` event to a GenerationProgress object (pure) ───

/**
 * Build the next GenerationProgress object after a `progress` event.
 * Updates the current table, row counts, and target, and appends the formatted
 * status message (capped at the last 5).
 */
export function applyProgressEvent(
  prev: GenerationProgress,
  event: ProgressStreamEvent,
): GenerationProgress {
  const statusMsg = formatProgressMessage(event)
  return {
    ...prev,
    currentTable: event.table || prev.currentTable,
    rowsInserted: event.rowsInserted || 0,
    totalInserted: event.totalInserted || prev.totalInserted,
    targetRows: event.targetRows || prev.targetRows,
    statusMessages: [...prev.statusMessages.slice(-5), statusMsg],
  }
}

// ─── Apply a `table_complete` event to a GenerationProgress object (pure) ───

/**
 * Build the next GenerationProgress object after a `table_complete` event.
 * Increments the tablesGenerated counter and appends the table completion
 * message (capped at the last 5).
 */
export function applyTableCompleteEvent(
  prev: GenerationProgress,
  event: TableCompleteStreamEvent,
): GenerationProgress {
  const completeMsg = formatTableCompleteMessage(event)
  return {
    ...prev,
    tablesGenerated: prev.tablesGenerated + 1,
    statusMessages: [...prev.statusMessages.slice(-5), completeMsg],
  }
}

// ─── Apply an `error` event to a GenerationProgress object (pure) ───

export interface ErrorStreamEvent {
  type: 'error'
  message?: string
  recoverable?: boolean
}

/**
 * Build the next GenerationProgress object after an `error` event. Marks
 * generation as stopped and appends an "Error: <msg>" entry.
 */
export function applyErrorEvent(
  prev: GenerationProgress,
  event: ErrorStreamEvent,
): GenerationProgress {
  const errorMsg = event.message || 'Generation failed'
  return {
    ...prev,
    isGenerating: false,
    statusMessages: [...prev.statusMessages, `Error: ${errorMsg}`],
  }
}
