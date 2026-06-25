'use client'

import { useState, useRef, useEffect, useCallback, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
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
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
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
import type { Message, SchemaTable, StudioPageProps, GenerationProgress } from './_lib/types'
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
import { SqlBlockCard } from './_components/sql-block-card'


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
  const [visibleRows, setVisibleRows] = useState(20)
  const [initialQuerySent, setInitialQuerySent] = useState(false)
  const [conversationId, setConversationId] = useState(initialConversationId || '')

  // SQL workspace state
  const [sqlEditor, setSqlEditor] = useState('')
  const [sqlResults, setSqlResults] = useState<{ rows: Record<string, unknown>[]; columns: string[]; executionTime: number } | null>(null)
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

  // Explorer state
  const [favoriteTables, setFavoriteTables] = useState<Set<string>>(new Set())
  const [explorerZoom, setExplorerZoom] = useState(1)
  const [explorerPan, setExplorerPan] = useState({ x: 0, y: 0 })
  const [isPanning, setIsPanning] = useState(false)
  const [panStart, setPanStart] = useState({ x: 0, y: 0 })

  // Chat panel resize
  const [chatWidth, setChatWidth] = useState(340)
  const [isResizing, setIsResizing] = useState(false)

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

        if (result.connection.status === 'failed') {
          toast.error(`Connection test failed: ${result.connection.error_message || 'unknown error'}`)
        }

        setActiveConnectionId(result.connection.id)
        setActiveConnectionName(result.connection.name)
        setActiveConnectionDialect(result.connection.dialect)

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
            content: `Connected to live ${result.connection.dialect} **"${result.connection.name}"**. I have direct access to this database — ask me anything and I'll run SQL against it.\n\n**Examples:**\n- "show me the first 10 rows of users"\n- "how many rows are in the orders table?"\n- "what tables are in this database?"\n- "add a status column to the orders table"\n\n**How it works:**\n- **SELECT** queries are auto-executed immediately — results appear inline below.\n- **INSERT / UPDATE / DELETE / DDL** operations show a confirmation dialog before executing.`,
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

  // ─── New chat ───
  const startNewChat = () => {
    setMessages([
      {
        id: Date.now().toString(),
        role: 'assistant',
        content: hasGeneratedData
          ? `You're still working on **"${databaseName}"**. What would you like to do next?`
          : 'Welcome to **SynthForge AI Studio**! Describe the database you need.',
        agentName: 'Orchestrator',
        timestamp: new Date(),
      },
    ])
    setConversationId('')
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
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

            if (event.type === 'database_created' && event.databaseId) {
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

            if (event.type === 'complete') {
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

              const finalMsg = `Generation complete — ${totalRows.toLocaleString()} rows across ${tablesGen} tables (${durationSec}s)`

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

              toast.success(`Database generated: ${totalRows.toLocaleString()} rows across ${tablesGen} tables`)
              invalidateCache('/api/databases')
            }

            if (event.type === 'error') {
              const errorMsg = event.message || 'Generation failed'

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
  const displayedRows = currentTableData.slice(0, visibleRows)
  const hasMoreRows = currentTableData.length > visibleRows

  // ─── ER Diagram Layout ───
  // Delegates to the extracted helper in ./_lib/utils.
  const erLayout = hasGeneratedData
    ? computeERLayoutHelper(generatedData, generatedSchema)
    : { nodes: [] as Array<{ name: string; x: number; y: number; schema: SchemaTable; rows: number }>, edges: [] as Array<{ from: string; to: string; fromCol: string; toCol: string; type: string }> }

  // SVG dimensions based on layout
  const svgWidth = Math.max(600, erLayout.nodes.length > 0 ? Math.max(...erLayout.nodes.map(n => n.x)) + 280 : 600)
  const svgHeight = Math.max(400, erLayout.nodes.length > 0 ? Math.max(...erLayout.nodes.map(n => n.y)) + 250 : 400)

  return (
    <div className="flex h-[calc(100vh-44px)] bg-background">
      {/* ─── Left Panel: AI Chat (resizable) ─── */}
      <div className="flex flex-col border-r bg-background shrink-0" style={{ width: chatWidth }}>
        {/* Chat Header */}
        <div className="px-3 py-2.5 border-b flex items-center justify-between bg-card shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <div className={`h-6 w-6 rounded-lg flex items-center justify-center shrink-0 ${isLiveDbMode ? 'bg-gradient-to-br from-sky-500 to-indigo-600' : 'bg-gradient-to-br from-amber-500 to-red-600'}`}>
              {isLiveDbMode ? <PlugZap className="h-3 w-3 text-white" /> : <Sparkles className="h-3 w-3 text-white" />}
            </div>
            <div className="min-w-0">
              <h2 className="text-xs font-semibold truncate">
                {isLiveDbMode ? (activeConnectionName || 'Live DB') : 'SynthForge AI'}
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
              className="h-5 w-5 p-0"
              onClick={startNewChat}
              title="New Chat"
            >
              <Plus className="h-3 w-3" />
            </Button>
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
              className={`flex gap-1.5 ${message.role === 'user' ? 'justify-end' : ''}`}
            >
              {message.role === 'assistant' && (
                <AgentIcon agentName={message.agentName} size="sm" />
              )}
              <div
                className={`max-w-[88%] rounded-lg px-2.5 py-2 overflow-hidden ${
                  message.role === 'user'
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted/70'
                }`}
                style={{ overflowWrap: 'break-word', wordBreak: 'break-word' }}
              >
                {message.role === 'assistant' && (
                  <p className="text-[9px] font-medium text-amber-600 dark:text-amber-400 mb-0.5 flex items-center gap-1">
                    {message.agentName || 'Orchestrator'}
                    {message.isStreaming && (
                      <span className="flex items-center gap-0.5">
                        <span className="inline-block h-1 w-1 rounded-full bg-amber-500 animate-pulse" />
                        <span className="inline-block h-1 w-1 rounded-full bg-amber-500 animate-pulse [animation-delay:0.2s]" />
                        <span className="inline-block h-1 w-1 rounded-full bg-amber-500 animate-pulse [animation-delay:0.4s]" />
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
                          onClick={() => handleOptionClick(choice)}
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
                  </div>
                )}

                {/* ─── SQL block(s) (live DB mode) ─── */}
                {message.role === 'assistant' && message.sqlBlock && (
                  <>
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
                      <div className="mt-1.5 space-y-1">
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
                  </>
                )}
              </div>
              {message.role === 'user' && (
                <div className="h-5 w-5 rounded-full bg-primary flex items-center justify-center shrink-0 mt-0.5">
                  <User className="h-2.5 w-2.5 text-primary-foreground" />
                </div>
              )}
            </div>
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
        <div className="px-2.5 py-2 border-t bg-card shrink-0">
          <div className="flex gap-1.5">
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={isLiveDbMode ? 'Ask me to edit, delete, drop, or query your live DB...' : 'Describe the data you need...'}
              disabled={loading || connectionLoading}
              className="flex-1 text-xs h-8"
            />
            {loading ? (
              <Button
                onClick={handleStopGeneration}
                size="sm"
                variant="destructive"
                className="h-8 w-8 p-0"
                title="Stop generation"
              >
                <Square className="h-3.5 w-3.5" />
              </Button>
            ) : (
              <Button
                onClick={() => sendMessage()}
                disabled={!input.trim()}
                size="sm"
                className="bg-gradient-to-r from-amber-600 to-red-600 hover:from-amber-700 hover:to-red-700 text-white h-8 w-8 p-0"
              >
                <Send className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* ─── Resize Handle ─── */}
      <div
        ref={resizeRef}
        className="w-1.5 cursor-col-resize bg-border hover:bg-amber-400 transition-colors shrink-0 active:bg-amber-500"
        onMouseDown={() => setIsResizing(true)}
      />

      {/* ─── Right Panel: Data/SQL/Explorer ─── */}
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
              </>
            )}
          </div>
        </div>

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
                              }>(`/api/connections/${activeConnectionId}?include=introspect`, { cacheTtl: 0, force: true, timeout: 30000 })
                              if (refresh.schema) setGeneratedSchema(refresh.schema)
                              if (refresh.data) setGeneratedData(refresh.data)
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
                    {Object.entries(generatedData).map(([tableName, rows]) => (
                      <button
                        key={tableName}
                        onClick={() => { setSelectedTable(tableName); setVisibleRows(20) }}
                        className={`w-full text-left px-2 py-1 rounded text-[11px] font-medium transition-colors flex items-center gap-1.5 group ${
                          selectedTable === tableName
                            ? 'bg-accent text-accent-foreground'
                            : 'text-muted-foreground hover:bg-accent/50 hover:text-accent-foreground'
                        }`}
                      >
                        <Table2 className="h-2.5 w-2.5 shrink-0" />
                        <span className="truncate">{tableName}</span>
                        <Badge variant="outline" className="ml-auto text-[8px] px-0.5 py-0 min-w-[16px] text-center">
                          {rows.length}
                        </Badge>
                      </button>
                    ))}
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
                              {currentTableData.length} row{currentTableData.length === 1 ? '' : 's'}
                            </Badge>
                          </div>
                        </div>
                        <div className="flex items-center gap-0.5 shrink-0">
                          <Button variant="ghost" size="sm" className="h-5 text-[9px] gap-0.5 px-1" onClick={handleAddRow} title="Add Row">
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
                          <Button variant="ghost" size="sm" className="h-5 w-5 p-0" onClick={() => copyToClipboard(JSON.stringify(currentTableData, null, 2))} title="Copy as JSON">
                            <Copy className="h-2.5 w-2.5" />
                          </Button>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="sm" className="h-5 w-5 p-0" title="Download table">
                                <Download className="h-2.5 w-2.5" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="text-xs">
                              <DropdownMenuItem onClick={() => exportAsJSON(currentTableData, `${selectedTable}.json`)}>
                                <FileJson className="mr-2 h-3 w-3" />
                                JSON (.json)
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => exportAsCSV(currentTableData as Record<string, unknown>[], `${selectedTable}.csv`)}>
                                <FileSpreadsheet className="mr-2 h-3 w-3" />
                                CSV (.csv)
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => {
                                const singleSchema = generatedSchema.find(s => s.name === selectedTable)
                                const singleData = selectedTable ? { [selectedTable]: generatedData[selectedTable] || [] } : {}
                                exportAsSQL(singleSchema ? [singleSchema] : [], singleData, `${selectedTable}.sql`)
                              }}>
                                <FileText className="mr-2 h-3 w-3" />
                                SQL Dump (.sql)
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                          <span className="hidden sm:inline-flex items-center gap-1 text-[9px] text-muted-foreground/80 border border-border rounded px-1.5 py-0.5 bg-muted/30 ml-1" title="Double-click any cell to edit it in place">
                            <MousePointerClick className="h-2.5 w-2.5" />
                            Double-click a cell to edit
                          </span>
                        </div>
                      </div>
                      <div className="flex-1 overflow-auto">
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
                                    className={cn(
                                      'text-left align-top py-1.5 px-2 font-medium whitespace-nowrap border-r last:border-r-0 min-w-[104px]',
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
                                  No rows yet. Click <span className="font-semibold not-italic text-foreground">Row</span> above to add one.
                                </td>
                              </tr>
                            ) : (
                              displayedRows.map((row, i) => (
                                <tr key={i} className={cn(
                                  'border-b hover:bg-muted/30 transition-colors',
                                  selectedRows.has(i) && 'bg-amber-50 dark:bg-amber-950/20',
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
                                    {i + 1}
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
                                        onDoubleClick={() => {
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
                      {hasMoreRows && (
                        <div className="px-2.5 py-1.5 border-t bg-muted/30 text-center shrink-0">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-[10px] h-6"
                            onClick={() => setVisibleRows(prev => prev + 20)}
                          >
                            Load more ({currentTableData.length - visibleRows} remaining)
                            <ChevronDown className="ml-1 h-2.5 w-2.5" />
                          </Button>
                        </div>
                      )}
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
                        onClick={() => {
                          if (sqlEditor.trim()) {
                            const name = prompt('Name this query:')
                            if (name) {
                              setSavedQueries(prev => [...prev, { name, sql: sqlEditor }])
                              toast.success('Query saved!')
                            }
                          }
                        }}
                      >
                        <Plus className="h-3 w-3 mr-2" />
                        Save Current Query
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
                                {tableData?.length || 0} rows
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
                              {node.rows} rows
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
