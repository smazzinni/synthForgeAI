// ─── Shared Types ─────────────────────────────────────────────

interface Workspace {
  id: string
  name: string
  slug: string
  agentInstructions: string
}

interface Project {
  id: string
  name: string
  description: string
  workspaceId: string
  databases?: Database_[]
}

interface Database_ {
  id: string
  name: string
  dbType: string
  schemaJson: string
  dataJson: string
  projectId: string
  updatedAt: string
  _count?: { datasets: number; conversations: number }
}

interface QualityScore {
  overall: number
  breakdown: {
    completeness: number
    uniqueness: number
    distribution: number
    referentialIntegrity: number
  }
}

interface PIICheck {
  hasPII: boolean
  findings: { type: string; field: string; count: number }[]
}

interface Message {
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

interface Conversation {
  id: string
  title: string
  messages: Message[]
}

interface ReasoningStep {
  type: 'intent' | 'domain_detection' | 'entity_extraction' | 'relationship_mapping' | 'constraint_planning' | 'data_strategy' | 'validation' | 'execution' | 'reflection'
  label: string
  description: string
  status: 'pending' | 'running' | 'completed' | 'failed'
  output?: string
}

interface ClarificationOption {
  id: string
  label: string
  value: string
  description?: string
}

interface AgentStepUI {
  agent: string
  task: string
  status: 'pending' | 'running' | 'completed' | 'failed'
  output?: string
  tables?: string[]
}

interface QualityReportData {
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

type View = 'landing' | 'dashboard' | 'studio'
type AgentMode = 'plan' | 'execute' | 'auto'

// ─── Animation Variants ────────────────────────────────────────

const fadeInUp = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -10 }
}

const staggerContainer = {
  animate: {
    transition: { staggerChildren: 0.08 }
  }
}

const staggerItem = {
  initial: { opacity: 0, y: 15 },
  animate: { opacity: 1, y: 0 }
}

const messageSlideIn = {
  initial: { opacity: 0, y: 12, scale: 0.98 },
  animate: { opacity: 1, y: 0, scale: 1 },
  transition: { type: 'spring' as const, stiffness: 300, damping: 24 }
}

// ─── Gradient background animation keyframes ──────────────────

const gradientStyle = `
@keyframes gradientShift {
  0%, 100% { background-position: 0% 50%; }
  50% { background-position: 100% 50%; }
}
`

export type {
  Workspace,
  Project,
  Database_,
  QualityScore,
  PIICheck,
  Message,
  Conversation,
  ReasoningStep,
  ClarificationOption,
  AgentStepUI,
  QualityReportData,
  View,
  AgentMode
}

export {
  fadeInUp,
  staggerContainer,
  staggerItem,
  messageSlideIn,
  gradientStyle
}
