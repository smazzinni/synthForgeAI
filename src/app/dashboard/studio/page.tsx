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
} from 'lucide-react'
import { toast } from 'sonner'
import { apiPost, apiPatch, apiDelete, apiGet, invalidateCache } from '@/lib/api-client'
import {
  parseAgentStatus,
  parseInteractiveOptions,
  parseAllInteractiveOptions,
  cleanDisplayText,
  isDestructiveSQL,
  getAgentByName,
  type AgentStatus,
  type InteractiveOptions,
  type OptionChoice,
} from '@/lib/ai-agents'

// ─── Types ───
interface Message {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  reasoningContent?: string
  agentName?: string
  agentStatus?: AgentStatus | null
  interactiveOptions?: InteractiveOptions | null
  timestamp: Date
  isStreaming?: boolean
  tables?: Record<string, unknown[]> | null
}

interface SchemaTable {
  name: string
  columns: { name: string; type: string }[]
}

interface StudioPageProps {
  databaseId?: string
  initialName?: string
  initialSchema?: SchemaTable[]
  initialData?: Record<string, unknown[]>
  initialMessages?: Message[]
  conversationId?: string
}

// ─── Export helpers (client-side) ───
function exportAsCSV(data: Record<string, unknown>[], filename: string) {
  if (!data.length) return
  const columns = Object.keys(data[0])
  const csvRows = [
    columns.map(c => `"${c}"`).join(','),
    ...data.map(row =>
      columns.map(col => {
        const val = row[col]
        if (val === null || val === undefined) return ''
        if (typeof val === 'object') return `"${JSON.stringify(val).replace(/"/g, '""')}"`
        return `"${String(val).replace(/"/g, '""')}"`
      }).join(',')
    ),
  ]
  const blob = new Blob([csvRows.join('\n')], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

function exportAsJSON(data: unknown, filename: string) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

function exportAsSQL(schema: SchemaTable[], data: Record<string, unknown[]>, filename: string) {
  let sql = `-- SynthForge AI Export\n-- Generated: ${new Date().toISOString()}\n\n`
  for (const table of schema) {
    const rows = data[table.name] as Record<string, unknown>[] | undefined
    sql += `CREATE TABLE ${table.name} (\n`
    const colDefs = table.columns.map(col => {
      let def = `  ${col.name} ${col.type.toUpperCase()}`
      if (col.name === 'id') def += ' PRIMARY KEY'
      return def
    })
    sql += colDefs.join(',\n') + '\n);\n\n'
    if (rows && rows.length > 0) {
      const columns = Object.keys(rows[0])
      for (const row of rows) {
        const values = columns.map(col => {
          const val = row[col]
          if (val === null || val === undefined) return 'NULL'
          if (typeof val === 'number') return String(val)
          if (typeof val === 'boolean') return val ? 'TRUE' : 'FALSE'
          return `'${String(val).replace(/'/g, "''")}'`
        })
        sql += `INSERT INTO ${table.name} (${columns.join(', ')}) VALUES (${values.join(', ')});\n`
      }
      sql += '\n'
    }
  }
  const blob = new Blob([sql], { type: 'application/sql' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

// ─── Parse AI response to extract text and JSON data ───
function parseAIResponse(content: string): {
  displayText: string
  tables: Record<string, unknown[]> | null
  databaseName: string | null
} {
  let tables: Record<string, unknown[]> | null = null
  let databaseName: string | null = null
  let displayText = content

  // Try to extract JSON code block
  const codeBlockMatch = content.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/)
  if (codeBlockMatch) {
    try {
      const parsed = JSON.parse(codeBlockMatch[1])
      if (parsed?.tables) {
        tables = parsed.tables
        databaseName = parsed.database_name || null
        displayText = content.replace(/```(?:json)?\s*\n?[\s\S]*?\n?```/, '').trim()
      }
    } catch {
      // Not valid JSON in code block
    }
  }

  // If no code block found, try raw JSON
  if (!tables) {
    const jsonMatch = content.match(/\{[\s\S]*"tables"[\s\S]*\}/)
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0])
        if (parsed?.tables) {
          tables = parsed.tables
          databaseName = parsed.database_name || null
          displayText = content.replace(jsonMatch[0], '').trim()
        }
      } catch {
        // Not parseable
      }
    }
  }

  // Clean up tags and agent status / options blocks
  displayText = displayText.replace(/<think[\s\S]*?<\/think>/gi, '')
  displayText = displayText.replace(/<thinking[\s\S]*?<\/thinking>/gi, '')
  displayText = cleanDisplayText(displayText)
  // Additional cleanup: remove any leftover raw JSON lines that look like agent commands
  displayText = displayText.replace(/^\s*\{"type"\s*:\s*"[^"]+"\s*[,\}][^\n]*$/gm, '')
  // Remove multiple consecutive blank lines
  displayText = displayText.replace(/\n{3,}/g, '\n\n')
  displayText = displayText.trim()

  return { displayText, tables, databaseName }
}

// ─── Extract schema from table data ───
function extractSchema(tables: Record<string, unknown[]>): SchemaTable[] {
  const schema: SchemaTable[] = []
  for (const [tableName, tableData] of Object.entries(tables)) {
    const rows = tableData as Record<string, unknown>[]
    if (Array.isArray(rows) && rows.length > 0) {
      const columns = Object.keys(rows[0]).map(key => {
        const val = rows[0][key]
        let type = 'varchar(255)'
        if (typeof val === 'number') type = Number.isInteger(val) ? 'integer' : 'decimal'
        else if (typeof val === 'boolean') type = 'boolean'
        else if (typeof val === 'string' && /^\d{4}-\d{2}-\d{2}/.test(val)) type = 'timestamp'
        else if (key === 'id' || key.endsWith('_id')) type = 'uuid'
        return { name: key, type }
      })
      schema.push({ name: tableName, columns })
    }
  }
  return schema
}

// ─── Agent icon helper ───
function AgentIcon({ agentName, size = 'sm' }: { agentName?: string; size?: 'sm' | 'md' }) {
  const agent = getAgentByName(agentName || '')
  const sizeClass = size === 'sm' ? 'h-5 w-5' : 'h-6 w-6'
  const iconSize = size === 'sm' ? 'h-2.5 w-2.5' : 'h-3 w-3'

  if (agent?.id === 'schema_architect') {
    return (
      <div className={`${sizeClass} rounded-full bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shrink-0`}>
        <GitBranch className={`${iconSize} text-white`} />
      </div>
    )
  }
  if (agent?.id === 'data_generator') {
    return (
      <div className={`${sizeClass} rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shrink-0`}>
        <Database className={`${iconSize} text-white`} />
      </div>
    )
  }
  if (agent?.id === 'quality_analyst') {
    return (
      <div className={`${sizeClass} rounded-full bg-gradient-to-br from-sky-500 to-blue-600 flex items-center justify-center shrink-0`}>
        <CheckCircle2 className={`${iconSize} text-white`} />
      </div>
    )
  }
  if (agent?.id === 'privacy_officer') {
    return (
      <div className={`${sizeClass} rounded-full bg-gradient-to-br from-rose-500 to-pink-600 flex items-center justify-center shrink-0`}>
        <Shield className={`${iconSize} text-white`} />
      </div>
    )
  }
  // Default: Orchestrator
  return (
    <div className={`${sizeClass} rounded-full bg-gradient-to-br from-amber-500 to-red-600 flex items-center justify-center shrink-0`}>
      <Sparkles className={`${iconSize} text-white`} />
    </div>
  )
}

// ─── ShowMoreText component for long messages ───
function ShowMoreText({ content, isStreaming }: { content: string; isStreaming?: boolean }) {
  const [expanded, setExpanded] = useState(false)
  const contentRef = useRef<HTMLDivElement>(null)
  const [isOverflowing, setIsOverflowing] = useState(false)

  useEffect(() => {
    if (contentRef.current) {
      setIsOverflowing(contentRef.current.scrollHeight > 400)
    }
  }, [content])

  // Format the text with basic markdown-like rendering
  const parts = content.split(/(\*\*[^*]+\*\*|\`[^`]+\`|\n)/g)
  const rendered = parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={i}>{part.slice(2, -2)}</strong>
    }
    if (part.startsWith('`') && part.endsWith('`')) {
      return <code key={i} className="bg-muted px-1 py-0.5 rounded text-xs font-mono">{part.slice(1, -1)}</code>
    }
    if (part === '\n') {
      return <br key={i} />
    }
    return <span key={i}>{part}</span>
  })

  return (
    <div>
      <div
        ref={contentRef}
        className={`text-sm leading-relaxed whitespace-pre-wrap ${!expanded && isOverflowing ? 'max-h-[400px] overflow-y-auto' : ''}`}
        style={{ overflowWrap: 'break-word', wordBreak: 'break-word' }}
      >
        {rendered}
      </div>
      {isOverflowing && !isStreaming && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="mt-1 text-[10px] text-amber-600 dark:text-amber-400 hover:underline font-medium"
        >
          {expanded ? 'Show less' : 'Show more'}
        </button>
      )}
    </div>
  )
}

// ─── Main Studio Page Component ───
function StudioPageInner({
  databaseId,
  initialName,
  initialSchema,
  initialData,
  initialMessages,
  conversationId: initialConversationId,
}: StudioPageProps) {
  const router = useRouter()
  const searchParams = useSearchParams()

  // ─── State ───
  const [messages, setMessages] = useState<Message[]>(initialMessages && initialMessages.length > 0 ? initialMessages : [
    {
      id: '1',
      role: 'assistant',
      content: databaseId
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
  const [queryHistory, setQueryHistory] = useState<string[]>([])
  const [savedQueries, setSavedQueries] = useState<Array<{ name: string; sql: string }>>([])
  const [sqlConfirmOpen, setSqlConfirmOpen] = useState(false)
  const [sqlConfirmQuery, setSqlConfirmQuery] = useState('')

  // Explorer state
  const [favoriteTables, setFavoriteTables] = useState<Set<string>>(new Set())
  const [explorerZoom, setExplorerZoom] = useState(1)
  const [explorerPan, setExplorerPan] = useState({ x: 0, y: 0 })
  const [isPanning, setIsPanning] = useState(false)
  const [panStart, setPanStart] = useState({ x: 0, y: 0 })

  // Chat panel resize
  const [chatWidth, setChatWidth] = useState(340)
  const [isResizing, setIsResizing] = useState(false)

  const chatEndRef = useRef<HTMLDivElement>(null)
  const chatContainerRef = useRef<HTMLDivElement>(null)
  const abortRef = useRef<AbortController | null>(null)
  const messagesRef = useRef<Message[]>(messages)
  const loadingRef = useRef(false)
  const resizeRef = useRef<HTMLDivElement>(null)

  // Keep messagesRef in sync
  useEffect(() => {
    messagesRef.current = messages
  }, [messages])

  const hasGeneratedData = generatedSchema.length > 0 || Object.keys(generatedData).length > 0

  // Handle initial query from dashboard
  useEffect(() => {
    const q = searchParams.get('q')
    if (q && !initialQuerySent) {
      setInitialQuerySent(true)
      setInput(q)
    }
  }, [searchParams, initialQuerySent])

  // Auto-select first table
  useEffect(() => {
    const tableNames = Object.keys(generatedData)
    if (tableNames.length > 0 && !selectedTable) {
      setSelectedTable(tableNames[0])
    }
  }, [generatedData, selectedTable])

  // Scroll to bottom of chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
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
          databaseId,
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
  }, [conversationId, databaseId, databaseName])

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
          ...(databaseId ? { databaseId, databaseName } : {}),
          ...(conversationId ? { conversationId } : {}),
          currentSchema: generatedSchema,
          currentData: dataToSend,
          history,
        }),
        signal: controller.signal,
      })

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`)
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

      // Parse the response for tables/data
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
      if ((err as Error).name === 'AbortError') return

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
  }, [input, databaseId, databaseName, conversationId, generatedSchema, generatedData, hasGeneratedData, saveConversation])

  // Auto-send query from dashboard
  useEffect(() => {
    const q = searchParams.get('q')
    if (q && !initialQuerySent) {
      setInitialQuerySent(true)
      const timer = setTimeout(() => {
        sendMessage(q)
      }, 500)
      return () => clearTimeout(timer)
    }
  }, [searchParams, initialQuerySent])

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
      if (databaseId) {
        await apiPatch('/api/databases', {
          id: databaseId,
          name,
          schema_json: schema,
          data_json: tables,
          row_count: totalRows,
          quality_score: 0.85,
          status: 'ready',
        })
      } else {
        const result = await apiPost<{ database?: { id: string } }>('/api/databases', {
          name,
          db_type: 'postgresql',
          schema_json: schema,
          row_count: totalRows,
          quality_score: 0.85,
          status: 'ready',
        })

        const dbId = result.database?.id
        if (dbId && Object.keys(tables).length > 0) {
          try {
            await apiPatch('/api/databases', {
              id: dbId,
              data_json: tables,
            })
          } catch {
            console.warn('[Studio] Failed to save data_json')
          }
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
    if (!databaseId) return
    if (!confirm('Are you sure you want to delete this database? This cannot be undone.')) return
    try {
      await apiDelete(`/api/databases?id=${databaseId}`)
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

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
    toast.success('Copied to clipboard')
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
      const result = await apiPost<{
        rows?: Record<string, unknown>[]
        columns?: string[]
        error?: string
        executionTime?: number
        rowCount?: number
      }>('/api/sql/execute', {
        sql,
        databaseId,
      })

      if (result.error) {
        toast.error(result.error)
        setSqlResults({ rows: [{ error: result.error }], columns: ['error'], executionTime: result.executionTime || 0 })
      } else if (result.rows) {
        setSqlResults({
          rows: result.rows,
          columns: result.columns || [],
          executionTime: result.executionTime || 0,
        })
        toast.success(`Query returned ${result.rowCount || result.rows.length} rows`)
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
  const generateSchemaSQL = (): string => {
    if (!generatedSchema.length) return '-- No schema generated yet'
    let sql = `-- SynthForge AI Generated Schema\n-- Database: ${databaseName || 'untitled'}\n\n`

    for (const table of generatedSchema) {
      sql += `CREATE TABLE ${table.name} (\n`
      const cols = table.columns.map(col => {
        let def = `  ${col.name} ${col.type.toUpperCase()}`
        if (col.name === 'id') def += ' PRIMARY KEY'
        return def
      })
      sql += cols.join(',\n')
      sql += '\n);\n\n'
    }
    return sql
  }

  // ─── Handle option button click ───
  const handleOptionClick = (choice: OptionChoice) => {
    sendMessage(choice.value)
  }

  // ─── Render formatted message content ───
  const renderMessageContent = (message: Message) => {
    if (message.role === 'user') {
      return <span className="whitespace-pre-wrap break-words" style={{ overflowWrap: 'break-word', wordBreak: 'break-word' }}>{message.content}</span>
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
  const displayedRows = currentTableData.slice(0, visibleRows)
  const hasMoreRows = currentTableData.length > visibleRows

  // ─── ER Diagram Layout ───
  const computeERLayout = () => {
    const tableNames = Object.keys(generatedData)
    if (tableNames.length === 0) return { nodes: [], edges: [] }

    const nodes: Array<{ name: string; x: number; y: number; schema: SchemaTable; rows: number }> = []
    const edges: Array<{ from: string; to: string; fromCol: string; toCol: string; type: string }> = []

    // Hierarchical layout
    const colWidth = 220
    const rowHeight = 200
    const cols = Math.ceil(Math.sqrt(tableNames.length))

    tableNames.forEach((name, i) => {
      const col = i % cols
      const row = Math.floor(i / cols)
      const schema = generatedSchema.find(t => t.name === name)
      const rows = (generatedData[name] as unknown[])?.length || 0

      nodes.push({
        name,
        x: 60 + col * (colWidth + 80),
        y: 60 + row * (rowHeight + 40),
        schema: schema || { name, columns: [] },
        rows,
      })

      // Find FK relationships
      if (schema) {
        for (const col of schema.columns) {
          if (col.name.endsWith('_id') && col.name !== 'id') {
            const targetTable = col.name.replace('_id', '')
            if (tableNames.includes(targetTable)) {
              edges.push({
                from: name,
                to: targetTable,
                fromCol: col.name,
                toCol: 'id',
                type: '1:N',
              })
            }
          }
        }
      }
    })

    return { nodes, edges }
  }

  const erLayout = hasGeneratedData ? computeERLayout() : { nodes: [], edges: [] }

  // SVG dimensions based on layout
  const svgWidth = Math.max(600, erLayout.nodes.length > 0 ? Math.max(...erLayout.nodes.map(n => n.x)) + 280 : 600)
  const svgHeight = Math.max(400, erLayout.nodes.length > 0 ? Math.max(...erLayout.nodes.map(n => n.y)) + 250 : 400)

  return (
    <div className="flex h-[calc(100vh-44px)] bg-background">
      {/* ─── Left Panel: AI Chat (resizable) ─── */}
      <div className="flex flex-col border-r bg-background shrink-0" style={{ width: chatWidth }}>
        {/* Chat Header */}
        <div className="px-3 py-2.5 border-b flex items-center justify-between bg-card shrink-0">
          <div className="flex items-center gap-2">
            <div className="h-6 w-6 rounded-lg bg-gradient-to-br from-amber-500 to-red-600 flex items-center justify-center">
              <Sparkles className="h-3 w-3 text-white" />
            </div>
            <div>
              <h2 className="text-xs font-semibold">SynthForge AI</h2>
              <p className="text-[9px] text-muted-foreground">DeepSeek Reasoner</p>
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
              placeholder="Describe the data you need..."
              disabled={loading}
              className="flex-1 text-xs h-8"
            />
            <Button
              onClick={() => sendMessage()}
              disabled={loading || !input.trim()}
              size="sm"
              className="bg-gradient-to-r from-amber-600 to-red-600 hover:from-amber-700 hover:to-red-700 text-white h-8 w-8 p-0"
            >
              {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
            </Button>
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
          <div className="flex items-center gap-2">
            {hasGeneratedData && (
              <>
                <Database className="h-3.5 w-3.5 text-amber-600" />
                <Input
                  value={databaseName}
                  onChange={(e) => setDatabaseName(e.target.value)}
                  className="h-6 text-xs font-medium border-transparent hover:border-input focus:border-input w-44 px-1"
                />
              </>
            )}
            {!hasGeneratedData && (
              <span className="text-xs text-muted-foreground">No database generated yet</span>
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
                  disabled={saving}
                >
                  {saving ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : <Save className="h-2.5 w-2.5" />}
                  Save
                </Button>
                {databaseId && (
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
                <div className="w-40 border-r bg-muted/30 flex flex-col shrink-0">
                  <div className="px-2 py-1.5 border-b flex items-center justify-between">
                    <p className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wider">Tables</p>
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
                  {selectedTable && currentTableData.length > 0 ? (
                    <>
                      <div className="px-2.5 py-1.5 border-b flex items-center justify-between shrink-0">
                        <div className="flex items-center gap-1.5">
                          <Table2 className="h-3 w-3 text-amber-600" />
                          <span className="text-xs font-medium">{selectedTable}</span>
                          <Badge variant="outline" className="text-[9px]">
                            {currentTableData.length} rows
                          </Badge>
                        </div>
                        <div className="flex items-center gap-0.5">
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
                          <Button variant="ghost" size="sm" className="h-5 w-5 p-0" onClick={() => copyToClipboard(JSON.stringify(currentTableData, null, 2))}>
                            <Copy className="h-2.5 w-2.5" />
                          </Button>
                          <Button variant="ghost" size="sm" className="h-5 w-5 p-0" onClick={() => exportAsJSON(currentTableData, `${selectedTable}.json`)}>
                            <Download className="h-2.5 w-2.5" />
                          </Button>
                        </div>
                      </div>
                      <div className="flex-1 overflow-auto">
                        <table className="w-full text-[11px] border-collapse">
                          <thead className="sticky top-0 z-10 bg-background">
                            <tr className="border-b">
                              <th className="text-left py-1.5 px-1 font-medium text-muted-foreground bg-muted/50 border-r w-6">
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
                              <th className="text-left py-1.5 px-2 font-medium text-muted-foreground bg-muted/50 border-r w-8">#</th>
                              {currentTableColumns.map((col) => (
                                <th key={col} className="text-left py-1.5 px-2 font-medium text-muted-foreground bg-muted/50 whitespace-nowrap border-r last:border-r-0 min-w-[90px]">
                                  <div className="flex items-center gap-1">
                                    <span className="font-mono text-[10px]">{col}</span>
                                    {generatedSchema
                                      .find(t => t.name === selectedTable)
                                      ?.columns.find(c => c.name === col) && (
                                      <Badge variant="secondary" className="text-[7px] px-0.5 py-0 font-mono">
                                        {generatedSchema.find(t => t.name === selectedTable)?.columns.find(c => c.name === col)?.type}
                                      </Badge>
                                    )}
                                  </div>
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {displayedRows.map((row, i) => (
                              <tr key={i} className={`border-b hover:bg-muted/30 transition-colors ${selectedRows.has(i) ? 'bg-amber-50 dark:bg-amber-950/20' : ''}`}>
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
                                {Object.entries(row as Record<string, unknown>).map(([colName, val], j) => (
                                  <td key={j} className="py-1 px-2 font-mono text-[10px] whitespace-nowrap max-w-[180px] truncate border-r last:border-r-0"
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
                                ))}
                              </tr>
                            ))}
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
                  ) : (
                    <div className="flex-1 flex items-center justify-center text-muted-foreground">
                      <p className="text-xs">Select a table to view data</p>
                    </div>
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
                        queryHistory.map((q, i) => (
                          <DropdownMenuItem key={i} onClick={() => setSqlEditor(q)}>
                            <code className="text-[10px] truncate max-w-[280px]">{q}</code>
                          </DropdownMenuItem>
                        ))
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
                        <Save className="h-2.5 w-2.5" />
                        Save
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-80">
                      {savedQueries.length === 0 ? (
                        <DropdownMenuItem disabled>No saved queries</DropdownMenuItem>
                      ) : (
                        savedQueries.map((sq, i) => (
                          <DropdownMenuItem key={i} onClick={() => setSqlEditor(sq.sql)}>
                            <span className="text-[10px] font-medium mr-2">{sq.name}</span>
                            <code className="text-[9px] text-muted-foreground truncate max-w-[200px]">{sq.sql}</code>
                          </DropdownMenuItem>
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
                <div className="w-56 border-r bg-muted/30 flex flex-col shrink-0">
                  <div className="px-2 py-1.5 border-b">
                    <p className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wider">Schema Tree</p>
                  </div>
                  <ScrollArea className="flex-1 p-1.5">
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
                        <marker id="arrowhead-many" markerWidth="10" markerHeight="7" refX="10" refY="3.5" orient="auto" markerUnits="strokeWidth">
                          <polygon points="0 0, 10 3.5, 0 7" className="fill-violet-500 dark:fill-violet-400" />
                        </marker>
                        <marker id="arrowhead-one" markerWidth="8" markerHeight="6" refX="0" refY="3" orient="auto" markerUnits="strokeWidth">
                          <line x1="0" y1="0" x2="8" y2="3" className="stroke-violet-500 dark:stroke-violet-400" strokeWidth="1.5" />
                          <line x1="0" y1="6" x2="8" y2="3" className="stroke-violet-500 dark:stroke-violet-400" strokeWidth="1.5" />
                        </marker>
                        <marker id="crowfoot-many" markerWidth="12" markerHeight="12" refX="12" refY="6" orient="auto" markerUnits="strokeWidth">
                          <line x1="0" y1="0" x2="12" y2="6" className="stroke-violet-500 dark:stroke-violet-400" strokeWidth="1.2" />
                          <line x1="0" y1="12" x2="12" y2="6" className="stroke-violet-500 dark:stroke-violet-400" strokeWidth="1.2" />
                          <line x1="0" y1="6" x2="12" y2="6" className="stroke-violet-500 dark:stroke-violet-400" strokeWidth="1.2" />
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
                            {/* Main line */}
                            <line
                              x1={fromX}
                              y1={fromY}
                              x2={toX}
                              y2={toY}
                              className="stroke-violet-400 dark:stroke-violet-500"
                              strokeWidth={1.5}
                              strokeDasharray={isOptional ? '6 3' : 'none'}
                              opacity={0.7}
                              markerEnd="url(#crowfoot-many)"
                              markerStart="url(#arrowhead-one)"
                            />

                            {/* FK column label at midpoint */}
                            <rect
                              x={midX - labelWidth / 2}
                              y={midY - labelHeight / 2 - 8}
                              width={labelWidth}
                              height={labelHeight}
                              rx={3}
                              className="fill-card stroke-violet-300 dark:stroke-violet-600"
                              strokeWidth={0.5}
                            />
                            <text
                              x={midX}
                              y={midY - 3}
                              textAnchor="middle"
                              className="fill-violet-700 dark:fill-violet-300"
                              fontSize={7}
                              fontWeight={500}
                              fontFamily="monospace"
                            >
                              {labelText}
                            </text>

                            {/* "1" label at the "one" end (near toNode/target) */}
                            <text
                              x={toX + (fromX - toX) * 0.08}
                              y={toY + (fromY - toY) * 0.08 - 4}
                              textAnchor="middle"
                              className="fill-violet-600 dark:fill-violet-400"
                              fontSize={9}
                              fontWeight={700}
                            >
                              1
                            </text>

                            {/* "N" label at the "many" end (near fromNode/source) */}
                            <text
                              x={fromX + (toX - fromX) * 0.08}
                              y={fromY + (toY - fromY) * 0.08 - 4}
                              textAnchor="middle"
                              className="fill-violet-600 dark:fill-violet-400"
                              fontSize={9}
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
                              className="fill-black/5 dark:fill-black/20"
                            />
                            {/* Main box */}
                            <rect
                              x={node.x}
                              y={node.y}
                              width={nodeWidth}
                              height={nodeHeight}
                              rx={6}
                              className="fill-card stroke-amber-500/50"
                              strokeWidth={selectedTable === node.name ? 2 : 1}
                            />
                            {/* Header */}
                            <rect
                              x={node.x}
                              y={node.y}
                              width={nodeWidth}
                              height={headerHeight}
                              rx={6}
                              className="fill-amber-100 dark:fill-amber-900/40"
                            />
                            <rect
                              x={node.x}
                              y={node.y + headerHeight - 6}
                              width={nodeWidth}
                              height={6}
                              className="fill-amber-100 dark:fill-amber-900/40"
                            />
                            {/* Table name */}
                            <text
                              x={node.x + 10}
                              y={node.y + 16}
                              className="fill-amber-800 dark:fill-amber-300"
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
                              className="fill-muted-foreground"
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
                                  className={col.name === 'id' || col.name.endsWith('_id') ? 'fill-amber-700 dark:fill-amber-400' : 'fill-foreground'}
                                  fontSize={8}
                                  fontFamily="monospace"
                                >
                                  {col.name === 'id' ? '🔑 ' : col.name.endsWith('_id') ? '🔗 ' : ''}{col.name}
                                </text>
                                <text
                                  x={node.x + nodeWidth - 10}
                                  y={node.y + headerHeight + 10 + ci * colHeight}
                                  textAnchor="end"
                                  className="fill-muted-foreground"
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
                                className="fill-muted-foreground"
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
