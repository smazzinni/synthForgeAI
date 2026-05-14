import { create } from 'zustand'
import type { View, AgentMode, Workspace, Project, Database_, Message, Conversation, AgentStepUI, QualityReportData } from '@/lib/types'

interface AppState {
  // ─── App ──────────────────────────────────
  view: View
  setView: (view: View) => void
  sidebarOpen: boolean
  setSidebarOpen: (open: boolean) => void
  mobileStudioTab: 'chat' | 'data'
  setMobileStudioTab: (tab: 'chat' | 'data') => void
  isOnline: boolean
  setIsOnline: (online: boolean) => void

  // ─── Workspace ────────────────────────────
  workspaces: Workspace[]
  setWorkspaces: (ws: Workspace[]) => void
  activeWorkspace: Workspace | null
  setActiveWorkspace: (ws: Workspace | null) => void
  projects: Project[]
  setProjects: (p: Project[]) => void

  // ─── Database ─────────────────────────────
  activeDb: Database_ | null
  setActiveDb: (db: Database_ | null) => void

  // ─── Chat ─────────────────────────────────
  conversation: Conversation | null
  setConversation: (c: Conversation | null) => void
  messages: Message[]
  setMessages: (msgs: Message[] | ((prev: Message[]) => Message[])) => void
  input: string
  setInput: (inp: string) => void
  isLoading: boolean
  setIsLoading: (loading: boolean) => void
  attachedFiles: { name: string; content: string; type: string }[]
  setAttachedFiles: (files: { name: string; content: string; type: string }[] | ((prev: { name: string; content: string; type: string }[]) => { name: string; content: string; type: string }[])) => void
  agentMode: AgentMode
  setAgentMode: (mode: AgentMode) => void
  agentSteps: AgentStepUI[]
  setAgentSteps: (steps: AgentStepUI[] | ((prev: AgentStepUI[]) => AgentStepUI[])) => void
  generationStartTime: number | null
  setGenerationStartTime: (t: number | null) => void
  generationElapsed: string
  setGenerationElapsed: (e: string) => void

  // ─── Right Panel ──────────────────────────
  rightTab: string
  setRightTab: (tab: string) => void
  sqlQuery: string
  setSqlQuery: (q: string) => void
  sqlResult: string
  setSqlResult: (r: string) => void
  expandedReasoning: Record<string, boolean>
  setExpandedReasoning: (r: Record<string, boolean> | ((prev: Record<string, boolean>) => Record<string, boolean>)) => void
  expandedSql: Record<string, boolean>
  setExpandedSql: (r: Record<string, boolean> | ((prev: Record<string, boolean>) => Record<string, boolean>)) => void

  // ─── Visualization ────────────────────────
  erSearchFilter: string
  setErSearchFilter: (f: string) => void
  erRelationshipFilter: string
  setErRelationshipFilter: (f: string) => void

  // ─── Analysis ─────────────────────────────
  explorerView: 'tree' | 'graph'
  setExplorerView: (v: 'tree' | 'graph') => void
  topologicalSortResult: string[] | null
  setTopologicalSortResult: (r: string[] | null) => void
  cutpoints: string[] | null
  setCutpoints: (c: string[] | null) => void
  selectedGraphNode: string | null
  setSelectedGraphNode: (n: string | null) => void
  reachableTables: string[] | null
  setReachableTables: (t: string[] | null) => void
  constraintClosureResult: { from: string; to: string; via: string; cascades: string[] }[] | null
  setConstraintClosureResult: (r: { from: string; to: string; via: string; cascades: string[] }[] | null) => void
  dfsResult: string[] | null
  setDfsResult: (r: string[] | null) => void
  cycleDetectionResult: string[] | null
  setCycleDetectionResult: (r: string[] | null) => void
  isAnalysisRunning: boolean
  setIsAnalysisRunning: (r: boolean) => void

  // ─── Quality ──────────────────────────────
  qualityReport: QualityReportData | null
  setQualityReport: (r: QualityReportData | null) => void
  isQualityCheckRunning: boolean
  setIsQualityCheckRunning: (r: boolean) => void
  showQualityReport: boolean
  setShowQualityReport: (r: boolean) => void

  // ─── UI State ─────────────────────────────
  isDragOver: boolean
  setIsDragOver: (r: boolean) => void
  showSchemaTemplates: boolean
  setShowSchemaTemplates: (r: boolean) => void
  showNewDbDialog: boolean
  setShowNewDbDialog: (r: boolean) => void
  newDbName: string
  setNewDbName: (r: string) => void
  newDbSchema: string
  setNewDbSchema: (r: string) => void
  totalTokens: number
  setTotalTokens: (r: number) => void
  showScrollToBottom: boolean
  setShowScrollToBottom: (r: boolean) => void
  isNearBottom: boolean
  setIsNearBottom: (r: boolean) => void
  sqlSuggestion: string
  setSqlSuggestion: (r: string) => void
  showSqlSuggestion: boolean
  setShowSqlSuggestion: (r: boolean) => void
  sqlValidationError: string
  setSqlValidationError: (r: string) => void
  showAgentMonitor: boolean
  setShowAgentMonitor: (r: boolean) => void
  schemaVersionCount: number
  setSchemaVersionCount: (r: number) => void
}

export const useAppStore = create<AppState>((set) => ({
  // ─── App ──────────────────────────────────
  view: 'landing',
  setView: (view) => set({ view }),
  sidebarOpen: true,
  setSidebarOpen: (sidebarOpen) => set({ sidebarOpen }),
  mobileStudioTab: 'chat',
  setMobileStudioTab: (mobileStudioTab) => set({ mobileStudioTab }),
  isOnline: true,
  setIsOnline: (isOnline) => set({ isOnline }),

  // ─── Workspace ────────────────────────────
  workspaces: [],
  setWorkspaces: (workspaces) => set({ workspaces }),
  activeWorkspace: null,
  setActiveWorkspace: (activeWorkspace) => set({ activeWorkspace }),
  projects: [],
  setProjects: (projects) => set({ projects }),

  // ─── Database ─────────────────────────────
  activeDb: null,
  setActiveDb: (activeDb) => set({ activeDb }),

  // ─── Chat ─────────────────────────────────
  conversation: null,
  setConversation: (conversation) => set({ conversation }),
  messages: [],
  setMessages: (messages) => set(typeof messages === 'function' ? (state) => ({ messages: messages(state.messages) }) : { messages }),
  input: '',
  setInput: (input) => set({ input }),
  isLoading: false,
  setIsLoading: (isLoading) => set({ isLoading }),
  attachedFiles: [],
  setAttachedFiles: (attachedFiles) => set(typeof attachedFiles === 'function' ? (state) => ({ attachedFiles: attachedFiles(state.attachedFiles) }) : { attachedFiles }),
  agentMode: 'auto',
  setAgentMode: (agentMode) => set({ agentMode }),
  agentSteps: [],
  setAgentSteps: (agentSteps) => set(typeof agentSteps === 'function' ? (state) => ({ agentSteps: agentSteps(state.agentSteps) }) : { agentSteps }),
  generationStartTime: null,
  setGenerationStartTime: (generationStartTime) => set({ generationStartTime }),
  generationElapsed: '',
  setGenerationElapsed: (generationElapsed) => set({ generationElapsed }),

  // ─── Right Panel ──────────────────────────
  rightTab: 'preview',
  setRightTab: (rightTab) => set({ rightTab }),
  sqlQuery: '',
  setSqlQuery: (sqlQuery) => set({ sqlQuery }),
  sqlResult: '',
  setSqlResult: (sqlResult) => set({ sqlResult }),
  expandedReasoning: {},
  setExpandedReasoning: (expandedReasoning) => set(typeof expandedReasoning === 'function' ? (state) => ({ expandedReasoning: expandedReasoning(state.expandedReasoning) }) : { expandedReasoning }),
  expandedSql: {},
  setExpandedSql: (expandedSql) => set(typeof expandedSql === 'function' ? (state) => ({ expandedSql: expandedSql(state.expandedSql) }) : { expandedSql }),

  // ─── Visualization ────────────────────────
  erSearchFilter: '',
  setErSearchFilter: (erSearchFilter) => set({ erSearchFilter }),
  erRelationshipFilter: 'all',
  setErRelationshipFilter: (erRelationshipFilter) => set({ erRelationshipFilter }),

  // ─── Analysis ─────────────────────────────
  explorerView: 'tree',
  setExplorerView: (explorerView) => set({ explorerView }),
  topologicalSortResult: null,
  setTopologicalSortResult: (topologicalSortResult) => set({ topologicalSortResult }),
  cutpoints: null,
  setCutpoints: (cutpoints) => set({ cutpoints }),
  selectedGraphNode: null,
  setSelectedGraphNode: (selectedGraphNode) => set({ selectedGraphNode }),
  reachableTables: null,
  setReachableTables: (reachableTables) => set({ reachableTables }),
  constraintClosureResult: null,
  setConstraintClosureResult: (constraintClosureResult) => set({ constraintClosureResult }),
  dfsResult: null,
  setDfsResult: (dfsResult) => set({ dfsResult }),
  cycleDetectionResult: null,
  setCycleDetectionResult: (cycleDetectionResult) => set({ cycleDetectionResult }),
  isAnalysisRunning: false,
  setIsAnalysisRunning: (isAnalysisRunning) => set({ isAnalysisRunning }),

  // ─── Quality ──────────────────────────────
  qualityReport: null,
  setQualityReport: (qualityReport) => set({ qualityReport }),
  isQualityCheckRunning: false,
  setIsQualityCheckRunning: (isQualityCheckRunning) => set({ isQualityCheckRunning }),
  showQualityReport: false,
  setShowQualityReport: (showQualityReport) => set({ showQualityReport }),

  // ─── UI State ─────────────────────────────
  isDragOver: false,
  setIsDragOver: (isDragOver) => set({ isDragOver }),
  showSchemaTemplates: false,
  setShowSchemaTemplates: (showSchemaTemplates) => set({ showSchemaTemplates }),
  showNewDbDialog: false,
  setShowNewDbDialog: (showNewDbDialog) => set({ showNewDbDialog }),
  newDbName: '',
  setNewDbName: (newDbName) => set({ newDbName }),
  newDbSchema: '',
  setNewDbSchema: (newDbSchema) => set({ newDbSchema }),
  totalTokens: 0,
  setTotalTokens: (totalTokens) => set({ totalTokens }),
  showScrollToBottom: false,
  setShowScrollToBottom: (showScrollToBottom) => set({ showScrollToBottom }),
  isNearBottom: true,
  setIsNearBottom: (isNearBottom) => set({ isNearBottom }),
  sqlSuggestion: '',
  setSqlSuggestion: (sqlSuggestion) => set({ sqlSuggestion }),
  showSqlSuggestion: false,
  setShowSqlSuggestion: (showSqlSuggestion) => set({ showSqlSuggestion }),
  sqlValidationError: '',
  setSqlValidationError: (sqlValidationError) => set({ sqlValidationError }),
  showAgentMonitor: false,
  setShowAgentMonitor: (showAgentMonitor) => set({ showAgentMonitor }),
  schemaVersionCount: 0,
  setSchemaVersionCount: (schemaVersionCount) => set({ schemaVersionCount }),
}))
