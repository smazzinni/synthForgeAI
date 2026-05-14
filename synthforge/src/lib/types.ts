// ─── Shared Types for SynthForge AI ─────────────────────

export interface Workspace {
  id: string
  name: string
  slug: string
  agentInstructions: string
}

export interface Database_ {
  id: string
  name: string
  dbType: string
  schemaJson: string
  dataJson: string
  projectId: string
  updatedAt: string
  _count?: { datasets: number; conversations: number }
}

export interface Project {
  id: string
  name: string
  description: string
  workspaceId: string
  databases?: Database_[]
}

export interface QualityScore {
  overall: number
  breakdown: {
    completeness: number
    uniqueness: number
    distribution: number
    referentialIntegrity: number
  }
}

export interface PIICheck {
  hasPII: boolean
  findings: { type: string; field: string; count: number }[]
}

export interface Message {
  id: string
  role: string
  content: string
  sqlCode: string
  tokensIn: number
  tokensOut: number
  cost: number
  createdAt: string
  agentName: string
  reasoningSteps: string
  options: string
  tablesJson: string
  qualityScore?: QualityScore | null
  piiCheck?: PIICheck | null
  schemaVersion?: number
  isError?: boolean
  isStreaming?: boolean
  isCancelled?: boolean
  generationStatus?: 'thinking' | 'generating' | 'completed' | 'failed' | 'cancelled'
}

export interface Conversation {
  id: string
  title: string
  messages: Message[]
}

export interface ReasoningStep {
  type: 'intent' | 'domain_detection' | 'entity_extraction' | 'relationship_mapping' | 'constraint_planning' | 'data_strategy' | 'validation' | 'execution' | 'reflection'
  label: string
  description: string
  status: 'pending' | 'running' | 'completed' | 'failed'
  output?: string
}

export interface ClarificationOption {
  id: string
  label: string
  value: string
  description?: string
}

export interface AgentStepUI {
  agent: string
  task: string
  status: 'pending' | 'running' | 'completed' | 'failed'
  output?: string
  tables?: string[]
}

export interface QualityReportData {
  overallScore: number
  totalTables: number
  totalRows: number
  totalIssues: number
  criticalCount: number
  warningCount: number
  infoCount: number
  tables: {
    table: string
    rowCount: number
    columnCount: number
    score: number
    issues: {
      table: string
      column?: string
      type: string
      severity: string
      message: string
      count: number
      recoverable: boolean
    }[]
  }[]
  fixesApplied: number
  fixDetails: {
    table: string
    column?: string
    type: string
    severity: string
    message: string
    count: number
    recoverable: boolean
    before?: unknown
    after?: unknown
  }[]
}

export interface SchemaDef {
  columns: Record<string, string>
  relationships?: string[]
}

export type View = 'landing' | 'dashboard' | 'studio'
export type AgentMode = 'plan' | 'execute' | 'auto'
