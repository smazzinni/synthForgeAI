// ─── Streaming Database Generation API — shared types ───

export interface GenerationSchema {
  name: string
  columns: Array<{ name: string; type: string }>
}

export interface GenerationRequest {
  databaseId?: string
  databaseName?: string
  schema: GenerationSchema[]
  rowCounts: Record<string, number>
  instructions?: string
  conversationHistory?: Array<{ role: string; content: string }>
  userId?: string
}

export interface SSEEvent {
  type:
    | 'progress'
    | 'table_complete'
    | 'complete'
    | 'error'
    | 'database_created'
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
