'use client'

import { useState, useRef, useEffect, useCallback, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
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
  Loader2,
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
  Plus,
  FileJson,
  FileSpreadsheet,
  FileText,
  AlertTriangle,
  PlugZap,
  RefreshCw,
  PanelRightOpen,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { apiPost, apiPatch, apiDelete, apiGet, invalidateCache } from '@/lib/api-client'
import {
  parseAgentStatus,
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
import type {
  Message,
  SchemaTable,
  SavedConversation,
  SavedQuery,
  StudioPageProps,
  GenerationProgress,
} from './_lib/types'
import { INITIAL_GREETING, QUICK_PROMPTS } from './_lib/constants'
import {
  MAX_CONVERSATIONS,
  loadSavedConversations,
  persistSavedConversations,
  generateConversationTitle,
} from './_lib/conversation-storage'
import {
  loadQueryHistory,
  saveQueryHistory,
  loadSavedQueries,
  saveSavedQueries,
} from './_lib/query-storage'
import {
  exportAsCSV,
  exportAsJSON,
  exportAsSQL,
  parseAIResponse,
  extractSchema,
  extractAllSqlBlocks,
  generateSchemaSQL as generateSchemaSQLHelper,
  computeERLayout as computeERLayoutHelper,
} from './_lib/utils'
import { AgentIcon } from './_components/agent-icon'
import { ChatHeader, type ConversationHistoryItem } from './_components/chat-header'
import { ShortcutsDialog } from './_components/shortcuts-dialog'
import { SchemaPreviewPanel } from './_components/schema-preview-panel'
import { DataTab } from './_components/data-tab'
import { SqlTab } from './_components/sql-tab'
import { ExplorerTab } from './_components/explorer-tab'
import { MessageBubble } from './_components/message-bubble'
import { ChatInput } from './_components/chat-input'
import {
  buildInitialGenerationProgress,
  applyProgressEvent,
  applyTableCompleteEvent,
  buildCompletedProgress,
  applyErrorEvent,
  formatProgressMessage,
  formatCompleteMessage,
  formatTableCompleteMessage,
} from './_lib/generation-helpers'


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
        : INITIAL_GREETING,
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
  const [sqlResults, setSqlResults] = useState<{ rows: Record<string, unknown>[]; columns: string[]; executionTime: number } | null>(null)
  const [sqlExecuting, setSqlExecuting] = useState(false)
  // Persist query history + saved queries to localStorage so they survive
  // page reloads. Previously these were in-memory only, so users lost their
  // saved queries every time they navigated away from the studio.
  const [queryHistory, setQueryHistory] = useState<string[]>(() => loadQueryHistory())
  const [savedQueries, setSavedQueries] = useState<SavedQuery[]>(() => loadSavedQueries())
  const [sqlConfirmOpen, setSqlConfirmOpen] = useState(false)
  const [sqlConfirmQuery, setSqlConfirmQuery] = useState('')

  // Persist query history + saved queries whenever they change
  useEffect(() => {
    saveQueryHistory(queryHistory)
  }, [queryHistory])
  useEffect(() => {
    saveSavedQueries(savedQueries)
  }, [savedQueries])

  // ─── Persist current conversation to history whenever messages change ───
  // Skips the initial greeting (no user messages) and mid-stream saves (a
  // message with isStreaming=true means the assistant is still generating).
  // Updates the existing conversation if activeConversationId is set, otherwise
  // creates a new entry. Keeps the list sorted by updatedAt desc and capped at
  // MAX_CONVERSATIONS (50).
  useEffect(() => {
    if (skipNextPersistRef.current) {
      skipNextPersistRef.current = false
      return
    }
    const hasUserMsg = messages.some(m => m.role === 'user')
    if (!hasUserMsg) return
    if (messages.some(m => m.isStreaming)) return

    const existingId = activeConversationIdRef.current
    const newId = existingId || (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`)
    const now = new Date().toISOString()
    const title = generateConversationTitle(messages)

    setConversations(prev => {
      const existing = prev.find(c => c.id === newId)
      // Skip if this exact entry was just written (no-op guard for re-renders
      // where the deps didn't actually change content).
      if (existing && existing.updatedAt === now) return prev
      const conv: SavedConversation = {
        id: newId,
        title,
        messages,
        schema: generatedSchema,
        data: generatedData,
        databaseName,
        databaseId: currentDatabaseId || null,
        createdAt: existing?.createdAt || now,
        updatedAt: now,
      }
      let next: SavedConversation[]
      if (existing) {
        next = prev.map(c => (c.id === newId ? conv : c))
      } else {
        next = [conv, ...prev]
      }
      // Keep most-recently-updated first; cap at MAX_CONVERSATIONS.
      next.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
      if (next.length > MAX_CONVERSATIONS) next = next.slice(0, MAX_CONVERSATIONS)
      persistSavedConversations(next)
      return next
    })

    // Register the new conversation id so subsequent updates patch this entry
    // instead of creating duplicates. Use the ref synchronously + state for any
    // UI that cares (e.g. highlighting the active item in the dropdown).
    if (!existingId) {
      activeConversationIdRef.current = newId
      setActiveConversationId(newId)
    }
  }, [messages, generatedSchema, generatedData, databaseName, currentDatabaseId])

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
  const chatInputRef = useRef<HTMLInputElement>(null)

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
          error?: string
        }>(`/api/connections/${connId}?include=introspect`, { cacheTtl: 0, force: true, timeout: 30000 })

        if (cancelled) return

        if (!result.connection) {
          toast.error('Connection not found')
          router.replace('/dashboard/connections')
          return
        }

        const conn = result.connection

        if (conn.status === 'failed') {
          toast.error(`Connection test failed: ${conn.error_message || 'unknown error'}`)
        }

        setActiveConnectionId(conn.id)
        setActiveConnectionName(conn.name)
        setActiveConnectionDialect(conn.dialect)

        if (result.schema && result.schema.length > 0) {
          setGeneratedSchema(result.schema)
        }
        if (result.data && Object.keys(result.data).length > 0) {
          setGeneratedData(result.data)
        }
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
          }
        }>(`/api/databases?id=${dbId}`, { cacheTtl: 0, force: true, timeout: 15000 })

        if (cancelled || !result.database) return

        setCurrentDatabaseId(result.database.id)
        setDatabaseName(result.database.name)
        if (Array.isArray(result.database.schema_json) && result.database.schema_json.length > 0) {
          setGeneratedSchema(result.database.schema_json)
        }
        if (result.database.data_json && Object.keys(result.database.data_json).length > 0) {
          setGeneratedData(result.database.data_json)
        }

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
  const sendMessage = useCallback(async (messageText?: string) => {
    const textToSend = messageText || input
    if (!textToSend.trim() || loadingRef.current) return

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

    try {
      const history = messagesRef.current
        .filter(m => m.role === 'user' || m.role === 'assistant')
        .map(m => ({ role: m.role, content: m.content }))

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
        try {
          const errBody = await response.json()
          if (errBody?.error) detail = errBody.error
          else if (errBody?.content) detail = errBody.content
        } catch {
          // Body wasn't JSON — keep the generic status message
        }
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

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          const trimmed = line.trim()
          if (!trimmed || !trimmed.startsWith('data: ')) continue

          const data = trimmed.slice(6)
          try {
            const parsed = JSON.parse(data)

            if (parsed.type === 'reasoning') {
              fullReasoning += parsed.content
              setCurrentReasoning(fullReasoning)
              setMessages(prev => prev.map(m =>
                m.id === assistantId
                  ? { ...m, reasoningContent: fullReasoning }
                  : m
              ))
            } else if (parsed.type === 'content') {
              fullContent += parsed.content

              // Parse for agent status updates
              const agentStatus = parseAgentStatus(fullContent)
              if (agentStatus) {
                lastAgentStatus = agentStatus
                lastAgentName = agentStatus.agent
              }

              // Parse for interactive options (all of them, use last)
              const allOptions = parseAllInteractiveOptions(fullContent)
              if (allOptions.length > 0) {
                lastInteractiveOptions = allOptions[allOptions.length - 1]
              }

              // During streaming, store raw content but display cleaned version
              setMessages(prev => prev.map(m =>
                m.id === assistantId
                  ? {
                    ...m,
                    content: fullContent,
                    agentName: lastAgentName,
                    agentStatus: lastAgentStatus,
                    interactiveOptions: lastInteractiveOptions,
                  }
                  : m
              ))
            } else if (parsed.type === 'done' || parsed.type === 'finish') {
              setMessages(prev => prev.map(m =>
                m.id === assistantId
                  ? { ...m, isStreaming: false }
                  : m
              ))
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
        let displayText = fullContent.replace(/```sql\s*\n[\s\S]*?\n?```/gi, '').trim()

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
              // Explicitly null in live mode — option buttons shouldn't
              // appear here even if the AI emits them by mistake.
              interactiveOptions: null,
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
            for (let idx = 0; idx < sqlBlocks.length; idx++) {
              const block = sqlBlocks[idx]
              const stripped = stripSqlComments(block).trim()
              const firstVerb = stripped.split(/\s+/)[0]?.toUpperCase() || ''
              const isReadOnly =
                firstVerb === 'SELECT' ||
                firstVerb === 'WITH' ||
                firstVerb === 'SHOW' ||
                firstVerb === 'DESCRIBE' ||
                firstVerb === 'EXPLAIN'

              if (isReadOnly && !isDestructiveSQL(block)) {
                // Auto-run reads immediately, no confirmation
                await executeSqlBlockRef.current(assistantId, block, true)
              } else {
                // For DDL/INSERT/UPDATE/DELETE: show a confirmation dialog.
                // If there are multiple blocks, batch them so the user
                // doesn't get N dialogs — instead they get one dialog per
                // block but can quickly click through.
                // We pass skipConfirm=false so executeSqlBlock shows the
                // native confirm() dialog.
                await executeSqlBlockRef.current(assistantId, block, false)
              }
            }
          }
          // Kick off the sequential execution in the background.
          // Don't await — we want the chat to remain responsive.
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

      setMessages(prev => [
        ...prev.filter(m => m.id !== assistantId),
        {
          id: assistantId,
          role: 'assistant',
          content: 'Sorry, I encountered an error connecting to the AI service. Please try again.',
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
        sendMessage(q)
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
  const executeSqlBlock = async (messageId: string, sql: string, skipConfirm = false) => {
    // NOTE: The ref is kept in sync via the useEffect below (not inside the
    // function body) so it is populated BEFORE the first auto-execution call
    // from `sendMessage`. The previous in-body assignment was a no-op on the
    // first AI response, silently breaking auto-execution of SELECT queries.

    if (!activeConnectionId) {
      toast.error('No active DB connection')
      return
    }
    if (!sql.trim()) return

    if (!skipConfirm && isDestructiveSQL(sql)) {
      const ok = window.confirm(
        `⚠️  This SQL will modify or destroy data on your LIVE database "${activeConnectionName}":\n\n${sql.slice(0, 200)}${sql.length > 200 ? '...' : ''}\n\nAre you sure you want to execute this?`,
      )
      if (!ok) return
    }

    setMessages(prev => prev.map(m =>
      m.id === messageId
        ? { ...m, sqlBlockExecuting: true, sqlBlockResult: null }
        : m
    ))

    try {
      const result = await apiPost<{
        rows?: Record<string, unknown>[]
        columns?: string[]
        error?: string
        executionTime?: number
        rowCount?: number
        affectedRows?: number
      }>('/api/connections/execute', {
        connectionId: activeConnectionId,
        sql,
        skipDangerousCheck: skipConfirm,
      }, { timeout: 60000 })

      if (result.error) {
        setMessages(prev => prev.map(m =>
          m.id === messageId
            ? { ...m, sqlBlockExecuting: false, sqlBlockResult: { ok: false, message: result.error!, rowCount: 0, affectedRows: 0 } }
            : m
        ))
        toast.error(result.error)
        // BUGFIX (BUG-46): if the connection itself was deleted or became
        // invalid, clean up the studio's live-mode state so the user
        // doesn't keep retrying against a dead connection.
        if (/connection.*not found|not have access/i.test(result.error)) {
          setActiveConnectionId(undefined)
          setActiveConnectionName(undefined)
          setActiveConnectionDialect(undefined)
          router.push('/dashboard/connections')
        }
        return
      }

      // BUGFIX (BUG-37): strip leading SQL comments before computing the
      // verb, so SQL prefixed with `-- DESTRUCTIVE: ...` is classified
      // correctly. Otherwise `verb = '--'` and `isMutation = false`,
      // causing the post-mutation schema refresh to be skipped and the
      // toast to say "Returned 0 row(s)" instead of "INSERT OK — N rows".
      const stripped = stripSqlComments(sql).trim()
      const verb = stripped.split(/\s+/)[0]?.toUpperCase() || ''
      const isMutation = ['INSERT', 'UPDATE', 'DELETE', 'CREATE', 'ALTER', 'DROP', 'TRUNCATE'].includes(verb)
      const affected = result.affectedRows ?? result.rowCount ?? (result.rows?.length || 0)

      setMessages(prev => prev.map(m =>
        m.id === messageId
          ? {
            ...m,
            sqlBlockExecuting: false,
            sqlBlockResult: {
              ok: true,
              message: isMutation ? `${verb} OK — ${affected} row(s) affected` : `Returned ${result.rowCount || result.rows?.length || 0} row(s)`,
              rowCount: result.rowCount || result.rows?.length || 0,
              affectedRows: affected,
              rows: result.rows?.slice(0, 50),
              columns: result.columns,
            },
          }
          : m
      ))

      if (isMutation) {
        toast.success(`${verb} OK — ${affected} row(s) affected`)
        // Refresh the schema + data from the external DB so the data tab
        // reflects the change immediately.
        try {
          const refresh = await apiGet<{
            schema?: SchemaTable[]
            data?: Record<string, unknown[]>
          }>(`/api/connections/${activeConnectionId}?include=introspect`, { cacheTtl: 0, force: true, timeout: 30000 })
          if (refresh.schema) setGeneratedSchema(refresh.schema)
          if (refresh.data) setGeneratedData(refresh.data)
        } catch (err) {
          // BUGFIX (BUG-45): surface the refresh failure to the user
          // instead of silently swallowing it. The Data tab will be stale
          // until they reload the page.
          console.warn('[Studio] Failed to refresh external DB after mutation:', err)
          toast.warning('Mutation succeeded, but the schema/data refresh failed. Reload the page to see the latest state.')
        }
      } else {
        // For SELECT queries: only show a toast + switch to SQL tab when
        // the USER manually clicked "Run on live DB". For auto-executed
        // reads (skipConfirm=true), the results are already shown inline
        // in the chat card — no toast needed (less noise).
        if (!skipConfirm) {
          toast.success(`Returned ${result.rowCount || result.rows?.length || 0} row(s)`)
          // Also surface the rows in the SQL tab results area
          if (result.rows && result.rows.length > 0) {
            setSqlResults({
              rows: result.rows,
              columns: result.columns || [],
              executionTime: result.executionTime || 0,
            })
            setActiveTab('sql')
          }
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Execution failed'
      setMessages(prev => prev.map(m =>
        m.id === messageId
          ? { ...m, sqlBlockExecuting: false, sqlBlockResult: { ok: false, message: msg, rowCount: 0, affectedRows: 0 } }
          : m
      ))
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
        })

        // If the SQL mutated data (INSERT / UPDATE / DELETE / etc.) the
        // server now returns the refreshed `data_json` and `schema_json`.
        // Apply them to local state so the Data tab stays in sync with the
        // backend instead of showing stale rows.
        if (result.refreshedData) {
          setGeneratedData(result.refreshedData)
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
  const handleOptionClick = (choice: OptionChoice) => {
    sendMessage(choice.value)
  }

  // ─── Start streaming data generation ───
  const startStreamingGeneration = async (signal: BeginGenerationSignal, assistantId: string) => {
    const controller = new AbortController()
    generationAbortRef.current = controller

    const genProgressId = (Date.now() + 2).toString()

    const initialProgress = buildInitialGenerationProgress(signal, currentDatabaseId)
    setGenerationProgress(initialProgress)

    // Add a generation progress message to chat
    setMessages(prev => [...prev, {
      id: genProgressId,
      role: 'assistant' as const,
      content: '',
      agentName: 'Data Generator',
      generationProgress: initialProgress,
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

            if (event.type === 'database_created' && event.databaseId) {
              // Update both React state AND the local closure variable so the
              // `complete` handler later in this same async function reads the
              // freshly-assigned id instead of the stale `currentDatabaseId`.
              liveDatabaseId = event.databaseId
              setCurrentDatabaseId(event.databaseId)
              setGenerationProgress(prev => ({ ...prev, databaseId: event.databaseId }))
            }

            if (event.type === 'progress') {
              const statusMsg = formatProgressMessage(event)
              setGenerationProgress(prev => applyProgressEvent(prev, event))

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

              const completeMsg = formatTableCompleteMessage(event)
              setGenerationProgress(prev => applyTableCompleteEvent(prev, event))

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

            if (event.type === 'complete') {
              const totalRows = event.totalRows || 0
              const tablesGen = event.tablesGenerated || 0

              // Update all the data at once from the server.
              // Use `liveDatabaseId` (the local mutable variable kept in sync
              // with `database_created` events) instead of the stale closure
              // value of `currentDatabaseId`.
              const dbId = liveDatabaseId || generationProgress.databaseId
              if (dbId) {
                try {
                  const dbResult = await apiGet<{ database?: { data_json: Record<string, unknown[]>; schema_json: SchemaTable[] } }>(`/api/databases?id=${dbId}`, { cacheTtl: 0, force: true })
                  if (dbResult.database?.data_json && Object.keys(dbResult.database.data_json).length > 0) {
                    setGeneratedData(dbResult.database.data_json)
                  }
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

              const finalMsg = formatCompleteMessage(event)
              setGenerationProgress(prev => buildCompletedProgress(prev, event))

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

              toast.success(`Database generated: ${totalRows.toLocaleString()} rows across ${tablesGen} tables`)
              invalidateCache('/api/databases')
            }

            if (event.type === 'error') {
              const errorMsg = event.message || 'Generation failed'

              setGenerationProgress(prev => applyErrorEvent(prev, event))

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

      const errorMsg = err instanceof Error ? err.message : 'Generation failed'
      const errEvent = { type: 'error' as const, message: errorMsg }
      setGenerationProgress(prev => applyErrorEvent(prev, errEvent))

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
    for (const rows of Object.values(generatedData)) {
      rowCount += Array.isArray(rows) ? rows.length : 0
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
      rowCounts[table.name] = Array.isArray(rows) && rows.length > 0 ? rows.length : 10
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
    setGeneratedData(prev => ({
      ...prev,
      [selectedTable]: (prev[selectedTable] || []).filter((_: unknown, i: number) => !selectedRows.has(i)),
    }))
    setSelectedRows(new Set())
    toast.success(`${selectedRows.size} row(s) deleted`)
  }

  // ─── Current table data for display ───
  const currentTableData = selectedTable ? generatedData[selectedTable] || [] : []
  const currentTableColumns = currentTableData.length > 0 ? Object.keys(currentTableData[0] as Record<string, unknown>) : []
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
    if (!q) return currentTableData
    return currentTableData.filter((row) => {
      const r = row as Record<string, unknown>
      return Object.values(r).some(v => {
        if (v === null || v === undefined) return false
        return String(v).toLowerCase().includes(q)
      })
    })
  })()
  const displayedRows = filteredTableData.slice(0, visibleRows)
  const hasMoreRows = filteredTableData.length > visibleRows

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
    <div className="flex h-[calc(100vh-44px)] bg-background relative">
      {/* ─── Left Panel: AI Chat (resizable) ─── */}
      {/* When the right panel is hidden the chat expands to full width. */}
      <div
        className={cn(
          'flex flex-col bg-background',
          panelVisible ? 'border-r shrink-0' : 'flex-1 border-r-0'
        )}
        style={panelVisible ? { width: chatWidth } : undefined}
      >
        {/* Chat Header */}
        <ChatHeader
          isLiveDbMode={isLiveDbMode}
          activeConnectionName={activeConnectionName}
          activeConnectionDialect={activeConnectionDialect}
          conversations={conversations}
          activeConversationId={activeConversationId}
          historyOpen={historyOpen}
          onHistoryOpenChange={setHistoryOpen}
          onNewChat={startNewChat}
          onLoadConversation={(conv) => loadConversation(conv as SavedConversation)}
          onDeleteConversation={deleteConversation}
          onClearAllConversations={() => {
            setConversations([])
            persistSavedConversations([])
            if (activeConversationIdRef.current) {
              activeConversationIdRef.current = null
              setActiveConversationId(null)
            }
            toast.success('Conversation history cleared')
          }}
          onShowShortcuts={() => setShowShortcuts(true)}
          onTogglePanel={() => setPanelVisible(false)}
          loading={loading}
          panelVisible={panelVisible}
          hasGeneratedData={hasGeneratedData}
          tableCount={Object.keys(generatedData).length}
        />

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
            <MessageBubble
              key={message.id}
              message={message}
              activeConnectionDialect={activeConnectionDialect}
              onOptionClick={handleOptionClick}
              onExecuteSqlBlock={(messageId, sql) => executeSqlBlock(messageId, sql)}
              onCopy={copyToClipboard}
              onOpenInEditor={(sql) => { setSqlEditor(sql); setActiveTab('sql') }}
            />
          ))}
          {loading && messages.length > 0 && !messages[messages.length - 1]?.isStreaming && (
            <div className="flex gap-1.5">
              <AgentIcon agentName="Orchestrator" size="sm" />
              <div className="bg-muted/70 rounded-lg px-2.5 py-2">
                <div className="flex items-center gap-1">
                  <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
                  <span className="text-[10px] text-muted-foreground">Connecting...</span>
                </div>
              </div>
            </div>
          )}
          <div ref={chatEndRef} />
        </div>

        {/* Chat Input */}
        <ChatInput
          value={input}
          onChange={setInput}
          onSend={() => sendMessage()}
          onStop={handleStopGeneration}
          disabled={loading}
          connectionLoading={connectionLoading}
          placeholder={isLiveDbMode ? 'Ask me to edit, delete, drop, or query your live DB...' : 'Describe the data you need...'}
          inputRef={chatInputRef}
          onKeyDown={handleKeyDown}
        />
      </div>

      {/* ─── Resize Handle ─── */}
      {/* Hidden when the right panel is collapsed — there's nothing to resize. */}
      {panelVisible && (
        <div
          ref={resizeRef}
          className="w-1.5 cursor-col-resize bg-border hover:bg-amber-400 transition-colors shrink-0 active:bg-amber-500"
          onMouseDown={() => setIsResizing(true)}
        />
      )}

      {/* ─── Right Panel: Data/SQL/Explorer ─── */}
      {/* The entire panel (header + tabs) is unmounted when `panelVisible`
          is false so the chat column can take the full viewport width. */}
      {panelVisible ? (
        <div className="flex-1 flex flex-col min-w-0">
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
            {hasGeneratedData && (
              <>
                {/* Export Dropdown */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm" className="h-6 text-[10px] gap-1">
                      <Download className="h-2.5 w-2.5" />
                      Export
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => exportAsSQL(generatedSchema, generatedData, `${databaseName || 'database'}.sql`)}>
                      <FileText className="mr-2 h-3 w-3" />
                      SQL Dump (.sql)
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => {
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
                    <DropdownMenuItem onClick={() => exportAsJSON(generatedData, `${databaseName || 'database'}.json`)}>
                      <FileJson className="mr-2 h-3 w-3" />
                      JSON (.json)
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>

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
          <SchemaPreviewPanel
            schema={generatedSchema}
            data={generatedData}
            selectedTable={selectedTable}
            onSelectTable={(tableName) => {
              setSelectedTable(tableName)
              setVisibleRows(20)
              setDataSearchQuery('')
              setActiveTab('data')
            }}
          />
        )}

        {hasGeneratedData ? (
          <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-col flex-1 min-h-0">
            <div className="px-3 pt-1.5 border-b shrink-0">
              <TabsList className="h-8">
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
              <DataTab
                schema={generatedSchema}
                data={generatedData}
                selectedTable={selectedTable}
                currentTableData={currentTableData}
                currentTableColumns={currentTableColumns}
                currentTableSchema={currentTableSchema}
                headerColumns={headerColumns}
                displayedRows={displayedRows}
                filteredTableData={filteredTableData}
                hasMoreRows={hasMoreRows}
                dataSearchQuery={dataSearchQuery}
                visibleRows={visibleRows}
                selectedRows={selectedRows}
                editingCell={editingCell}
                editingCellValue={editingCellValue}
                setDataSearchQuery={setDataSearchQuery}
                setVisibleRows={setVisibleRows}
                setSelectedRows={setSelectedRows}
                setEditingCell={setEditingCell}
                setEditingCellValue={setEditingCellValue}
                isLiveDbMode={isLiveDbMode}
                onSelectTable={(name) => { setSelectedTable(name); setVisibleRows(20); setDataSearchQuery('') }}
                onViewInExplorer={() => setActiveTab('explorer')}
                onAddTableClick={() => setAddTableDialogOpen(true)}
                onAddColumnClick={() => setAddColumnDialogOpen(true)}
                onAddRow={handleAddRow}
                onDeleteSelectedRows={handleDeleteSelectedRows}
                onCellEdit={handleCellEdit}
                onCopyToClipboard={copyToClipboard}
                onRefreshSchema={async () => {
                  if (!activeConnectionId) return
                  try {
                    toast.info('Refreshing schema from live DB...')
                    const refresh = await apiGet<{
                      schema?: SchemaTable[]
                      data?: Record<string, unknown[]>
                    }>(`/api/connections/${activeConnectionId}?include=introspect`, { cacheTtl: 0, force: true, timeout: 30000 })
                    if (refresh.schema) setGeneratedSchema(refresh.schema)
                    if (refresh.data) setGeneratedData(refresh.data)
                    setSelectedTable('')
                    toast.success(`Loaded ${refresh.schema?.length || 0} tables from live DB`)
                  } catch (err) {
                    toast.error(err instanceof Error ? err.message : 'Failed to refresh')
                  }
                }}
                onExportJSON={exportAsJSON}
                onExportCSV={exportAsCSV}
                onExportSQL={exportAsSQL}
              />
            </TabsContent>

            {/* ─── SQL Tab ─── */}
            <TabsContent value="sql" className="flex-1 overflow-hidden m-0">
              <SqlTab
                sqlEditor={sqlEditor}
                setSqlEditor={setSqlEditor}
                sqlResults={sqlResults}
                setSqlResults={setSqlResults}
                sqlExecuting={sqlExecuting}
                queryHistory={queryHistory}
                setQueryHistory={setQueryHistory}
                savedQueries={savedQueries}
                setSavedQueries={setSavedQueries}
                databaseName={databaseName}
                onExecute={executeSQL}
                onGenerateSchemaSQL={generateSchemaSQL}
                onAIGenerate={generateAIQL}
                onCopy={copyToClipboard}
                onSaveCurrentQuery={saveCurrentQuery}
              />
            </TabsContent>

            {/* ─── Explorer Tab ─── */}
            <TabsContent value="explorer" className="flex-1 overflow-hidden m-0">
              <ExplorerTab
                schema={generatedSchema}
                data={generatedData}
                selectedTable={selectedTable}
                erLayout={erLayout}
                favoriteTables={favoriteTables}
                setFavoriteTables={setFavoriteTables}
                explorerZoom={explorerZoom}
                setExplorerZoom={setExplorerZoom}
                explorerPan={explorerPan}
                setExplorerPan={setExplorerPan}
                isPanning={isPanning}
                setIsPanning={setIsPanning}
                panStart={panStart}
                setPanStart={setPanStart}
                onSelectTable={(name) => { setSelectedTable(name); setActiveTab('data'); setVisibleRows(20) }}
              />
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
                {QUICK_PROMPTS.map((example) => (
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
      {!panelVisible && (
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

      {/* ─── Keyboard Shortcuts Help Dialog ─── */}
      {/* Opened via Cmd/Ctrl + / (or the Keyboard icon in the chat header).
          Lists every shortcut grouped by category. ESC closes (handled both
          by Radix's default and the global keydown listener above). */}
      <ShortcutsDialog open={showShortcuts} onOpenChange={setShowShortcuts} />
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
