// ─── Studio shared types ───
// Extracted from page.tsx to keep the main component file focused.

import type { AgentStatus, InteractiveOptions } from '@/lib/ai-agents'

export interface GenerationProgress {
  isGenerating: boolean
  currentTable: string
  rowsInserted: number
  totalInserted: number
  targetRows: number
  tablesGenerated: number
  statusMessages: string[]
  databaseId?: string
}

export interface Message {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  reasoningContent?: string
  agentName?: string
  agentStatus?: AgentStatus | null
  interactiveOptions?: InteractiveOptions | null
  generationProgress?: GenerationProgress | null
  timestamp: Date
  isStreaming?: boolean
  tables?: Record<string, unknown[]> | null
  // ─── External DB SQL block(s) ───
  sqlBlock?: string | null
  sqlBlocks?: string[]
  sqlBlockExecuting?: boolean
  sqlBlockResult?: {
    ok: boolean
    message: string
    rowCount?: number
    affectedRows?: number
    rows?: Record<string, unknown>[]
    columns?: string[]
  } | null
}

export interface SchemaTable {
  name: string
  columns: { name: string; type: string }[]
}

export interface StudioPageProps {
  databaseId?: string
  initialName?: string
  initialSchema?: SchemaTable[]
  initialData?: Record<string, unknown[]>
  initialMessages?: Message[]
  conversationId?: string
  // ─── External DB connection (live mode) ───
  initialConnectionId?: string
  initialConnectionName?: string
  initialConnectionDialect?: 'postgres' | 'mysql'
}
