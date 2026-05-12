'use client'

import React, { useState, useEffect, useRef, useCallback } from 'react'
import ReactMarkdown from 'react-markdown'
import {
  Database, MessageSquare, Plus, Send, ChevronRight, ChevronDown,
  Table2, Download, Copy, Sparkles, LayoutDashboard,
  Code2, FileJson, FileText, Trash2, Zap, Upload, X, Check,
  Loader2, ArrowRight, Hash, Paperclip, Play, FolderTree,
  Brain, Wand2, AlertCircle, Circle,
  Columns3, Key, Link2, RefreshCw
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger
} from '@/components/ui/dialog'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { useToast } from '@/hooks/use-toast'

// ─── Types ─────────────────────────────────────────────
interface Workspace { id: string; name: string; slug: string; agentInstructions: string }
interface Project { id: string; name: string; description: string; workspaceId: string; databases?: Database_[] }
interface Database_ { id: string; name: string; dbType: string; schemaJson: string; dataJson: string; projectId: string; _count?: { datasets: number; conversations: number } }
interface Message { id: string; role: string; content: string; sqlCode: string; tokensIn: number; tokensOut: number; cost: number; createdAt: string; agentName: string; reasoningSteps: string; options: string; tablesJson: string }
interface Conversation { id: string; title: string; messages: Message[] }

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

type View = 'landing' | 'dashboard' | 'studio'
type AgentMode = 'plan' | 'execute' | 'auto'

// ─── Main App ──────────────────────────────────────────
export default function SynthForgeApp() {
  const [view, setView] = useState<View>('landing')
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [activeWorkspace, setActiveWorkspace] = useState<Workspace | null>(null)
  const [projects, setProjects] = useState<Project[]>([])
  const [activeDb, setActiveDb] = useState<Database_ | null>(null)
  const [conversation, setConversation] = useState<Conversation | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [isStreaming, setIsStreaming] = useState(false)
  const [streamingContent, setStreamingContent] = useState('')
  const [showNewDbDialog, setShowNewDbDialog] = useState(false)
  const [newDbName, setNewDbName] = useState('')
  const [newDbSchema, setNewDbSchema] = useState('')
  const [agentMode, setAgentMode] = useState<AgentMode>('auto')
  const [attachedFiles, setAttachedFiles] = useState<{ name: string; content: string; type: string }[]>([])
  const [rightTab, setRightTab] = useState('preview')
  const [sqlQuery, setSqlQuery] = useState('')
  const [sqlResult, setSqlResult] = useState<string>('')
  const [expandedReasoning, setExpandedReasoning] = useState<Record<string, boolean>>({})
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const chatInputRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const { toast } = useToast()

  // Load workspaces on mount
  useEffect(() => {
    loadWorkspaces()
  }, [])

  // Auto-scroll chat
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, streamingContent])

  const loadWorkspaces = async () => {
    try {
      const res = await fetch('/api/workspaces')
      const data = await res.json()
      if (data.workspaces?.length > 0) {
        setWorkspaces(data.workspaces)
        setActiveWorkspace(data.workspaces[0])
        loadProjects(data.workspaces[0].id)
      }
    } catch {
      toast({ title: 'Error', description: 'Failed to load workspaces', variant: 'destructive' })
    }
  }

  const loadProjects = async (workspaceId: string) => {
    try {
      const res = await fetch(`/api/projects?workspaceId=${workspaceId}`)
      const data = await res.json()
      if (data.projects) {
        setProjects(data.projects)
      }
    } catch {
      toast({ title: 'Error', description: 'Failed to load projects', variant: 'destructive' })
    }
  }

  const refreshDatabase = async (dbId: string) => {
    try {
      const res = await fetch('/api/databases')
      const data = await res.json()
      const updated = data.databases?.find((d: Database_) => d.id === dbId)
      if (updated) setActiveDb(updated)
    } catch { /* silent */ }
  }

  const allDatabases = projects.flatMap(p => p.databases || [])

  const openDatabase = async (db: Database_) => {
    setActiveDb(db)
    setConversation(null)
    setMessages([])
    setStreamingContent('')
    setRightTab('preview')
    setAgentMode('auto')
    setSqlQuery('')
    setSqlResult('')
    setAttachedFiles([])
    setView('studio')
  }

  // ─── Core Send Message ──────────────────────────────────
  const sendMessage = useCallback(async (messageText: string, files: { name: string; content: string; type: string }[] = []) => {
    if ((!messageText.trim() && files.length === 0) || isStreaming || !activeDb) return

    setInput('')
    setIsStreaming(true)
    setStreamingContent('')

    const tempUserMsg: Message = {
      id: 'temp-' + Date.now(),
      role: 'user',
      content: messageText + (files.length > 0 ? `\n\n[Attached: ${files.map(f => f.name).join(', ')}]` : ''),
      sqlCode: '',
      tokensIn: 0,
      tokensOut: 0,
      cost: 0,
      createdAt: new Date().toISOString(),
      agentName: '',
      reasoningSteps: '[]',
      options: '[]',
      tablesJson: '{}'
    }
    setMessages(prev => [...prev, tempUserMsg])

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversationId: conversation?.id || null,
          databaseId: activeDb.id,
          workspaceId: activeWorkspace?.id,
          message: messageText,
          stream: true,
          agentMode,
          files: files.map(f => ({ name: f.name, content: f.content, type: f.type }))
        })
      })

      if (!res.ok) throw new Error('Chat request failed')

      const convId = res.headers.get('X-Conversation-Id')
      if (convId && !conversation) {
        setConversation({ id: convId, title: messageText.slice(0, 60), messages: [] })
      }

      const reader = res.body?.getReader()
      if (!reader) throw new Error('No stream body')

      let fullContent = ''
      const decoder = new TextDecoder()

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        const chunk = decoder.decode(value, { stream: true })
        const lines = chunk.split('\n')

        for (const line of lines) {
          if (line.startsWith('data: ') && line !== 'data: [DONE]') {
            try {
              const data = JSON.parse(line.slice(6))
              fullContent += data.content || ''
              setStreamingContent(fullContent)
            } catch { /* skip */ }
          }
        }
      }

      const parsed = parseAgentResponse(fullContent)
      const assistantMsg: Message = {
        id: 'msg-' + Date.now(),
        role: 'assistant',
        content: fullContent,
        sqlCode: parsed?.sqlCode || '',
        tokensIn: 0,
        tokensOut: 0,
        cost: 0,
        createdAt: new Date().toISOString(),
        agentName: parsed?.agentName || agentMode + '-agent',
        reasoningSteps: JSON.stringify(parsed?.reasoningSteps || []),
        options: JSON.stringify(parsed?.options || []),
        tablesJson: parsed?.tables ? JSON.stringify(parsed.tables) : '{}'
      }
      setMessages(prev => [...prev, assistantMsg])
      setStreamingContent('')

      await refreshDatabase(activeDb.id)

    } catch (error) {
      toast({ title: 'Error', description: 'Failed to get AI response. Please try again.', variant: 'destructive' })
      setMessages(prev => prev.filter(m => m.id !== tempUserMsg.id))
    } finally {
      setIsStreaming(false)
    }
  }, [isStreaming, activeDb, conversation, activeWorkspace, toast, agentMode])

  // ─── Chat Submit (from input) ────────────────────────────
  const handleSubmit = useCallback(async () => {
    const msgText = input.trim()
    const files = [...attachedFiles]
    if (!msgText && files.length === 0) return
    setAttachedFiles([])
    await sendMessage(msgText, files)
  }, [input, attachedFiles, sendMessage])

  const parseAgentResponse = (content: string) => {
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0])
        return {
          action: parsed.action || 'generate',
          agentName: parsed.agentName || 'auto-agent',
          explanation: parsed.explanation || '',
          tables: parsed.tables || undefined,
          sqlCode: parsed.sqlCode || '',
          options: parsed.options || [],
          reasoningSteps: parsed.reasoningSteps || [],
          followUpQuestions: parsed.followUpQuestions || []
        }
      }
    } catch { /* not JSON */ }
    return null
  }

  const getTablesFromMessages = (): Record<string, Record<string, unknown>[]> => {
    const allTables: Record<string, Record<string, unknown>[]> = {}
    // Also check database dataJson
    if (activeDb?.dataJson) {
      try {
        const dbData = JSON.parse(activeDb.dataJson)
        if (dbData && typeof dbData === 'object') {
          for (const [k, v] of Object.entries(dbData)) {
            if (Array.isArray(v)) allTables[k] = v
          }
        }
      } catch { /* */ }
    }
    // Also parse from messages
    for (const msg of messages) {
      if (msg.role === 'assistant') {
        try {
          const tables = JSON.parse(msg.tablesJson || '{}')
          for (const [k, v] of Object.entries(tables)) {
            if (Array.isArray(v)) allTables[k] = v
          }
        } catch { /* */ }
      }
    }
    return allTables
  }

  const getSchemaFromDb = (): Record<string, { columns: Record<string, string> }> => {
    if (!activeDb?.schemaJson) return {}
    try {
      return JSON.parse(activeDb.schemaJson)
    } catch { return {} }
  }

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
    toast({ title: 'Copied!', description: 'Content copied to clipboard' })
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files) return

    Array.from(files).forEach(file => {
      const reader = new FileReader()
      reader.onload = (ev) => {
        const content = ev.target?.result as string
        const ext = file.name.split('.').pop()?.toLowerCase() || ''
        const type = ext === 'sql' ? 'sql' : ext === 'csv' ? 'csv' : ext === 'json' ? 'json' : 'text'
        setAttachedFiles(prev => [...prev, { name: file.name, content, type }])
      }
      reader.readAsText(file)
    })
    // Reset file input
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const removeFile = (index: number) => {
    setAttachedFiles(prev => prev.filter((_, i) => i !== index))
  }

  const createDatabase = async () => {
    if (!newDbName.trim() || !projects[0]) return

    let schemaObj = {}
    if (newDbSchema.trim()) {
      try {
        schemaObj = JSON.parse(newDbSchema)
      } catch {
        toast({ title: 'Invalid JSON', description: 'Schema must be valid JSON', variant: 'destructive' })
        return
      }
    }

    try {
      const res = await fetch('/api/databases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newDbName,
          dbType: 'postgresql',
          schemaJson: schemaObj,
          projectId: projects[0].id
        })
      })

      const data = await res.json()
      if (data.database) {
        await loadProjects(activeWorkspace!.id)
        setShowNewDbDialog(false)
        setNewDbName('')
        setNewDbSchema('')
        toast({ title: 'Database Created', description: `${newDbName} is ready` })
      }
    } catch {
      toast({ title: 'Error', description: 'Failed to create database', variant: 'destructive' })
    }
  }

  const deleteDatabase = async (dbId: string) => {
    try {
      await fetch(`/api/databases?id=${dbId}`, { method: 'DELETE' })
      if (activeDb?.id === dbId) {
        setActiveDb(null)
        setView('dashboard')
      }
      await loadProjects(activeWorkspace!.id)
      toast({ title: 'Deleted', description: 'Database removed' })
    } catch {
      toast({ title: 'Error', description: 'Failed to delete database', variant: 'destructive' })
    }
  }

  const exportData = (tables: Record<string, Record<string, unknown>[]>, format: string) => {
    let content = ''
    let filename = 'synthforge-data'
    let type = 'text/plain'

    if (format === 'json') {
      content = JSON.stringify(tables, null, 2)
      filename += '.json'
      type = 'application/json'
    } else if (format === 'csv') {
      const tableName = Object.keys(tables)[0]
      const rows = tables[tableName]
      if (rows?.length > 0) {
        const headers = Object.keys(rows[0])
        content = [headers.join(','), ...rows.map(r => headers.map(h => `"${r[h] ?? ''}"`).join(','))].join('\n')
      }
      filename += '.csv'
      type = 'text/csv'
    } else if (format === 'sql') {
      const statements: string[] = []
      for (const [tableName, rows] of Object.entries(tables)) {
        if (rows?.length > 0) {
          const cols = Object.keys(rows[0])
          for (const row of rows) {
            const values = cols.map(c => {
              const v = row[c]
              return typeof v === 'string' ? `'${v.replace(/'/g, "''")}'` : String(v ?? 'NULL')
            })
            statements.push(`INSERT INTO ${tableName} (${cols.join(', ')}) VALUES (${values.join(', ')});`)
          }
        }
      }
      content = statements.join('\n')
      filename += '.sql'
      type = 'text/plain'
    }

    const blob = new Blob([content], { type })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
  }

  const runSqlPlayground = () => {
    if (!sqlQuery.trim()) return
    const tables = getTablesFromMessages()
    const tableName = sqlQuery.match(/FROM\s+(\w+)/i)?.[1] || sqlQuery.match(/from\s+(\w+)/i)?.[1]
    if (tableName && tables[tableName]) {
      setSqlResult(`Found ${tables[tableName].length} rows in "${tableName}"\n\n${JSON.stringify(tables[tableName].slice(0, 5), null, 2)}${tables[tableName].length > 5 ? '\n\n... and more' : ''}`)
    } else {
      setSqlResult(`Query executed (simulated)\n\nAvailable tables: ${Object.keys(tables).join(', ') || 'None'}\n\nNote: SQL Playground runs in preview mode. Generated data is available for inspection.`)
    }
  }

  // ─── Render Helper: Agent Badge ────────────────────────
  const AgentBadge = ({ name }: { name: string }) => {
    const isPlan = name.includes('plan')
    const isExec = name.includes('exec')
    const color = isPlan ? 'bg-blue-100 text-blue-800 border-blue-200' : isExec ? 'bg-green-100 text-green-800 border-green-200' : 'bg-amber-100 text-amber-800 border-amber-200'
    const icon = isPlan ? <Brain className="h-3 w-3" /> : isExec ? <Play className="h-3 w-3" /> : <Wand2 className="h-3 w-3" />
    return (
      <Badge className={`text-xs ${color} gap-1`}>
        {icon} {name}
      </Badge>
    )
  }

  // ─── Render Helper: Reasoning Steps ───────────────────
  const ReasoningTimeline = ({ steps, msgId }: { steps: ReasoningStep[]; msgId: string }) => {
    const isOpen = expandedReasoning[msgId] ?? false
    if (!steps || steps.length === 0) return null

    return (
      <Collapsible open={isOpen} onOpenChange={(o) => setExpandedReasoning(prev => ({ ...prev, [msgId]: o }))}>
        <CollapsibleTrigger className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors mt-2">
          {isOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
          <Brain className="h-3 w-3" /> Reasoning Steps ({steps.length})
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="mt-2 space-y-1.5 pl-1">
            {steps.map((step, i) => (
              <div key={i} className="flex items-start gap-2 text-xs">
                <div className="mt-0.5 shrink-0">
                  {step.status === 'completed' && <Check className="h-3 w-3 text-green-600" />}
                  {step.status === 'running' && <Loader2 className="h-3 w-3 text-yellow-600 animate-spin" />}
                  {step.status === 'failed' && <AlertCircle className="h-3 w-3 text-red-600" />}
                  {step.status === 'pending' && <Circle className="h-3 w-3 text-slate-300" />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="font-medium">{step.label}</span>
                    <Badge variant="outline" className="text-[10px] px-1 py-0 font-mono">{step.type.replace('_', ' ')}</Badge>
                  </div>
                  <p className="text-muted-foreground">{step.description}</p>
                  {step.output && (
                    <p className="text-green-700 mt-0.5 font-mono text-[11px] leading-tight">{step.output}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </CollapsibleContent>
      </Collapsible>
    )
  }

  // ─── Render Helper: Clarification Options ─────────────
  const ClarificationOptions = ({ options }: { options: ClarificationOption[] }) => {
    if (!options || options.length === 0) return null
    return (
      <div className="mt-3 space-y-2">
        <p className="text-xs font-medium text-muted-foreground">Choose an option:</p>
        <div className="flex flex-wrap gap-2">
          {options.map((opt) => (
            <Button
              key={opt.id}
              variant="outline"
              size="sm"
              className="h-auto py-1.5 px-3 text-xs"
              onClick={() => {
                sendMessage(opt.value)
              }}
            >
              {opt.label}
            </Button>
          ))}
        </div>
        {options.some(o => o.description) && (
          <div className="space-y-1 mt-1">
            {options.map(opt => opt.description && (
              <p key={opt.id} className="text-[11px] text-muted-foreground">
                <span className="font-medium">{opt.label}:</span> {opt.description}
              </p>
            ))}
          </div>
        )}
      </div>
    )
  }

  // ─── Render: Assistant Content ────────────────────────
  const renderAssistantContent = (content: string) => {
    // Try to extract just the explanation from JSON responses
    let displayContent = content
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0])
        if (parsed.explanation) {
          displayContent = parsed.explanation
        }
      }
    } catch { /* use raw content */ }

    return (
      <div className="prose prose-sm max-w-none dark:prose-invert prose-p:my-1 prose-headings:my-2 prose-pre:my-1 prose-pre:bg-white prose-pre:border prose-code:text-xs">
        <ReactMarkdown>{displayContent}</ReactMarkdown>
      </div>
    )
  }

  // ─── Render: Data Table ───────────────────────────────
  const DataTable = ({ tableName, rows, page = 0 }: { tableName: string; rows: Record<string, unknown>[]; page?: number }) => {
    const pageSize = 20
    const totalPages = Math.ceil(rows.length / pageSize)
    const startIdx = page * pageSize
    const pageRows = rows.slice(startIdx, startIdx + pageSize)

    return (
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Table2 className="h-4 w-4 text-amber-700" />
              {tableName}
            </CardTitle>
            <Badge variant="secondary" className="text-xs">{rows.length} rows</Badge>
          </div>
        </CardHeader>
        <CardContent>
          {pageRows.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b bg-muted/30">
                    {Object.keys(pageRows[0]).map(key => (
                      <th key={key} className="text-left py-1.5 px-2 font-medium text-muted-foreground whitespace-nowrap">{key}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map((row, i) => (
                    <tr key={i} className="border-b last:border-0 hover:bg-white/50 transition-colors">
                      {Object.values(row).map((val: unknown, j) => (
                        <td key={j} className="py-1.5 px-2 whitespace-nowrap max-w-[200px] truncate">
                          {val === null ? <span className="text-muted-foreground italic">null</span> : String(val)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              {totalPages > 1 && (
                <div className="flex items-center justify-between mt-3 pt-2 border-t">
                  <p className="text-xs text-muted-foreground">Page {page + 1} of {totalPages}</p>
                  <div className="flex gap-1">
                    <Button variant="outline" size="sm" className="h-6 text-xs" disabled={page === 0} onClick={() => { /* Pagination handled by parent */ }}>
                      Prev
                    </Button>
                    <Button variant="outline" size="sm" className="h-6 text-xs" disabled={page >= totalPages - 1}>
                      Next
                    </Button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">No data rows</p>
          )}
        </CardContent>
      </Card>
    )
  }

  // ─── Render: Schema Card ──────────────────────────────
  const SchemaCard = ({ tableName, columns }: { tableName: string; columns: Record<string, string> }) => (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <Table2 className="h-4 w-4 text-amber-700" />
          {tableName}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-1">
          {Object.entries(columns).map(([colName, colType]) => (
            <div key={colName} className="flex items-center justify-between text-xs py-1.5 border-b last:border-0 hover:bg-muted/30 px-1 rounded">
              <div className="flex items-center gap-2">
                {colName.toLowerCase().includes('id') && <Key className="h-3 w-3 text-amber-600" />}
                {colName.toLowerCase().includes('_id') && <Link2 className="h-3 w-3 text-blue-500" />}
                <span className="font-mono font-medium">{colName}</span>
              </div>
              <Badge variant="secondary" className="text-[10px] font-mono">{colType}</Badge>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )

  // ─── Render: Explorer Tree ────────────────────────────
  const ExplorerTree = () => {
    const tables = getTablesFromMessages()
    const schema = getSchemaFromDb()
    const allTableNames = new Set([...Object.keys(tables), ...Object.keys(schema)])

    return (
      <div className="space-y-1 p-2">
        <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground mb-2">
          <FolderTree className="h-3 w-3" /> DATABASE TABLES
        </div>
        {allTableNames.size === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-8">No tables yet. Chat with AI to generate data.</p>
        ) : (
          Array.from(allTableNames).map(tableName => {
            const rows = tables[tableName] || []
            const schemaDef = schema[tableName]
            return (
              <button
                key={tableName}
                className="w-full text-left p-2 rounded-md hover:bg-muted/50 transition-colors group"
                onClick={() => {
                  setRightTab('preview')
                }}
              >
                <div className="flex items-center gap-2">
                  <ChevronRight className="h-3 w-3 text-muted-foreground group-hover:text-foreground" />
                  <Table2 className="h-3.5 w-3.5 text-amber-700" />
                  <span className="text-sm font-medium">{tableName}</span>
                </div>
                <div className="ml-6 mt-0.5 text-[11px] text-muted-foreground">
                  {rows.length > 0 && <span>{rows.length} rows</span>}
                  {schemaDef?.columns && <span>{rows.length > 0 ? ' · ' : ''}{Object.keys(schemaDef.columns).length} columns</span>}
                </div>
                {schemaDef?.columns && (
                  <div className="ml-6 mt-1 flex flex-wrap gap-1">
                    {Object.keys(schemaDef.columns).slice(0, 4).map(col => (
                      <Badge key={col} variant="outline" className="text-[9px] px-1 py-0 font-mono">{col}</Badge>
                    ))}
                    {Object.keys(schemaDef.columns).length > 4 && (
                      <Badge variant="outline" className="text-[9px] px-1 py-0">+{Object.keys(schemaDef.columns).length - 4}</Badge>
                    )}
                  </div>
                )}
              </button>
            )
          })
        )}
      </div>
    )
  }

  // ═══════════════════════════════════════════════════════════
  // LANDING PAGE
  // ═══════════════════════════════════════════════════════════
  if (view === 'landing') {
    return (
      <div className="min-h-screen flex flex-col bg-gradient-to-br from-slate-50 to-slate-100">
        {/* Nav */}
        <nav className="border-b bg-white/80 backdrop-blur-sm sticky top-0 z-50">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-amber-600 to-red-700 flex items-center justify-center">
                <Zap className="h-5 w-5 text-white" />
              </div>
              <span className="text-xl font-bold tracking-tight">SynthForge AI</span>
            </div>
            <div className="flex items-center gap-3">
              <Button variant="ghost" size="sm" onClick={() => setView('dashboard')}>
                Dashboard
              </Button>
              <Button size="sm" className="bg-gradient-to-r from-amber-600 to-red-700 hover:from-amber-700 hover:to-red-800 text-white" onClick={() => setView('dashboard')}>
                Get Started
              </Button>
            </div>
          </div>
        </nav>

        {/* Hero */}
        <main className="flex-1">
          <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 lg:py-32">
            <div className="grid lg:grid-cols-2 gap-12 items-center">
              <div>
                <Badge className="mb-4 bg-amber-100 text-amber-800 border-amber-200">
                  <Sparkles className="h-3 w-3 mr-1" /> AI-Powered
                </Badge>
                <h1 className="text-4xl lg:text-6xl font-bold tracking-tight mb-6">
                  Generate <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-600 to-red-700">Synthetic Data</span> with AI
                </h1>
                <p className="text-lg text-muted-foreground mb-8 leading-relaxed">
                  Create realistic, privacy-safe synthetic data from scratch. No production data needed.
                  Just describe what you need and our AI generates relationally intact, statistically accurate datasets in seconds.
                </p>
                <div className="flex gap-3">
                  <Button size="lg" className="bg-gradient-to-r from-amber-600 to-red-700 hover:from-amber-700 hover:to-red-800 text-white" onClick={() => setView('dashboard')}>
                    Start Generating <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                  <Button size="lg" variant="outline">
                    View Documentation
                  </Button>
                </div>
              </div>
              <div className="relative">
                <Card className="shadow-2xl border-0">
                  <CardHeader className="pb-3">
                    <div className="flex items-center gap-2">
                      <div className="h-3 w-3 rounded-full bg-red-400" />
                      <div className="h-3 w-3 rounded-full bg-amber-400" />
                      <div className="h-3 w-3 rounded-full bg-green-400" />
                      <span className="ml-2 text-xs text-muted-foreground font-mono">SynthForge AI Studio</span>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="bg-muted rounded-lg p-3 text-sm">
                      <span className="text-amber-700 font-medium">You:</span> Generate 50 rows of e-commerce data with users, orders, and products
                    </div>
                    <div className="bg-primary/5 rounded-lg p-3 text-sm space-y-2">
                      <div className="flex items-center gap-2">
                        <span className="text-primary font-medium">SynthForge:</span>
                        <Badge className="text-[10px] bg-amber-100 text-amber-800 border-amber-200"><Wand2 className="h-2.5 w-2.5 mr-0.5" /> auto-agent</Badge>
                      </div>
                      <p className="text-muted-foreground">I&apos;ll create a realistic e-commerce dataset with 50 users, their orders, and a product catalog.</p>
                      <div className="bg-white rounded border p-2 font-mono text-xs overflow-hidden">
                        <p className="text-green-700">-- 3 tables generated</p>
                        <p className="text-muted-foreground">users (50 rows) | orders (127 rows) | products (30 rows)</p>
                        <p className="text-amber-700 mt-1">-- Referential integrity: OK</p>
                        <p className="text-amber-700">-- PII check: All synthetic</p>
                      </div>
                      <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                        <Brain className="h-3 w-3" /> 6 reasoning steps completed
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          </section>

          {/* Features */}
          <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
            <div className="text-center mb-12">
              <h2 className="text-3xl font-bold mb-4">Everything You Need for Synthetic Data</h2>
              <p className="text-muted-foreground text-lg max-w-2xl mx-auto">From schema definition to export, SynthForge AI handles the entire synthetic data lifecycle.</p>
            </div>
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              {[
                { icon: MessageSquare, title: 'AI Data Agent', desc: 'Describe your data needs in natural language. Our AI generates realistic, domain-specific synthetic data instantly.' },
                { icon: Table2, title: 'Schema-Aware Generation', desc: 'Upload SQL DDL, JSON schemas, or CSV headers. The AI understands relationships and maintains referential integrity.' },
                { icon: Download, title: 'Multi-Format Export', desc: 'Export as JSON, CSV, SQL INSERT statements, or directly push to connected databases with one click.' },
                { icon: Sparkles, title: 'PII Protection', desc: 'Automatic detection and masking of personally identifiable information. All generated data is privacy-safe by design.' },
                { icon: Code2, title: 'SQL Transparency', desc: 'Every generation action produces viewable SQL. Copy, audit, or modify the generated statements.' },
                { icon: RefreshCw, title: 'Iterative Refinement', desc: 'Chat with the AI to refine your data. Add columns, adjust distributions, or regenerate specific tables.' }
              ].map((feature, i) => (
                <Card key={i} className="hover:shadow-md transition-shadow group">
                  <CardContent className="pt-6">
                    <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-amber-100 to-red-50 flex items-center justify-center mb-3 group-hover:from-amber-200 group-hover:to-red-100 transition-colors">
                      <feature.icon className="h-5 w-5 text-amber-700" />
                    </div>
                    <h3 className="font-semibold text-lg mb-2">{feature.title}</h3>
                    <p className="text-sm text-muted-foreground">{feature.desc}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </section>
        </main>

        {/* Footer */}
        <footer className="border-t py-8 bg-white">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Zap className="h-4 w-4 text-amber-700" />
              <span className="text-sm font-medium">SynthForge AI</span>
            </div>
            <p className="text-xs text-muted-foreground">Privacy-safe synthetic data generation</p>
          </div>
        </footer>
      </div>
    )
  }

  // ═══════════════════════════════════════════════════════════
  // STUDIO VIEW
  // ═══════════════════════════════════════════════════════════
  if (view === 'studio' && activeDb) {
    const allTables = getTablesFromMessages()
    const schemaObj = getSchemaFromDb()

    return (
      <div className="h-screen flex flex-col bg-background">
        {/* Studio Header */}
        <header className="border-b bg-white h-12 flex items-center px-4 gap-3 shrink-0">
          <Button variant="ghost" size="sm" onClick={() => setView('dashboard')} className="gap-1 text-xs">
            <ChevronRight className="h-3 w-3 rotate-180" />
            Back
          </Button>
          <Separator orientation="vertical" className="h-6" />
          <Database className="h-4 w-4 text-amber-700" />
          <span className="font-semibold text-sm">{activeDb.name}</span>
          <Badge variant="secondary" className="text-xs">{activeDb.dbType}</Badge>

          {/* Agent Mode Selector */}
          <Separator orientation="vertical" className="h-6" />
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Agent:</span>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div>
                    <Select value={agentMode} onValueChange={(v) => setAgentMode(v as AgentMode)}>
                      <SelectTrigger className="h-7 w-[130px] text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="plan">
                          <span className="flex items-center gap-1.5"><Brain className="h-3 w-3 text-blue-600" /> Plan</span>
                        </SelectItem>
                        <SelectItem value="execute">
                          <span className="flex items-center gap-1.5"><Play className="h-3 w-3 text-green-600" /> Execute</span>
                        </SelectItem>
                        <SelectItem value="auto">
                          <span className="flex items-center gap-1.5"><Wand2 className="h-3 w-3 text-amber-600" /> Auto</span>
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Plan: Schema only | Execute: Data gen | Auto: Both</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>

          <div className="ml-auto flex items-center gap-2">
            {Object.keys(allTables).length > 0 && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="gap-1 text-xs h-7">
                    <Download className="h-3 w-3" /> Export
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  <DropdownMenuItem onClick={() => exportData(allTables, 'json')}>
                    <FileJson className="h-3 w-3 mr-2" /> JSON
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => exportData(allTables, 'csv')}>
                    <FileText className="h-3 w-3 mr-2" /> CSV
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => exportData(allTables, 'sql')}>
                    <Code2 className="h-3 w-3 mr-2" /> SQL
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </header>

        {/* Main Studio Content */}
        <div className="flex-1 flex overflow-hidden">
          {/* ─── Left: Chat Panel (55%) ─── */}
          <div className="w-[55%] flex flex-col border-r">
            {/* Messages */}
            <ScrollArea className="flex-1">
              <div className="p-4 space-y-4">
                {messages.length === 0 && !isStreaming && (
                  <div className="flex flex-col items-center justify-center h-full text-center py-20">
                    <div className="h-16 w-16 rounded-2xl bg-gradient-to-br from-amber-600 to-red-700 flex items-center justify-center mb-4">
                      <Sparkles className="h-8 w-8 text-white" />
                    </div>
                    <h2 className="text-2xl font-bold mb-2">SynthForge AI Data Agent</h2>
                    <p className="text-muted-foreground max-w-md mb-8">
                      Describe the synthetic data you need. Upload a schema or just tell me what you want.
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-w-lg w-full">
                      {[
                        'Generate 50 users with realistic names and emails',
                        'Create an e-commerce dataset with orders and products',
                        'Generate healthcare data with patients and diagnoses',
                        'Create a SaaS analytics dataset with events'
                      ].map((suggestion, i) => (
                        <button
                          key={i}
                          className="text-left text-sm p-3 rounded-lg border hover:bg-muted/50 transition-colors"
                          onClick={() => setInput(suggestion)}
                        >
                          <span className="text-muted-foreground">{suggestion}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {messages.map((msg) => {
                  const parsedOptions: ClarificationOption[] = (() => {
                    try { return JSON.parse(msg.options || '[]') } catch { return [] }
                  })()
                  const parsedReasoning: ReasoningStep[] = (() => {
                    try { return JSON.parse(msg.reasoningSteps || '[]') } catch { return [] }
                  })()

                  return (
                    <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[85%] rounded-xl p-3 ${
                        msg.role === 'user'
                          ? 'bg-gradient-to-r from-amber-600 to-red-700 text-white'
                          : 'bg-muted'
                      }`}>
                        {msg.role === 'assistant' ? (
                          <div className="space-y-2">
                            {/* Agent Badge */}
                            {msg.agentName && <AgentBadge name={msg.agentName} />}

                            {/* Content */}
                            <div className="text-sm">
                              {renderAssistantContent(msg.content)}
                            </div>

                            {/* SQL Code Block */}
                            {msg.sqlCode && (
                              <Collapsible>
                                <CollapsibleTrigger className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors mt-2">
                                  <ChevronRight className="h-3 w-3" />
                                  <Code2 className="h-3 w-3" /> View SQL
                                </CollapsibleTrigger>
                                <CollapsibleContent>
                                  <div className="mt-1 bg-white rounded-md border p-2 relative group">
                                    <pre className="font-mono text-xs overflow-x-auto max-h-48 whitespace-pre-wrap text-green-800">{msg.sqlCode}</pre>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="absolute top-1 right-1 h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                                      onClick={() => copyToClipboard(msg.sqlCode)}
                                    >
                                      <Copy className="h-3 w-3" />
                                    </Button>
                                  </div>
                                </CollapsibleContent>
                              </Collapsible>
                            )}

                            {/* Reasoning Steps */}
                            {parsedReasoning.length > 0 && (
                              <ReasoningTimeline steps={parsedReasoning} msgId={msg.id} />
                            )}

                            {/* Clarification Options */}
                            {parsedOptions.length > 0 && (
                              <ClarificationOptions options={parsedOptions} />
                            )}

                            {/* Copy Button */}
                            <div className="flex gap-1 mt-1">
                              <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={() => copyToClipboard(msg.content)}>
                                <Copy className="h-3 w-3 mr-1" /> Copy
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                        )}
                      </div>
                    </div>
                  )
                })}

                {/* Streaming indicator */}
                {isStreaming && streamingContent && (
                  <div className="flex justify-start">
                    <div className="max-w-[85%] rounded-xl p-3 bg-muted">
                      <AgentBadge name={agentMode + '-agent'} />
                      <div className="text-sm mt-1">
                        {renderAssistantContent(streamingContent)}
                      </div>
                      <Loader2 className="h-3 w-3 animate-spin mt-2 text-muted-foreground" />
                    </div>
                  </div>
                )}

                {isStreaming && !streamingContent && (
                  <div className="flex justify-start">
                    <div className="rounded-xl p-3 bg-muted">
                      <AgentBadge name={agentMode + '-agent'} />
                      <div className="flex items-center gap-2 text-sm text-muted-foreground mt-1">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Generating...
                      </div>
                    </div>
                  </div>
                )}

                <div ref={messagesEndRef} />
              </div>
            </ScrollArea>

            {/* Input Area */}
            <div className="border-t p-3 bg-white">
              {/* Attached files */}
              {attachedFiles.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {attachedFiles.map((f, i) => (
                    <Badge key={i} variant="secondary" className="gap-1 text-xs">
                      <Paperclip className="h-3 w-3" />
                      {f.name}
                      <button onClick={() => removeFile(i)} className="hover:text-destructive">
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              )}
              <div className="flex gap-2">
                <div className="flex-1 relative">
                  <Textarea
                    ref={chatInputRef}
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Describe the data you want to generate..."
                    className="resize-none min-h-[44px] max-h-[120px] pr-10"
                    rows={1}
                    disabled={isStreaming}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 w-8 p-0"
                          onClick={() => fileInputRef.current?.click()}
                          disabled={isStreaming}
                        >
                          <Paperclip className="h-4 w-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Attach file (.sql, .csv, .json, .txt)</TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                  <Button
                    onClick={handleSubmit}
                    disabled={(!input.trim() && attachedFiles.length === 0) || isStreaming}
                    size="sm"
                    className="bg-gradient-to-r from-amber-600 to-red-700 hover:from-amber-700 hover:to-red-800 text-white h-8 w-8 p-0"
                  >
                    <Send className="h-4 w-4" />
                  </Button>
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  className="hidden"
                  accept=".sql,.csv,.json,.txt"
                  multiple
                  onChange={handleFileUpload}
                />
              </div>
            </div>
          </div>

          {/* ─── Right: Data Workspace (45%) ─── */}
          <div className="w-[45%] flex flex-col bg-slate-50/50">
            <Tabs value={rightTab} onValueChange={setRightTab} className="flex-1 flex flex-col">
              <TabsList className="w-full justify-start rounded-none border-b bg-white h-10 px-2 shrink-0">
                <TabsTrigger value="preview" className="text-xs gap-1">
                  <Table2 className="h-3 w-3" /> Data Preview
                </TabsTrigger>
                <TabsTrigger value="schema" className="text-xs gap-1">
                  <Columns3 className="h-3 w-3" /> Schema
                </TabsTrigger>
                <TabsTrigger value="sql" className="text-xs gap-1">
                  <Code2 className="h-3 w-3" /> SQL Playground
                </TabsTrigger>
                <TabsTrigger value="explorer" className="text-xs gap-1">
                  <FolderTree className="h-3 w-3" /> Explorer
                </TabsTrigger>
              </TabsList>

              {/* Data Preview Tab */}
              <TabsContent value="preview" className="flex-1 overflow-auto p-4 mt-0">
                {Object.keys(allTables).length > 0 ? (
                  <div className="space-y-4">
                    {Object.entries(allTables).map(([tableName, rows]) => (
                      <DataTable key={tableName} tableName={tableName} rows={rows} />
                    ))}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center h-full text-center py-20">
                    <Table2 className="h-12 w-12 text-muted-foreground/30 mb-3" />
                    <h3 className="font-semibold text-muted-foreground mb-1">No Data Yet</h3>
                    <p className="text-sm text-muted-foreground">Chat with the AI agent to generate synthetic data</p>
                  </div>
                )}
              </TabsContent>

              {/* Schema Tab */}
              <TabsContent value="schema" className="flex-1 overflow-auto p-4 mt-0">
                {Object.keys(schemaObj).length > 0 ? (
                  <div className="space-y-4">
                    {/* ERD-like overview */}
                    <Card className="border-dashed">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm flex items-center gap-2">
                          <Link2 className="h-4 w-4 text-blue-600" /> Entity Relationships
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="flex flex-wrap gap-3 justify-center">
                          {Object.entries(schemaObj).map(([tableName, tableDef]) => {
                            const def = tableDef as { columns?: Record<string, string> }
                            const hasFk = def.columns && Object.keys(def.columns).some(c => c.endsWith('_id') && c !== 'id')
                            return (
                              <div key={tableName} className="flex flex-col items-center">
                                <div className="bg-white border-2 border-amber-300 rounded-lg px-3 py-2 text-center min-w-[80px] shadow-sm">
                                  <p className="font-semibold text-xs text-amber-800">{tableName}</p>
                                  <p className="text-[10px] text-muted-foreground">{def.columns ? Object.keys(def.columns).length : 0} cols</p>
                                </div>
                                {hasFk && (
                                  <div className="flex items-center gap-0.5 mt-1 text-[10px] text-blue-500">
                                    <Link2 className="h-3 w-3" /> FK
                                  </div>
                                )}
                              </div>
                            )
                          })}
                        </div>
                        {/* Connection lines description */}
                        {Object.entries(schemaObj).some(([, t]) => {
                          const def = t as { columns?: Record<string, string> }
                          return def.columns && Object.keys(def.columns).some(c => c.endsWith('_id') && c !== 'id')
                        }) && (
                          <div className="mt-3 pt-3 border-t text-xs text-muted-foreground space-y-1">
                            {Object.entries(schemaObj).map(([tableName, tableDef]) => {
                              const def = tableDef as { columns?: Record<string, string> }
                              if (!def.columns) return null
                              const fkCols = Object.keys(def.columns).filter(c => c.endsWith('_id') && c !== 'id')
                              if (fkCols.length === 0) return null
                              return (
                                <div key={tableName} className="flex items-center gap-1">
                                  <span className="font-mono font-medium">{tableName}</span>
                                  <ArrowRight className="h-3 w-3" />
                                  {fkCols.map(fk => (
                                    <span key={fk} className="text-blue-600 font-mono">{fk.replace('_id', '')}</span>
                                  ))}
                                </div>
                              )
                            })}
                          </div>
                        )}
                      </CardContent>
                    </Card>

                    {/* Individual schema cards */}
                    {Object.entries(schemaObj).map(([tableName, tableDef]) => {
                      const def = tableDef as { columns: Record<string, string> }
                      return <SchemaCard key={tableName} tableName={tableName} columns={def.columns || {}} />
                    })}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center h-full text-center py-20">
                    <Columns3 className="h-12 w-12 text-muted-foreground/30 mb-3" />
                    <h3 className="font-semibold text-muted-foreground mb-1">No Schema Defined</h3>
                    <p className="text-sm text-muted-foreground">Ask the AI to generate data and a schema will be created</p>
                  </div>
                )}
              </TabsContent>

              {/* SQL Playground Tab */}
              <TabsContent value="sql" className="flex-1 flex flex-col mt-0">
                <div className="p-4 space-y-3 flex-1 flex flex-col">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold flex items-center gap-2">
                      <Code2 className="h-4 w-4" /> SQL Playground
                    </h3>
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-xs h-7 gap-1"
                      onClick={() => {
                        const tables = Object.keys(allTables)
                        if (tables.length > 0) {
                          setSqlQuery(`SELECT * FROM ${tables[0]} LIMIT 10;`)
                        }
                      }}
                    >
                      <Sparkles className="h-3 w-3" /> AI Generate
                    </Button>
                  </div>
                  <Textarea
                    value={sqlQuery}
                    onChange={e => setSqlQuery(e.target.value)}
                    placeholder="SELECT * FROM users LIMIT 10;"
                    className="font-mono text-sm min-h-[120px] resize-y"
                  />
                  <Button
                    onClick={runSqlPlayground}
                    disabled={!sqlQuery.trim()}
                    size="sm"
                    className="bg-gradient-to-r from-amber-600 to-red-700 hover:from-amber-700 hover:to-red-800 text-white gap-1 self-start"
                  >
                    <Play className="h-3 w-3" /> Run Query
                  </Button>
                  {sqlResult && (
                    <div className="flex-1 bg-white rounded-md border p-3 overflow-auto">
                      <pre className="font-mono text-xs whitespace-pre-wrap">{sqlResult}</pre>
                    </div>
                  )}
                  {!sqlResult && (
                    <div className="flex-1 flex items-center justify-center">
                      <div className="text-center text-muted-foreground">
                        <Code2 className="h-8 w-8 mx-auto mb-2 opacity-30" />
                        <p className="text-sm">Write a SQL query and click Run</p>
                        <p className="text-xs mt-1">Available tables: {Object.keys(allTables).join(', ') || 'None'}</p>
                      </div>
                    </div>
                  )}
                </div>
              </TabsContent>

              {/* Explorer Tab */}
              <TabsContent value="explorer" className="flex-1 overflow-auto mt-0">
                <ExplorerTree />
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </div>
    )
  }

  // ═══════════════════════════════════════════════════════════
  // DASHBOARD VIEW
  // ═══════════════════════════════════════════════════════════
  return (
    <div className="min-h-screen flex">
      {/* Sidebar */}
      <aside className="w-72 border-r bg-slate-50 flex flex-col shrink-0">
        <div className="p-4 border-b">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-amber-600 to-red-700 flex items-center justify-center">
              <Zap className="h-5 w-5 text-white" />
            </div>
            <span className="font-bold text-lg">SynthForge AI</span>
          </div>
        </div>

        <div className="p-3">
          <Button variant="ghost" size="sm" className="w-full justify-start gap-2" onClick={() => setView('landing')}>
            <LayoutDashboard className="h-4 w-4" /> Home
          </Button>
        </div>

        <Separator />

        <div className="flex-1 overflow-y-auto p-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Databases</span>
            <Dialog open={showNewDbDialog} onOpenChange={setShowNewDbDialog}>
              <DialogTrigger asChild>
                <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
                  <Plus className="h-4 w-4" />
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Create Database</DialogTitle>
                  <DialogDescription>Define a new database for synthetic data generation.</DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div>
                    <label className="text-sm font-medium mb-1 block">Name</label>
                    <Input value={newDbName} onChange={e => setNewDbName(e.target.value)} placeholder="e.g., E-Commerce" />
                  </div>
                  <div>
                    <label className="text-sm font-medium mb-1 block">Schema (JSON, optional)</label>
                    <Textarea
                      value={newDbSchema}
                      onChange={e => setNewDbSchema(e.target.value)}
                      placeholder='{"users": {"columns": {"id": "serial", "name": "varchar", "email": "varchar"}}}'
                      className="font-mono text-xs min-h-[120px]"
                    />
                    <p className="text-xs text-muted-foreground mt-1">Leave empty to define schema through chat</p>
                  </div>
                  <Button onClick={createDatabase} className="w-full bg-gradient-to-r from-amber-600 to-red-700 text-white" disabled={!newDbName.trim()}>
                    Create Database
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>

          <div className="space-y-1 max-h-96 overflow-y-auto">
            {allDatabases.map(db => (
              <div
                key={db.id}
                className={`w-full text-left p-2.5 rounded-lg text-sm transition-colors group ${
                  activeDb?.id === db.id ? 'bg-white shadow-sm border' : 'hover:bg-white/50'
                }`}
              >
                <button className="w-full flex items-center gap-2" onClick={() => openDatabase(db)}>
                  <Database className="h-4 w-4 text-amber-700 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="font-medium truncate">{db.name}</p>
                    <p className="text-xs text-muted-foreground">{db.dbType}</p>
                  </div>
                </button>
              </div>
            ))}
          </div>

          {allDatabases.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-4">No databases yet. Create one to get started.</p>
          )}
        </div>

        <div className="p-3 border-t">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Hash className="h-3 w-3" />
            <span>{activeWorkspace?.name || 'Workspace'}</span>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-5xl mx-auto p-6 sm:p-8">
          <div className="mb-8">
            <h1 className="text-3xl font-bold mb-2">Dashboard</h1>
            <p className="text-muted-foreground">Select a database to start generating synthetic data, or create a new one.</p>
          </div>

          {/* Quick Actions */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
            <Card className="hover:shadow-md transition-shadow cursor-pointer" onClick={() => setShowNewDbDialog(true)}>
              <CardContent className="pt-6 flex items-center gap-4">
                <div className="h-12 w-12 rounded-xl bg-amber-100 flex items-center justify-center shrink-0">
                  <Plus className="h-6 w-6 text-amber-700" />
                </div>
                <div>
                  <h3 className="font-semibold">New Database</h3>
                  <p className="text-xs text-muted-foreground">Create from schema or chat</p>
                </div>
              </CardContent>
            </Card>
            <Card className="hover:shadow-md transition-shadow cursor-pointer" onClick={() => {
              if (allDatabases.length > 0) openDatabase(allDatabases[0])
              else setShowNewDbDialog(true)
            }}>
              <CardContent className="pt-6 flex items-center gap-4">
                <div className="h-12 w-12 rounded-xl bg-purple-50 flex items-center justify-center shrink-0">
                  <MessageSquare className="h-6 w-6 text-purple-700" />
                </div>
                <div>
                  <h3 className="font-semibold">Chat with AI</h3>
                  <p className="text-xs text-muted-foreground">Describe data to generate</p>
                </div>
              </CardContent>
            </Card>
            <Card className="hover:shadow-md transition-shadow cursor-pointer" onClick={() => {
              if (allDatabases.length > 0) openDatabase(allDatabases[0])
              else setShowNewDbDialog(true)
            }}>
              <CardContent className="pt-6 flex items-center gap-4">
                <div className="h-12 w-12 rounded-xl bg-green-50 flex items-center justify-center shrink-0">
                  <Upload className="h-6 w-6 text-green-700" />
                </div>
                <div>
                  <h3 className="font-semibold">Upload Schema</h3>
                  <p className="text-xs text-muted-foreground">SQL DDL, JSON, or CSV</p>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Databases Grid */}
          <div className="mb-8">
            <h2 className="text-lg font-semibold mb-4">Your Databases</h2>
            {allDatabases.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {allDatabases.map(db => {
                  const dbSchema = (() => { try { return JSON.parse(db.schemaJson) } catch { return {} } })()
                  const tableCount = Object.keys(dbSchema).length
                  const dataObj = (() => { try { return JSON.parse(db.dataJson || '{}') } catch { return {} } })()
                  const totalRows = Object.values(dataObj).reduce((acc: number, v: unknown) => acc + (Array.isArray(v) ? v.length : 0), 0)
                  return (
                    <Card key={db.id} className="hover:shadow-md transition-shadow cursor-pointer group" onClick={() => openDatabase(db)}>
                      <CardHeader className="pb-2">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Database className="h-5 w-5 text-amber-700" />
                            <CardTitle className="text-base">{db.name}</CardTitle>
                          </div>
                          <Badge variant="secondary" className="text-xs">{db.dbType}</Badge>
                        </div>
                      </CardHeader>
                      <CardContent>
                        <div className="flex items-center gap-4 text-xs text-muted-foreground mb-3">
                          <span className="flex items-center gap-1">
                            <Table2 className="h-3 w-3" /> {tableCount} tables
                          </span>
                          <span className="flex items-center gap-1">
                            <Hash className="h-3 w-3" /> {totalRows} rows
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <div className="flex flex-wrap gap-1">
                            {Object.keys(dbSchema).slice(0, 3).map(t => (
                              <Badge key={t} variant="outline" className="text-[10px] px-1.5 py-0">{t}</Badge>
                            ))}
                            {Object.keys(dbSchema).length > 3 && (
                              <Badge variant="outline" className="text-[10px] px-1.5 py-0">+{Object.keys(dbSchema).length - 3}</Badge>
                            )}
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                            onClick={(e) => { e.stopPropagation(); deleteDatabase(db.id) }}
                          >
                            <Trash2 className="h-3 w-3 text-destructive" />
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  )
                })}
              </div>
            ) : (
              <Card className="border-dashed">
                <CardContent className="pt-6 text-center py-12">
                  <Database className="h-12 w-12 text-muted-foreground/30 mx-auto mb-3" />
                  <h3 className="font-semibold mb-1">No Databases Yet</h3>
                  <p className="text-sm text-muted-foreground mb-4">Create your first database to start generating synthetic data</p>
                  <Button className="bg-gradient-to-r from-amber-600 to-red-700 text-white" onClick={() => setShowNewDbDialog(true)}>
                    <Plus className="h-4 w-4 mr-2" /> Create Database
                  </Button>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </main>
    </div>
  )
}
