'use client'

import { useState, useRef, useEffect, useCallback, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
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
} from 'lucide-react'
import { toast } from 'sonner'
import { apiPost, apiPatch, apiDelete, invalidateCache } from '@/lib/api-client'

// ─── Types ───
interface Message {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  reasoningContent?: string
  agentName?: string
  timestamp: Date
  isStreaming?: boolean
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

  // Clean up any remaining think/thinking tags
  displayText = displayText.replace(/<think[\s\S]*?<\/think>/gi, '')
  displayText = displayText.replace(/<thinking[\s\S]*?<\/thinking>/gi, '')
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

// ─── Main Studio Page Component ───
function StudioPageInner({ databaseId, initialName, initialSchema, initialData }: StudioPageProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [messages, setMessages] = useState<Message[]>([
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

  const chatEndRef = useRef<HTMLDivElement>(null)
  const chatContainerRef = useRef<HTMLDivElement>(null)
  const abortRef = useRef<AbortController | null>(null)

  const hasGeneratedData = generatedSchema.length > 0 || Object.keys(generatedData).length > 0

  // Handle initial query from dashboard navigation
  useEffect(() => {
    const q = searchParams.get('q')
    if (q && !initialQuerySent) {
      setInitialQuerySent(true)
      setInput(q)
      // Small delay to let the component mount
      setTimeout(() => {
        const inputEl = document.querySelector<HTMLInputElement>('input[placeholder="Describe the data you need..."]')
        if (inputEl) {
          // Trigger send via programmatic input
        }
      }, 100)
    }
  }, [searchParams, initialQuerySent])

  // Auto-select first table when data changes
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

  // ─── Send message with DeepSeek streaming ───
  const sendMessage = useCallback(async (messageText?: string) => {
    const textToSend = messageText || input
    if (!textToSend.trim() || loading) return

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
    setReasoningVisible(true)
    setCurrentReasoning('')

    const controller = new AbortController()
    abortRef.current = controller

    try {
      // Build history from previous messages
      const history = messages
        .filter(m => m.role === 'user' || m.role === 'assistant')
        .map(m => ({ role: m.role, content: m.content }))

      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: userMessage.content,
          ...(databaseId ? { databaseId, databaseName } : {}),
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
              setMessages(prev => prev.map(m =>
                m.id === assistantId
                  ? { ...m, content: fullContent }
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

          // Auto-save the data immediately
          autoSaveData(tables, schema, parsedName)
        }

        // Update the message with cleaned display text (no JSON)
        if (displayText && displayText !== fullContent) {
          setMessages(prev => prev.map(m =>
            m.id === assistantId
              ? { ...m, content: displayText }
              : m
          ))
        }
      }

      setLoading(false)
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
      setReasoningVisible(false)
    }
  }, [input, loading, messages, databaseId, databaseName])

  // Auto-send query from dashboard
  useEffect(() => {
    const q = searchParams.get('q')
    if (q && !initialQuerySent) {
      setInitialQuerySent(true)
      const timer = setTimeout(() => {
        sendMessage(q)
      }, 300)
      return () => clearTimeout(timer)
    }
  }, [searchParams, initialQuerySent, sendMessage])

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

  const downloadJSON = (data: unknown, filename: string) => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
  }

  // ─── Generate SQL from schema ───
  const generateSQL = (): string => {
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

  // ─── Render formatted message content (no raw JSON) ───
  const renderMessageContent = (message: Message) => {
    if (message.role === 'user') {
      return <span className="whitespace-pre-wrap">{message.content}</span>
    }

    const content = message.content
    if (!content) {
      if (message.isStreaming) {
        return <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      }
      return null
    }

    // Format the text with basic markdown-like rendering
    const parts = content.split(/(\*\*[^*]+\*\*|\`[^`]+\`|\n)/g)
    return (
      <div className="whitespace-pre-wrap text-sm leading-relaxed">
        {parts.map((part, i) => {
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
        })}
      </div>
    )
  }

  // ─── Current table data for display ───
  const currentTableData = selectedTable ? generatedData[selectedTable] || [] : []
  const currentTableColumns = currentTableData.length > 0 ? Object.keys(currentTableData[0] as Record<string, unknown>) : []
  const displayedRows = currentTableData.slice(0, visibleRows)
  const hasMoreRows = currentTableData.length > visibleRows

  return (
    <div className="flex h-[calc(100vh-44px)] bg-background">
      {/* ─── Left Panel: AI Chat (1/4 width) ─── */}
      <div className="flex flex-col w-1/4 min-w-[280px] max-w-[400px] border-r bg-background">
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

        {/* Chat Messages - Scrollable */}
        <div ref={chatContainerRef} className="flex-1 overflow-y-auto px-2.5 py-3 space-y-2.5 scroll-smooth">
          {messages.map((message) => (
            <div
              key={message.id}
              className={`flex gap-1.5 ${message.role === 'user' ? 'justify-end' : ''}`}
            >
              {message.role === 'assistant' && (
                <div className="h-5 w-5 rounded-full bg-gradient-to-br from-amber-500 to-red-600 flex items-center justify-center shrink-0 mt-0.5">
                  <Bot className="h-2.5 w-2.5 text-white" />
                </div>
              )}
              <div
                className={`max-w-[88%] rounded-lg px-2.5 py-2 ${
                  message.role === 'user'
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted/70'
                }`}
              >
                {message.role === 'assistant' && (
                  <p className="text-[9px] font-medium text-amber-600 dark:text-amber-400 mb-0.5">
                    {message.agentName}
                    {message.isStreaming && ' · typing...'}
                  </p>
                )}
                {renderMessageContent(message)}
              </div>
              {message.role === 'user' && (
                <div className="h-5 w-5 rounded-full bg-primary flex items-center justify-center shrink-0 mt-0.5">
                  <User className="h-2.5 w-2.5 text-primary-foreground" />
                </div>
              )}
            </div>
          ))}
          {loading && !messages[messages.length - 1]?.isStreaming && (
            <div className="flex gap-1.5">
              <div className="h-5 w-5 rounded-full bg-gradient-to-br from-amber-500 to-red-600 flex items-center justify-center shrink-0">
                <Bot className="h-2.5 w-2.5 text-white" />
              </div>
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

      {/* ─── Right Panel: Data/SQL/Explorer (3/4 width) ─── */}
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
                  <div className="px-2 py-1.5 border-b">
                    <p className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wider">Tables</p>
                  </div>
                  <div className="flex-1 overflow-y-auto p-1 space-y-0.5">
                    {Object.entries(generatedData).map(([tableName, rows]) => (
                      <button
                        key={tableName}
                        onClick={() => { setSelectedTable(tableName); setVisibleRows(20) }}
                        className={`w-full text-left px-2 py-1 rounded text-[11px] font-medium transition-colors flex items-center gap-1.5 ${
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

                {/* Data grid with horizontal + vertical scroll + lazy load */}
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
                          <Button variant="ghost" size="sm" className="h-5 w-5 p-0" onClick={() => copyToClipboard(JSON.stringify(currentTableData, null, 2))}>
                            <Copy className="h-2.5 w-2.5" />
                          </Button>
                          <Button variant="ghost" size="sm" className="h-5 w-5 p-0" onClick={() => downloadJSON(currentTableData, `${selectedTable}.json`)}>
                            <Download className="h-2.5 w-2.5" />
                          </Button>
                        </div>
                      </div>
                      <div className="flex-1 overflow-auto">
                        <table className="w-full text-[11px] border-collapse">
                          <thead className="sticky top-0 z-10 bg-background">
                            <tr className="border-b">
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
                              <tr key={i} className="border-b hover:bg-muted/30 transition-colors">
                                <td className="py-1 px-2 text-muted-foreground font-mono text-[9px] border-r bg-muted/20">
                                  {i + 1}
                                </td>
                                {Object.values(row as Record<string, unknown>).map((val, j) => (
                                  <td key={j} className="py-1 px-2 font-mono text-[10px] whitespace-nowrap max-w-[180px] truncate border-r last:border-r-0">
                                    {val === null ? (
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
                      {/* Lazy load more rows */}
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
                <div className="flex-1 overflow-auto p-3">
                  <pre className="text-[11px] font-mono bg-muted/50 rounded-lg p-3 whitespace-pre-wrap leading-relaxed border">
                    {generateSQL()}
                  </pre>
                </div>
                <div className="px-3 py-1.5 border-t flex items-center gap-1.5 bg-muted/30 shrink-0">
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-[10px] gap-1 h-6"
                    onClick={() => copyToClipboard(generateSQL())}
                  >
                    <Copy className="h-2.5 w-2.5" />
                    Copy SQL
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-[10px] gap-1 h-6"
                    onClick={() => {
                      const blob = new Blob([generateSQL()], { type: 'text/sql' })
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
                </div>
              </div>
            </TabsContent>

            {/* ─── Explorer Tab ─── */}
            <TabsContent value="explorer" className="flex-1 overflow-hidden m-0">
              <div className="flex h-full">
                {/* Schema tree sidebar */}
                <div className="w-48 border-r bg-muted/30 flex flex-col shrink-0">
                  <div className="px-2 py-1.5 border-b">
                    <p className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wider">Schema Tree</p>
                  </div>
                  <ScrollArea className="flex-1 p-1.5">
                    <div className="space-y-1.5">
                      {generatedSchema.map((table) => {
                        const tableData = generatedData[table.name] as Record<string, unknown>[] | undefined
                        return (
                          <div key={table.name} className="rounded border bg-card overflow-hidden">
                            <div className="px-2 py-1 bg-muted/50 flex items-center gap-1.5 border-b">
                              <Table2 className="h-2.5 w-2.5 text-amber-600" />
                              <span className="text-[10px] font-semibold">{table.name}</span>
                              <Badge variant="outline" className="text-[7px] ml-auto px-0.5 py-0">
                                {tableData?.length || 0} rows
                              </Badge>
                            </div>
                            <div className="p-1 space-y-px">
                              {table.columns.map((col) => (
                                <div key={col.name} className="flex items-center justify-between px-1 py-px rounded text-[9px]">
                                  <div className="flex items-center gap-0.5">
                                    {(col.name === 'id' || col.name.endsWith('_id')) && (
                                      <div className="h-1 w-1 rounded-full bg-amber-500" title="Key" />
                                    )}
                                    <span className="font-mono">{col.name}</span>
                                  </div>
                                  <span className="text-muted-foreground font-mono text-[8px]">{col.type}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </ScrollArea>
                </div>

                {/* Graph visualization area */}
                <div className="flex-1 flex items-center justify-center bg-muted/10 relative overflow-auto">
                  <svg width="100%" height="100%" className="absolute inset-0">
                    {(() => {
                      const tableNames = Object.keys(generatedData)
                      const centerX = 350
                      const centerY = 250
                      const radius = Math.min(180, tableNames.length * 55)

                      return tableNames.map((name, i) => {
                        const angle = (2 * Math.PI * i) / tableNames.length - Math.PI / 2
                        const x = centerX + radius * Math.cos(angle)
                        const y = centerY + radius * Math.sin(angle)

                        const schema = generatedSchema.find(t => t.name === name)
                        const fkColumns = schema?.columns.filter(c => c.name.endsWith('_id') && c.name !== 'id') || []

                        return (
                          <g key={name}>
                            {fkColumns.map((col) => {
                              const targetTable = col.name.replace('_id', '')
                              const targetIdx = tableNames.indexOf(targetTable)
                              if (targetIdx === -1) return null
                              const targetAngle = (2 * Math.PI * targetIdx) / tableNames.length - Math.PI / 2
                              const tx = centerX + radius * Math.cos(targetAngle)
                              const ty = centerY + radius * Math.sin(targetAngle)

                              return (
                                <line
                                  key={col.name}
                                  x1={x}
                                  y1={y}
                                  x2={tx}
                                  y2={ty}
                                  stroke="currentColor"
                                  className="text-muted-foreground"
                                  strokeWidth={1.5}
                                  strokeDasharray="4 4"
                                  opacity={0.3}
                                />
                              )
                            })}
                            <rect
                              x={x - 55}
                              y={y - 18}
                              width={110}
                              height={36}
                              rx={6}
                              className="fill-card stroke-amber-500"
                              strokeWidth={1.5}
                            />
                            <text
                              x={x}
                              y={y - 2}
                              textAnchor="middle"
                              dominantBaseline="middle"
                              className="fill-foreground"
                              fontSize={10}
                              fontWeight={600}
                            >
                              {name}
                            </text>
                            <text
                              x={x}
                              y={y + 10}
                              textAnchor="middle"
                              className="fill-muted-foreground"
                              fontSize={7}
                            >
                              {(generatedData[name] as Record<string, unknown>[])?.length || 0} rows · {schema?.columns.length || 0} cols
                            </text>
                          </g>
                        )
                      })
                    })()}
                  </svg>

                  {Object.keys(generatedData).length <= 1 && (
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                      <div className="text-center text-muted-foreground">
                        <GitBranch className="h-6 w-6 mx-auto mb-1.5 opacity-20" />
                        <p className="text-[10px]">Relationship graph appears with</p>
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
