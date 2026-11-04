'use client'

import { useState, useRef, useEffect, useCallback, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Send,
  Loader2,
  Bot,
  User,
  Sparkles,
  Brain,
  ChevronDown,
  Database,
  Table2,
  Code2,
  GitBranch,
  Save,
  Trash2,
  Copy,
  Download,
  Play,
  History,
  Star,
  StarOff,
  Plus,
  FileJson,
  FileSpreadsheet,
  FileText,
  X,
  ZoomIn,
  ZoomOut,
  Move,
  AlertTriangle,
  CheckCircle2,
  Shield,
  Wand2,
  PlugZap,
  Square,
  RotateCcw,
  KeyRound,
  Link2,
  Layers,
  MousePointerClick,
  RefreshCw,
  Search,
  ArrowRight,
  Columns,
  ChevronRight,
  Keyboard,
  PanelRightClose,
  PanelRightOpen,
  Clock,
  MessageSquare,
  Eraser,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { downloadExport, type ExportFormat } from '../export-download'
import { useIsMobile } from '@/hooks/use-mobile'
import { apiPost, apiPatch, apiDelete, apiGet, invalidateCache } from '@/lib/api-client'
import {
  parseAgentStatus,
  parseInteractiveOptions,
  parseAllInteractiveOptions,
  parseBeginGeneration,
  cleanDisplayText,
  isDestructiveSQL,
  stripSqlComments,
  getAgentByName,
  type AgentStatus,
  type InteractiveOptions,
  type OptionChoice,
  type BeginGenerationSignal,
} from '@/lib/ai-agents'
// Extracted types + helpers + sub-components (kept the main file focused)
import type { Message, SchemaTable, StudioPageProps, GenerationProgress, SavedConversation } from './_lib/types'
import {
  exportAsCSV,
  exportAsJSON,
  exportAsSQL,
  parseAIResponse,
  extractSchema,
  extractAllSqlBlocks,
  extractSqlBlock,
  generateSchemaSQL as generateSchemaSQLHelper,
  computeERLayout as computeERLayoutHelper,
  getDataColumnKind,
  humanizeColumnName,
  columnPlainEnglishHint,
} from './_lib/utils'
import { AgentIcon } from './_components/agent-icon'
import { ShowMoreText } from './_components/show-more-text'
import { SqlBlockCard, type SqlBlockResult } from './_components/sql-block-card'


// ─── Conversation history (localStorage persistence) ───
// Saves up to 50 most recent conversations so users can reload past sessions
// from the History dropdown in the chat header. Each conversation stores the
// full message list plus the generated schema/data/databaseName/databaseId so
// the entire studio state can be restored on load.
const CONVERSATION_STORAGE_KEY = 'synthforge_conversations'
const MAX_CONVERSATIONS = 50
const MAX_AUTO_TURNS = 5
const ACTIVE_GENERATION_KEY = 'synthforge:activeGeneration'

function clearActiveGeneration() {
  try { localStorage.removeItem(ACTIVE_GENERATION_KEY) } catch { /* ignore */ }
}

// SSR-safe lazy loader. Guards against malformed JSON, missing fields, and
// string-vs-Date timestamp mismatches (localStorage serializes Date → string).
function loadSavedConversations(): SavedConversation[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(CONVERSATION_STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter((c: unknown): c is Record<string, unknown> => typeof c === 'object' && c !== null)
      .map((c): SavedConversation => {
        const rawMsgs = Array.isArray(c.messages) ? c.messages : []
        const messages: Message[] = rawMsgs.map((m: Record<string, unknown>, i: number) => ({
          id: String(m.id ?? `m-${i}`),
          role: (m.role as Message['role']) || 'assistant',
          content: String(m.content ?? ''),
          reasoningContent: m.reasoningContent != null ? String(m.reasoningContent) : undefined,
          agentName: m.agentName != null ? String(m.agentName) : undefined,
          timestamp: new Date(typeof m.timestamp === 'string' ? m.timestamp : Date.now()),
          isStreaming: false,
        }))
        return {
          id: String(c.id ?? ''),
          title: String(c.title ?? 'New Conversation'),
          messages,
          schema: Array.isArray(c.schema) ? (c.schema as SchemaTable[]) : [],
          data: (c.data && typeof c.data === 'object' && !Array.isArray(c.data))
            ? (c.data as Record<string, unknown[]>)
            : {},
          databaseName: String(c.databaseName ?? ''),
          databaseId: c.databaseId != null ? String(c.databaseId) : null,
          createdAt: String(c.createdAt ?? new Date().toISOString()),
          updatedAt: String(c.updatedAt ?? new Date().toISOString()),
        }
      })
  } catch {
    return []
  }
}

function persistSavedConversations(convs: SavedConversation[]) {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(CONVERSATION_STORAGE_KEY, JSON.stringify(convs))
  } catch { /* localStorage unavailable or quota exceeded */ }
}

// Auto-title: first user message truncated to 50 chars, else "New Conversation".
function generateConversationTitle(messages: Message[]): string {
  const firstUser = messages.find(m => m.role === 'user')
  if (!firstUser) return 'New Conversation'
  const text = firstUser.content.trim()
  if (!text) return 'New Conversation'
  return text.length > 50 ? text.slice(0, 50) + '…' : text
}

// Compact relative time for the history list ("2h ago", "just now", …).
function relativeTime(iso: string): string {
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return ''
  const diff = Math.max(0, Date.now() - then)
  const sec = Math.floor(diff / 1000)
  if (sec < 60) return 'just now'
  const min = Math.floor(sec / 60)
  if (min < 60) return `${min}m ago`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}h ago`
  const day = Math.floor(hr / 24)
  if (day < 7) return `${day}d ago`
  const wk = Math.floor(day / 7)
  if (wk < 5) return `${wk}w ago`
  const mo = Math.floor(day / 30)
  if (mo < 12) return `${mo}mo ago`
  return `${Math.floor(day / 365)}y ago`
}

// Format a message timestamp as a short HH:MM string for the hover tooltip.
function formatTimestamp(d: Date): string {
  try {
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  } catch {
    return ''
  }
}

// Auto-resize a <textarea> to fit its content, capped at ~3 lines.
// Resets height to auto first so shrinking text also collapses the box.
function autoResizeTextarea(el: HTMLTextAreaElement | null) {
  if (!el) return
  el.style.height = 'auto'
  // ~20px per line + a little padding; cap at 3 lines (~72px).
  const maxHeight = 72
  el.style.height = `${Math.min(el.scrollHeight, maxHeight)}px`
  el.style.overflowY = el.scrollHeight > maxHeight ? 'auto' : 'hidden'
}


// ─── Main Studio Page Component ───
function StudioPageInner({
  databaseId,
  initialName,
  initialSchema,
  initialData,
  initialMessages,
  conversationId: initialConversationId,
  initialConnectionId,
  initialConnectionName,
  initialConnectionDialect,
}: StudioPageProps) {
  const router = useRouter()
  const searchParams = useSearchParams()

  // ─── State ───
  const [currentDatabaseId, setCurrentDatabaseId] = useState<string | undefined>(databaseId)

  // ─── External DB connection state ───
  // When a connection is active, the studio operates in "live mode" — the AI
  // returns SQL blocks instead of BEGIN_GENERATION signals, and SQL is
  // executed against the external DB via /api/connections/execute.
  const [activeConnectionId, setActiveConnectionId] = useState<string | undefined>(initialConnectionId)
  const [activeConnectionName, setActiveConnectionName] = useState<string | undefined>(initialConnectionName)
  const [activeConnectionDialect, setActiveConnectionDialect] = useState<'postgres' | 'mysql' | undefined>(initialConnectionDialect)
  const [connectionLoading, setConnectionLoading] = useState(false)

  const isLiveDbMode = !!activeConnectionId

  const [messages, setMessages] = useState<Message[]>(initialMessages && initialMessages.length > 0 ? initialMessages : [
    {
      id: '1',
      role: 'assistant',
      content: initialConnectionId
        ? `Connected to live ${initialConnectionDialect || 'DB'} **"${initialConnectionName || ''}"**. I have direct access to this database — ask me anything and I'll run SQL against it.\n\n**Examples:**\n- "show me the first 10 rows of users"\n- "how many rows are in the orders table?"\n- "what tables are in this database?"\n- "delete all users created before 2020"\n- "add a status column to the orders table"\n- "drop the legacy_logs table"\n\n**How it works:**\n- **SELECT** queries are auto-executed immediately — results appear inline below.\n- **INSERT / UPDATE / DELETE / DDL** operations show a confirmation dialog before executing.\n- Destructive operations (DROP, TRUNCATE, DELETE without WHERE) are clearly badged.`
        : databaseId
        ? `You're editing database **"${initialName || databaseId}"**. Describe changes or ask me to add more data.`
        : 'Welcome to **SynthForge AI Studio**! I can help you generate synthetic data.\n\nDescribe the database you need, and I\'ll design the schema, generate realistic data, and ensure quality compliance.\n\nFor example: "Generate an e-commerce database with users, orders, and products"',
      agentName: 'Orchestrator',
      timestamp: new Date(),
    },
  ])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [reasoningVisible, setReasoningVisible] = useState(false)
  const [currentReasoning, setCurrentReasoning] = useState('')
  const [generatedSchema, setGeneratedSchema] = useState<SchemaTable[]>(initialSchema || [])
  const [generatedData, setGeneratedData] = useState<Record<string, unknown[]>>(initialData || {})
  const [databaseName, setDatabaseName] = useState(initialName || '')
  const [saving, setSaving] = useState(false)
  const [activeTab, setActiveTab] = useState('data')
  const [selectedTable, setSelectedTable] = useState<string>('')
  const [tableCounts, setTableCounts] = useState<Record<string, number>>({})
  // Server-side paging state for tables larger than what is held in memory.
  const [pagedRows, setPagedRows] = useState<unknown[]>([])
  const [pagedColumns, setPagedColumns] = useState<string[]>([])
  const [pagedTotal, setPagedTotal] = useState(0)
  const [pagedLoading, setPagedLoading] = useState(false)
  const [pageOffset, setPageOffset] = useState(0)
  const [pageSize, setPageSize] = useState(100)
  const [pageSort, setPageSort] = useState<{ col: string; dir: 'asc' | 'desc' } | null>(null)
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [visibleRows, setVisibleRows] = useState(20)
  const [initialQuerySent, setInitialQuerySent] = useState(false)
  const [conversationId, setConversationId] = useState(initialConversationId || '')

  // ─── Conversation history (localStorage) ───
  // Persists past conversations so users can reload them from the History
  // dropdown in the chat header. Lazy-initialized from localStorage (SSR-safe).
  const [conversations, setConversations] = useState<SavedConversation[]>(() => loadSavedConversations())
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null)
  const [historyOpen, setHistoryOpen] = useState(false)
  // Refs to read/write these inside the persistence effect without adding
  // them to its dependency array (which would cause infinite re-runs).
  const activeConversationIdRef = useRef<string | null>(null)
  // When loading a past conversation we set this so the next messages-change
  // effect skips auto-persisting (which would otherwise bump `updatedAt` and
  // needlessly reorder the history list).
  const skipNextPersistRef = useRef(false)

  // SQL workspace state
  const [sqlEditor, setSqlEditor] = useState('')
  const [sqlResults, setSqlResults] = useState<{ rows: Record<string, unknown>[]; columns: string[]; executionTime: number; truncated?: boolean; totalRows?: number } | null>(null)
  const [sqlExecuting, setSqlExecuting] = useState(false)
  // Persist query history + saved queries to localStorage so they survive
  // page reloads. Previously these were in-memory only, so users lost their
  // saved queries every time they navigated away from the studio.
  const [queryHistory, setQueryHistory] = useState<string[]>(() => {
    if (typeof window === 'undefined') return []
    try {
      const raw = localStorage.getItem('synthforge_query_history')
      return raw ? JSON.parse(raw) : []
    } catch {
      return []
    }
  })
  const [savedQueries, setSavedQueries] = useState<Array<{ name: string; sql: string }>>(() => {
    if (typeof window === 'undefined') return []
    try {
      const raw = localStorage.getItem('synthforge_saved_queries')
      return raw ? JSON.parse(raw) : []
    } catch {
      return []
    }
  })
  const [sqlConfirmOpen, setSqlConfirmOpen] = useState(false)
  const [sqlConfirmQuery, setSqlConfirmQuery] = useState('')

  // Persist query history + saved queries whenever they change
  useEffect(() => {
    try {
      localStorage.setItem('synthforge_query_history', JSON.stringify(queryHistory))
    } catch { /* localStorage unavailable */ }
  }, [queryHistory])
  useEffect(() => {
    try {
      localStorage.setItem('synthforge_saved_queries', JSON.stringify(savedQueries))
    } catch { /* localStorage unavailable */ }
  }, [savedQueries])

  // ─── Persist current conversation to history (debounced) ───
  // CRITICAL: This effect must NOT depend on `conversations` — including it
  // creates an infinite loop (effect runs → setConversations → conversations
  // changes → effect runs again). We use a ref + debounce to coalesce rapid
  // updates (which happen during SQL streaming + execution) into a single write.
  const persistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    if (skipNextPersistRef.current) {
      skipNextPersistRef.current = false
      return
    }
    const hasUserMsg = messages.some(m => m.role === 'user')
    if (!hasUserMsg) return
    if (messages.some(m => m.isStreaming)) return

    // Debounce: coalesce rapid message updates (e.g. during SQL streaming)
    // into a single persistence write. Without this, each token from the AI
    // stream or each SQL result triggers a separate save, causing rapid
    // setConversations calls that can trigger "Maximum update depth exceeded".
    if (persistTimerRef.current) {
      clearTimeout(persistTimerRef.current)
    }
    persistTimerRef.current = setTimeout(() => {
      const existingId = activeConversationIdRef.current
      const newId = existingId || (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`)
      const now = new Date().toISOString()
      const title = generateConversationTitle(messages)

      setConversations(prev => {
        const existing = prev.find(c => c.id === newId)
        if (existing && existing.updatedAt === now) return prev
        const conv: SavedConversation = {
          id: newId,
          title,
          messages,
          schema: generatedSchema,
          data: generatedData,
          databaseName,
          databaseId: currentDatabaseId || null,
          connectionId: activeConnectionId || null,
          createdAt: existing?.createdAt || now,
          updatedAt: now,
        }
        let next: SavedConversation[]
        if (existing) {
          next = prev.map(c => (c.id === newId ? conv : c))
        } else {
          next = [conv, ...prev]
        }
        next.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
        if (next.length > MAX_CONVERSATIONS) next = next.slice(0, MAX_CONVERSATIONS)
        persistSavedConversations(next)
        return next
      })

      // Register the new conversation id so subsequent updates patch this
      // entry instead of creating duplicates. Only set the ref synchronously;
      // defer the state update to a microtask so it doesn't trigger a
      // synchronous re-render that would re-run this effect.
      if (!existingId) {
        activeConversationIdRef.current = newId
        queueMicrotask(() => setActiveConversationId(newId))
      }
    }, 500) // 500ms debounce — coalesces rapid streaming updates

    return () => {
      if (persistTimerRef.current) {
        clearTimeout(persistTimerRef.current)
      }
    }
  }, [messages, generatedSchema, generatedData, databaseName, currentDatabaseId, activeConnectionId])

  // Explorer state
  const [favoriteTables, setFavoriteTables] = useState<Set<string>>(new Set())
  const [explorerZoom, setExplorerZoom] = useState(1)
  const [explorerPan, setExplorerPan] = useState({ x: 0, y: 0 })
  const [isPanning, setIsPanning] = useState(false)
  const [panStart, setPanStart] = useState({ x: 0, y: 0 })

  // Chat panel resize
  const [chatWidth, setChatWidth] = useState(340)
  const [isResizing, setIsResizing] = useState(false)

  // ─── Keyboard shortcuts + right panel visibility ───
  // `showShortcuts` toggles the shortcuts help dialog (Cmd/Ctrl + /).
  // `panelVisible` toggles the right data/SQL/explorer panel (Cmd/Ctrl + B).
  // When the panel is hidden the chat column expands to full width and a
  // floating button is rendered to re-open it.
  const [showShortcuts, setShowShortcuts] = useState(false)
  const [panelVisible, setPanelVisible] = useState(true)
  const isMobile = useIsMobile()
  const [mobileView, setMobileView] = useState<'chat' | 'data'>('chat')
  const rightPanelShown = isMobile ? mobileView === 'data' : panelVisible
  // Auto-resizing textarea ref. We swap from a single-line <Input> to a
  // <Textarea> so the chat box can grow with content (capped at 3 lines).
  const chatInputRef = useRef<HTMLTextAreaElement>(null)
  // Tracks whether the chat textarea is focused so we can render a soft
  // amber focus ring/glow around the input row.
  const [inputFocused, setInputFocused] = useState(false)
  // Controls the "Clear chat" confirmation AlertDialog in the chat header.
  const [clearChatOpen, setClearChatOpen] = useState(false)

  // Streaming generation state
  const [generationProgress, setGenerationProgress] = useState<GenerationProgress>({
    isGenerating: false,
    currentTable: '',
    rowsInserted: 0,
    totalInserted: 0,
    targetRows: 0,
    tablesGenerated: 0,
    statusMessages: [],
  })
  const generationAbortRef = useRef<AbortController | null>(null)
  const generationJobIdRef = useRef<{ jobId: string; databaseId: string } | null>(null)
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const pendingTimeoutsRef = useRef<Set<ReturnType<typeof setTimeout>>>(new Set())
  const autoTurnsRef = useRef(0)

  const chatEndRef = useRef<HTMLDivElement>(null)
  const chatContainerRef = useRef<HTMLDivElement>(null)
  const abortRef = useRef<AbortController | null>(null)
  const messagesRef = useRef<Message[]>(messages)
  const loadingRef = useRef(false)
  const resizeRef = useRef<HTMLDivElement>(null)
  // Ref to the latest `executeSqlBlock` function. `sendMessage` (defined
  // above `executeSqlBlock`) needs to call it for auto-execution of SELECT
  // queries in live-DB mode, but `const` declarations aren't hoisted. The
  // ref lets `sendMessage` reach the latest version without a TDZ error.
  const executeSqlBlockRef = useRef<(messageId: string, sql: string, skipConfirm?: boolean) => void>(() => {})

  // Keep messagesRef in sync
  useEffect(() => {
    messagesRef.current = messages
  }, [messages])

  const hasGeneratedData = generatedSchema.length > 0 || Object.keys(generatedData).length > 0

  // Handle initial query from dashboard — merged with the auto-send effect
  // below to avoid double-firing. The previous version had TWO effects
  // both reading `searchParams.get('q')`: one set `input`, the other
  // called `sendMessage(q)`. If the user had already typed something,
  // the sendMessage(q) would overwrite their input. Now there's only one
  // effect that calls sendMessage(q) directly (BUG-47).

  // ─── Load external DB connection when ?connectionId=... is in the URL ───
  // Fetches the connection record, then introspects schema + sample rows.
  useEffect(() => {
    const connId = searchParams.get('connectionId')
    if (!connId || activeConnectionId === connId) return
    let cancelled = false

    const loadConnection = async () => {
      setConnectionLoading(true)
      try {
        const result = await apiGet<{
          connection?: {
            id: string
            name: string
            dialect: 'postgres' | 'mysql'
            status: string
            error_message: string | null
          }
          schema?: SchemaTable[]
          data?: Record<string, unknown[]>
          counts?: Record<string, number>
          error?: string
        }>(`/api/connections/${connId}?include=introspect`, { cacheTtl: 0, force: true, timeout: 30000 })

        if (cancelled) return

        if (!result.connection) {
          toast.error('Connection not found')
          router.replace('/dashboard/connections')
          return
        }

        if (result.connection.status === 'failed') {
          toast.error(`Connection test failed: ${result.connection.error_message || 'unknown error'}`)
        }

        const conn = result.connection
        setActiveConnectionId(result.connection.id)
        setActiveConnectionName(result.connection.name)
        setActiveConnectionDialect(result.connection.dialect)

        if (result.schema && result.schema.length > 0) {
          setGeneratedSchema(result.schema)
        }
        if (result.data && Object.keys(result.data).length > 0) {
          setGeneratedData(result.data)
        }
        if (result.counts) setTableCounts(result.counts)
        setDatabaseName(result.connection.name)

        // Replace the generic welcome message with a live-DB welcome so the
        // user immediately understands they are connected to a real database
        // and the assistant can run SQL against it. Only replace the initial
        // assistant greeting (id === '1') so we never clobber real chat history.
        setMessages(prev => {
          const hasRealHistory = prev.some(m => m.role === 'user')
          if (hasRealHistory) return prev
          return prev.map(m => m.id === '1' ? {
            ...m,
            content: `Connected to live ${conn.dialect} **"${conn.name}"**. I have direct access to this database — ask me anything and I'll run SQL against it.\n\n**Examples:**\n- "show me the first 10 rows of users"\n- "how many rows are in the orders table?"\n- "what tables are in this database?"\n- "add a status column to the orders table"\n\n**How it works:**\n- **SELECT** queries are auto-executed immediately — results appear inline below.\n- **INSERT / UPDATE / DELETE / DDL** operations show a confirmation dialog before executing.`,
          } : m)
        })

        if (result.error) {
          toast.warning(`Schema introspection warning: ${result.error}`)
        } else {
          toast.success(`Connected to ${result.connection.name}`)
        }
      } catch (err) {
        if (!cancelled) {
          toast.error(err instanceof Error ? err.message : 'Failed to load connection')
        }
      } finally {
        if (!cancelled) setConnectionLoading(false)
      }
    }

    loadConnection()
    return () => { cancelled = true }
  }, [searchParams])

  // ─── Restore database + conversation history when ?databaseId=... is in the URL ───
  // When the user navigates to /dashboard/studio?databaseId=<id> (e.g. from the
  // dashboard's "Open" link on a database card), load the saved schema + data
  // AND the conversation history so the chat is restored.
  // BUGFIX: previously the studio only loaded connection mode (?connectionId=)
  // but never restored a generated database's schema/data/messages on refresh.
  // ─── Poll a server-side generation job (after disconnect / page reload) ───
  const pollGeneration = (databaseId: string) => {
    if (pollIntervalRef.current) clearInterval(pollIntervalRef.current)
    const startedAt = Date.now()
    setGenerationProgress(prev => ({ ...prev, isGenerating: true, databaseId }))
    const stop = () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current)
      pollIntervalRef.current = null
    }
    let inFlight = false
    pollIntervalRef.current = setInterval(async () => {
      if (inFlight) return
      if (Date.now() - startedAt > 30 * 60 * 1000) {
        stop()
        setGenerationProgress(prev => ({ ...prev, isGenerating: false }))
        toast.warning('Generation is taking longer than expected. Refresh the page to check its status.')
        return
      }
      inFlight = true
      try {
        const res = await apiGet<{ database?: { data_json: Record<string, unknown[]>; schema_json: SchemaTable[]; row_count?: number; status: string; table_counts?: Record<string, number> } }>(
          `/api/databases?id=${databaseId}&preview=200`, { cacheTtl: 0, force: true, timeout: 15000 })
        const db = res.database
        if (!db) return
        if (db.status === 'generating') {
          if (typeof db.row_count === 'number') {
            setGenerationProgress(prev => ({ ...prev, isGenerating: true, totalInserted: db.row_count as number }))
          }
          return
        }
        stop()
        generationJobIdRef.current = null
        clearActiveGeneration()
        if (db.data_json && Object.keys(db.data_json).length > 0) setGeneratedData(db.data_json)
        if (db.table_counts) setTableCounts(db.table_counts)
        if (Array.isArray(db.schema_json) && db.schema_json.length > 0) setGeneratedSchema(db.schema_json)
        setGenerationProgress(prev => ({
          ...prev,
          isGenerating: false,
          totalInserted: db.row_count ?? prev.totalInserted,
        }))
        toast.success('Database generation finished')
        invalidateCache('/api/databases')
      } catch (err) {
        console.warn('[Studio] Generation poll failed:', err)
      } finally {
        inFlight = false
      }
    }, 3000)
  }

  // Resume polling for a generation that was started before a reload.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(ACTIVE_GENERATION_KEY)
      if (!raw) return
      const saved = JSON.parse(raw) as { jobId?: string; databaseId?: string }
      const urlDbId = new URLSearchParams(window.location.search).get('databaseId')
      if (!saved.databaseId || (urlDbId && urlDbId !== saved.databaseId)) return
      generationJobIdRef.current = saved.jobId ? { jobId: saved.jobId, databaseId: saved.databaseId } : null
      if (!urlDbId) setCurrentDatabaseId(saved.databaseId)
      pollGeneration(saved.databaseId)
    } catch { /* ignore */ }
     
  }, [])

  // Detach from in-flight requests on unmount (the server keeps generating).
  useEffect(() => {
    const timeouts = pendingTimeoutsRef.current
    return () => {
      abortRef.current?.abort()
      generationAbortRef.current?.abort()
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current)
      timeouts.forEach(clearTimeout)
      timeouts.clear()
    }
  }, [])

  useEffect(() => {
    const dbId = searchParams.get('databaseId')
    if (!dbId || currentDatabaseId === dbId) return
    let cancelled = false

    const loadDatabase = async () => {
      try {
        const result = await apiGet<{
          database?: {
            id: string
            name: string
            schema_json: SchemaTable[]
            data_json: Record<string, unknown[]>
            row_count: number
            status: string
            table_counts?: Record<string, number>
          }
        }>(`/api/databases?id=${dbId}&preview=200`, { cacheTtl: 0, force: true, timeout: 15000 })

        if (cancelled || !result.database) return

        setCurrentDatabaseId(result.database.id)
        setDatabaseName(result.database.name)
        if (result.database.status === 'generating') {
          pollGeneration(result.database.id)
        }
        if (Array.isArray(result.database.schema_json) && result.database.schema_json.length > 0) {
          setGeneratedSchema(result.database.schema_json)
        }
        if (result.database.data_json && Object.keys(result.database.data_json).length > 0) {
          setGeneratedData(result.database.data_json)
        }
        if (result.database.table_counts) setTableCounts(result.database.table_counts)

        // Also load the conversation history for this database
        try {
          const convResult = await apiGet<{ conversations: Array<{ id: string; title: string; messages: Array<{ role: string; content: string; agent_name: string | null }> }> }>(`/api/conversations?databaseId=${dbId}`, { cacheTtl: 0, force: true, timeout: 15000 })
          if (cancelled) return
          const conv = convResult.conversations?.[0]
          if (conv && conv.messages && conv.messages.length > 0) {
            setConversationId(conv.id)
            // Convert the stored messages into the studio's Message format
            const restoredMessages: Message[] = conv.messages.map((m, i) => ({
              id: `restored-${i}-${Date.now()}`,
              role: m.role as 'user' | 'assistant',
              content: m.content,
              agentName: m.agent_name || undefined,
              timestamp: new Date(),
            }))
            // Keep the welcome message only if there are no stored messages
            setMessages(restoredMessages)
          }
        } catch {
          // Conversations are optional — don't fail the whole restore
        }
      } catch (err) {
        if (!cancelled) {
          console.warn('[Studio] Failed to restore database:', err)
        }
      }
    }

    loadDatabase()
    return () => { cancelled = true }
  }, [searchParams])

  // Auto-select first table
  useEffect(() => {
    const tableNames = Object.keys(generatedData)
    if (tableNames.length > 0 && !selectedTable) {
      setSelectedTable(tableNames[0])
    }
  }, [generatedData, selectedTable])

  // Scroll to bottom of chat — but only if the user is already near the
  // bottom (within 80px). This prevents the view from snapping back down
  // on every token while the user is reading earlier messages.
  // BUGFIX (BUG-51): previously fired on every `currentReasoning` change
  // (i.e. every token), causing janky scroll fighting with the user.
  useEffect(() => {
    const container = chatContainerRef.current
    if (!container) return
    const nearBottom =
      container.scrollHeight - container.scrollTop - container.clientHeight < 80
    if (!nearBottom) return
    // Use 'auto' (instant) during streaming — 'smooth' causes a long
    // animation queue that fights with rapid token updates.
    const isStreaming = currentReasoning.length > 0
    chatEndRef.current?.scrollIntoView({ behavior: isStreaming ? 'auto' : 'smooth' })
  }, [messages, currentReasoning])

  // ─── Auto-resize chat textarea ───
  // Recompute the textarea height whenever `input` changes. The onChange
  // handler already calls autoResizeTextarea on each keystroke, but this
  // effect also catches programmatic clears (e.g. setInput('') after
  // sendMessage) so the box collapses back to a single line.
  useEffect(() => {
    autoResizeTextarea(chatInputRef.current)
  }, [input])

  // ─── Resize handler ───
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return
      const newWidth = Math.max(280, Math.min(600, e.clientX))
      setChatWidth(newWidth)
    }
    const handleMouseUp = () => setIsResizing(false)

    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove)
      document.addEventListener('mouseup', handleMouseUp)
    }
    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [isResizing])

  // ─── Save conversation to backend ───
  const saveConversation = useCallback(async (userMsg: string, assistantMsg: string, agentName?: string) => {
    try {
      const msgs = [
        { role: 'user', content: userMsg },
        { role: 'assistant', content: assistantMsg, agentName },
      ]
      if (conversationId) {
        await apiPost('/api/conversations', {
          id: conversationId,
          messages: msgs,
        })
      } else {
        const result = await apiPost<{ conversationId: string }>('/api/conversations', {
          databaseId: currentDatabaseId,
          title: databaseName || 'New Conversation',
          messages: msgs,
        })
        if (result.conversationId) {
          setConversationId(result.conversationId)
        }
      }
    } catch (err) {
      console.warn('[Studio] Failed to save conversation:', err)
    }
  }, [conversationId, currentDatabaseId, databaseName])

  // ─── Send message with DeepSeek streaming ───
  const sendMessage = useCallback(async (messageText?: string, isAuto = false) => {
    const textToSend = messageText || input
    if (!textToSend.trim() || loadingRef.current) return
    if (isAuto === true) autoTurnsRef.current += 1
    else autoTurnsRef.current = 0

    if (abortRef.current) {
      abortRef.current.abort()
    }

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: textToSend.trim(),
      timestamp: new Date(),
    }

    const assistantId = (Date.now() + 1).toString()
    const assistantMessage: Message = {
      id: assistantId,
      role: 'assistant',
      content: '',
      reasoningContent: '',
      agentName: 'Orchestrator',
      timestamp: new Date(),
      isStreaming: true,
    }

    setMessages(prev => [...prev, userMessage, assistantMessage])
    setInput('')
    setLoading(true)
    loadingRef.current = true
    setReasoningVisible(true)
    setCurrentReasoning('')

    const controller = new AbortController()
    abortRef.current = controller
    let flushTimer: ReturnType<typeof setTimeout> | null = null
    let errorDetail: string | null = null
    let errorStatus = 0

    try {
      // BUGFIX: Wire sqlBlockResult into chat history so the AI model can
      // actually SEE the results of queries it asked the user to execute.
      // Without this, the model emits "Let me check the existing data..." and
      // then waits for results that never arrive in its context — causing
      // multi-step "fetch → generate → insert → verify" flows to stall.
      // FIX: Use sqlBlockStates (per-block state) instead of the legacy
      // sqlBlockResult field, so ALL blocks' results are included.
      const history = messagesRef.current
        .filter(m => m.role === 'user' || m.role === 'assistant')
        .map(m => {
          let content = m.content
          // Include per-block results from sqlBlockStates (the authoritative source)
          if (m.role === 'assistant' && m.sqlBlockStates) {
            for (const [sql, state] of Object.entries(m.sqlBlockStates)) {
              if (state.result) {
                if (state.result.ok && state.result.rows && state.result.rows.length > 0) {
                  content += `\n\n[SQL RESULT for "${sql.slice(0, 80)}...": ${state.result.message}]\n${JSON.stringify(state.result.rows.slice(0, 20), null, 2)}${state.result.rows.length > 20 ? `\n... +${state.result.rows.length - 20} more rows` : ''}`
                } else if (state.result.ok) {
                  content += `\n\n[SQL RESULT for "${sql.slice(0, 80)}...": ${state.result.message}]`
                } else if (!state.result.ok) {
                  content += `\n\n[SQL ERROR for "${sql.slice(0, 80)}...": ${state.result.message}]`
                }
              }
            }
          }
          return { role: m.role, content }
        })

      // Truncate currentData if too large (> 20KB send only summary)
      let dataToSend: Record<string, unknown[]> | undefined = hasGeneratedData ? generatedData : undefined
      if (dataToSend) {
        const dataStr = JSON.stringify(dataToSend)
        if (dataStr.length > 20000) {
          // Send only schema + row counts instead of full data
          const summary: Record<string, unknown[]> = {}
          for (const [tableName, rows] of Object.entries(dataToSend)) {
            if (Array.isArray(rows) && rows.length > 0) {
              // Send first 2 rows as samples + row count
              summary[tableName] = rows.slice(0, 2)
            } else {
              summary[tableName] = []
            }
          }
          dataToSend = summary
        }
      }

      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: userMessage.content,
          ...(currentDatabaseId ? { databaseId: currentDatabaseId, databaseName } : {}),
          ...(conversationId ? { conversationId } : {}),
          // ─── Live DB mode ───
          ...(activeConnectionId ? {
            connectionId: activeConnectionId,
            connectionName: activeConnectionName,
            connectionDialect: activeConnectionDialect,
          } : {}),
          currentSchema: generatedSchema,
          currentData: dataToSend,
          history,
        }),
        signal: controller.signal,
      })

      if (!response.ok) {
        // Parse the JSON error body so the user sees the helpful message
        // (e.g. "DeepSeek API key not configured", "Rate limit exceeded")
        // instead of a vague "API error: 503".
        let detail = `API error: ${response.status}`
        errorStatus = response.status
        try {
          const errBody = await response.json()
          if (errBody?.error) detail = errBody.error
          else if (errBody?.content) detail = errBody.content
        } catch {
          // Body wasn't JSON — keep the generic status message
        }
        errorDetail = detail
        throw new Error(detail)
      }

      const reader = response.body?.getReader()
      if (!reader) throw new Error('No response stream')

      const decoder = new TextDecoder()
      let buffer = ''
      let fullContent = ''
      let fullReasoning = ''
      let lastAgentName = 'Orchestrator'
      let lastAgentStatus: AgentStatus | null = null
      let lastInteractiveOptions: InteractiveOptions | null = null
      let reasoningDirty = false
      let contentDirty = false

      // Flush buffered tokens to state (at most every 50ms). Parsing runs
      // here rather than per token.
      const flush = () => {
        if (flushTimer) {
          clearTimeout(flushTimer)
          flushTimer = null
        }
        if (reasoningDirty) {
          reasoningDirty = false
          const r = fullReasoning
          setCurrentReasoning(r)
          setMessages(prev => prev.map(m =>
            m.id === assistantId ? { ...m, reasoningContent: r } : m
          ))
        }
        if (contentDirty) {
          contentDirty = false
          const agentStatus = parseAgentStatus(fullContent)
          if (agentStatus) {
            lastAgentStatus = agentStatus
            lastAgentName = agentStatus.agent
          }
          const allOptions = parseAllInteractiveOptions(fullContent)
          if (allOptions.length > 0) {
            lastInteractiveOptions = allOptions[allOptions.length - 1]
          }
          const c = fullContent
          const an = lastAgentName
          const as = lastAgentStatus
          const io = lastInteractiveOptions
          setMessages(prev => prev.map(m =>
            m.id === assistantId
              ? { ...m, content: c, agentName: an, agentStatus: as, interactiveOptions: io }
              : m
          ))
        }
      }
      const scheduleFlush = () => {
        if (!flushTimer) flushTimer = setTimeout(flush, 50)
      }

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          const trimmed = line.trim()
          if (!trimmed || trimmed.startsWith(':') || !trimmed.startsWith('data: ')) continue

          const data = trimmed.slice(6)
          try {
            const parsed = JSON.parse(data)

            if (parsed.type === 'reasoning') {
              fullReasoning += parsed.content
              reasoningDirty = true
              scheduleFlush()
            } else if (parsed.type === 'content') {
              fullContent += parsed.content
              contentDirty = true
              scheduleFlush()
            } else if (parsed.type === 'done' || parsed.type === 'finish') {
              flush()
              setMessages(prev => prev.map(m =>
                m.id === assistantId
                  ? { ...m, isStreaming: false }
                  : m
              ))
            } else if (parsed.type === 'truncated') {
              flush()
              // BUGFIX (Root cause #3): Response was cut off due to token limit.
              // Show a warning and auto-continue after a short delay.
              toast.warning('Response was cut off due to token limit. Auto-continuing...')
              setMessages(prev => prev.map(m =>
                m.id === assistantId
                  ? { ...m, isStreaming: false, content: m.content + '\n\n⚠️ *[Response was truncated due to token limit. Continuing...]*' }
                  : m
              ))
              // Auto-continue after 2 seconds (capped)
              const t = setTimeout(() => {
                pendingTimeoutsRef.current.delete(t)
                const lastMsg = messagesRef.current[messagesRef.current.length - 1]
                if (lastMsg && lastMsg.role === 'assistant' && !lastMsg.isStreaming) {
                  if (autoTurnsRef.current >= MAX_AUTO_TURNS) {
                    toast.info('Paused automatic follow-ups — send a message to continue.')
                    return
                  }
                  sendMessage('[Auto-continue: Your previous response was cut off. Please continue from where you left off, completing any SQL blocks that were truncated.]', true)
                }
              }, 2000)
              pendingTimeoutsRef.current.add(t)
            } else if (parsed.type === 'error') {
              console.error('[Studio] Stream error:', parsed.content)
              // Surface the mid-stream error to the user and stop the
              // streaming indicator so the bubble doesn't appear stuck.
              const errMsg = parsed.content || 'The AI stream was interrupted'
              setMessages(prev => prev.map(m =>
                m.id === assistantId
                  ? { ...m, isStreaming: false, content: m.content || `⚠️ ${errMsg}` }
                  : m
              ))
              toast.error(errMsg)
            }
          } catch {
            // Skip unparseable
          }
        }
      }

      // Finalize the message
      flush()
      setMessages(prev => prev.map(m =>
        m.id === assistantId
          ? { ...m, isStreaming: false }
          : m
      ))

      // ─── LIVE DB MODE ───
      // When connected to an external DB, the AI responds with SQL code
      // blocks instead of BEGIN_GENERATION signals. Extract the SQL blocks
      // and attach them to the message so the UI can render Execute buttons.
      //
      // AUTO-EXECUTION: SELECT queries are auto-executed immediately so the
      // user sees real rows inline (not just a "Run" button). Mutations
      // (INSERT/UPDATE/DELETE/DDL) still require the user to click "Run on
      // live DB" so they can confirm destructive operations.
      if (isLiveDbMode) {
        // BUGFIX (BUG-35): capture ALL sql blocks, not just the first.
        const sqlBlocks = extractAllSqlBlocks(fullContent)
        const primarySqlBlock = sqlBlocks.length > 0 ? sqlBlocks[0] : null

        // Strip ALL ```sql fenced blocks from the displayed text so the
        // user sees just the explanation + the rendered SQL cards (which
        // have their own Copy / Execute buttons). Other code blocks
        // (```json, ```bash) are preserved.
        // BUGFIX (Root cause #4): Also strip UNCLOSED ```sql fences (truncated
        // responses) so they don't appear as raw text in the chat bubble.
        let displayText = fullContent
          .replace(/```sql\s*\n[\s\S]*?\n?```/gi, '') // closed fences
          .replace(/```sql\s*\n[\s\S]+$/gi, '') // unclosed fences (truncated)
          .trim()

        // BUGFIX (BUG-39): the system prompt tells the AI NOT to emit
        // BEGIN_GENERATION signals or option-block JSON in live mode, but
        // LLMs don't always comply. Strip them so they don't appear in
        // the displayed text or get saved to conversation history.
        displayText = cleanDisplayText(displayText)
        displayText = displayText.replace(/\{"action"\s*:\s*"BEGIN_GENERATION"[\s\S]*?\}/g, '').trim()
        // Remove multiple consecutive blank lines left by the stripping
        displayText = displayText.replace(/\n{3,}/g, '\n\n').trim()

        setMessages(prev => prev.map(m =>
          m.id === assistantId
            ? {
              ...m,
              content: displayText || (primarySqlBlock ? 'Here\'s the SQL:' : ''),
              sqlBlock: primarySqlBlock,
              sqlBlocks: sqlBlocks.length > 0 ? sqlBlocks : undefined,
              // BUGFIX (interactive options in live-DB mode): Previously
              // hard-coded to `null`, which meant whenever the AI asked a
              // question (e.g. "choose a size: small / medium / large") the
              // choice buttons were silently discarded and the user had no
              // way to answer — they could only re-type a free-form reply in
              // the main chat box. Now we preserve the parsed options so the
              // choices render AND a custom-answer input is shown below them.
              interactiveOptions: lastInteractiveOptions,
            }
            : m
        ))

        setLoading(false)
        loadingRef.current = false
        setReasoningVisible(false)
        setCurrentReasoning('')

        saveConversation(userMessage.content, displayText || fullContent, lastAgentName)

        // ─── AUTO-EXECUTE queries in live-DB mode ───
        // The system prompt tells the AI that SELECT queries are
        // auto-executed. So when the AI emits a SELECT (or WITH ... SELECT,
        // or SHOW/DESCRIBE/EXPLAIN), we immediately run it against the live
        // DB and display the rows inline — the user doesn't have to click
        // anything.
        //
        // For DDL/INSERT (e.g. when the user says "seed this database"),
        // we ALSO auto-execute them — but with a confirmation dialog for
        // each block (since they mutate data). This makes the "seed this
        // database" flow work end-to-end: AI emits CREATE TABLE + INSERT
        // blocks, the studio runs them sequentially (confirming each),
        // then refreshes the schema so the new tables appear in the Data
        // section.
        if (sqlBlocks.length > 0 && activeConnectionId) {
          // Auto-execute each SQL block sequentially.
          // - SELECT/WITH/SHOW/DESCRIBE/EXPLAIN: skipConfirm=true (no dialog)
          // - CREATE TABLE/INSERT/UPDATE/DELETE/ALTER/DROP/TRUNCATE:
          //   skipConfirm=false (shows confirmation dialog per block)
          // We run them sequentially (not in parallel) so the user can
          // confirm/reject each one, and so foreign-key dependencies
          // (CREATE TABLE users → INSERT INTO users → CREATE TABLE orders
          // referencing users) resolve in order.
          const runSequentially = async () => {
            let hadReadOnlyQueries = false
            let hadMutations = false
            for (let idx = 0; idx < sqlBlocks.length; idx++) {
              const block = sqlBlocks[idx]
              const stripped = stripSqlComments(block).trim()
              const statements = stripped.split(';').map(s => stripSqlComments(s).trim()).filter(Boolean)
              const readOnlyVerbs = ['SELECT', 'WITH', 'SHOW', 'DESCRIBE', 'EXPLAIN', 'SET', 'USE']
              const allReadOnly = statements.length > 0 && statements.every(stmt => {
                const verb = stmt.split(/\s+/)[0]?.toUpperCase() || ''
                return readOnlyVerbs.includes(verb)
              })

              // Check if this is a destructive operation (DROP TABLE, DELETE
              // without WHERE, TRUNCATE) — these ALWAYS need confirmation.
              // Non-destructive mutations (INSERT, CREATE TABLE, UPDATE with
              // WHERE) are auto-executed in live-DB mode so the Data Generator
              // can insert data without the user clicking "Run" on every block.
              const isDestructive = isDestructiveSQL(block)

              if (allReadOnly && !isDestructive) {
                // Read-only queries: auto-execute, no confirmation
                hadReadOnlyQueries = true
                await executeSqlBlockRef.current(assistantId, block, true)
              } else if (!isDestructive) {
                // Non-destructive mutations (INSERT, CREATE TABLE, UPDATE with WHERE):
                // Auto-execute WITHOUT confirmation — the AI is generating data and
                // should be able to insert it directly. The user asked for data
                // generation, so confirming every INSERT would be annoying.
                hadMutations = true
                await executeSqlBlockRef.current(assistantId, block, true) // skipConfirm=true
              } else {
                // Destructive operations (DROP, TRUNCATE, DELETE without WHERE):
                // ALWAYS require confirmation, even in auto-execute mode.
                await executeSqlBlockRef.current(assistantId, block, false)
              }
            }

            // Auto-continue after read-only queries OR mutations so the AI
            // can see the results and proceed with the next step.
            // BUGFIX (auto-continue broken): Previously `!isStreaming` referenced
            // a variable that did NOT exist in this scope (the only `isStreaming`
            // is a local const inside a different useEffect). This threw a
            // ReferenceError which was silently caught by the .catch() below,
            // so the auto-continue NEVER fired — meaning the AI executed the
            // first SQL block but never received the results, stalling the
            // multi-step "introspect → insert → verify" loop. Fix: use
            // `loadingRef.current` (the authoritative loading flag), which is
            // false at this point because the stream already finished.
            if ((hadReadOnlyQueries || hadMutations) && !loadingRef.current) {
              const t = setTimeout(() => {
                pendingTimeoutsRef.current.delete(t)
                const lastMsg = messagesRef.current[messagesRef.current.length - 1]
                if (lastMsg && lastMsg.role === 'assistant' && !lastMsg.isStreaming && !loadingRef.current) {
                  if (autoTurnsRef.current >= MAX_AUTO_TURNS) {
                    toast.info('Paused automatic follow-ups — send a message to continue.')
                    return
                  }
                  sendMessage('[Auto-continue: SQL executed successfully. Results are in conversation history. Proceed with the next step.]', true)
                }
              }, 1500)
              pendingTimeoutsRef.current.add(t)
            }
          }
          runSequentially().catch(err => {
            console.error('[Studio] Auto-execution sequence failed:', err)
          })
        }

        return
      }

      // Check for BEGIN_GENERATION signal first
      const beginGenSignal = parseBeginGeneration(fullContent)

      if (beginGenSignal) {
        // Clean the display text — remove the BEGIN_GENERATION signal
        const displayText = cleanDisplayText(fullContent)
        const cleanText = displayText.replace(/<think[\s\S]*?<\/think>/gi, '').trim()

        // Update the message with cleaned text (no signal, no raw data)
        setMessages(prev => prev.map(m =>
          m.id === assistantId
            ? { ...m, content: cleanText || 'Starting database generation...', interactiveOptions: null }
            : m
        ))

        // Set the schema immediately from the signal
        if (beginGenSignal.schema && beginGenSignal.schema.length > 0) {
          setGeneratedSchema(beginGenSignal.schema)
        }
        if (beginGenSignal.databaseName) {
          setDatabaseName(beginGenSignal.databaseName)
        }

        // Trigger the streaming generation pipeline
        setLoading(false)
        loadingRef.current = false
        setReasoningVisible(false)
        setCurrentReasoning('')

        // Persist the user message + assistant acknowledgment to the
        // conversation (previously this was skipped on the BEGIN_GENERATION
        // path, which meant generation prompts were lost on refresh).
        const cleanedDisplay = cleanDisplayText(fullContent).replace(/<think[\s\S]*?<\/think>/gi, '').trim()
        saveConversation(userMessage.content, cleanedDisplay || 'Starting database generation...', lastAgentName)

        // Start streaming generation in the background
        startStreamingGeneration(beginGenSignal, assistantId)
        return
      }

      // Fallback: Parse the response for tables/data (legacy path — kept for backward compatibility)
      if (fullContent) {
        const { tables, databaseName: parsedName, displayText } = parseAIResponse(fullContent)

        if (tables) {
          const schema = extractSchema(tables)
          setGeneratedSchema(schema)
          setGeneratedData(tables)
          if (parsedName) setDatabaseName(parsedName)
          autoSaveData(tables, schema, parsedName)
        }

        // Update the message with cleaned display text — preserve interactiveOptions
        if (displayText && displayText !== fullContent) {
          setMessages(prev => prev.map(m =>
            m.id === assistantId
              ? { ...m, content: displayText, interactiveOptions: lastInteractiveOptions }
              : m
          ))
        } else {
          // Even if text didn't change, make sure options are preserved
          setMessages(prev => prev.map(m =>
            m.id === assistantId
              ? { ...m, interactiveOptions: lastInteractiveOptions }
              : m
          ))
        }

        // Save conversation
        saveConversation(userMessage.content, displayText || fullContent, lastAgentName)
      }

      setLoading(false)
      loadingRef.current = false
      setReasoningVisible(false)
      setCurrentReasoning('')
    } catch (err) {
      // BUGFIX (BUG-42): the AbortError path returned early WITHOUT
      // resetting loading/loadingRef, leaving the UI stuck in "Thinking…"
      // state. The new sendMessage call sets them true at the top, so for
      // the typical "user sent a new message before the previous one
      // finished" case the state is correct — but for any OTHER abort
      // reason (component unmount, future Stop button) the UI would hang.
      // Always reset state here, even on abort.
      if (flushTimer) clearTimeout(flushTimer)
      if ((err as Error).name === 'AbortError') {
        setLoading(false)
        loadingRef.current = false
        setReasoningVisible(false)
        // Mark the in-flight assistant message as no longer streaming so
        // the typing indicator stops.
        setMessages(prev => prev.map(m =>
          m.id === assistantId ? { ...m, isStreaming: false } : m
        ))
        return
      }

      const errText = errorStatus === 401
        ? 'Your session expired — please sign in again.'
        : (errorDetail || 'Sorry, I encountered an error connecting to the AI service. Please try again.')
      toast.error(errText)
      setMessages(prev => [
        ...prev.filter(m => m.id !== assistantId),
        {
          id: assistantId,
          role: 'assistant',
          content: errText,
          agentName: 'System',
          timestamp: new Date(),
        },
      ])
      setLoading(false)
      loadingRef.current = false
      setReasoningVisible(false)
    }
  }, [input, currentDatabaseId, databaseName, conversationId, generatedSchema, generatedData, hasGeneratedData, saveConversation, activeConnectionId, activeConnectionName, activeConnectionDialect, isLiveDbMode])

  // Auto-send query from dashboard. We wait for the live-DB connection to
  // finish loading (when ?connectionId= is present) before firing, otherwise
  // sendMessage runs with activeConnectionId=undefined and the AI emits a
  // BEGIN_GENERATION signal instead of SQL against the live DB.
  useEffect(() => {
    const q = searchParams.get('q')
    const hasConnection = searchParams.get('connectionId')
    const ready = !hasConnection || (activeConnectionId && !connectionLoading)
    if (q && !initialQuerySent && ready) {
      setInitialQuerySent(true)
      const timer = setTimeout(() => {
        // Check if there's uploaded file content in sessionStorage
        // (from the dashboard's Upload & Import feature)
        let fullPrompt = q
        try {
          const uploadContent = sessionStorage.getItem('synthforge_upload_content')
          const uploadFilename = sessionStorage.getItem('synthforge_upload_filename')
          if (uploadContent && uploadFilename) {
            fullPrompt = `${q}\n\n--- FILE CONTENT: ${uploadFilename} ---\n${uploadContent}\n--- END FILE CONTENT ---`
            // Clean up sessionStorage after reading
            sessionStorage.removeItem('synthforge_upload_content')
            sessionStorage.removeItem('synthforge_upload_filename')
            sessionStorage.removeItem('synthforge_upload_type')
          }
        } catch {
          // sessionStorage not available
        }
        sendMessage(fullPrompt)
      }, 100)
      return () => clearTimeout(timer)
    }
  }, [searchParams, initialQuerySent, activeConnectionId, connectionLoading])

  // ─── Auto-save generated data ───
  const autoSaveData = async (
    tables: Record<string, unknown[]>,
    schema: SchemaTable[],
    parsedName?: string | null
  ) => {
    const name = parsedName || databaseName || schema[0]?.name || 'Untitled Database'
    let totalRows = 0
    for (const rows of Object.values(tables)) {
      totalRows += rows.length
    }

    try {
      if (currentDatabaseId) {
        await apiPatch('/api/databases', {
          id: currentDatabaseId,
          name,
          schema_json: schema,
          data_json: tables,
          row_count: totalRows,
          quality_score: 0.85,
          status: 'ready',
        })
      } else {
        // Create the database WITH data_json in the same POST so we don't
        // end up with a half-saved record if a follow-up PATCH were to fail.
        const result = await apiPost<{ database?: { id: string } }>('/api/databases', {
          name,
          db_type: 'postgresql',
          schema_json: schema,
          data_json: tables,
          row_count: totalRows,
          quality_score: 0.85,
          status: 'ready',
        })

        const dbId = result.database?.id
        if (dbId) {
          setCurrentDatabaseId(dbId)
        } else {
          // POST returned 200 but no id — surface the failure instead of
          // showing a misleading green toast.
          throw new Error('Server did not return a database id')
        }
      }
      invalidateCache('/api/databases')
      toast.success('Data saved to database!')
    } catch (err) {
      console.error('[Studio] Auto-save failed:', err)
      toast.error('Failed to auto-save data')
    }
  }

  // ─── Manual save ───
  const saveToDatabase = async () => {
    if (!hasGeneratedData) {
      toast.error('No data to save')
      return
    }
    setSaving(true)
    try {
      await autoSaveData(generatedData, generatedSchema)
    } finally {
      setSaving(false)
    }
  }

  // ─── Delete database ───
  const deleteDatabase = async () => {
    if (!currentDatabaseId) return
    if (!confirm('Are you sure you want to delete this database? This cannot be undone.')) return
    try {
      await apiDelete(`/api/databases?id=${currentDatabaseId}`)
      invalidateCache('/api/databases')
      toast.success('Database deleted')
      router.push('/dashboard')
    } catch {
      toast.error('Failed to delete database')
    }
  }

  // ─── Load a saved conversation from history ───
  // Restores messages, schema, data, databaseName, and databaseId from a
  // localStorage-saved conversation. Sets skipNextPersistRef so the
  // messages-change effect doesn't immediately re-save (which would bump
  // updatedAt and needlessly reorder the history list).
  const loadConversation = useCallback((conv: SavedConversation) => {
    skipNextPersistRef.current = true
    activeConversationIdRef.current = conv.id
    setActiveConversationId(conv.id)
    // Restore all conversation state. Force isStreaming=false on every
    // message so the persistence effect doesn't skip saving the restored
    // conversation on the next real change.
    setMessages(
      conv.messages.map(m => ({
        ...m,
        timestamp: new Date(m.timestamp),
        isStreaming: false,
        sqlBlockExecuting: false,
      })),
    )
    setGeneratedSchema(conv.schema || [])
    setGeneratedData(conv.data || {})
    setTableCounts({})
    setDatabaseName(conv.databaseName || '')
    setCurrentDatabaseId(conv.databaseId || undefined)
    // Reset the backend conversation id — the loaded chat is a fresh backend
    // session (the backend conversation endpoint is keyed by databaseId, not
    // by the localStorage history id).
    setConversationId('')
    setSelectedTable('')
    setVisibleRows(20)
    toast.success('Conversation loaded')
  }, [])

  // ─── Delete a conversation from history ───
  const deleteConversation = useCallback((id: string) => {
    setConversations(prev => {
      const next = prev.filter(c => c.id !== id)
      persistSavedConversations(next)
      return next
    })
    // If the deleted conversation is the active one, detach so the next
    // user message starts a new history entry instead of patching a ghost.
    if (activeConversationIdRef.current === id) {
      activeConversationIdRef.current = null
      setActiveConversationId(null)
    }
    toast.success('Conversation deleted')
  }, [])

  // ─── New chat ───
  // The current conversation is already auto-persisted by the messages-change
  // effect above, so here we only need to detach from it (so the next chat
  // starts a fresh history entry) and reset the studio to its initial greeting
  // state. In live-DB mode we preserve the introspected schema/data (they are
  // tied to the connection, not the conversation); in synthetic-data mode we
  // clear everything per the task spec.
  const startNewChat = () => {
    activeConversationIdRef.current = null
    setActiveConversationId(null)
    setConversationId('')
    if (!isLiveDbMode) {
      setGeneratedSchema([])
      setGeneratedData({})
      setTableCounts({})
      setDatabaseName('')
      setCurrentDatabaseId(undefined)
    }
    setSelectedTable('')
    setVisibleRows(20)
    setMessages([
      {
        id: Date.now().toString(),
        role: 'assistant',
        content: isLiveDbMode
          ? `Connected to live ${activeConnectionDialect || 'DB'} **"${activeConnectionName || ''}"**. Ask me anything and I'll run SQL against it.`
          : 'Welcome to **SynthForge AI Studio**! Describe the database you need.',
        agentName: 'Orchestrator',
        timestamp: new Date(),
      },
    ])
  }

  // ─── Clear chat ───
  // Like startNewChat but only wipes the message list (keeps the current
  // generated schema/data + database name + conversation id). Used by the
  // "Clear chat" button in the chat header (with an AlertDialog confirmation).
  const clearChat = () => {
    setMessages([
      {
        id: Date.now().toString(),
        role: 'assistant',
        content: isLiveDbMode
          ? `Chat cleared. Still connected to live ${activeConnectionDialect || 'DB'} **"${activeConnectionName || ''}"** — ask me anything.`
          : 'Chat cleared. Describe the next database you need.',
        agentName: 'Orchestrator',
        timestamp: new Date(),
      },
    ])
    setCurrentReasoning('')
    setReasoningVisible(false)
    // Detach from the active saved conversation so clearing doesn't overwrite
    // the previous history entry — the cleared state starts a new one.
    activeConversationIdRef.current = null
    setActiveConversationId(null)
    toast.success('Chat cleared')
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  // ─── Save current SQL editor content as a named query ───
  // Shared by the "Saved Queries" dropdown and the Cmd/Ctrl+Shift+S shortcut.
  // Prompts for a name and appends to the savedQueries list (persisted to
  // localStorage via the effect near the top of the component).
  const saveCurrentQuery = () => {
    if (!sqlEditor.trim()) {
      toast.error('Nothing to save — SQL editor is empty')
      return
    }
    const name = window.prompt('Name this query:')
    if (name) {
      setSavedQueries(prev => [...prev, { name, sql: sqlEditor }])
      toast.success('Query saved!')
    }
  }

  // ─── Export the current database as a SQL dump ───
  // Shared by the Export dropdown and the Cmd/Ctrl+Shift+E shortcut. Falls
  // back to a toast when there's nothing to export.
  const exportCurrentDatabase = () => {
    if (!hasGeneratedData) {
      toast.error('Nothing to export — no database generated yet')
      return
    }
    if (currentDatabaseId) {
      void downloadExport({ databaseId: currentDatabaseId }, 'sql', databaseName || 'database')
      return
    }
    exportAsSQL(generatedSchema, generatedData, `${databaseName || 'database'}.sql`)
    toast.success('Database exported as SQL dump')
  }

  // ─── Stop generation ───
  // Aborts the in-flight chat request AND any streaming data generation.
  // The AbortController's cancel() handler on the server-side ReadableStream
  // ensures the upstream DeepSeek connection is also released.
  const handleStopGeneration = () => {
    if (abortRef.current) {
      abortRef.current.abort()
      abortRef.current = null
    }
    if (generationAbortRef.current) {
      generationAbortRef.current.abort()
      generationAbortRef.current = null
    }
    const activeJob = generationJobIdRef.current
    if (activeJob) {
      fetch('/api/generate-stream?jobId=' + encodeURIComponent(activeJob.jobId), { method: 'DELETE' }).catch(() => {})
      generationJobIdRef.current = null
    }
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current)
      pollIntervalRef.current = null
    }
    clearActiveGeneration()
    setLoading(false)
    loadingRef.current = false
    setReasoningVisible(false)
    setGenerationProgress(prev => ({ ...prev, isGenerating: false }))
    toast.info('Generation stopped')
  }

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
    toast.success('Copied to clipboard')
  }

  // ─── Execute a SQL block returned by the AI (live DB mode) ───
  // Called from the chat message UI when the user clicks "Execute".
  // If the statement is destructive, ask for confirmation first.
  // CRITICAL FIX: Each SQL block now has COMPLETELY INDEPENDENT state via
  // sqlBlockStates (keyed by the SQL string). We NO LONGER update the legacy
  // sqlBlockExecuting/sqlBlockResult fields, which were shared across ALL
  // blocks in the same message and caused every button to show the same result.
  const executeSqlBlock = async (messageId: string, sql: string, skipConfirm = false) => {
    if (!activeConnectionId) {
      toast.error('No active DB connection')
      return
    }
    if (!sql.trim()) return

    const askConfirm = () => window.confirm(
      `⚠️  This SQL will modify or destroy data on your LIVE database "${activeConnectionName}":\n\n${sql.slice(0, 200)}${sql.length > 200 ? '...' : ''}\n\nAre you sure you want to execute this?`,
    )
    // Once the user has confirmed (or the caller pre-confirmed), tell the
    // server to skip its own dangerous-statement check.
    let confirmed = skipConfirm
    if (!confirmed && isDestructiveSQL(sql)) {
      if (!askConfirm()) return
      confirmed = true
    }

    // Helper to update ONLY this specific SQL block's state in sqlBlockStates.
    // This is the KEY FIX: we do NOT touch sqlBlockExecuting/sqlBlockResult
    // (the legacy shared fields) — only sqlBlockStates[sql].
    const updateBlockState = (executing: boolean, result: SqlBlockResult | null) => {
      setMessages(prev => prev.map(m => {
        if (m.id !== messageId) return m
        const states = { ...(m.sqlBlockStates || {}) }
        states[sql] = { executing, result }
        return { ...m, sqlBlockStates: states }
      }))
    }

    // Set executing state for THIS specific block only
    updateBlockState(true, null)

    try {
      type BlockExecResponse = {
        truncated?: boolean
        rows?: Record<string, unknown>[]
        columns?: string[]
        error?: string
        executionTime?: number
        rowCount?: number
        affectedRows?: number
        requiresConfirmation?: boolean
      }
      const run = (skipDangerousCheck: boolean) => apiPost<BlockExecResponse>('/api/connections/execute', {
        connectionId: activeConnectionId,
        sql,
        skipDangerousCheck,
      }, { timeout: 60000 })
      let result = await run(confirmed)

      if (result.requiresConfirmation) {
        if (!askConfirm()) {
          updateBlockState(false, { ok: false, message: 'Cancelled — not executed', rowCount: 0, affectedRows: 0 })
          return
        }
        confirmed = true
        result = await run(true)
      }

      if (result.error) {
        const errResult: SqlBlockResult = { ok: false, message: result.error!, rowCount: 0, affectedRows: 0 }
        updateBlockState(false, errResult)
        toast.error(result.error)
        if (/connection.*not found|not have access/i.test(result.error)) {
          setActiveConnectionId(undefined)
          setActiveConnectionName(undefined)
          setActiveConnectionDialect(undefined)
          router.push('/dashboard/connections')
        }
        return
      }

      const stripped = stripSqlComments(sql).trim()
      const allStatements = stripped.split(';').map(s => stripSqlComments(s).trim()).filter(Boolean)
      const mutationVerbs = ['INSERT', 'UPDATE', 'DELETE', 'CREATE', 'ALTER', 'DROP', 'TRUNCATE', 'USE']
      const firstMutationVerb = allStatements
        .map(s => s.split(/\s+/)[0]?.toUpperCase() || '')
        .find(v => mutationVerbs.includes(v)) || ''
      const verb = firstMutationVerb || allStatements[0]?.split(/\s+/)[0]?.toUpperCase() || ''
      const isMutation = mutationVerbs.includes(verb)
      const affected = result.affectedRows ?? result.rowCount ?? (result.rows?.length || 0)

      const okResult: SqlBlockResult = {
        ok: true,
        message: isMutation ? `${verb} OK — ${affected} row(s) affected` : `Returned ${result.rowCount || result.rows?.length || 0} row(s)`,
        rowCount: result.rowCount || result.rows?.length || 0,
        affectedRows: affected,
        rows: result.rows?.slice(0, 50),
        columns: result.columns,
        truncated: result.truncated,
      }

      // Update ONLY this block's state
      updateBlockState(false, okResult)

      if (isMutation) {
        toast.success(`${verb} OK — ${affected} row(s) affected`)
        try {
          const refresh = await apiGet<{
            schema?: SchemaTable[]
            data?: Record<string, unknown[]>
            counts?: Record<string, number>
          }>(`/api/connections/${activeConnectionId}?include=introspect`, { cacheTtl: 0, force: true, timeout: 30000 })
          if (refresh.schema) setGeneratedSchema(refresh.schema)
          if (refresh.data) setGeneratedData(refresh.data)
          if (refresh.counts) setTableCounts(refresh.counts)
        } catch (err) {
          console.warn('[Studio] Failed to refresh external DB after mutation:', err)
          toast.warning('Mutation succeeded, but the schema/data refresh failed. Reload the page to see the latest state.')
        }
      } else {
        if (!skipConfirm) {
          toast.success(`Returned ${result.rowCount || result.rows?.length || 0} row(s)`)
          if (result.rows && result.rows.length > 0) {
            setSqlResults({
              rows: result.rows,
              columns: result.columns || [],
              executionTime: result.executionTime || 0,
              truncated: result.truncated,
              totalRows: result.rowCount,
            })
            setActiveTab('sql')
          }
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Execution failed'
      const errResult: SqlBlockResult = { ok: false, message: msg, rowCount: 0, affectedRows: 0 }
      updateBlockState(false, errResult)
      toast.error(msg)
    }
  }

  // Keep executeSqlBlockRef in sync so `sendMessage` (defined above
  // `executeSqlBlock`) can invoke it for auto-execution of SELECT queries in
  // live-DB mode. This useEffect MUST be placed AFTER the `executeSqlBlock`
  // const declaration to avoid a Temporal Dead Zone (TDZ) ReferenceError.
  // The ref is reassigned whenever the function identity or the live-DB
  // context changes so the closure captures fresh `activeConnectionId` etc.
  useEffect(() => {
    executeSqlBlockRef.current = executeSqlBlock
  }, [executeSqlBlock, activeConnectionId, activeConnectionName, activeConnectionDialect])

  // ─── Export live connection (whole DB or one table) ───
  const exportLive = (format: ExportFormat, tableName?: string) => {
    if (!activeConnectionId) return
    return downloadExport(
      { connectionId: activeConnectionId, ...(tableName ? { tableName } : {}) },
      format,
      tableName || activeConnectionName || 'database',
    )
  }

  // ─── SQL Execution ───
  const executeSQL = async (sql: string, skipConfirm = false) => {
    if (!sql.trim()) return

    if (!skipConfirm && isDestructiveSQL(sql)) {
      setSqlConfirmQuery(sql)
      setSqlConfirmOpen(true)
      return
    }

    setSqlExecuting(true)
    setSqlResults(null)

    // Add to history
    setQueryHistory(prev => [sql, ...prev.filter(q => q !== sql)].slice(0, 10))

    try {
      // Build request payload. Route to the live external DB when a
      // connection is active; otherwise fall back to the synthetic DB or
      // client-side data.
      const payload: Record<string, unknown> = { sql, skipDangerousCheck: skipConfirm }
      if (activeConnectionId) {
        payload.connectionId = activeConnectionId
      } else if (currentDatabaseId) {
        payload.databaseId = currentDatabaseId
      } else if (hasGeneratedData) {
        payload.data = generatedData
      }

      const endpoint = activeConnectionId ? '/api/connections/execute' : '/api/sql/execute'

      const result = await apiPost<{
        rows?: Record<string, unknown>[]
        columns?: string[]
        error?: string
        executionTime?: number
        truncated?: boolean
        rowCount?: number
        affectedRows?: number
        refreshedData?: Record<string, unknown[]>
        refreshedSchema?: SchemaTable[]
        // BUGFIX (BUG-38): the server surfaces destructive-statement
        // detections the client-side check might have missed (e.g. for
        // multi-statement SQL where the second statement is destructive).
        requiresConfirmation?: boolean
        destructive?: boolean
        sql?: string
      }>(endpoint, payload, { timeout: 60000 })

      // BUGFIX (BUG-38): if the server detected a destructive operation
      // that the client-side `isDestructiveSQL` check missed (e.g.
      // `SELECT 1; DROP DATABASE prod` — the client only checks the first
      // verb), open the confirmation dialog instead of showing an error.
      if (result.requiresConfirmation) {
        setSqlConfirmQuery(result.sql || sql)
        setSqlConfirmOpen(true)
        // Also update the SQL editor so when the user clicks "Execute
        // anyway" they see exactly what they're confirming.
        if (result.sql) setSqlEditor(result.sql)
        return
      }

      if (result.error) {
        toast.error(result.error)
        setSqlResults({ rows: [{ error: result.error }], columns: ['error'], executionTime: result.executionTime || 0 })
      } else if (result.rows) {
        setSqlResults({
          rows: result.rows,
          columns: result.columns || [],
          executionTime: result.executionTime || 0,
          truncated: result.truncated,
          totalRows: result.rowCount,
        })

        // If the SQL mutated data (INSERT / UPDATE / DELETE / etc.) the
        // server now returns the refreshed `data_json` and `schema_json`.
        // Apply them to local state so the Data tab stays in sync with the
        // backend instead of showing stale rows.
        if (result.refreshedData) {
          setGeneratedData(result.refreshedData)
          setTableCounts({})
          if (currentDatabaseId) {
            apiGet<{ database?: { data_json: Record<string, unknown[]>; table_counts?: Record<string, number> } }>(
              `/api/databases?id=${currentDatabaseId}&preview=200`, { cacheTtl: 0, force: true, timeout: 30000 })
              .then(d => {
                if (d.database?.data_json) setGeneratedData(d.database.data_json)
                if (d.database?.table_counts) setTableCounts(d.database.table_counts)
              }).catch(() => { /* keep refreshedData */ })
          }
        }
        if (result.refreshedSchema) {
          setGeneratedSchema(result.refreshedSchema)
        }

        const verb = sql.trim().split(/\s+/)[0]?.toUpperCase() || ''
        const isMutation = ['INSERT', 'UPDATE', 'DELETE', 'CREATE', 'ALTER', 'DROP', 'TRUNCATE'].includes(verb)
        if (isMutation) {
          const affected = result.affectedRows ?? result.rowCount ?? result.rows.length
          toast.success(`${verb} OK — ${affected} row(s) affected`)
        } else {
          toast.success(`Query returned ${result.rowCount || result.rows.length} rows`)
        }
      }
    } catch (err) {
      toast.error('Failed to execute SQL')
      setSqlResults({ rows: [{ error: 'Execution failed' }], columns: ['error'], executionTime: 0 })
    } finally {
      setSqlExecuting(false)
    }
  }

  // ─── AI-assisted SQL generation ───
  const generateAIQL = () => {
    const prompt = `Generate a SQL query for the current database schema. Tables: ${generatedSchema.map(t => `${t.name}(${t.columns.map(c => `${c.name}:${c.type}`).join(', ')})`).join(', ')}. What kind of query?`
    setInput(prompt)
    setActiveTab('data') // Switch to chat
  }

  // ─── Generate SQL from schema ───
  // Generate CREATE TABLE SQL from the current schema. Delegates to the
  // extracted helper in ./_lib/utils.
  const generateSchemaSQL = (): string => generateSchemaSQLHelper(generatedSchema, databaseName)

  // ─── Handle option button click ───
  // Collapses the (now answered) question so the bubble doesn't keep
  // showing stale choice buttons after the user has picked one.
  const handleOptionClick = (choice: OptionChoice, messageId?: string) => {
    if (messageId) {
      setMessages(prev => prev.map(m =>
        m.id === messageId ? { ...m, interactiveOptions: null } : m
      ))
    }
    sendMessage(choice.value)
  }

  // ─── Start streaming data generation ───
  const startStreamingGeneration = async (signal: BeginGenerationSignal, assistantId: string) => {
    const controller = new AbortController()
    generationAbortRef.current = controller
    generationJobIdRef.current = null

    const genProgressId = (Date.now() + 2).toString()

    setGenerationProgress({
      isGenerating: true,
      currentTable: '',
      rowsInserted: 0,
      totalInserted: 0,
      targetRows: Object.values(signal.rowCounts).reduce((s, n) => s + n, 0),
      tablesGenerated: 0,
      statusMessages: ['Generating database schema...'],
      databaseId: currentDatabaseId,
    })

    // Add a generation progress message to chat
    setMessages(prev => [...prev, {
      id: genProgressId,
      role: 'assistant' as const,
      content: '',
      agentName: 'Data Generator',
      generationProgress: {
        isGenerating: true,
        currentTable: '',
        rowsInserted: 0,
        totalInserted: 0,
        targetRows: Object.values(signal.rowCounts).reduce((s, n) => s + n, 0),
        tablesGenerated: 0,
        statusMessages: ['Generating database schema...'],
      },
      timestamp: new Date(),
    }])

    try {
      // Build conversation history for context
      const history = messagesRef.current
        .filter(m => m.role === 'user' || m.role === 'assistant')
        .map(m => ({ role: m.role, content: m.content }))

      const response = await fetch('/api/generate-stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          databaseId: currentDatabaseId,
          databaseName: signal.databaseName || databaseName,
          schema: signal.schema,
          rowCounts: signal.rowCounts,
          instructions: signal.instructions,
          conversationHistory: history,
        }),
        signal: controller.signal,
      })

      if (!response.ok) {
        throw new Error(`Generation API error: ${response.status}`)
      }

      const reader = response.body?.getReader()
      if (!reader) throw new Error('No response stream')

      const decoder = new TextDecoder()
      let sseBuffer = ''
      const accumulatedData: Record<string, unknown[]> = {}
      let totalInserted = 0
      // Local mutable copy of the database id so that the `complete` handler
      // can read the most recent value, even if `database_created` fired
      // mid-stream after this closure captured the initial value.
      let liveDatabaseId = currentDatabaseId

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        sseBuffer += decoder.decode(value, { stream: true })
        const sseLines = sseBuffer.split('\n')
        sseBuffer = sseLines.pop() || ''

        for (const sseLine of sseLines) {
          const trimmed = sseLine.trim()
          if (!trimmed || !trimmed.startsWith('data: ')) continue

          const sseData = trimmed.slice(6)
          try {
            const event = JSON.parse(sseData)

            if ((event.type === 'job_started' || event.type === 'database_created') && event.jobId && event.databaseId) {
              generationJobIdRef.current = { jobId: event.jobId, databaseId: event.databaseId }
              try {
                localStorage.setItem(ACTIVE_GENERATION_KEY, JSON.stringify({ jobId: event.jobId, databaseId: event.databaseId, startedAt: Date.now() }))
              } catch { /* ignore */ }
            }

            if ((event.type === 'job_started' || event.type === 'database_created') && event.databaseId) {
              // Update both React state AND the local closure variable so the
              // `complete` handler later in this same async function reads the
              // freshly-assigned id instead of the stale `currentDatabaseId`.
              liveDatabaseId = event.databaseId
              setCurrentDatabaseId(event.databaseId)
              setGenerationProgress(prev => ({ ...prev, databaseId: event.databaseId }))
            }

            if (event.type === 'progress') {
              const statusMsg = event.message
                || (event.table
                  ? `Streaming records into [${event.table}] — ${event.totalInserted || 0} rows`
                  : `${event.totalInserted || 0} rows inserted`)

              setGenerationProgress(prev => ({
                ...prev,
                currentTable: event.table || prev.currentTable,
                rowsInserted: event.rowsInserted || 0,
                totalInserted: event.totalInserted || prev.totalInserted,
                targetRows: event.targetRows || prev.targetRows,
                statusMessages: [...prev.statusMessages.slice(-5), statusMsg],
              }))

              // Update the progress message in chat
              setMessages(prev => prev.map(m =>
                m.id === genProgressId
                  ? {
                    ...m,
                    generationProgress: {
                      isGenerating: true,
                      currentTable: event.table || '',
                      rowsInserted: event.rowsInserted || 0,
                      totalInserted: event.totalInserted || 0,
                      targetRows: event.targetRows || 0,
                      tablesGenerated: 0,
                      statusMessages: [...(m.generationProgress?.statusMessages || []).slice(-5), statusMsg],
                    },
                  }
                  : m
              ))
            }

            if (event.type === 'table_complete') {
              const tableName = event.table || ''
              const tableRows = event.totalRows || 0

              // Extract schema for this table
              const tableSchema = signal.schema.find(s => s.name === tableName)
              if (tableSchema && !accumulatedData[tableName]) {
                // Update schema
                setGeneratedSchema(prev => {
                  const existing = prev.find(t => t.name === tableName)
                  if (!existing) return [...prev, tableSchema]
                  return prev
                })
              }

              const completeMsg = `[${tableName}] — ${tableRows.toLocaleString()} rows inserted`

              setGenerationProgress(prev => ({
                ...prev,
                tablesGenerated: prev.tablesGenerated + 1,
                statusMessages: [...prev.statusMessages.slice(-5), completeMsg],
              }))

              setMessages(prev => prev.map(m =>
                m.id === genProgressId
                  ? {
                    ...m,
                    generationProgress: {
                      ...m.generationProgress!,
                      tablesGenerated: (m.generationProgress?.tablesGenerated || 0) + 1,
                      statusMessages: [...(m.generationProgress?.statusMessages || []).slice(-5), completeMsg],
                    },
                  }
                  : m
              ))
            }

            if (event.type === 'complete' || event.type === 'cancelled') {
              clearActiveGeneration()
              const isCancelled = event.type === 'cancelled'
              const durationSec = ((event.durationMs || 0) / 1000).toFixed(1)
              const totalRows = event.totalRows || 0
              const tablesGen = event.tablesGenerated || 0

              // Update all the data at once from the server.
              // Use `liveDatabaseId` (the local mutable variable kept in sync
              // with `database_created` events) instead of the stale closure
              // value of `currentDatabaseId`.
              const dbId = liveDatabaseId || generationProgress.databaseId
              if (dbId) {
                try {
                  const dbResult = await apiGet<{ database?: { data_json: Record<string, unknown[]>; schema_json: SchemaTable[]; table_counts?: Record<string, number> } }>(`/api/databases?id=${dbId}&preview=200`, { cacheTtl: 0, force: true })
                  if (dbResult.database?.data_json && Object.keys(dbResult.database.data_json).length > 0) {
                    setGeneratedData(dbResult.database.data_json)
                  }
                  if (dbResult.database?.table_counts) setTableCounts(dbResult.database.table_counts)
                  if (dbResult.database?.schema_json && Array.isArray(dbResult.database.schema_json) && dbResult.database.schema_json.length > 0) {
                    setGeneratedSchema(dbResult.database.schema_json as SchemaTable[])
                  }
                } catch (err) {
                  console.warn('[Studio] Failed to fetch generated DB after completion:', err)
                  // Fallback: use accumulated data if we collected any
                  if (Object.keys(accumulatedData).length > 0) {
                    setGeneratedData(accumulatedData)
                  }
                }
              } else if (Object.keys(accumulatedData).length > 0) {
                setGeneratedData(accumulatedData)
              }

              const finalMsg = isCancelled
                ? (event.message || 'Generation cancelled')
                : `Generation complete — ${totalRows.toLocaleString()} rows across ${tablesGen} tables (${durationSec}s)`

              setGenerationProgress(prev => ({
                ...prev,
                isGenerating: false,
                tablesGenerated: tablesGen,
                totalInserted: totalRows,
                statusMessages: [...prev.statusMessages.slice(-5), finalMsg],
              }))

              // Update the progress message to show completion
              setMessages(prev => prev.map(m =>
                m.id === genProgressId
                  ? {
                    ...m,
                    content: finalMsg,
                    generationProgress: {
                      isGenerating: false,
                      currentTable: '',
                      rowsInserted: totalRows,
                      totalInserted: totalRows,
                      targetRows: totalRows,
                      tablesGenerated: tablesGen,
                      statusMessages: [...(m.generationProgress?.statusMessages || []).slice(-5), finalMsg],
                    },
                  }
                  : m
              ))

              // Update database name
              if (signal.databaseName) setDatabaseName(signal.databaseName)

              if (isCancelled) toast.info(event.message || 'Generation cancelled')
              else toast.success(`Database generated: ${totalRows.toLocaleString()} rows across ${tablesGen} tables`)
              invalidateCache('/api/databases')
            }

            if (event.type === 'error') {
              const errorMsg = event.message || 'Generation failed'
              if (!event.recoverable) clearActiveGeneration()

              setGenerationProgress(prev => ({
                ...prev,
                isGenerating: false,
                statusMessages: [...prev.statusMessages, `Error: ${errorMsg}`],
              }))

              setMessages(prev => prev.map(m =>
                m.id === genProgressId
                  ? {
                    ...m,
                    content: `Generation error: ${errorMsg}`,
                    generationProgress: {
                      ...m.generationProgress!,
                      isGenerating: false,
                      statusMessages: [...(m.generationProgress?.statusMessages || []), `Error: ${errorMsg}`],
                    },
                  }
                  : m
              ))

              if (event.recoverable) {
                toast.warning(`Generation partially completed: ${errorMsg}`)
              } else {
                toast.error(`Generation failed: ${errorMsg}`)
              }
            }
          } catch {
            // Skip unparseable SSE events
          }
        }
      }

      // Final cleanup
      setGenerationProgress(prev => ({ ...prev, isGenerating: false }))
    } catch (err) {
      if ((err as Error).name === 'AbortError') return

      // Network drop after the job is known: the server keeps generating.
      const knownDbId = generationJobIdRef.current?.databaseId
      if (knownDbId) {
        toast.info('Connection lost — generation continues on the server. Reconnecting…')
        pollGeneration(knownDbId)
        return
      }

      const errorMsg = err instanceof Error ? err.message : 'Generation failed'

      setGenerationProgress(prev => ({
        ...prev,
        isGenerating: false,
        statusMessages: [...prev.statusMessages, `Error: ${errorMsg}`],
      }))

      setMessages(prev => prev.map(m =>
        m.id === genProgressId
          ? {
            ...m,
            content: `Generation error: ${errorMsg}`,
            generationProgress: m.generationProgress
              ? { ...m.generationProgress, isGenerating: false }
              : null,
          }
          : m
      ))

      toast.error(`Generation failed: ${errorMsg}`)
    }
  }

  // ─── Render formatted message content ───
  const renderMessageContent = (message: Message) => {
    if (message.role === 'user') {
      return <span className="whitespace-pre-wrap break-words" style={{ overflowWrap: 'break-word', wordBreak: 'break-word' }}>{message.content}</span>
    }

    // ─── Render generation progress UI ───
    if (message.generationProgress) {
      const gp = message.generationProgress
      const progressPercent = gp.targetRows > 0 ? Math.min(100, Math.round((gp.totalInserted / gp.targetRows) * 100)) : 0

      return (
        <div className="space-y-2">
          {/* Progress bar */}
          <div className="flex items-center gap-2">
            {gp.isGenerating && <Loader2 className="h-3.5 w-3.5 animate-spin text-emerald-500 shrink-0" />}
            {!gp.isGenerating && gp.totalInserted > 0 && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />}
            <div className="flex-1">
              <div className="flex items-center justify-between mb-0.5">
                <span className="text-[10px] font-medium text-foreground">
                  {gp.isGenerating ? 'Generating...' : 'Complete'}
                </span>
                <span className="text-[9px] text-muted-foreground">{progressPercent}%</span>
              </div>
              <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${gp.isGenerating ? 'bg-emerald-500' : 'bg-emerald-600'}`}
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            </div>
          </div>

          {/* Current table */}
          {gp.currentTable && gp.isGenerating && (
            <div className="flex items-center gap-1.5 text-[9px]">
              <div className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-muted-foreground">Streaming into</span>
              <span className="font-mono font-semibold text-emerald-600 dark:text-emerald-400">[{gp.currentTable}]</span>
              <span className="text-muted-foreground">—</span>
              <span className="font-mono">{gp.totalInserted.toLocaleString()}</span>
              <span className="text-muted-foreground">/ {gp.targetRows.toLocaleString()} rows</span>
            </div>
          )}

          {/* Status messages */}
          {gp.statusMessages.length > 0 && (
            <div className="space-y-0.5 pl-1">
              {gp.statusMessages.slice(-5).map((msg, i) => (
                <div key={i} className="text-[9px] flex items-center gap-1">
                  {msg.startsWith('[') && msg.includes('rows inserted') ? (
                    <span className="text-emerald-600 dark:text-emerald-400 font-medium">{msg}</span>
                  ) : msg.startsWith('Error') ? (
                    <span className="text-destructive font-medium">{msg}</span>
                  ) : msg.startsWith('Generation complete') ? (
                    <span className="text-emerald-600 dark:text-emerald-400 font-semibold">{msg}</span>
                  ) : (
                    <span className="text-muted-foreground">{msg}</span>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Summary when complete */}
          {!gp.isGenerating && gp.tablesGenerated > 0 && (
            <div className="flex items-center gap-2 text-[9px] text-muted-foreground pt-0.5 border-t border-border/50">
              <span>{gp.tablesGenerated} tables</span>
              <span>·</span>
              <span>{gp.totalInserted.toLocaleString()} rows</span>
            </div>
          )}
        </div>
      )
    }

    let content = message.content
    if (!content) {
      if (message.isStreaming) {
        return (
          <div className="flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            <span className="text-xs text-muted-foreground">Thinking...</span>
          </div>
        )
      }
      return null
    }

    // Clean any residual raw JSON blocks — also during streaming
    content = cleanDisplayText(content)
    // Strip <think/> and <thinking/> tags that may appear in streaming
    content = content.replace(/<think[\s\S]*?<\/think>/gi, '')
    content = content.replace(/<thinking[\s\S]*?<\/thinking>/gi, '')
    content = content.trim()

    if (!content) return null

    return <ShowMoreText content={content} isStreaming={message.isStreaming} />
  }

  // ─── Data editing state ───
  const [editingCell, setEditingCell] = useState<{ row: number; col: string } | null>(null)
  const [editingCellValue, setEditingCellValue] = useState('')
  const [addTableDialogOpen, setAddTableDialogOpen] = useState(false)
  const [newTableName, setNewTableName] = useState('')
  const [newTableColumns, setNewTableColumns] = useState('')
  const [addColumnDialogOpen, setAddColumnDialogOpen] = useState(false)
  const [newColumnName, setNewColumnName] = useState('')
  const [newColumnType, setNewColumnType] = useState('varchar(255)')
  const [selectedRows, setSelectedRows] = useState<Set<number>>(new Set())

  // ─── Schema preview + data viz enhancement state ───
  // Collapsible "Schema" panel in the right panel area (defaults open so the
  // user immediately sees table/column/row totals once data is generated).
  const [schemaPanelOpen, setSchemaPanelOpen] = useState(true)
  // Confirmation dialog for "Regenerate Data" — replacing all existing rows
  // with fresh synthetic data using the same schema + row counts.
  const [regenerateConfirmOpen, setRegenerateConfirmOpen] = useState(false)
  // Per-table row search filter in the Data tab. Filters the displayedRows by
  // matching the query against any cell's stringified value.
  const [dataSearchQuery, setDataSearchQuery] = useState('')

  // ─── Schema-wide stats for the preview panel ───
  // Computed once per render from generatedSchema + generatedData. Cheap
  // because schemas are small (<100 tables typically).
  const schemaStats = (() => {
    const tableCount = generatedSchema.length
    let columnCount = 0
    let rowCount = 0
    const typeBreakdown = new Map<string, number>()
    for (const table of generatedSchema) {
      columnCount += table.columns.length
      for (const col of table.columns) {
        // Normalize the type (strip length like varchar(255) -> varchar) so
        // the breakdown reads "3 varchar" rather than "2 varchar(255), 1 varchar(100)".
        const normalized = col.type.toLowerCase().replace(/\(.*\)/g, '').trim() || col.type
        typeBreakdown.set(normalized, (typeBreakdown.get(normalized) || 0) + 1)
      }
    }
    for (const [name, rows] of Object.entries(generatedData)) {
      rowCount += Math.max(tableCounts[name] ?? 0, Array.isArray(rows) ? rows.length : 0)
    }
    return { tableCount, columnCount, rowCount, typeBreakdown }
  })()

  // ─── Regenerate Data ───
  // Rebuilds a BeginGenerationSignal from the current schema + row counts and
  // kicks off the streaming generation pipeline, replacing all existing data.
  // Reuses the same mechanism the AI uses when it first emits BEGIN_GENERATION.
  const regenerateData = async () => {
    if (generatedSchema.length === 0) {
      toast.error('No schema to regenerate from')
      return
    }

    // Build row counts from the current data (fall back to 10 rows per table
    // if a table exists in schema but not in data yet).
    const rowCounts: Record<string, number> = {}
    for (const table of generatedSchema) {
      const rows = generatedData[table.name]
      const n = Math.max(tableCounts[table.name] ?? 0, Array.isArray(rows) ? rows.length : 0)
      rowCounts[table.name] = n > 0 ? n : 10
    }

    const signal: BeginGenerationSignal = {
      action: 'BEGIN_GENERATION',
      schema: generatedSchema,
      rowCounts,
      instructions: 'Regenerate fresh synthetic data for the existing schema. Produce realistic, varied values.',
      databaseName: databaseName || generatedSchema[0]?.name || 'Regenerated Database',
    }

    // Clear existing data so the new generation starts clean. The schema is
    // preserved (it's the same schema the user is regenerating from).
    setGeneratedData({})
    setTableCounts({})

    // Add a chat message so the user sees the regeneration happening in-line
    // with the rest of their conversation history.
    const assistantId = (Date.now() + 100).toString()
    setMessages(prev => [...prev, {
      id: assistantId,
      role: 'assistant',
      content: 'Regenerating data with the same schema and row counts…',
      agentName: 'Data Generator',
      timestamp: new Date(),
      isStreaming: false,
    }])

    setRegenerateConfirmOpen(false)
    toast.info('Regenerating data — this will replace all existing rows')

    await startStreamingGeneration(signal, assistantId)
  }

  const dropTableCount = (t: string) => setTableCounts(prev => {
    if (!(t in prev)) return prev
    const next = { ...prev }
    delete next[t]
    return next
  })

  const handleAddTable = () => {
    if (!newTableName.trim()) return
    const cols = newTableColumns.split(',').map(c => c.trim()).filter(Boolean)
    const defaultColumns = cols.length > 0 ? cols : ['id']
    const emptyRow: Record<string, unknown> = {}
    for (const col of defaultColumns) {
      emptyRow[col] = col === 'id' ? crypto.randomUUID() : null
    }
    setGeneratedData(prev => ({
      ...prev,
      [newTableName.trim()]: [emptyRow],
    }))
    setGeneratedSchema(prev => [
      ...prev,
      {
        name: newTableName.trim(),
        columns: defaultColumns.map(c => ({
          name: c,
          type: c === 'id' ? 'uuid' : 'varchar(255)',
        })),
      },
    ])
    setSelectedTable(newTableName.trim())
    setAddTableDialogOpen(false)
    setNewTableName('')
    setNewTableColumns('')
    toast.success(`Table "${newTableName.trim()}" created`)
  }

  const handleAddColumn = () => {
    if (!newColumnName.trim() || !selectedTable) return
    setGeneratedSchema(prev => prev.map(t =>
      t.name === selectedTable
        ? { ...t, columns: [...t.columns, { name: newColumnName.trim(), type: newColumnType }] }
        : t
    ))
    dropTableCount(selectedTable)
    setGeneratedData(prev => ({
      ...prev,
      [selectedTable]: (prev[selectedTable] || []).map((row: unknown) => {
        const r = row as Record<string, unknown>
        return { ...r, [newColumnName.trim()]: null }
      }),
    }))
    setAddColumnDialogOpen(false)
    setNewColumnName('')
    setNewColumnType('varchar(255)')
    toast.success(`Column "${newColumnName.trim()}" added`)
  }

  const handleAddRow = () => {
    if (!selectedTable) return
    const schema = generatedSchema.find(t => t.name === selectedTable)
    const emptyRow: Record<string, unknown> = {}
    if (schema) {
      for (const col of schema.columns) {
        emptyRow[col.name] = col.name === 'id' ? crypto.randomUUID() : null
      }
    }
    dropTableCount(selectedTable)
    setGeneratedData(prev => ({
      ...prev,
      [selectedTable]: [...(prev[selectedTable] || []), emptyRow],
    }))
    toast.success('Row added')
  }

  const handleCellEdit = (rowIndex: number, colName: string, value: string) => {
    if (!selectedTable) return
    setGeneratedData(prev => ({
      ...prev,
      [selectedTable]: (prev[selectedTable] || []).map((row: unknown, i: number) => {
        const r = row as Record<string, unknown>
        return i === rowIndex ? { ...r, [colName]: value } : r
      }),
    }))
    setEditingCell(null)
  }

  const handleDeleteSelectedRows = () => {
    if (!selectedTable || selectedRows.size === 0) return
    dropTableCount(selectedTable)
    setGeneratedData(prev => ({
      ...prev,
      [selectedTable]: (prev[selectedTable] || []).filter((_: unknown, i: number) => !selectedRows.has(i)),
    }))
    setSelectedRows(new Set())
    toast.success(`${selectedRows.size} row(s) deleted`)
  }

  // ─── Current table data for display ───
  const memoryRows = selectedTable ? generatedData[selectedTable] || [] : []
  const knownTotal = selectedTable ? tableCounts[selectedTable] : undefined
  const isPaged = !!selectedTable && knownTotal !== undefined && knownTotal > memoryRows.length &&
    (isLiveDbMode ? !!activeConnectionId : !!currentDatabaseId)
  const currentTableData = isPaged ? pagedRows : memoryRows
  const displayTotal = isPaged ? pagedTotal || (knownTotal ?? 0) : (knownTotal !== undefined && knownTotal > memoryRows.length ? knownTotal : memoryRows.length)
  const rowCountFor = (t: string) => Math.max(tableCounts[t] ?? 0, Array.isArray(generatedData[t]) ? generatedData[t].length : 0)

  // Debounce the filter box for server-side filtering (synthetic only).
  useEffect(() => {
    const h = setTimeout(() => setDebouncedSearch(dataSearchQuery.trim()), 300)
    return () => clearTimeout(h)
  }, [dataSearchQuery])
  // Reset paging when the table changes.
  useEffect(() => {
    setPageOffset(0)
    setPageSort(null)
    setPagedRows([])
  }, [selectedTable, currentDatabaseId, activeConnectionId])
  // Fetch the current server-side page.
  useEffect(() => {
    if (!isPaged || !selectedTable) return
    let cancelled = false
    const qs = new URLSearchParams({ table: selectedTable, offset: String(pageOffset), limit: String(pageSize) })
    if (pageSort) { qs.set('sort', pageSort.col); qs.set('dir', pageSort.dir) }
    if (!isLiveDbMode && debouncedSearch) qs.set('q', debouncedSearch)
    const url = isLiveDbMode
      ? `/api/connections/${activeConnectionId}/rows?${qs}`
      : `/api/databases/${currentDatabaseId}/rows?${qs}`
    setPagedLoading(true)
    apiGet<{ rows?: unknown[]; columns?: string[]; total?: number }>(url, { cacheTtl: 0, force: true, timeout: 30000 })
      .then(res => {
        if (cancelled) return
        setPagedRows(res.rows || [])
        setPagedColumns(res.columns || [])
        setPagedTotal(res.total ?? 0)
      })
      .catch(err => { if (!cancelled) toast.error(err instanceof Error ? err.message : 'Failed to load rows') })
      .finally(() => { if (!cancelled) setPagedLoading(false) })
    return () => { cancelled = true }
  }, [isPaged, selectedTable, pageOffset, pageSize, pageSort, debouncedSearch, isLiveDbMode, activeConnectionId, currentDatabaseId])
  const currentTableColumns = isPaged && pagedColumns.length > 0 ? pagedColumns : currentTableData.length > 0 ? Object.keys(currentTableData[0] as Record<string, unknown>) : []
  // Schema for the currently selected table. Lets us show column types and
  // render the table header even when the table has no rows yet.
  const currentTableSchema = selectedTable ? generatedSchema.find(t => t.name === selectedTable) : undefined
  // Columns to render in the table header. Prefer the row-derived order
  // (matches what the user sees when they edit), fall back to schema order
  // so the empty-rows state still shows all columns.
  const headerColumns = currentTableColumns.length > 0
    ? currentTableColumns
    : (currentTableSchema?.columns?.map(c => c.name) || [])
  // ─── Search filter for the data grid ───
  // When the user types in the per-table search box, filter the rows to those
  // whose stringified cell values include the (case-insensitive) query. The
  // filtered set is what gets sliced by visibleRows so "Load more" still works.
  const filteredTableData = (() => {
    const q = dataSearchQuery.trim().toLowerCase()
    if (!q || isPaged) return currentTableData
    return currentTableData.filter((row) => {
      const r = row as Record<string, unknown>
      return Object.values(r).some(v => {
        if (v === null || v === undefined) return false
        return String(v).toLowerCase().includes(q)
      })
    })
  })()
  const displayedRows = isPaged ? filteredTableData : filteredTableData.slice(0, visibleRows)
  const hasMoreRows = !isPaged && filteredTableData.length > visibleRows

  // ─── ER Diagram Layout ───
  // Delegates to the extracted helper in ./_lib/utils.
  const erLayout = hasGeneratedData
    ? computeERLayoutHelper(generatedData, generatedSchema)
    : { nodes: [] as Array<{ name: string; x: number; y: number; schema: SchemaTable; rows: number }>, edges: [] as Array<{ from: string; to: string; fromCol: string; toCol: string; type: string }> }

  // SVG dimensions based on layout
  const svgWidth = Math.max(600, erLayout.nodes.length > 0 ? Math.max(...erLayout.nodes.map(n => n.x)) + 280 : 600)
  const svgHeight = Math.max(400, erLayout.nodes.length > 0 ? Math.max(...erLayout.nodes.map(n => n.y)) + 250 : 400)

  // ─── Keyboard shortcuts ───
  // Registers a single keydown listener on `window` and dispatches to the
  // appropriate handler. We keep the latest closure in a ref so the listener
  // (attached once on mount) always sees current state without re-registering
  // on every keystroke.
  const shortcutHandlerRef = useRef<(e: KeyboardEvent) => void>(() => {})
  shortcutHandlerRef.current = (e: KeyboardEvent) => {
    const mod = e.ctrlKey || e.metaKey // Cmd on macOS, Ctrl elsewhere

    // ─── Escape: close any open dialog/modal ───
    // The shadcn Dialog component (Radix) already closes on Escape, but we
    // also clear our shortcuts dialog flag and bail out early so we don't
    // accidentally trigger another shortcut while a dialog is dismissing.
    if (e.key === 'Escape') {
      if (showShortcuts) {
        setShowShortcuts(false)
        e.preventDefault()
      }
      return
    }

    // ─── Modifier-based shortcuts ───
    if (!mod) return

    // Cmd/Ctrl + Shift + S → Save current SQL query
    if (e.shiftKey && (e.key === 'S' || e.key === 's')) {
      e.preventDefault()
      saveCurrentQuery()
      return
    }

    // Cmd/Ctrl + Shift + E → Export current database
    if (e.shiftKey && (e.key === 'E' || e.key === 'e')) {
      e.preventDefault()
      exportCurrentDatabase()
      return
    }

    // Plain Cmd/Ctrl shortcuts (no Shift)
    if (e.shiftKey) return

    switch (e.key) {
      case 'Enter':
        // Only fire when the chat input is focused so Cmd+Enter doesn't grab
        // the keystroke from the SQL editor or other inputs.
        if (document.activeElement === chatInputRef.current) {
          e.preventDefault()
          sendMessage()
        }
        break
      case 'k':
      case 'K':
        e.preventDefault()
        startNewChat()
        toast.success('Started a new chat')
        break
      case 'b':
      case 'B':
        e.preventDefault()
        setPanelVisible(v => !v)
        break
      case '/':
        e.preventDefault()
        setShowShortcuts(s => !s)
        break
      case '1':
        e.preventDefault()
        setActiveTab('data')
        break
      case '2':
        e.preventDefault()
        setActiveTab('sql')
        break
      case '3':
        e.preventDefault()
        setActiveTab('explorer')
        break
    }
  }

  useEffect(() => {
    const handler = (e: KeyboardEvent) => shortcutHandlerRef.current(e)
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  return (
    <div className={cn('flex h-[calc(100dvh-44px)] bg-background relative', isMobile && 'flex-col')}>
      {isMobile && (
        <div className="flex gap-1 p-1.5 border-b bg-card shrink-0">
          <Button
            size="sm"
            variant={mobileView === 'chat' ? 'default' : 'outline'}
            className="flex-1 h-9"
            onClick={() => setMobileView('chat')}
          >
            Chat
          </Button>
          <Button
            size="sm"
            variant={mobileView === 'data' ? 'default' : 'outline'}
            className="flex-1 h-9"
            onClick={() => setMobileView('data')}
          >
            Data
          </Button>
        </div>
      )}
      {/* ─── Left Panel: AI Chat (resizable) ─── */}
      {/* When the right panel is hidden the chat expands to full width. */}
      <div
        className={cn(
          'flex flex-col bg-background',
          isMobile
            ? cn('w-full flex-1 min-h-0', mobileView !== 'chat' && 'hidden')
            : panelVisible ? 'border-r shrink-0' : 'flex-1 border-r-0'
        )}
        style={!isMobile && panelVisible ? { width: chatWidth } : undefined}
      >
        {/* Chat Header */}
        <div className="px-3 py-2.5 border-b flex items-center justify-between bg-card shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <div className="relative shrink-0">
              <div className={`h-6 w-6 rounded-lg flex items-center justify-center bg-gradient-to-br ${isLiveDbMode ? 'from-amber-500 to-red-600' : 'from-amber-500 to-red-600'}`}>
                {isLiveDbMode ? <PlugZap className="h-3 w-3 text-white" /> : <Sparkles className="h-3 w-3 text-white" />}
              </div>
              {/* Live connection status dot — green when the studio has a
                  reachable DB (live connection OR generated synthetic data),
                  muted grey otherwise. Pinned to the bottom-right of the icon. */}
              <span
                className={`absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full border border-card ${
                  (isLiveDbMode || hasGeneratedData)
                    ? 'bg-emerald-500'
                    : 'bg-muted-foreground/40'
                }`}
                title={
                  (isLiveDbMode || hasGeneratedData)
                    ? 'Database connected'
                    : 'No database connected'
                }
                aria-label={
                  (isLiveDbMode || hasGeneratedData)
                    ? 'Database connected'
                    : 'No database connected'
                }
              />
            </div>
            <div className="min-w-0">
              <h2 className="text-xs font-semibold truncate flex items-center gap-1.5">
                {isLiveDbMode ? (activeConnectionName || 'Live DB') : 'SynthForge AI'}
                {/* Active dialect badge — PostgreSQL / MySQL in live mode,
                    SQLite for synthetic-data mode. Amber/red theme to stay
                    consistent with the rest of the chat header. */}
                <Badge
                  variant="outline"
                  className="text-[8px] h-3 px-1 gap-0.5 leading-none shrink-0 border-amber-400/60 text-amber-700 dark:text-amber-400 bg-amber-50/60 dark:bg-amber-950/30"
                >
                  {isLiveDbMode
                    ? (activeConnectionDialect || 'postgres').toUpperCase()
                    : 'SQLITE'}
                </Badge>
              </h2>
              <p className="text-[9px] text-muted-foreground truncate">
                {isLiveDbMode
                  ? `LIVE ${activeConnectionDialect || 'postgres'} · CRUD mode`
                  : 'DeepSeek v4 · streaming'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              className="h-5 w-5 p-0 hover:bg-amber-100 dark:hover:bg-amber-950/40 hover:text-amber-700 dark:hover:text-amber-400"
              onClick={startNewChat}
              title="New Chat (⌘K)"
              aria-label="New chat"
            >
              <Plus className="h-3 w-3" />
            </Button>
            {/* ─── Clear chat (with confirmation) ─── */}
            {/* Wipes the message list back to a fresh greeting but keeps the
                current schema/data/connection. Opens an AlertDialog so the
                action is confirmable (matches the existing destructive-action
                UX pattern used for destructive SQL). */}
            <Button
              variant="ghost"
              size="sm"
              className="h-5 w-5 p-0 hover:bg-rose-100 dark:hover:bg-rose-950/40 hover:text-rose-600 dark:hover:text-rose-400"
              onClick={() => setClearChatOpen(true)}
              title="Clear chat"
              aria-label="Clear chat"
              disabled={loading}
            >
              <Eraser className="h-3 w-3" />
            </Button>
            {/* ─── Conversation History dropdown ─── */}
            {/* Controlled so we can close it programmatically after loading a
                conversation. Uses <div> items (not <DropdownMenuItem>) for the
                conversation rows so the nested delete button can stopPropagation
                without dismissing the menu. */}
            <DropdownMenu open={historyOpen} onOpenChange={setHistoryOpen}>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-5 w-5 p-0 relative"
                  title="Conversation History"
                >
                  <History className="h-3 w-3" />
                  {conversations.length > 0 && (
                    <span className="absolute -top-1 -right-1 bg-amber-500 text-white text-[8px] font-bold rounded-full h-3 min-w-3 px-0.5 flex items-center justify-center leading-none">
                      {conversations.length > 99 ? '99+' : conversations.length}
                    </span>
                  )}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-80">
                {conversations.length === 0 ? (
                  <div className="px-2 py-4 text-center text-[11px] text-muted-foreground">
                    <History className="h-5 w-5 mx-auto mb-1.5 opacity-40" />
                    No saved conversations yet
                  </div>
                ) : (
                  <>
                    <div className="px-2 py-1 text-[10px] font-semibold text-muted-foreground flex items-center justify-between">
                      <span>Recent Conversations</span>
                      <Badge variant="secondary" className="text-[9px] h-3.5 px-1 leading-none">
                        {conversations.length}
                      </Badge>
                    </div>
                    <DropdownMenuSeparator />
                    <div className="max-h-80 overflow-y-auto">
                      {conversations.map((conv) => {
                        const isActive = conv.id === activeConversationId
                        return (
                          <div
                            key={conv.id}
                            className={cn(
                              'group flex items-start gap-2 px-2 py-1.5 rounded-sm cursor-pointer mx-0.5',
                              isActive ? 'bg-accent' : 'hover:bg-accent',
                            )}
                            onClick={() => { loadConversation(conv); setHistoryOpen(false) }}
                          >
                            <MessageSquare className="h-3 w-3 mt-0.5 shrink-0 text-muted-foreground" />
                            <div className="flex-1 min-w-0">
                              <div className="text-[11px] font-medium truncate">{conv.title}</div>
                              <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                                <Clock className="h-2.5 w-2.5 text-muted-foreground shrink-0" />
                                <span className="text-[9px] text-muted-foreground">{relativeTime(conv.updatedAt)}</span>
                                {conv.databaseName && (
                                  <Badge variant="outline" className="text-[8px] h-3 px-1 gap-0.5 leading-none shrink-0">
                                    <Database className="h-2 w-2" />
                                    {conv.databaseName.length > 12 ? conv.databaseName.slice(0, 12) + '…' : conv.databaseName}
                                  </Badge>
                                )}
                              </div>
                            </div>
                            <button
                              className="opacity-0 group-hover:opacity-100 text-destructive hover:text-destructive/80 transition-opacity shrink-0 p-0.5"
                              onClick={(e) => { e.stopPropagation(); deleteConversation(conv.id) }}
                              title="Delete conversation"
                              aria-label="Delete conversation"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </div>
                        )
                      })}
                    </div>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      className="text-[11px] text-destructive focus:text-destructive"
                      onClick={() => {
                        setConversations([])
                        persistSavedConversations([])
                        if (activeConversationIdRef.current) {
                          activeConversationIdRef.current = null
                          setActiveConversationId(null)
                        }
                        toast.success('Conversation history cleared')
                      }}
                    >
                      <Trash2 className="h-3 w-3 mr-2" />
                      Clear all history
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
            <Button
              variant="ghost"
              size="sm"
              className="h-5 w-5 p-0"
              onClick={() => setShowShortcuts(true)}
              title="Keyboard Shortcuts (⌘/)"
            >
              <Keyboard className="h-3 w-3" />
            </Button>
            {panelVisible && !isMobile && (
              <Button
                variant="ghost"
                size="sm"
                className="h-5 w-5 p-0"
                onClick={() => setPanelVisible(false)}
                title="Hide Panel (⌘B)"
              >
                <PanelRightClose className="h-3 w-3" />
              </Button>
            )}
            {isLiveDbMode && (
              <Badge variant="outline" className="text-[9px] gap-0.5 text-sky-700 dark:text-sky-400 border-sky-400 h-5 animate-pulse">
                <PlugZap className="h-2.5 w-2.5" />
                LIVE
              </Badge>
            )}
            {loading && (
              <Badge variant="secondary" className="text-[9px] gap-0.5 animate-pulse h-5">
                <Brain className="h-2.5 w-2.5" />
                Thinking
              </Badge>
            )}
            {hasGeneratedData && !loading && (
              <Badge variant="outline" className="text-[9px] gap-0.5 text-emerald-600 border-emerald-300 h-5">
                <Database className="h-2.5 w-2.5" />
                {Object.keys(generatedData).length} tables
              </Badge>
            )}
          </div>
        </div>

        {/* Agent status bar */}
        {loading && messages.length > 0 && (() => {
          const lastAssistant = [...messages].reverse().find(m => m.role === 'assistant')
          if (lastAssistant?.agentStatus) {
            const agent = getAgentByName(lastAssistant.agentStatus.agent)
            return (
              <div className={`px-3 py-1.5 border-b shrink-0 ${agent?.bgColor || 'bg-amber-50 dark:bg-amber-950/20'}`}>
                <div className="flex items-center gap-1.5">
                  <AgentIcon agentName={lastAssistant.agentStatus.agent} size="sm" />
                  <span className={`text-[10px] font-medium ${agent?.textColor || 'text-amber-700 dark:text-amber-400'}`}>
                    {lastAssistant.agentStatus.agent}
                  </span>
                  <span className="text-[9px] text-muted-foreground">· {lastAssistant.agentStatus.status}</span>
                  <div className="ml-auto flex items-center gap-1">
                    <div className="w-16 h-1 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full bg-amber-500 rounded-full transition-all duration-300"
                        style={{ width: `${lastAssistant.agentStatus.progress}%` }}
                      />
                    </div>
                    <span className="text-[8px] text-muted-foreground">{lastAssistant.agentStatus.progress}%</span>
                  </div>
                </div>
              </div>
            )
          }
          return null
        })()}

        {/* Reasoning indicator */}
        {reasoningVisible && currentReasoning && (
          <div className="px-3 py-1.5 border-b bg-amber-50 dark:bg-amber-950/20 shrink-0">
            <button
              onClick={() => setReasoningVisible(!reasoningVisible)}
              className="flex items-center gap-1 text-[10px] text-amber-700 dark:text-amber-400 w-full"
            >
              <Brain className="h-2.5 w-2.5" />
              <span className="font-medium">Reasoning...</span>
              <ChevronDown className={`h-2.5 w-2.5 ml-auto transition-transform ${reasoningVisible ? 'rotate-180' : ''}`} />
            </button>
            {reasoningVisible && (
              <p className="mt-0.5 text-[9px] text-amber-600/80 dark:text-amber-400/80 line-clamp-3 leading-relaxed">
                {currentReasoning.slice(-300)}
              </p>
            )}
          </div>
        )}

        {/* Chat Messages */}
        <div ref={chatContainerRef} className="flex-1 overflow-y-auto px-2.5 py-3 space-y-2.5 scroll-smooth">
          {messages.map((message) => (
            <div
              key={message.id}
              className={`group relative flex gap-1.5 animate-msg-fade-in ${message.role === 'user' ? 'justify-end' : ''}`}
            >
              {message.role === 'assistant' && (
                <AgentIcon agentName={message.agentName} size="sm" />
              )}
              <div
                className={`relative w-full sm:max-w-[88%] rounded-lg px-2.5 py-2 overflow-hidden border transition-colors ${
                  message.role === 'user'
                    ? 'bg-primary text-primary-foreground border-transparent'
                    : 'bg-gradient-to-b from-amber-50/70 to-amber-50/10 dark:from-amber-950/25 dark:to-amber-950/5 border-amber-200/50 dark:border-amber-900/30'
                }`}
                style={{ overflowWrap: 'break-word', wordBreak: 'break-word' }}
              >
                {message.role === 'assistant' && (
                  <p className="text-[9px] font-semibold mb-0.5 flex items-center gap-1">
                    <span className="bg-gradient-to-r from-amber-600 to-red-600 dark:from-amber-400 dark:to-red-400 bg-clip-text text-transparent">
                      {message.agentName || 'Orchestrator'}
                    </span>
                    {message.isStreaming && (
                      <span className="flex items-center gap-[3px] ml-0.5" aria-label="assistant is typing">
                        <span className="typing-dot inline-block h-1 w-1 rounded-full bg-amber-500" />
                        <span className="typing-dot inline-block h-1 w-1 rounded-full bg-amber-500 [animation-delay:0.18s]" />
                        <span className="typing-dot inline-block h-1 w-1 rounded-full bg-amber-500 [animation-delay:0.36s]" />
                      </span>
                    )}
                  </p>
                )}
                {renderMessageContent(message)}

                {/* Interactive options buttons - show during streaming too, but disabled */}
                {message.role === 'assistant' && message.interactiveOptions && (
                  <div className="mt-2 space-y-1.5">
                    <p className="text-[10px] font-medium text-muted-foreground">
                      {message.interactiveOptions.question}
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {message.interactiveOptions.choices.map((choice) => (
                        <button
                          key={choice.value}
                          onClick={() => handleOptionClick(choice, message.id)}
                          disabled={message.isStreaming}
                          className={`text-[10px] px-2.5 py-1 rounded-full border transition-colors ${
                            message.isStreaming ? 'opacity-50 cursor-not-allowed' : ''
                          } ${
                            message.interactiveOptions!.multi
                              ? 'border-violet-300 bg-violet-50 dark:bg-violet-950/30 text-violet-700 dark:text-violet-400 hover:bg-violet-100 dark:hover:bg-violet-950/50'
                              : 'border-amber-300 bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-950/50'
                          }`}
                        >
                          {choice.label}
                        </button>
                      ))}
                    </div>
                    {/* Custom answer input — lets the user type their own
                        answer instead of picking one of the preset choices.
                        The answer is sent as a normal chat message so the AI
                        can respond to any free-form input (e.g. "200 rows",
                        "medium, US locale"). Disabled while the AI is
                        streaming. Pressing Enter or clicking the send button
                        submits the custom answer. */}
                    {!message.isStreaming && (
                      <form
                        className="flex items-center gap-1 mt-1.5"
                        onSubmit={(e) => {
                          e.preventDefault()
                          const el = e.currentTarget.elements.namedItem('custom-answer') as HTMLInputElement | null
                          if (!el) return
                          const val = el.value.trim()
                          if (!val) return
                          el.value = ''
                          // Collapse the options once the user has answered so
                          // the bubble doesn't keep showing the (now stale)
                          // question + buttons.
                          setMessages(prev => prev.map(m =>
                            m.id === message.id ? { ...m, interactiveOptions: null } : m
                          ))
                          sendMessage(val)
                        }}
                      >
                        <Input
                          name="custom-answer"
                          placeholder="Or type your own answer…"
                          className="h-7 text-[11px] flex-1"
                          aria-label="Custom answer"
                        />
                        <Button
                          type="submit"
                          size="sm"
                          variant="secondary"
                          className="h-7 px-2 text-[10px] gap-1 shrink-0"
                          aria-label="Send custom answer"
                        >
                          <Send className="h-3 w-3" />
                          Send
                        </Button>
                      </form>
                    )}
                  </div>
                )}

                {/* ─── SQL block(s) (live DB mode) ─── */}
                {/* Wrapped in a mt-2.5 + space-y-2 container for clearer visual
                    hierarchy between the message body and the SQL card(s). */}
                {message.role === 'assistant' && message.sqlBlock && (
                  <>
                    <div className="mt-2.5 space-y-2">
                      {/* Render the primary SQL block (with execute button + result) */}
                      <SqlBlockCard
                        sql={message.sqlBlock}
                        dialect={activeConnectionDialect}
                        executing={message.sqlBlockExecuting}
                        result={message.sqlBlockResult}
                        onCopy={() => copyToClipboard(message.sqlBlock!)}
                        onOpenInEditor={() => { setSqlEditor(message.sqlBlock!); setActiveTab('sql') }}
                        onExecute={() => executeSqlBlock(message.id, message.sqlBlock!)}
                      />
                      {/* Render any additional SQL blocks as read-only previews
                          (the user can copy them into the SQL editor to execute). */}
                      {message.sqlBlocks && message.sqlBlocks.length > 1 && (
                        <div className="space-y-2">
                          {message.sqlBlocks.slice(1).map((extraSql, idx) => (
                            <SqlBlockCard
                              key={idx}
                              sql={extraSql}
                              dialect={activeConnectionDialect}
                              onCopy={() => copyToClipboard(extraSql)}
                              onOpenInEditor={() => { setSqlEditor(extraSql); setActiveTab('sql') }}
                              onExecute={() => executeSqlBlock(message.id, extraSql)}
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  </>
                )}

                {/* Hover timestamp — small muted text pinned to the bottom-right
                    corner of the bubble. Hidden until the row is hovered so the
                    chat stays visually uncluttered. */}
                <span
                  className="pointer-events-none absolute bottom-0.5 right-1.5 text-[8px] font-medium text-muted-foreground/70 opacity-0 transition-opacity duration-150 group-hover:opacity-100"
                  aria-hidden="true"
                >
                  {formatTimestamp(message.timestamp)}
                </span>
              </div>
              {message.role === 'user' && (
                <div className="h-5 w-5 rounded-full bg-gradient-to-br from-amber-500 to-red-600 flex items-center justify-center shrink-0 mt-0.5 shadow-sm">
                  <User className="h-2.5 w-2.5 text-white" />
                </div>
              )}
            </div>
          ))}
          {loading && messages.length > 0 && !messages[messages.length - 1]?.isStreaming && (
            <div className="flex gap-1.5 animate-msg-fade-in">
              <AgentIcon agentName="Orchestrator" size="sm" />
              <div className="bg-gradient-to-b from-amber-50/70 to-amber-50/10 dark:from-amber-950/25 dark:to-amber-950/5 border border-amber-200/50 dark:border-amber-900/30 rounded-lg px-2.5 py-2">
                <div className="flex items-center gap-1">
                  <Loader2 className="h-3 w-3 animate-spin text-amber-600 dark:text-amber-400" />
                  <span className="text-[10px] text-muted-foreground">Connecting...</span>
                </div>
              </div>
            </div>
          )}
          <div ref={chatEndRef} />
        </div>

        {/* Chat Input */}
        <div className="px-2.5 py-2 border-t bg-card shrink-0 pb-[env(safe-area-inset-bottom)]">
          {/* Pulsing "AI is thinking..." indicator — shown above the input row
              while a generation is in flight so the user has clear feedback
              that the assistant is working (in addition to the typing dots
              inside the streaming bubble). */}
          {loading && (
            <div className="mb-1.5 flex items-center gap-1.5 animate-thinking" aria-live="polite">
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full rounded-full bg-amber-500 opacity-75 animate-ping" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-amber-600 dark:bg-amber-400" />
              </span>
              <span className="text-[9px] font-medium text-amber-700 dark:text-amber-400">
                AI is thinking…
              </span>
            </div>
          )}
          <div
            className={`flex gap-1.5 items-end rounded-lg p-1 transition-all duration-200 ${
              inputFocused
                ? 'ring-2 ring-amber-400/50 dark:ring-amber-500/40 shadow-[0_0_0_3px_rgba(251,191,36,0.08)]'
                : 'ring-1 ring-transparent'
            }`}
          >
            <Textarea
              ref={chatInputRef}
              value={input}
              onChange={(e) => {
                setInput(e.target.value)
                autoResizeTextarea(chatInputRef.current)
              }}
              onKeyDown={handleKeyDown}
              onFocus={() => setInputFocused(true)}
              onBlur={() => setInputFocused(false)}
              placeholder={isLiveDbMode ? 'Ask me to edit, delete, drop, or query your live DB...' : 'Describe the data you need...'}
              disabled={loading || connectionLoading}
              rows={1}
              className="flex-1 text-xs min-h-[32px] max-md:min-h-[36px] max-h-[72px] [field-sizing:fixed] resize-none border-0 bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0 px-1.5 py-1.5 leading-snug"
            />
            {loading ? (
              <Button
                onClick={handleStopGeneration}
                size="sm"
                variant="destructive"
                className="h-8 w-8 max-md:h-9 max-md:w-9 p-0 shrink-0 hover:scale-105 transition-transform"
                title="Stop generation"
                aria-label="Stop generation"
              >
                <Square className="h-3.5 w-3.5 fill-current" />
              </Button>
            ) : (
              <Button
                onClick={() => sendMessage()}
                disabled={!input.trim()}
                size="sm"
                className="bg-gradient-to-r from-amber-600 to-red-600 hover:from-amber-700 hover:to-red-700 text-white h-8 w-8 max-md:h-9 max-md:w-9 p-0 shrink-0 transition-transform hover:scale-105 disabled:scale-100 disabled:opacity-50"
                aria-label="Send message"
              >
                <Send className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
          {/* Footer row: character counter (right) + keyboard hint (left).
              Only shows the counter when there is input text so the row stays
              empty/unobtrusive for an empty input. */}
          <div className="mt-1 flex items-center justify-between px-1">
            <span className="text-[8px] text-muted-foreground/70 select-none">
              <kbd className="px-1 py-0.5 rounded border bg-muted text-muted-foreground font-mono text-[8px] leading-none">
                ⌘
              </kbd>
              <span className="mx-0.5">+</span>
              <kbd className="px-1 py-0.5 rounded border bg-muted text-muted-foreground font-mono text-[8px] leading-none">
                Enter
              </kbd>
              <span className="ml-1">to send · Shift+Enter for newline</span>
            </span>
            {input.length > 0 && (
              <span
                className={`text-[8px] font-medium tabular-nums select-none ${
                  input.length > 1800 ? 'text-rose-500' : 'text-muted-foreground/70'
                }`}
                aria-live="polite"
              >
                {input.length.toLocaleString()} chars
              </span>
            )}
          </div>
        </div>
      </div>

      {/* ─── Resize Handle ─── */}
      {/* Hidden when the right panel is collapsed — there's nothing to resize. */}
      {panelVisible && !isMobile && (
        <div
          ref={resizeRef}
          className="w-1.5 cursor-col-resize bg-border hover:bg-amber-400 transition-colors shrink-0 active:bg-amber-500"
          onMouseDown={() => setIsResizing(true)}
        />
      )}

      {/* ─── Right Panel: Data/SQL/Explorer ─── */}
      {/* The entire panel (header + tabs) is unmounted when `panelVisible`
          is false so the chat column can take the full viewport width. */}
      {rightPanelShown ? (
        <div className={cn('flex-1 flex flex-col min-w-0', isMobile && 'w-full min-h-0')}>
        {/* Panel Header */}
        <div className="px-3 py-2 border-b flex items-center justify-between bg-card shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            {isLiveDbMode && (
              <>
                <PlugZap className="h-3.5 w-3.5 text-sky-600 shrink-0" />
                <Input
                  value={databaseName}
                  onChange={(e) => setDatabaseName(e.target.value)}
                  className="h-6 text-xs font-medium border-transparent hover:border-input focus:border-input w-44 px-1"
                />
                <Badge variant="outline" className="text-[9px] gap-0.5 text-sky-700 dark:text-sky-400 border-sky-400 h-5 shrink-0">
                  <PlugZap className="h-2.5 w-2.5" />
                  LIVE {activeConnectionDialect || 'postgres'}
                </Badge>
              </>
            )}
            {!isLiveDbMode && hasGeneratedData && (
              <>
                <Database className="h-3.5 w-3.5 text-amber-600 shrink-0" />
                <Input
                  value={databaseName}
                  onChange={(e) => setDatabaseName(e.target.value)}
                  className="h-6 text-xs font-medium border-transparent hover:border-input focus:border-input w-44 px-1"
                />
              </>
            )}
            {!isLiveDbMode && !hasGeneratedData && (
              <span className="text-xs text-muted-foreground">
                {connectionLoading ? 'Loading connection...' : 'No database generated yet'}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            {isLiveDbMode && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="h-6 text-[10px] gap-1">
                    <Download className="h-2.5 w-2.5" />
                    Export
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {(['sql', 'csv', 'json', 'xlsx'] as ExportFormat[]).map(f => (
                    <DropdownMenuItem key={f} onClick={() => exportLive(f)}>
                      {{ sql: 'SQL dump (.sql)', csv: 'CSV (.csv)', json: 'JSON (.json)', xlsx: 'Excel (.xls)' }[f]}
                    </DropdownMenuItem>
                  ))}
                  {selectedTable && <DropdownMenuSeparator />}
                  {selectedTable && (['sql', 'csv', 'json', 'xlsx'] as ExportFormat[]).map(f => (
                    <DropdownMenuItem key={`t-${f}`} onClick={() => exportLive(f, selectedTable)}>
                      Export &quot;{selectedTable}&quot; as {f === 'xlsx' ? 'Excel' : f.toUpperCase()}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            {hasGeneratedData && (
              <>
                {/* Export Dropdown (synthetic data; live DBs use the server-side export above) */}
                {!isLiveDbMode && <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm" className="h-6 text-[10px] gap-1">
                      <Download className="h-2.5 w-2.5" />
                      Export
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => exportCurrentDatabase()}>
                      <FileText className="mr-2 h-3 w-3" />
                      SQL Dump (.sql)
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => {
                      if (currentDatabaseId) {
                        void downloadExport({ databaseId: currentDatabaseId, ...(selectedTable ? { tableName: selectedTable } : {}) }, 'csv', selectedTable || databaseName || 'database')
                        return
                      }
                      if (selectedTable && currentTableData.length > 0) {
                        exportAsCSV(currentTableData as Record<string, unknown>[], `${databaseName}_${selectedTable}.csv`)
                      } else {
                        // Export all tables as one CSV
                        const allRows: Record<string, unknown>[] = []
                        for (const [tableName, rows] of Object.entries(generatedData)) {
                          for (const row of (rows as Record<string, unknown>[])) {
                            allRows.push({ _table: tableName, ...row })
                          }
                        }
                        if (allRows.length > 0) exportAsCSV(allRows, `${databaseName || 'database'}.csv`)
                      }
                    }}>
                      <FileSpreadsheet className="mr-2 h-3 w-3" />
                      CSV (.csv)
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => {
                      if (currentDatabaseId) void downloadExport({ databaseId: currentDatabaseId }, 'json', databaseName || 'database')
                      else exportAsJSON(generatedData, `${databaseName || 'database'}.json`)
                    }}>
                      <FileJson className="mr-2 h-3 w-3" />
                      JSON (.json)
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>}

                <Button
                  variant="outline"
                  size="sm"
                  className="h-6 text-[10px] gap-1"
                  onClick={saveToDatabase}
                  disabled={saving || isLiveDbMode}
                  title={isLiveDbMode ? 'Save is disabled in live DB mode — changes are written directly to your external DB when you run SQL.' : 'Save'}
                >
                  {saving ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : <Save className="h-2.5 w-2.5" />}
                  Save
                </Button>
                {currentDatabaseId && !isLiveDbMode && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-6 text-[10px] gap-1 text-destructive hover:text-destructive"
                    onClick={deleteDatabase}
                  >
                    <Trash2 className="h-2.5 w-2.5" />
                    Delete
                  </Button>
                )}

                {/* Copy SQL — copies the current SQL editor content (or the
                    generated schema SQL if the editor is empty) to the
                    clipboard so it can be pasted into an external tool. */}
                <TooltipProvider delayDuration={300}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-6 text-[10px] gap-1"
                        onClick={() => {
                          const content = sqlEditor.trim() || generateSchemaSQL()
                          navigator.clipboard.writeText(content)
                          toast.success('SQL copied to clipboard')
                        }}
                      >
                        <Copy className="h-2.5 w-2.5" />
                        Copy SQL
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom">
                      <p className="text-xs">Copy current SQL (or schema DDL if editor is empty) to clipboard</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>

                {/* Regenerate Data — replaces all existing rows with fresh
                    synthetic data using the same schema + per-table row
                    counts. Disabled in live-DB mode (data lives in the
                    external DB, not synthforge) and while a generation is
                    already running. */}
                {!isLiveDbMode && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-6 text-[10px] gap-1 text-amber-700 dark:text-amber-400 border-amber-300 dark:border-amber-700 hover:bg-amber-50 dark:hover:bg-amber-950/30"
                    onClick={() => setRegenerateConfirmOpen(true)}
                    disabled={generationProgress.isGenerating || loading}
                    title="Regenerate all data using the current schema and row counts"
                  >
                    <RefreshCw className={`h-2.5 w-2.5 ${generationProgress.isGenerating ? 'animate-spin' : ''}`} />
                    Regenerate
                  </Button>
                )}
              </>
            )}
          </div>
        </div>

        {/* ─── Schema Preview Panel (collapsible) ───
            Shown once a database has been generated. Replaces the "No Data
            Generated Yet" empty state in spirit — when data exists the user
            gets a compact at-a-glance summary of the schema (tables, columns,
            rows) plus clickable table chips that select the table in the Data
            tab. Defaults open so the totals are visible immediately. */}
        {hasGeneratedData && (
          <Collapsible
            open={schemaPanelOpen}
            onOpenChange={setSchemaPanelOpen}
            className="border-b bg-gradient-to-r from-amber-50/60 to-red-50/40 dark:from-amber-950/20 dark:to-red-950/10 shrink-0"
          >
            <CollapsibleTrigger asChild>
              <button
                type="button"
                className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-amber-100/50 dark:hover:bg-amber-950/30 transition-colors text-left"
              >
                <div className="h-5 w-5 rounded-md bg-gradient-to-br from-amber-500 to-red-600 flex items-center justify-center shrink-0">
                  <Database className="h-2.5 w-2.5 text-white" />
                </div>
                <span className="text-[11px] font-semibold text-foreground">Schema</span>
                {/* Totals summary — always visible so the user sees counts even
                    when the panel is collapsed. */}
                <div className="flex items-center gap-1 ml-1">
                  <Badge variant="outline" className="text-[9px] gap-0.5 h-4 px-1 border-amber-300 dark:border-amber-700 text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30">
                    <Table2 className="h-2 w-2" />
                    {schemaStats.tableCount} tables
                  </Badge>
                  <Badge variant="outline" className="text-[9px] gap-0.5 h-4 px-1 border-amber-300 dark:border-amber-700 text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30">
                    <Columns className="h-2 w-2" />
                    {schemaStats.columnCount} cols
                  </Badge>
                  <Badge variant="outline" className="text-[9px] gap-0.5 h-4 px-1 border-amber-300 dark:border-amber-700 text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30">
                    <Database className="h-2 w-2" />
                    {schemaStats.rowCount.toLocaleString()} rows
                  </Badge>
                </div>
                <ChevronDown className={`h-3 w-3 ml-auto text-muted-foreground transition-transform ${schemaPanelOpen ? 'rotate-180' : ''}`} />
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="px-3 pb-2 pt-0.5">
                {/* Column-type breakdown — e.g. "3 uuid, 2 varchar, 1 timestamp" */}
                {schemaStats.typeBreakdown.size > 0 && (
                  <div className="flex items-center gap-1 flex-wrap mb-1.5">
                    <span className="text-[9px] text-muted-foreground uppercase tracking-wider">Types:</span>
                    {[...schemaStats.typeBreakdown.entries()]
                      .sort((a, b) => b[1] - a[1])
                      .slice(0, 8)
                      .map(([type, count]) => (
                        <Badge key={type} variant="secondary" className="text-[8px] font-mono px-1 py-0 h-3.5 bg-amber-100/80 dark:bg-amber-900/30 text-amber-800 dark:text-amber-300">
                          {count} {type}
                        </Badge>
                      ))}
                  </div>
                )}
                <Separator className="mb-1.5 bg-amber-200/50 dark:bg-amber-800/30" />
                {/* Compact scrollable list of tables — clickable to select in Data tab */}
                <div className="max-h-32 overflow-y-auto pr-1 space-y-0.5
                                [&::-webkit-scrollbar]:w-1.5
                                [&::-webkit-scrollbar-thumb]:rounded-full
                                [&::-webkit-scrollbar-thumb]:bg-amber-300/60
                                dark:[&::-webkit-scrollbar-thumb]:bg-amber-700/50">
                  {generatedSchema.map((table) => {
                    const rows = generatedData[table.name]
                    const rowCount = Math.max(tableCounts[table.name] ?? 0, Array.isArray(rows) ? rows.length : 0)
                    const isActive = selectedTable === table.name
                    return (
                      <button
                        key={table.name}
                        type="button"
                        onClick={() => {
                          setSelectedTable(table.name)
                          setVisibleRows(20)
                          setDataSearchQuery('')
                          setActiveTab('data')
                        }}
                        className={`w-full flex items-center gap-1.5 px-1.5 py-1 rounded text-[10px] transition-colors group ${
                          isActive
                            ? 'bg-amber-100 dark:bg-amber-900/40 text-amber-900 dark:text-amber-200'
                            : 'hover:bg-amber-50 dark:hover:bg-amber-950/30 text-foreground/80'
                        }`}
                        title={`${table.name} — ${table.columns.length} columns, ${rowCount.toLocaleString()} rows`}
                      >
                        <Table2 className={`h-2.5 w-2.5 shrink-0 ${isActive ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground'}`} />
                        <span className="font-mono font-medium truncate flex-1 text-left">{table.name}</span>
                        <Badge variant="outline" className="text-[8px] px-1 py-0 h-3.5 gap-0.5 border-amber-300/60 dark:border-amber-700/50 text-muted-foreground shrink-0">
                          <Columns className="h-2 w-2" />
                          {table.columns.length}
                        </Badge>
                        <Badge variant="outline" className="text-[8px] px-1 py-0 h-3.5 min-w-[20px] text-center shrink-0 border-amber-300/60 dark:border-amber-700/50 text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30">
                          {rowCount.toLocaleString()}
                        </Badge>
                      </button>
                    )
                  })}
                </div>
              </div>
            </CollapsibleContent>
          </Collapsible>
        )}

        {hasGeneratedData ? (
          <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-col flex-1 min-h-0">
            <div className="px-3 pt-1.5 border-b shrink-0">
              <TabsList className={cn('h-8', isMobile && 'overflow-x-auto max-w-full justify-start')}>
                <TabsTrigger value="data" className="text-[11px] gap-1 px-2.5">
                  <Table2 className="h-3 w-3" />
                  Data
                </TabsTrigger>
                <TabsTrigger value="sql" className="text-[11px] gap-1 px-2.5">
                  <Code2 className="h-3 w-3" />
                  SQL
                </TabsTrigger>
                <TabsTrigger value="explorer" className="text-[11px] gap-1 px-2.5">
                  <GitBranch className="h-3 w-3" />
                  Explorer
                </TabsTrigger>
              </TabsList>
            </div>

            {/* ─── Data Tab ─── */}
            <TabsContent value="data" className="flex-1 overflow-hidden m-0">
              <div className="flex h-full">
                {/* Table selector sidebar */}
                <div className="w-44 border-r bg-muted/30 flex flex-col shrink-0">
                  <div className="px-2 py-1.5 border-b flex items-center justify-between">
                    <div className="flex items-center gap-1 text-muted-foreground">
                      <Layers className="h-3 w-3" />
                      <span className="text-[10px] font-semibold uppercase tracking-wider">Tables</span>
                    </div>
                    <div className="flex items-center gap-0.5">
                      {isLiveDbMode && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-4 w-4 p-0"
                          onClick={async () => {
                            if (!activeConnectionId) return
                            try {
                              toast.info('Refreshing schema from live DB...')
                              const refresh = await apiGet<{
                                schema?: SchemaTable[]
                                data?: Record<string, unknown[]>
                                counts?: Record<string, number>
                              }>(`/api/connections/${activeConnectionId}?include=introspect`, { cacheTtl: 0, force: true, timeout: 30000 })
                              if (refresh.schema) setGeneratedSchema(refresh.schema)
                              if (refresh.data) setGeneratedData(refresh.data)
                              if (refresh.counts) setTableCounts(refresh.counts)
                              setSelectedTable('')
                              toast.success(`Loaded ${refresh.schema?.length || 0} tables from live DB`)
                            } catch (err) {
                              toast.error(err instanceof Error ? err.message : 'Failed to refresh')
                            }
                          }}
                          title="Refresh schema from live DB"
                        >
                          <RotateCcw className="h-2.5 w-2.5" />
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-4 w-4 p-0"
                        onClick={() => setAddTableDialogOpen(true)}
                        title="Add Table"
                      >
                        <Plus className="h-2.5 w-2.5" />
                      </Button>
                    </div>
                  </div>
                  <div className="flex-1 overflow-y-auto p-1 space-y-0.5 max-h-96">
                    {Object.entries(generatedData).map(([tableName, rows]) => {
                      const rowCount = Math.max(tableCounts[tableName] ?? 0, Array.isArray(rows) ? rows.length : 0)
                      const isActive = selectedTable === tableName
                      return (
                        <button
                          key={tableName}
                          onClick={() => { setSelectedTable(tableName); setVisibleRows(20); setDataSearchQuery('') }}
                          className={`w-full text-left px-2 py-1 rounded text-[11px] font-medium transition-colors flex items-center gap-1.5 group ${
                            isActive
                              ? 'bg-accent text-accent-foreground'
                              : 'text-muted-foreground hover:bg-accent/50 hover:text-accent-foreground'
                          }`}
                          title={`${tableName} — ${rowCount.toLocaleString()} row${rowCount === 1 ? '' : 's'}`}
                        >
                          <Table2 className={`h-2.5 w-2.5 shrink-0 ${isActive ? 'text-amber-600 dark:text-amber-400' : ''}`} />
                          <span className="truncate">{tableName}</span>
                          {/* Row count badge — amber-tinted so it reads as a row
                              count at a glance (matches the example "users (10)"). */}
                          <Badge
                            variant="outline"
                            className={`ml-auto text-[8px] px-1 py-0 min-w-[20px] text-center h-3.5 shrink-0 transition-colors ${
                              isActive
                                ? 'border-amber-400 dark:border-amber-600 bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-300'
                                : 'border-amber-300/60 dark:border-amber-700/40 bg-amber-50 dark:bg-amber-950/20 text-amber-700 dark:text-amber-400 group-hover:bg-amber-100 dark:group-hover:bg-amber-900/40'
                            }`}
                          >
                            {rowCount.toLocaleString()}
                          </Badge>
                        </button>
                      )
                    })}
                  </div>
                </div>

                {/* Data grid */}
                <div className="flex-1 flex flex-col min-w-0">
                  {!selectedTable ? (
                    // ─── Empty state 1: no table selected ───
                    <div className="flex-1 flex items-center justify-center p-4">
                      <div className="text-center max-w-sm">
                        <div className="mx-auto mb-3 h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                          <Database className="h-5 w-5 text-primary" />
                        </div>
                        <p className="text-sm font-medium text-foreground">Pick a table on the left</p>
                        <p className="mt-1 text-[11px] text-muted-foreground">
                          Tables you generate or import will appear in the sidebar. Column headers are tinted so you can spot relationships at a glance:
                        </p>
                        <div className="mt-3 flex items-center justify-center gap-1.5 text-[10px]">
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded border border-primary/40 bg-primary/10 text-primary">
                            <KeyRound className="h-2.5 w-2.5" />PK
                          </span>
                          <span className="text-muted-foreground">primary key</span>
                          <span className="mx-0.5 text-muted-foreground/50">·</span>
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded border border-sky-500/40 bg-sky-500/10 text-sky-600 dark:text-sky-400">
                            <Link2 className="h-2.5 w-2.5" />FK
                          </span>
                          <span className="text-muted-foreground">foreign key</span>
                        </div>
                      </div>
                    </div>
                  ) : headerColumns.length === 0 ? (
                    // ─── Empty state 2: table selected but no columns yet ───
                    <div className="flex-1 flex items-center justify-center p-4">
                      <div className="text-center max-w-sm">
                        <div className="mx-auto mb-3 h-10 w-10 rounded-full bg-muted flex items-center justify-center">
                          <Table2 className="h-5 w-5 text-muted-foreground" />
                        </div>
                        <p className="text-sm font-medium text-foreground">No columns in this table yet</p>
                        <p className="mt-1 text-[11px] text-muted-foreground mb-3">
                          Add a column to start building out the schema for &ldquo;{selectedTable}&rdquo;.
                        </p>
                        <Button variant="outline" size="sm" className="h-7 text-[11px] gap-1" onClick={() => setAddColumnDialogOpen(true)}>
                          <Plus className="h-3 w-3" />Add Column
                        </Button>
                      </div>
                    </div>
                  ) : (
                    // ─── Table selected with columns (may have 0 rows) ───
                    <>
                      <div className="px-2.5 py-1.5 border-b flex items-center justify-between shrink-0 gap-2">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <Table2 className="h-3.5 w-3.5 text-amber-600 shrink-0" />
                          <div className="flex flex-col min-w-0 leading-tight">
                            <span className="text-xs font-semibold truncate">{selectedTable}</span>
                            <Badge variant="outline" className="text-[9px] px-1 py-0 h-3.5 w-fit">
                              {displayTotal.toLocaleString()} row{displayTotal === 1 ? '' : 's'}
                            </Badge>
                          </div>
                        </div>
                        <div className="flex items-center gap-0.5 shrink-0">
                          <Button variant="ghost" size="sm" className="h-5 text-[9px] gap-0.5 px-1" onClick={handleAddRow} disabled={isPaged} title={isPaged ? 'Use the SQL tab or AI chat to edit large tables' : 'Add Row'}>
                            <Plus className="h-2.5 w-2.5" />Row
                          </Button>
                          <Button variant="ghost" size="sm" className="h-5 text-[9px] gap-0.5 px-1" onClick={() => setAddColumnDialogOpen(true)} title="Add Column">
                            <Plus className="h-2.5 w-2.5" />Col
                          </Button>
                          {selectedRows.size > 0 && (
                            <Button variant="ghost" size="sm" className="h-5 text-[9px] gap-0.5 px-1 text-destructive hover:text-destructive" onClick={handleDeleteSelectedRows} title="Delete Selected Rows">
                              <Trash2 className="h-2.5 w-2.5" />Del
                            </Button>
                          )}
                          <Button variant="ghost" size="sm" className="h-5 w-5 p-0" onClick={() => copyToClipboard(JSON.stringify(currentTableData, null, 2))} title={isPaged ? 'Copy current page as JSON' : 'Copy as JSON'}>
                            <Copy className="h-2.5 w-2.5" />
                          </Button>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="sm" className="h-5 w-5 p-0" title="Download table">
                                <Download className="h-2.5 w-2.5" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="text-xs">
                              <DropdownMenuItem onClick={() => {
                                if (!isLiveDbMode && currentDatabaseId) void downloadExport({ databaseId: currentDatabaseId, tableName: selectedTable }, 'json', selectedTable)
                                else if (isLiveDbMode) void exportLive('json', selectedTable)
                                else exportAsJSON(currentTableData, `${selectedTable}.json`)
                              }}>
                                <FileJson className="mr-2 h-3 w-3" />
                                JSON (.json)
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => {
                                if (!isLiveDbMode && currentDatabaseId) void downloadExport({ databaseId: currentDatabaseId, tableName: selectedTable }, 'csv', selectedTable)
                                else if (isLiveDbMode) void exportLive('csv', selectedTable)
                                else exportAsCSV(currentTableData as Record<string, unknown>[], `${selectedTable}.csv`)
                              }}>
                                <FileSpreadsheet className="mr-2 h-3 w-3" />
                                CSV (.csv)
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => {
                                if (!isLiveDbMode && currentDatabaseId) { void downloadExport({ databaseId: currentDatabaseId, tableName: selectedTable }, 'sql', selectedTable); return }
                                if (isLiveDbMode) { void exportLive('sql', selectedTable); return }
                                const singleSchema = generatedSchema.find(s => s.name === selectedTable)
                                const singleData = selectedTable ? { [selectedTable]: generatedData[selectedTable] || [] } : {}
                                exportAsSQL(singleSchema ? [singleSchema] : [], singleData, `${selectedTable}.sql`)
                              }}>
                                <FileText className="mr-2 h-3 w-3" />
                                SQL Dump (.sql)
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                          <span className="hidden sm:inline-flex items-center gap-1 text-[9px] text-muted-foreground/80 border border-border rounded px-1.5 py-0.5 bg-muted/30 ml-1" title={isPaged ? 'Use the SQL tab or AI chat to edit large tables' : 'Double-click any cell to edit it in place'}>
                            <MousePointerClick className="h-2.5 w-2.5" />
                            {isPaged ? 'Large table: read-only' : 'Double-click a cell to edit'}
                          </span>
                        </div>
                      </div>

                      {/* ─── Table Info card + row search ───
                          Compact at-a-glance summary of the selected table
                          (column count, row count, type breakdown) plus a
                          "View in Explorer" shortcut, and a search box that
                          filters rows within this table by any cell value. */}
                      <div className="px-2.5 py-1.5 border-b bg-muted/20 shrink-0 flex items-center gap-2 flex-wrap">
                        <Card className="px-2 py-1 shadow-none border-amber-200/60 dark:border-amber-800/40 bg-amber-50/40 dark:bg-amber-950/20">
                          <CardContent className="p-0 flex items-center gap-2">
                            <Table2 className="h-3 w-3 text-amber-600 dark:text-amber-400 shrink-0" />
                            <span className="text-[11px] font-bold text-foreground truncate max-w-[120px]">{selectedTable}</span>
                            <Separator orientation="vertical" className="h-3.5 bg-amber-300/50 dark:bg-amber-700/40" />
                            <span className="text-[9px] text-muted-foreground">
                              <span className="font-semibold text-foreground">{currentTableSchema?.columns.length || headerColumns.length}</span> cols
                            </span>
                            <span className="text-[9px] text-muted-foreground">
                              <span className="font-semibold text-foreground">{displayTotal.toLocaleString()}</span> rows
                            </span>
                            {currentTableSchema && currentTableSchema.columns.length > 0 && (
                              <>
                                <Separator orientation="vertical" className="h-3.5 bg-amber-300/50 dark:bg-amber-700/40" />
                                <div className="flex items-center gap-0.5 flex-wrap max-w-[280px]">
                                  {(() => {
                                    const counts = new Map<string, number>()
                                    for (const c of currentTableSchema.columns) {
                                      const norm = c.type.toLowerCase().replace(/\(.*\)/g, '').trim() || c.type
                                      counts.set(norm, (counts.get(norm) || 0) + 1)
                                    }
                                    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([t, n]) => (
                                      <Badge key={t} variant="outline" className="text-[8px] font-mono px-1 py-0 h-3 border-amber-300/60 dark:border-amber-700/40 text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30">
                                        {n} {t}
                                      </Badge>
                                    ))
                                  })()}
                                </div>
                              </>
                            )}
                          </CardContent>
                        </Card>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-5 text-[9px] gap-0.5 px-1.5 text-amber-700 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/30 ml-auto"
                          onClick={() => setActiveTab('explorer')}
                          title="View this table in the Explorer tab"
                        >
                          <ArrowRight className="h-2.5 w-2.5" />
                          View in Explorer
                        </Button>
                        <div className="relative w-40">
                          <Search className="absolute left-1.5 top-1/2 -translate-y-1/2 h-2.5 w-2.5 text-muted-foreground pointer-events-none" />
                          <Input
                            value={dataSearchQuery}
                            onChange={(e) => { setDataSearchQuery(e.target.value); setVisibleRows(20); setPageOffset(0) }}
                            disabled={isPaged && isLiveDbMode}
                            title={isPaged && isLiveDbMode ? 'Filtering is not available for paged live tables; use the SQL tab' : undefined}
                            placeholder="Filter rows…"
                            className="h-5 text-[10px] pl-6 pr-5"
                          />
                          {dataSearchQuery && (
                            <button
                              onClick={() => setDataSearchQuery('')}
                              className="absolute right-1 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                              title="Clear filter"
                            >
                              <X className="h-2.5 w-2.5" />
                            </button>
                          )}
                        </div>
                      </div>

                      <div className="flex-1 overflow-auto max-h-[500px]">
                        <table className="w-full text-[11px] border-collapse">
                          <thead className="sticky top-0 z-10 bg-background">
                            <tr className="border-b">
                              <th className="text-left py-1.5 px-1 font-medium text-muted-foreground bg-muted/50 border-r border-b border-border w-6">
                                <input
                                  type="checkbox"
                                  className="h-3 w-3"
                                  checked={selectedRows.size === displayedRows.length && displayedRows.length > 0}
                                  onChange={(e) => {
                                    if (e.target.checked) {
                                      setSelectedRows(new Set(displayedRows.map((_, i) => i)))
                                    } else {
                                      setSelectedRows(new Set())
                                    }
                                  }}
                                />
                              </th>
                              <th className="text-left py-1.5 px-2 font-medium text-muted-foreground bg-muted/50 border-r border-b border-border w-8">#</th>
                              {headerColumns.map((col) => {
                                const kind = getDataColumnKind(col)
                                const colType = currentTableSchema?.columns.find(c => c.name === col)?.type
                                const hint = columnPlainEnglishHint(col)
                                return (
                                  <th
                                    key={col}
                                    onClick={isPaged ? () => { setPageOffset(0); setPageSort(prev => prev?.col === col ? { col, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { col, dir: 'asc' }) } : undefined}
                                    className={cn(
                                      'text-left align-top py-1.5 px-2 font-medium whitespace-nowrap border-r last:border-r-0 min-w-[104px]',
                                      isPaged && 'cursor-pointer select-none hover:bg-muted/70',
                                      kind === 'pk' && 'bg-primary/10 border-b-2 border-b-primary',
                                      kind === 'fk' && 'bg-sky-500/10 dark:bg-sky-950/35 border-b-2 border-b-sky-500/55',
                                      kind === 'regular' && 'bg-muted/40 border-b border-border',
                                    )}
                                  >
                                    <div className="flex flex-col gap-0.5">
                                      <div className="flex items-center gap-1">
                                        {kind === 'pk' && (
                                          <Badge variant="outline" className="text-[7px] px-1 py-0 h-3.5 gap-0.5 border-primary/40 bg-primary/10 text-primary shrink-0">
                                            <KeyRound className="h-2 w-2" />PK
                                          </Badge>
                                        )}
                                        {kind === 'fk' && (
                                          <Badge variant="outline" className="text-[7px] px-1 py-0 h-3.5 gap-0.5 border-sky-500/40 bg-sky-500/10 text-sky-600 dark:text-sky-400 shrink-0">
                                            <Link2 className="h-2 w-2" />FK
                                          </Badge>
                                        )}
                                        <span className="text-[11px] font-semibold text-foreground">{humanizeColumnName(col)}</span>
                                        {isPaged && pageSort?.col === col && <span className="text-[10px] text-primary">{pageSort.dir === 'asc' ? '▲' : '▼'}</span>}
                                      </div>
                                      <div className="flex items-center gap-1">
                                        <span className="font-mono text-[9px] text-muted-foreground">{col}</span>
                                        {colType && (
                                          <Badge variant="outline" className="text-[7px] px-0.5 py-0 h-3 font-mono">
                                            {colType}
                                          </Badge>
                                        )}
                                      </div>
                                      {hint && (
                                        <p className="text-[8px] text-muted-foreground/80 leading-tight">{hint}</p>
                                      )}
                                    </div>
                                  </th>
                                )
                              })}
                            </tr>
                          </thead>
                          <tbody>
                            {displayedRows.length === 0 ? (
                              // ─── Empty state 3: table selected, columns exist, no rows ───
                              <tr>
                                <td colSpan={headerColumns.length + 2} className="py-6 text-center text-xs text-muted-foreground italic">
                                  {dataSearchQuery
                                    ? <>No rows match <span className="font-semibold not-italic text-foreground">&ldquo;{dataSearchQuery}&rdquo;</span>. <button onClick={() => setDataSearchQuery('')} className="text-amber-600 dark:text-amber-400 underline not-italic">Clear filter</button></>
                                    : <>No rows yet. Click <span className="font-semibold not-italic text-foreground">Row</span> above to add one.</>}
                                </td>
                              </tr>
                            ) : (
                              displayedRows.map((row, i) => (
                                <tr key={i} className={cn(
                                  'border-b transition-colors',
                                  // Zebra striping — alternate rows get a subtle
                                  // muted background so wide tables are easier to
                                  // scan. Selected rows override with amber tint.
                                  i % 2 === 1 ? 'bg-muted/30' : 'bg-background',
                                  'hover:bg-amber-50/60 dark:hover:bg-amber-950/20',
                                  selectedRows.has(i) && 'bg-amber-50 dark:bg-amber-950/30',
                                )}>
                                  <td className="py-1 px-1 border-r bg-muted/20">
                                    <input
                                      type="checkbox"
                                      className="h-3 w-3"
                                      checked={selectedRows.has(i)}
                                      onChange={(e) => {
                                        setSelectedRows(prev => {
                                          const next = new Set(prev)
                                          if (e.target.checked) next.add(i)
                                          else next.delete(i)
                                          return next
                                        })
                                      }}
                                    />
                                  </td>
                                  <td className="py-1 px-2 text-muted-foreground font-mono text-[9px] border-r bg-muted/20">
                                    {(isPaged ? pageOffset : 0) + i + 1}
                                  </td>
                                  {currentTableColumns.map((colName) => {
                                    const val = (row as Record<string, unknown>)[colName]
                                    const kind = getDataColumnKind(colName)
                                    return (
                                      <td
                                        key={colName}
                                        className={cn(
                                          'py-1 px-2 font-mono text-[10px] whitespace-nowrap max-w-[180px] truncate border-r last:border-r-0',
                                          kind === 'pk' && 'bg-primary/[0.07]',
                                          kind === 'fk' && 'bg-sky-500/[0.08] dark:bg-sky-950/25',
                                        )}
                                        onDoubleClick={isPaged ? undefined : () => {
                                          setEditingCell({ row: i, col: colName })
                                          setEditingCellValue(val === null ? '' : String(val))
                                        }}
                                      >
                                        {editingCell?.row === i && editingCell?.col === colName ? (
                                          <input
                                            type="text"
                                            className="w-full h-5 text-[10px] font-mono px-1 border border-amber-400 rounded bg-background focus:outline-none"
                                            value={editingCellValue}
                                            autoFocus
                                            onChange={(e) => setEditingCellValue(e.target.value)}
                                            onBlur={() => handleCellEdit(i, colName, editingCellValue)}
                                            onKeyDown={(e) => {
                                              if (e.key === 'Enter') handleCellEdit(i, colName, editingCellValue)
                                              if (e.key === 'Escape') setEditingCell(null)
                                            }}
                                          />
                                        ) : val === null ? (
                                          <span className="text-muted-foreground italic">NULL</span>
                                        ) : typeof val === 'boolean' ? (
                                          <Badge variant={val ? 'default' : 'secondary'} className="text-[8px] px-1 py-0">
                                            {String(val)}
                                          </Badge>
                                        ) : typeof val === 'number' ? (
                                          <span className="text-blue-600 dark:text-blue-400">{String(val)}</span>
                                        ) : (
                                          String(val ?? '')
                                        )}
                                      </td>
                                    )
                                  })}
                                </tr>
                              ))
                            )}
                          </tbody>
                        </table>
                      </div>
                      {/* ─── Data grid footer ───
                          Always-visible "Rows: X of Y" counter so the user
                          knows how many rows are shown vs. the total (after
                          any search filter is applied). When more rows are
                          available below the visibleRows cap, also shows a
                          "Load more" button on the right. */}
                      <div className="px-2.5 py-1.5 border-t bg-muted/30 shrink-0 flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground min-w-0">
                          {isPaged ? (
                            <span className="shrink-0" data-testid="paged-range">
                              Rows {pagedTotal === 0 ? 0 : (pageOffset + 1).toLocaleString()}–{Math.min(pageOffset + pageSize, pagedTotal).toLocaleString()} of {pagedTotal.toLocaleString()}
                              {pagedLoading && <span className="ml-1 italic">loading…</span>}
                            </span>
                          ) : (
                          <span className="shrink-0">
                            Rows: <span className="font-semibold text-foreground">{displayedRows.length.toLocaleString()}</span>
                            {' '}of{' '}
                            <span className="font-semibold text-foreground">{filteredTableData.length.toLocaleString()}</span>
                          </span>
                          )}
                          {dataSearchQuery && currentTableData.length !== filteredTableData.length && (
                            <Badge variant="outline" className="text-[8px] px-1 py-0 h-3.5 gap-0.5 border-amber-300/60 dark:border-amber-700/40 text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 shrink-0">
                              <Search className="h-2 w-2" />
                              filtered from {currentTableData.length.toLocaleString()}
                            </Badge>
                          )}
                        </div>
                        {isPaged && (
                          <div className="flex items-center gap-1 shrink-0">
                            <select
                              className="h-5 text-[10px] border rounded bg-background px-1"
                              value={pageSize}
                              onChange={(e) => { setPageSize(Number(e.target.value)); setPageOffset(0) }}
                              aria-label="Rows per page"
                            >
                              {[50, 100, 250, 500].map(n => <option key={n} value={n}>{n} / page</option>)}
                            </select>
                            <Button variant="outline" size="sm" className="h-5 text-[10px] px-2" disabled={pageOffset === 0 || pagedLoading}
                              onClick={() => setPageOffset(o => Math.max(0, o - pageSize))}>Prev</Button>
                            <Button variant="outline" size="sm" className="h-5 text-[10px] px-2" disabled={pageOffset + pageSize >= pagedTotal || pagedLoading}
                              onClick={() => setPageOffset(o => o + pageSize)}>Next</Button>
                          </div>
                        )}
                        {hasMoreRows && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-[10px] h-6 shrink-0"
                            onClick={() => setVisibleRows(prev => prev + 20)}
                          >
                            Load more ({filteredTableData.length - visibleRows} remaining)
                            <ChevronDown className="ml-1 h-2.5 w-2.5" />
                          </Button>
                        )}
                      </div>
                    </>
                  )}
                </div>
              </div>
            </TabsContent>

            {/* ─── SQL Tab ─── */}
            <TabsContent value="sql" className="flex-1 overflow-hidden m-0">
              <div className="flex flex-col h-full">
                {/* SQL Editor */}
                <div className="flex-1 flex flex-col min-h-0">
                  <div className="px-3 py-1.5 border-b flex items-center justify-between shrink-0 bg-muted/30">
                    <span className="text-[10px] font-medium text-muted-foreground">SQL Editor</span>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-5 text-[9px] gap-0.5 px-1.5"
                        onClick={generateAIQL}
                        title="Ask AI to generate SQL"
                      >
                        <Wand2 className="h-2.5 w-2.5" />
                        AI Generate
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-5 text-[9px] gap-0.5 px-1.5"
                        onClick={() => setSqlEditor(generateSchemaSQL())}
                      >
                        <Code2 className="h-2.5 w-2.5" />
                        Schema
                      </Button>
                    </div>
                  </div>
                  <div className="flex-1 relative">
                    <textarea
                      value={sqlEditor}
                      onChange={(e) => setSqlEditor(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                          e.preventDefault()
                          executeSQL(sqlEditor)
                        }
                      }}
                      placeholder="-- Write SQL here... (Ctrl+Enter to execute)&#10;SELECT * FROM users LIMIT 10;"
                      className="w-full h-full p-3 text-[12px] font-mono bg-background resize-none focus:outline-none leading-relaxed"
                      spellCheck={false}
                    />
                  </div>
                </div>

                {/* SQL toolbar */}
                <div className="px-3 py-1.5 border-t flex items-center gap-1.5 bg-muted/30 shrink-0">
                  <Button
                    variant="default"
                    size="sm"
                    className="h-6 text-[10px] gap-1 bg-gradient-to-r from-amber-600 to-red-600 hover:from-amber-700 hover:to-red-700 text-white"
                    onClick={() => executeSQL(sqlEditor)}
                    disabled={sqlExecuting || !sqlEditor.trim()}
                  >
                    {sqlExecuting ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : <Play className="h-2.5 w-2.5" />}
                    Run
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-6 text-[10px] gap-1"
                    onClick={() => copyToClipboard(sqlEditor || generateSchemaSQL())}
                  >
                    <Copy className="h-2.5 w-2.5" />
                    Copy
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-6 text-[10px] gap-1"
                    onClick={() => {
                      const content = sqlEditor || generateSchemaSQL()
                      const blob = new Blob([content], { type: 'text/sql' })
                      const url = URL.createObjectURL(blob)
                      const a = document.createElement('a')
                      a.href = url
                      a.download = `${databaseName || 'schema'}.sql`
                      a.click()
                      URL.revokeObjectURL(url)
                    }}
                  >
                    <Download className="h-2.5 w-2.5" />
                    Download
                  </Button>

                  <div className="flex-1" />

                  {/* Query history dropdown */}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="sm" className="h-6 text-[10px] gap-0.5">
                        <History className="h-2.5 w-2.5" />
                        History ({queryHistory.length})
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-80">
                      {queryHistory.length === 0 ? (
                        <DropdownMenuItem disabled>No queries yet</DropdownMenuItem>
                      ) : (
                        <>
                          {queryHistory.map((q, i) => (
                            <DropdownMenuItem key={i} onClick={() => setSqlEditor(q)}>
                              <code className="text-[10px] truncate max-w-[260px] flex-1">{q}</code>
                            </DropdownMenuItem>
                          ))}
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className="text-destructive focus:text-destructive"
                            onClick={() => {
                              setQueryHistory([])
                              toast.success('Query history cleared')
                            }}
                          >
                            <Trash2 className="h-3 w-3 mr-2" />
                            Clear History
                          </DropdownMenuItem>
                        </>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>

                  {/* Saved queries */}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 text-[10px] gap-0.5"
                      >
                        <Save className="h-2.5 w-2.5" />
                        Saved ({savedQueries.length})
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-80">
                      <DropdownMenuItem
                        disabled={!sqlEditor.trim()}
                        onClick={saveCurrentQuery}
                      >
                        <Plus className="h-3 w-3 mr-2" />
                        Save Current Query
                        <kbd className="ml-auto px-1.5 py-0.5 text-[9px] font-mono rounded border bg-muted text-muted-foreground">⌘⇧S</kbd>
                      </DropdownMenuItem>
                      {savedQueries.length > 0 && <DropdownMenuSeparator />}
                      {savedQueries.length === 0 ? (
                        <DropdownMenuItem disabled>No saved queries yet</DropdownMenuItem>
                      ) : (
                        savedQueries.map((sq, i) => (
                          <div key={i} className="group flex items-center px-2 py-1.5 hover:bg-accent rounded-sm cursor-pointer" onClick={() => setSqlEditor(sq.sql)}>
                            <span className="text-[10px] font-medium mr-2 truncate max-w-[100px]">{sq.name}</span>
                            <code className="text-[9px] text-muted-foreground truncate flex-1 max-w-[140px]">{sq.sql}</code>
                            <button
                              className="ml-1 opacity-0 group-hover:opacity-100 text-destructive hover:text-destructive/80 transition-opacity shrink-0"
                              onClick={(e) => {
                                e.stopPropagation()
                                setSavedQueries(prev => prev.filter((_, idx) => idx !== i))
                                toast.success(`Deleted "${sq.name}"`)
                              }}
                              title="Delete saved query"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </div>
                        ))
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>

                {/* SQL Results */}
                {sqlResults && (
                  <div className="border-t max-h-64 overflow-auto shrink-0">
                    <div className="px-3 py-1 border-b bg-muted/30 flex items-center justify-between sticky top-0 z-10">
                      <span className="text-[10px] font-medium text-muted-foreground">
                        Results ({sqlResults.rows.length} rows · {sqlResults.executionTime}ms)
                      </span>
                      {sqlResults.truncated && (
                        <span className="text-[10px] text-amber-700 dark:text-amber-400 mx-2 truncate">
                          Showing first 1,000 of {(sqlResults.totalRows ?? sqlResults.rows.length).toLocaleString()} rows — add LIMIT/WHERE or export for the full result.
                        </span>
                      )}
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-5 text-[9px] gap-0.5 px-1"
                          onClick={() => exportAsCSV(sqlResults.rows, 'query_results.csv')}
                        >
                          <Download className="h-2.5 w-2.5" />
                          CSV
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-5 text-[9px] gap-0.5 px-1"
                          onClick={() => exportAsJSON(sqlResults.rows, 'query_results.json')}
                        >
                          <Download className="h-2.5 w-2.5" />
                          JSON
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-5 w-5 p-0"
                          onClick={() => setSqlResults(null)}
                        >
                          <X className="h-2.5 w-2.5" />
                        </Button>
                      </div>
                    </div>
                    <table className="w-full text-[11px] border-collapse">
                      <thead className="sticky top-[33px] z-10 bg-background">
                        <tr className="border-b">
                          {sqlResults.columns.map((col) => (
                            <th key={col} className="text-left py-1 px-2 font-medium text-muted-foreground bg-muted/50 whitespace-nowrap">
                              {col}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {sqlResults.rows.slice(0, 100).map((row, i) => (
                          <tr key={i} className="border-b hover:bg-muted/30">
                            {sqlResults.columns.map((col) => (
                              <td key={col} className="py-1 px-2 font-mono text-[10px] whitespace-nowrap max-w-[200px] truncate">
                                {row[col] === null ? <span className="italic text-muted-foreground">NULL</span> : String(row[col] ?? '')}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </TabsContent>

            {/* ─── Explorer Tab ─── */}
            <TabsContent value="explorer" className="flex-1 overflow-hidden m-0">
              <div className="flex h-full">
                {/* Schema tree sidebar */}
                <div className="w-56 border-r bg-muted/30 flex flex-col shrink-0 overflow-hidden">
                  <div className="px-2 py-1.5 border-b shrink-0">
                    <p className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wider">Schema Tree</p>
                  </div>
                  <ScrollArea className="flex-1 min-h-0 p-1.5">
                    <div className="space-y-1.5">
                      {generatedSchema.map((table) => {
                        const tableData = generatedData[table.name] as Record<string, unknown>[] | undefined
                        const isFav = favoriteTables.has(table.name)
                        return (
                          <div key={table.name} className="rounded border bg-card overflow-hidden">
                            <div className="px-2 py-1 bg-muted/50 flex items-center gap-1.5 border-b">
                              <Table2 className="h-2.5 w-2.5 text-amber-600" />
                              <span className="text-[10px] font-semibold">{table.name}</span>
                              <Badge variant="outline" className="text-[7px] ml-auto px-0.5 py-0">
                                {rowCountFor(table.name).toLocaleString()} rows
                              </Badge>
                              <button
                                onClick={() => {
                                  setFavoriteTables(prev => {
                                    const next = new Set(prev)
                                    if (next.has(table.name)) next.delete(table.name)
                                    else next.add(table.name)
                                    return next
                                  })
                                }}
                                className="ml-0.5"
                              >
                                {isFav ? (
                                  <Star className="h-2.5 w-2.5 text-amber-500 fill-amber-500" />
                                ) : (
                                  <StarOff className="h-2.5 w-2.5 text-muted-foreground/50" />
                                )}
                              </button>
                            </div>
                            <div className="p-1 space-y-px">
                              {table.columns.map((col) => (
                                <div key={col.name} className="flex items-center justify-between px-1 py-px rounded text-[9px] hover:bg-muted/50">
                                  <div className="flex items-center gap-0.5">
                                    {col.name === 'id' && (
                                      <Badge variant="secondary" className="text-[6px] px-0.5 py-0 bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">PK</Badge>
                                    )}
                                    {col.name.endsWith('_id') && col.name !== 'id' && (
                                      <Badge variant="secondary" className="text-[6px] px-0.5 py-0 bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400">FK</Badge>
                                    )}
                                    <span className="font-mono">{col.name}</span>
                                  </div>
                                  <span className="text-muted-foreground font-mono text-[8px]">{col.type}</span>
                                </div>
                              ))}
                            </div>
                            {/* Quick preview */}
                            {tableData && tableData.length > 0 && (
                              <button
                                onClick={() => { setSelectedTable(table.name); setActiveTab('data'); setVisibleRows(20) }}
                                className="w-full px-2 py-1 text-[9px] text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950/30 border-t transition-colors"
                              >
                                Preview first 5 rows →
                              </button>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </ScrollArea>
                </div>

                {/* ER Diagram visualization */}
                <div className="flex-1 relative overflow-hidden bg-muted/10">
                  {/* Zoom controls */}
                  <div className="absolute top-2 right-2 z-10 flex items-center gap-1 bg-card border rounded-lg px-1.5 py-1 shadow-sm">
                    <Button variant="ghost" size="sm" className="h-5 w-5 p-0" onClick={() => setExplorerZoom(z => Math.max(0.3, z - 0.2))}>
                      <ZoomOut className="h-3 w-3" />
                    </Button>
                    <span className="text-[9px] font-mono min-w-[32px] text-center">{Math.round(explorerZoom * 100)}%</span>
                    <Button variant="ghost" size="sm" className="h-5 w-5 p-0" onClick={() => setExplorerZoom(z => Math.min(2, z + 0.2))}>
                      <ZoomIn className="h-3 w-3" />
                    </Button>
                    <Button variant="ghost" size="sm" className="h-5 w-5 p-0" onClick={() => { setExplorerZoom(1); setExplorerPan({ x: 0, y: 0 }) }}>
                      <Move className="h-3 w-3" />
                    </Button>
                  </div>

                  <div
                    className="w-full h-full overflow-auto cursor-grab active:cursor-grabbing"
                    onMouseDown={(e) => {
                      setIsPanning(true)
                      setPanStart({ x: e.clientX - explorerPan.x, y: e.clientY - explorerPan.y })
                    }}
                    onMouseMove={(e) => {
                      if (isPanning) {
                        setExplorerPan({
                          x: e.clientX - panStart.x,
                          y: e.clientY - panStart.y,
                        })
                      }
                    }}
                    onMouseUp={() => setIsPanning(false)}
                    onMouseLeave={() => setIsPanning(false)}
                  >
                    <svg
                      width={svgWidth}
                      height={svgHeight}
                      style={{
                        transform: `translate(${explorerPan.x}px, ${explorerPan.y}px) scale(${explorerZoom})`,
                        transformOrigin: '0 0',
                      }}
                    >
                      {/* SVG defs for arrowheads */}
                      <defs>
                        {/* Arrow pointing to the "many" side (filled triangle) */}
                        <marker id="arrowhead-many" markerWidth="12" markerHeight="8" refX="12" refY="4" orient="auto" markerUnits="strokeWidth">
                          <path d="M0,0 L12,4 L0,8 L3,4 Z" fill="#8b5cf6" />
                        </marker>
                        {/* "One" indicator — single perpendicular line */}
                        <marker id="arrowhead-one" markerWidth="8" markerHeight="12" refX="4" refY="6" orient="auto" markerUnits="strokeWidth">
                          <line x1="4" y1="0" x2="4" y2="12" stroke="#8b5cf6" strokeWidth="2" />
                        </marker>
                        {/* Crow's foot for "many" side */}
                        <marker id="crowfoot-many" markerWidth="14" markerHeight="14" refX="14" refY="7" orient="auto" markerUnits="strokeWidth">
                          <line x1="0" y1="0" x2="14" y2="7" stroke="#8b5cf6" strokeWidth="1.5" />
                          <line x1="0" y1="14" x2="14" y2="7" stroke="#8b5cf6" strokeWidth="1.5" />
                          <line x1="0" y1="7" x2="14" y2="7" stroke="#8b5cf6" strokeWidth="1.5" />
                        </marker>
                        {/* Simple filled arrow for the "to" end */}
                        <marker id="arrow-filled" markerWidth="10" markerHeight="7" refX="10" refY="3.5" orient="auto" markerUnits="strokeWidth">
                          <polygon points="0,0 10,3.5 0,7" fill="#7c3aed" />
                        </marker>
                      </defs>

                      {/* Render relationship lines with arrows and labels */}
                      {erLayout.edges.map((edge, i) => {
                        const fromNode = erLayout.nodes.find(n => n.name === edge.from)
                        const toNode = erLayout.nodes.find(n => n.name === edge.to)
                        if (!fromNode || !toNode) return null

                        // Calculate edge endpoints at node borders
                        const fromNodeWidth = 200
                        const fromHeaderHeight = 24
                        const fromColHeight = 14
                        const fromNodeHeight = fromHeaderHeight + Math.min(fromNode.schema.columns.length, 8) * fromColHeight + 8

                        const toNodeWidth = 200
                        const toHeaderHeight = 24
                        const toColHeight = 14
                        const toNodeHeight = toHeaderHeight + Math.min(toNode.schema.columns.length, 8) * toColHeight + 8

                        const fromCenterX = fromNode.x + fromNodeWidth / 2
                        const fromCenterY = fromNode.y + fromNodeHeight / 2
                        const toCenterX = toNode.x + toNodeWidth / 2
                        const toCenterY = toNode.y + toNodeHeight / 2

                        // Calculate intersection points with node rectangles
                        const dx = toCenterX - fromCenterX
                        const dy = toCenterY - fromCenterY

                        // Determine from edge point
                        let fromX: number, fromY: number
                        if (Math.abs(dx) * fromNodeHeight > Math.abs(dy) * fromNodeWidth) {
                          // Exit from left or right side
                          fromX = dx > 0 ? fromNode.x + fromNodeWidth : fromNode.x
                          fromY = fromCenterY + (fromX - fromCenterX) * (dy / dx)
                        } else {
                          // Exit from top or bottom
                          fromY = dy > 0 ? fromNode.y + fromNodeHeight : fromNode.y
                          fromX = fromCenterX + (fromY - fromCenterY) * (dx / dy)
                        }

                        // Determine to edge point
                        let toX: number, toY: number
                        if (Math.abs(dx) * toNodeHeight > Math.abs(dy) * toNodeWidth) {
                          toX = dx > 0 ? toNode.x : toNode.x + toNodeWidth
                          toY = toCenterY + (toX - toCenterX) * (dy / dx)
                        } else {
                          toY = dy > 0 ? toNode.y : toNode.y + toNodeHeight
                          toX = toCenterX + (toY - toCenterY) * (dx / dy)
                        }

                        // Check if the FK column is optional (nullable) — for line style
                        const fkColumn = fromNode.schema.columns.find(c => c.name === edge.fromCol)
                        const isOptional = fkColumn?.type?.toLowerCase().includes('null') || false

                        // Midpoint for label
                        const midX = (fromX + toX) / 2
                        const midY = (fromY + toY) / 2

                        // Edge label background rect
                        const labelText = edge.fromCol
                        const labelWidth = labelText.length * 5.5 + 8
                        const labelHeight = 12

                        return (
                          <g key={`edge-${i}`}>
                            {/* Background line (wider, semi-transparent for glow effect) */}
                            <line
                              x1={fromX}
                              y1={fromY}
                              x2={toX}
                              y2={toY}
                              stroke="#8b5cf6"
                              strokeWidth={4}
                              strokeDasharray={isOptional ? '8 4' : 'none'}
                              opacity={0.15}
                            />
                            {/* Main connection line */}
                            <line
                              x1={fromX}
                              y1={fromY}
                              x2={toX}
                              y2={toY}
                              stroke="#7c3aed"
                              strokeWidth={2}
                              strokeDasharray={isOptional ? '8 4' : 'none'}
                              markerEnd="url(#arrow-filled)"
                            />

                            {/* FK column label at midpoint */}
                            <rect
                              x={midX - labelWidth / 2}
                              y={midY - labelHeight / 2 - 9}
                              width={labelWidth}
                              height={labelHeight}
                              rx={3}
                              fill="#ffffff"
                              stroke="#8b5cf6"
                              strokeWidth={0.8}
                            />
                            <text
                              x={midX}
                              y={midY - 3}
                              textAnchor="middle"
                              fill="#6d28d9"
                              fontSize={7}
                              fontWeight={500}
                              fontFamily="monospace"
                            >
                              {labelText}
                            </text>

                            {/* "1" label at the "one" end (near toNode/target) */}
                            <text
                              x={toX + (fromX - toX) * 0.1}
                              y={toY + (fromY - toY) * 0.1 - 5}
                              textAnchor="middle"
                              fill="#7c3aed"
                              fontSize={10}
                              fontWeight={700}
                            >
                              1
                            </text>

                            {/* "N" label at the "many" end (near fromNode/source) */}
                            <text
                              x={fromX + (toX - fromX) * 0.1}
                              y={fromY + (toY - fromY) * 0.1 - 5}
                              textAnchor="middle"
                              fill="#7c3aed"
                              fontSize={10}
                              fontWeight={700}
                            >
                              N
                            </text>
                          </g>
                        )
                      })}

                      {/* Render table nodes */}
                      {erLayout.nodes.map((node) => {
                        const isFav = favoriteTables.has(node.name)
                        const headerHeight = 24
                        const colHeight = 14
                        const nodeWidth = 200
                        const nodeHeight = headerHeight + Math.min(node.schema.columns.length, 8) * colHeight + 8

                        return (
                          <g
                            key={node.name}
                            onClick={() => { setSelectedTable(node.name); setActiveTab('data'); setVisibleRows(20) }}
                            className="cursor-pointer"
                          >
                            {/* Shadow */}
                            <rect
                              x={node.x + 2}
                              y={node.y + 2}
                              width={nodeWidth}
                              height={nodeHeight}
                              rx={6}
                              fill="rgba(0,0,0,0.08)"
                            />
                            {/* Main box */}
                            <rect
                              x={node.x}
                              y={node.y}
                              width={nodeWidth}
                              height={nodeHeight}
                              rx={6}
                              fill="#ffffff"
                              stroke={selectedTable === node.name ? '#d97706' : '#f59e0b'}
                              strokeWidth={selectedTable === node.name ? 2.5 : 1}
                            />
                            {/* Header */}
                            <rect
                              x={node.x}
                              y={node.y}
                              width={nodeWidth}
                              height={headerHeight}
                              rx={6}
                              fill="#fef3c7"
                            />
                            <rect
                              x={node.x}
                              y={node.y + headerHeight - 6}
                              width={nodeWidth}
                              height={6}
                              fill="#fef3c7"
                            />
                            {/* Table name */}
                            <text
                              x={node.x + 10}
                              y={node.y + 16}
                              fill="#92400e"
                              fontSize={10}
                              fontWeight={700}
                            >
                              {isFav && '★ '}{node.name}
                            </text>
                            {/* Row count badge */}
                            <text
                              x={node.x + nodeWidth - 10}
                              y={node.y + 16}
                              textAnchor="end"
                              fill="#6b7280"
                              fontSize={8}
                            >
                              {rowCountFor(node.name).toLocaleString()} rows
                            </text>
                            {/* Columns */}
                            {node.schema.columns.slice(0, 8).map((col, ci) => (
                              <g key={col.name}>
                                <text
                                  x={node.x + 10}
                                  y={node.y + headerHeight + 10 + ci * colHeight}
                                  fill={col.name === 'id' || col.name.endsWith('_id') ? '#b45309' : '#374151'}
                                  fontSize={8}
                                  fontFamily="monospace"
                                >
                                  {col.name === 'id' ? '🔑 ' : col.name.endsWith('_id') ? '🔗 ' : ''}{col.name}
                                </text>
                                <text
                                  x={node.x + nodeWidth - 10}
                                  y={node.y + headerHeight + 10 + ci * colHeight}
                                  textAnchor="end"
                                  fill="#9ca3af"
                                  fontSize={7}
                                  fontFamily="monospace"
                                >
                                  {col.type}
                                </text>
                              </g>
                            ))}
                            {node.schema.columns.length > 8 && (
                              <text
                                x={node.x + 10}
                                y={node.y + headerHeight + 10 + 8 * colHeight}
                                fill="#9ca3af"
                                fontSize={7}
                              >
                                +{node.schema.columns.length - 8} more columns...
                              </text>
                            )}
                          </g>
                        )
                      })}
                    </svg>
                  </div>

                  {Object.keys(generatedData).length <= 1 && (
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                      <div className="text-center text-muted-foreground">
                        <GitBranch className="h-6 w-6 mx-auto mb-1.5 opacity-20" />
                        <p className="text-[10px]">ER diagram appears with</p>
                        <p className="text-[10px]">multiple connected tables</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </TabsContent>
          </Tabs>
        ) : (
          /* Empty state */
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center max-w-sm px-4">
              <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-amber-100 to-red-100 dark:from-amber-900/30 dark:to-red-900/30 flex items-center justify-center mx-auto mb-3">
                <Database className="h-7 w-7 text-amber-600" />
              </div>
              <h3 className="text-base font-semibold mb-1.5">No Data Generated Yet</h3>
              <p className="text-xs text-muted-foreground mb-3">
                Describe the database you need in the AI chat, and I&apos;ll design the schema and generate realistic data.
              </p>
              <div className="flex flex-wrap gap-1.5 justify-center">
                {[
                  'E-commerce with users, orders, products',
                  'Hospital management system',
                  'Social media platform',
                  'SaaS subscription billing',
                ].map((example) => (
                  <button
                    key={example}
                    onClick={() => setInput(example)}
                    className="text-[10px] px-2 py-1 rounded-full border bg-card hover:bg-accent transition-colors"
                  >
                    {example}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
      ) : null}

      {/* Floating "Show Panel" button — only rendered when the right panel
          is collapsed. Anchored to the top-right of the studio container. */}
      {!panelVisible && !isMobile && (
        <Button
          variant="outline"
          size="sm"
          className="absolute right-4 top-4 h-8 gap-1.5 shadow-md bg-card hover:bg-accent z-20"
          onClick={() => setPanelVisible(true)}
          title="Show Panel (⌘B)"
        >
          <PanelRightOpen className="h-3.5 w-3.5" />
          Show Panel
        </Button>
      )}

      {/* SQL Confirmation Dialog */}
      <Dialog open={sqlConfirmOpen} onOpenChange={setSqlConfirmOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              Confirm Destructive Operation
            </DialogTitle>
            <DialogDescription>
              This SQL statement may modify or delete data. Please review it carefully before proceeding.
            </DialogDescription>
          </DialogHeader>
          <pre className="bg-muted p-3 rounded-lg text-xs font-mono overflow-auto max-h-40">
            {sqlConfirmQuery}
          </pre>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSqlConfirmOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                setSqlConfirmOpen(false)
                executeSQL(sqlConfirmQuery, true)
              }}
            >
              Execute Anyway
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Table Dialog */}
      <Dialog open={addTableDialogOpen} onOpenChange={setAddTableDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Table2 className="h-5 w-5 text-amber-600" />
              Add Table
            </DialogTitle>
            <DialogDescription>
              Create a new empty table in your database.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium mb-1 block">Table Name</label>
              <Input
                value={newTableName}
                onChange={(e) => setNewTableName(e.target.value)}
                placeholder="e.g., orders"
                className="h-8 text-sm"
                onKeyDown={(e) => { if (e.key === 'Enter') handleAddTable() }}
              />
            </div>
            <div>
              <label className="text-xs font-medium mb-1 block">Columns (comma-separated, optional)</label>
              <Input
                value={newTableColumns}
                onChange={(e) => setNewTableColumns(e.target.value)}
                placeholder="e.g., id, name, email, created_at"
                className="h-8 text-sm"
                onKeyDown={(e) => { if (e.key === 'Enter') handleAddTable() }}
              />
              <p className="text-[10px] text-muted-foreground mt-1">An "id" column is auto-added if not specified</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddTableDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleAddTable} disabled={!newTableName.trim()} className="bg-gradient-to-r from-amber-600 to-red-600 hover:from-amber-700 hover:to-red-700 text-white">
              Create Table
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Regenerate Data Confirmation ───
          AlertDialog (not a plain Dialog) so it blocks interaction with the
          rest of the studio until the user confirms or cancels. The
          destructive action button calls regenerateData() which clears all
          existing rows and re-runs the streaming generation pipeline with
          the same schema + per-table row counts. */}
      <AlertDialog open={regenerateConfirmOpen} onOpenChange={setRegenerateConfirmOpen}>
        <AlertDialogContent className="sm:max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <RefreshCw className="h-5 w-5 text-amber-600" />
              Regenerate Data?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This will replace all existing data with new synthetic data. The current schema
              ({schemaStats.tableCount} table{schemaStats.tableCount === 1 ? '' : 's'},{' '}
              {schemaStats.rowCount.toLocaleString()} row{schemaStats.rowCount === 1 ? '' : 's'}) and per-table
              row counts will be preserved, but every row will be regenerated with fresh values.
              <br /><br />
              <span className="text-amber-700 dark:text-amber-400 font-medium">This action cannot be undone.</span> Save
              your current database first if you want to keep this dataset.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-gradient-to-r from-amber-600 to-red-600 hover:from-amber-700 hover:to-red-700 text-white border-0"
              onClick={(e) => {
                e.preventDefault()
                void regenerateData()
              }}
            >
              <RefreshCw className="h-4 w-4 mr-1.5" />
              Regenerate Data
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Add Column Dialog */}
      <Dialog open={addColumnDialogOpen} onOpenChange={setAddColumnDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="h-5 w-5 text-amber-600" />
              Add Column to "{selectedTable}"
            </DialogTitle>
            <DialogDescription>
              Add a new column to the selected table.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium mb-1 block">Column Name</label>
              <Input
                value={newColumnName}
                onChange={(e) => setNewColumnName(e.target.value)}
                placeholder="e.g., phone"
                className="h-8 text-sm"
                onKeyDown={(e) => { if (e.key === 'Enter') handleAddColumn() }}
              />
            </div>
            <div>
              <label className="text-xs font-medium mb-1 block">Data Type</label>
              <select
                value={newColumnType}
                onChange={(e) => setNewColumnType(e.target.value)}
                className="w-full h-8 text-sm border rounded-md px-2 bg-background"
              >
                <option value="varchar(255)">VARCHAR(255)</option>
                <option value="integer">INTEGER</option>
                <option value="decimal">DECIMAL</option>
                <option value="boolean">BOOLEAN</option>
                <option value="timestamp">TIMESTAMP</option>
                <option value="uuid">UUID</option>
                <option value="text">TEXT</option>
              </select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddColumnDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleAddColumn} disabled={!newColumnName.trim()} className="bg-gradient-to-r from-amber-600 to-red-600 hover:from-amber-700 hover:to-red-700 text-white">
              Add Column
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Clear Chat confirmation ─── */}
      {/* Triggered by the Eraser button in the chat header. Uses AlertDialog so
          the user must explicitly confirm before the message list is wiped
          (prevents accidental loss of an in-progress conversation). The
          schema/data/connection are preserved — only messages are reset. */}
      <AlertDialog open={clearChatOpen} onOpenChange={setClearChatOpen}>
        <AlertDialogContent className="sm:max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Eraser className="h-4 w-4 text-rose-600" />
              Clear chat?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This removes all messages from the current chat and starts a fresh
              greeting. Your generated schema, data, and database connection
              will be preserved.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                clearChat()
                setClearChatOpen(false)
              }}
              className="bg-gradient-to-r from-rose-600 to-red-600 hover:from-rose-700 hover:to-red-700 text-white"
            >
              Clear chat
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ─── Keyboard Shortcuts Help Dialog ─── */}
      {/* Opened via Cmd/Ctrl + / (or the Keyboard icon in the chat header).
          Lists every shortcut grouped by category. ESC closes (handled both
          by Radix's default and the global keydown listener above). */}
      <Dialog open={showShortcuts} onOpenChange={setShowShortcuts}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Keyboard className="h-5 w-5 text-amber-600" />
              Keyboard Shortcuts
            </DialogTitle>
            <DialogDescription>
              Speed up your workflow with these shortcuts. Use <kbd className="px-1.5 py-0.5 text-[10px] font-mono rounded border bg-muted text-muted-foreground">⌘</kbd> on macOS or <kbd className="px-1.5 py-0.5 text-[10px] font-mono rounded border bg-muted text-muted-foreground">Ctrl</kbd> on Windows/Linux.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-1">
            {/* Chat */}
            <div>
              <h4 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-2">Chat</h4>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-sm">Send Message</span>
                  <kbd className="px-2 py-1 text-xs font-mono rounded border bg-muted text-muted-foreground">⌘↵</kbd>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm">New Chat</span>
                  <kbd className="px-2 py-1 text-xs font-mono rounded border bg-muted text-muted-foreground">⌘K</kbd>
                </div>
              </div>
            </div>

            {/* Data */}
            <div>
              <h4 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-2">Data</h4>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-sm">Data Tab</span>
                  <kbd className="px-2 py-1 text-xs font-mono rounded border bg-muted text-muted-foreground">⌘1</kbd>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm">SQL Tab</span>
                  <kbd className="px-2 py-1 text-xs font-mono rounded border bg-muted text-muted-foreground">⌘2</kbd>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm">Explorer Tab</span>
                  <kbd className="px-2 py-1 text-xs font-mono rounded border bg-muted text-muted-foreground">⌘3</kbd>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm">Save Query</span>
                  <kbd className="px-2 py-1 text-xs font-mono rounded border bg-muted text-muted-foreground">⌘⇧S</kbd>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm">Export Database</span>
                  <kbd className="px-2 py-1 text-xs font-mono rounded border bg-muted text-muted-foreground">⌘⇧E</kbd>
                </div>
              </div>
            </div>

            {/* View */}
            <div>
              <h4 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-2">View</h4>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-sm">Toggle Panel</span>
                  <kbd className="px-2 py-1 text-xs font-mono rounded border bg-muted text-muted-foreground">⌘B</kbd>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm">Shortcuts</span>
                  <kbd className="px-2 py-1 text-xs font-mono rounded border bg-muted text-muted-foreground">⌘/</kbd>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm">Close Dialog</span>
                  <kbd className="px-2 py-1 text-xs font-mono rounded border bg-muted text-muted-foreground">Esc</kbd>
                </div>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button
              onClick={() => setShowShortcuts(false)}
              className="bg-gradient-to-r from-amber-600 to-red-600 hover:from-amber-700 hover:to-red-700 text-white"
            >
              Got it
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// Default export with Suspense boundary for useSearchParams
export default function StudioPage(props: StudioPageProps) {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center h-[calc(100vh-44px)] bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-amber-600" />
      </div>
    }>
      <StudioPageInner {...props} />
    </Suspense>
  )
}
