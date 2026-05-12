'use client'

import React, { useState, useEffect, useRef, useCallback } from 'react'
import ReactMarkdown from 'react-markdown'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Database, MessageSquare, Plus, Send, ChevronRight, ChevronDown,
  Table2, Download, Copy, Sparkles, LayoutDashboard,
  Code2, FileJson, FileText, Trash2, Zap, Upload, X, Check,
  Loader2, ArrowRight, Hash, Paperclip, Play, FolderTree,
  Brain, Wand2, AlertCircle, Circle,
  Columns3, Key, Link2, RefreshCw, Menu, Eye, EyeOff,
  PanelLeftClose, PanelLeft
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
import { Skeleton } from '@/components/ui/skeleton'
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable'
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

// ─── Animation Variants ────────────────────────────────
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
  transition: { type: 'spring', stiffness: 300, damping: 24 }
}

// ─── Animated Dots Component ───────────────────────────
function AnimatedDots() {
  const [dots, setDots] = useState('.')
  useEffect(() => {
    const interval = setInterval(() => {
      setDots(prev => prev.length >= 3 ? '.' : prev + '.')
    }, 400)
    return () => clearInterval(interval)
  }, [])
  return <span>{dots}</span>
}

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
  const [isLoading, setIsLoading] = useState(false)
  const [showNewDbDialog, setShowNewDbDialog] = useState(false)
  const [newDbName, setNewDbName] = useState('')
  const [newDbSchema, setNewDbSchema] = useState('')
  const [agentMode, setAgentMode] = useState<AgentMode>('auto')
  const [attachedFiles, setAttachedFiles] = useState<{ name: string; content: string; type: string }[]>([])
  const [rightTab, setRightTab] = useState('preview')
  const [sqlQuery, setSqlQuery] = useState('')
  const [sqlResult, setSqlResult] = useState<string>('')
  const [expandedReasoning, setExpandedReasoning] = useState<Record<string, boolean>>({})
  const [expandedSql, setExpandedSql] = useState<Record<string, boolean>>({})
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [mobileStudioTab, setMobileStudioTab] = useState<'chat' | 'data'>('chat')
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
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages, isLoading])

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
    setRightTab('preview')
    setAgentMode('auto')
    setSqlQuery('')
    setSqlResult('')
    setAttachedFiles([])
    setMobileStudioTab('chat')
    setView('studio')
  }

  // ─── Core Send Message (NON-STREAMING) ────────────────
  const sendMessage = useCallback(async (messageText: string, files: { name: string; content: string; type: string }[] = []) => {
    if (!messageText.trim() || isLoading || !activeDb) return

    setInput('')
    setIsLoading(true)

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
          stream: false,
          agentMode,
          files: files.map(f => ({ name: f.name, content: f.content, type: f.type }))
        })
      })

      if (!res.ok) {
        const errData = await res.json().catch(() => ({ error: 'Request failed' }))
        throw new Error(errData.error || 'Chat request failed')
      }

      const data = await res.json()

      if (!conversation && data.conversationId) {
        setConversation({ id: data.conversationId, title: messageText.slice(0, 60), messages: [] })
      }

      const assistantMsg: Message = {
        id: 'msg-' + Date.now(),
        role: 'assistant',
        content: data.message.content,
        sqlCode: data.message.sqlCode || '',
        tokensIn: data.message.tokensIn || 0,
        tokensOut: data.message.tokensOut || 0,
        cost: data.message.cost || 0,
        createdAt: new Date().toISOString(),
        agentName: data.message.agentName || agentMode + '-agent',
        reasoningSteps: JSON.stringify(data.message.reasoningSteps || []),
        options: JSON.stringify(data.message.options || []),
        tablesJson: data.message.tablesJson || '{}'
      }
      setMessages(prev => [...prev, assistantMsg])

      await refreshDatabase(activeDb.id)
    } catch (error) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to get response',
        variant: 'destructive',
        action: <Button size="sm" variant="outline" onClick={() => sendMessage(messageText, files)}>Retry</Button>
      })
      setMessages(prev => prev.filter(m => m.id !== tempUserMsg.id))
    } finally {
      setIsLoading(false)
    }
  }, [isLoading, activeDb, conversation, activeWorkspace, toast, agentMode])

  // ─── Chat Submit (from input) ────────────────────────────
  const handleSubmit = useCallback(async () => {
    const msgText = input.trim()
    const files = [...attachedFiles]
    if (!msgText && files.length === 0) return
    setAttachedFiles([])
    await sendMessage(msgText, files)
  }, [input, attachedFiles, sendMessage])

  const getTablesFromMessages = (): Record<string, Record<string, unknown>[]> => {
    const allTables: Record<string, Record<string, unknown>[]> = {}
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
    const color = isPlan ? 'bg-sky-100 text-sky-800 border-sky-200' : isExec ? 'bg-emerald-100 text-emerald-800 border-emerald-200' : 'bg-amber-100 text-amber-800 border-amber-200'
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
        <CollapsibleTrigger className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors mt-2 cursor-pointer">
          {isOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
          <Brain className="h-3 w-3" /> Reasoning Steps ({steps.length})
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="mt-2 space-y-1.5 pl-1">
            {steps.map((step, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.05 }}
                className="flex items-start gap-2 text-xs"
              >
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
              </motion.div>
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
            <motion.div key={opt.id} whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}>
              <Button
                variant="outline"
                size="sm"
                className="h-auto py-1.5 px-3 text-xs hover:bg-amber-50 hover:border-amber-300 transition-colors"
                onClick={() => sendMessage(opt.value)}
              >
                {opt.label}
              </Button>
            </motion.div>
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
  const DataTable = ({ tableName, rows }: { tableName: string; rows: Record<string, unknown>[] }) => {
    const [page, setPage] = useState(0)
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
            <ScrollArea className="max-h-80">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b bg-muted/30 sticky top-0">
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
                    <Button variant="outline" size="sm" className="h-6 text-xs" disabled={page === 0} onClick={() => setPage(p => p - 1)}>
                      Prev
                    </Button>
                    <Button variant="outline" size="sm" className="h-6 text-xs" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}>
                      Next
                    </Button>
                  </div>
                </div>
              )}
            </ScrollArea>
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
        <ScrollArea className="max-h-48">
          <div className="space-y-1">
            {Object.entries(columns).map(([colName, colType]) => (
              <div key={colName} className="flex items-center justify-between text-xs py-1.5 border-b last:border-0 hover:bg-muted/30 px-1 rounded">
                <div className="flex items-center gap-2">
                  {colName.toLowerCase() === 'id' && <Key className="h-3 w-3 text-amber-600" />}
                  {colName.toLowerCase().endsWith('_id') && <Link2 className="h-3 w-3 text-sky-500" />}
                  <span className="font-mono font-medium">{colName}</span>
                </div>
                <Badge variant="secondary" className="text-[10px] font-mono">{colType}</Badge>
              </div>
            ))}
          </div>
        </ScrollArea>
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
          <div className="text-center py-12">
            <Table2 className="h-8 w-8 mx-auto text-muted-foreground/30 mb-2" />
            <p className="text-xs text-muted-foreground">No tables yet. Chat with AI to generate data.</p>
          </div>
        ) : (
          <ScrollArea className="max-h-[calc(100vh-220px)]">
            {Array.from(allTableNames).map(tableName => {
              const rows = tables[tableName] || []
              const schemaDef = schema[tableName]
              return (
                <motion.button
                  key={tableName}
                  initial={{ opacity: 0, x: -5 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="w-full text-left p-2 rounded-md hover:bg-muted/50 transition-colors group"
                  onClick={() => setRightTab('preview')}
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
                </motion.button>
              )
            })}
          </ScrollArea>
        )}
      </div>
    )
  }

  // ─── Render: Chat Message ──────────────────────────────
  const ChatMessage = ({ msg }: { msg: Message }) => {
    const isUser = msg.role === 'user'

    if (isUser) {
      return (
        <motion.div {...messageSlideIn} className="flex justify-end">
          <div className="max-w-[85%] bg-gradient-to-br from-amber-600 to-red-700 text-white rounded-2xl rounded-br-md px-4 py-2.5 shadow-sm">
            <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
          </div>
        </motion.div>
      )
    }

    // Assistant message
    let parsedOptions: ClarificationOption[] = []
    let parsedSteps: ReasoningStep[] = []
    try { parsedOptions = JSON.parse(msg.options || '[]') } catch { /* */ }
    try { parsedSteps = JSON.parse(msg.reasoningSteps || '[]') } catch { /* */ }

    return (
      <motion.div {...messageSlideIn} className="flex justify-start">
        <div className="max-w-[90%] bg-muted/50 rounded-2xl rounded-bl-md px-4 py-3 shadow-sm">
          {/* Agent Badge */}
          <div className="flex items-center gap-2 mb-2">
            <AgentBadge name={msg.agentName} />
            {msg.tokensIn > 0 && (
              <span className="text-[10px] text-muted-foreground">
                {msg.tokensIn + msg.tokensOut} tokens · ${msg.cost.toFixed(4)}
              </span>
            )}
          </div>

          {/* Explanation */}
          {renderAssistantContent(msg.content)}

          {/* SQL Code Section */}
          {msg.sqlCode && (
            <Collapsible
              open={expandedSql[msg.id] ?? true}
              onOpenChange={(o) => setExpandedSql(prev => ({ ...prev, [msg.id]: o }))}
            >
              <CollapsibleTrigger className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors mt-3 cursor-pointer">
                {expandedSql[msg.id] ?? true ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                <Code2 className="h-3 w-3" /> SQL
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="mt-1.5 relative group">
                  <ScrollArea className="max-h-48">
                    <pre className="bg-slate-900 text-green-400 p-3 rounded-lg text-xs font-mono overflow-x-auto">
                      <code>{msg.sqlCode}</code>
                    </pre>
                  </ScrollArea>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="absolute top-1.5 right-1.5 h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity bg-slate-800 text-slate-300 hover:text-white"
                    onClick={() => copyToClipboard(msg.sqlCode)}
                  >
                    <Copy className="h-3 w-3" />
                  </Button>
                </div>
              </CollapsibleContent>
            </Collapsible>
          )}

          {/* Reasoning Steps */}
          <ReasoningTimeline steps={parsedSteps} msgId={msg.id} />

          {/* Clarification Options */}
          <ClarificationOptions options={parsedOptions} />
        </div>
      </motion.div>
    )
  }

  // ─── Render: Chat Panel ────────────────────────────────
  const ChatPanel = () => (
    <div className="flex flex-col h-full">
      {/* Messages Area */}
      <ScrollArea className="flex-1">
        <div className="p-4 space-y-4">
          {messages.length === 0 && !isLoading && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="flex flex-col items-center justify-center text-center py-16"
            >
              <motion.div
                initial={{ rotate: -10 }}
                animate={{ rotate: 0 }}
                transition={{ type: 'spring', stiffness: 200 }}
                className="h-16 w-16 rounded-2xl bg-gradient-to-br from-amber-600 to-red-700 flex items-center justify-center mb-4 shadow-lg"
              >
                <Sparkles className="h-8 w-8 text-white" />
              </motion.div>
              <h2 className="text-xl font-bold mb-2">SynthForge AI Data Agent</h2>
              <p className="text-muted-foreground max-w-sm mb-8 text-sm">
                Describe the data you need and our AI will generate realistic, privacy-safe synthetic data with proper relationships.
              </p>
              <motion.div
                variants={staggerContainer}
                initial="initial"
                animate="animate"
                className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full max-w-md"
              >
                {[
                  { icon: <Hash className="h-3.5 w-3.5" />, text: 'Generate 20 users with realistic profiles' },
                  { icon: <Table2 className="h-3.5 w-3.5" />, text: 'Create e-commerce orders and products' },
                  { icon: <Database className="h-3.5 w-3.5" />, text: 'Hospital management database schema' },
                  { icon: <Code2 className="h-3.5 w-3.5" />, text: 'Student enrollment with courses and grades' }
                ].map((suggestion, i) => (
                  <motion.button
                    key={i}
                    variants={staggerItem}
                    whileHover={{ scale: 1.02, y: -1 }}
                    whileTap={{ scale: 0.98 }}
                    className="flex items-center gap-2 p-3 rounded-lg border bg-card hover:bg-muted/50 transition-colors text-left text-xs text-muted-foreground hover:text-foreground"
                    onClick={() => sendMessage(suggestion.text)}
                  >
                    {suggestion.icon}
                    <span>{suggestion.text}</span>
                  </motion.button>
                ))}
              </motion.div>
            </motion.div>
          )}

          {messages.map((msg) => (
            <ChatMessage key={msg.id} msg={msg} />
          ))}

          {/* Loading Indicator */}
          {isLoading && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex justify-start"
            >
              <div className="bg-muted/50 rounded-2xl rounded-bl-md px-4 py-3 flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin text-amber-600" />
                <span className="text-sm text-muted-foreground">AI is thinking<AnimatedDots /></span>
              </div>
            </motion.div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </ScrollArea>

      {/* Input Area */}
      <div className="border-t bg-background p-3 shrink-0">
        {/* Attached Files */}
        {attachedFiles.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-2">
            {attachedFiles.map((file, i) => (
              <Badge key={i} variant="secondary" className="gap-1 text-xs py-1">
                <Paperclip className="h-3 w-3" />
                {file.name}
                <button onClick={() => removeFile(i)} className="hover:text-destructive transition-colors">
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))}
          </div>
        )}

        <div className="flex items-end gap-2">
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            multiple
            accept=".sql,.csv,.json,.txt"
            onChange={handleFileUpload}
          />
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 shrink-0"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Paperclip className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Attach files</TooltipContent>
            </Tooltip>
          </TooltipProvider>

          <div className="flex-1 relative">
            <Textarea
              ref={chatInputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Describe the data you need..."
              className="min-h-[38px] max-h-32 resize-none pr-12 text-sm"
              disabled={isLoading}
              rows={1}
            />
            <span className="absolute bottom-1.5 right-12 text-[10px] text-muted-foreground">
              {input.length}/4000
            </span>
          </div>

          <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
            <Button
              size="sm"
              className="h-9 w-9 p-0 bg-gradient-to-r from-amber-600 to-red-700 hover:from-amber-700 hover:to-red-800 text-white shrink-0"
              onClick={handleSubmit}
              disabled={isLoading || (!input.trim() && attachedFiles.length === 0)}
            >
              <Send className="h-4 w-4" />
            </Button>
          </motion.div>
        </div>
      </div>
    </div>
  )

  // ─── Render: Data Workspace Panel ─────────────────────
  const DataWorkspace = () => {
    const allTables = getTablesFromMessages()
    const schemaObj = getSchemaFromDb()

    return (
      <Tabs value={rightTab} onValueChange={setRightTab} className="flex flex-col h-full">
        <TabsList className="w-full justify-start rounded-none border-b bg-transparent h-10 px-2 shrink-0">
          <TabsTrigger value="preview" className="text-xs data-[state=active]:bg-muted">Data Preview</TabsTrigger>
          <TabsTrigger value="schema" className="text-xs data-[state=active]:bg-muted">Schema</TabsTrigger>
          <TabsTrigger value="sql" className="text-xs data-[state=active]:bg-muted">SQL Playground</TabsTrigger>
          <TabsTrigger value="explorer" className="text-xs data-[state=active]:bg-muted">Explorer</TabsTrigger>
        </TabsList>

        <TabsContent value="preview" className="flex-1 overflow-auto mt-0">
          <ScrollArea className="h-full">
            <div className="p-4 space-y-4">
              {Object.keys(allTables).length === 0 ? (
                <div className="text-center py-16">
                  <Table2 className="h-10 w-10 mx-auto text-muted-foreground/30 mb-3" />
                  <p className="text-sm font-medium text-muted-foreground mb-1">No data yet</p>
                  <p className="text-xs text-muted-foreground">Chat with the AI to generate synthetic data</p>
                </div>
              ) : (
                Object.entries(allTables).map(([tableName, rows]) => (
                  <DataTable key={tableName} tableName={tableName} rows={rows} />
                ))
              )}
            </div>
          </ScrollArea>
        </TabsContent>

        <TabsContent value="schema" className="flex-1 overflow-auto mt-0">
          <ScrollArea className="h-full">
            <div className="p-4 space-y-4">
              {Object.keys(schemaObj).length === 0 ? (
                <div className="text-center py-16">
                  <Columns3 className="h-10 w-10 mx-auto text-muted-foreground/30 mb-3" />
                  <p className="text-sm font-medium text-muted-foreground mb-1">No schema defined</p>
                  <p className="text-xs text-muted-foreground">Ask the AI to design a database schema</p>
                </div>
              ) : (
                Object.entries(schemaObj).map(([tableName, def]) => (
                  <SchemaCard key={tableName} tableName={tableName} columns={(def as { columns: Record<string, string> }).columns} />
                ))
              )}
            </div>
          </ScrollArea>
        </TabsContent>

        <TabsContent value="sql" className="flex-1 flex flex-col mt-0">
          <div className="p-4 space-y-3 flex-1 flex flex-col">
            <div className="flex items-center gap-2">
              <Code2 className="h-4 w-4 text-amber-700" />
              <span className="text-sm font-semibold">SQL Playground</span>
            </div>
            <Textarea
              value={sqlQuery}
              onChange={(e) => setSqlQuery(e.target.value)}
              placeholder="SELECT * FROM users LIMIT 10;"
              className="min-h-[100px] font-mono text-xs flex-1"
            />
            <Button
              size="sm"
              className="bg-gradient-to-r from-amber-600 to-red-700 hover:from-amber-700 hover:to-red-800 text-white w-fit"
              onClick={runSqlPlayground}
            >
              <Play className="h-3 w-3 mr-1" /> Run Query
            </Button>
            {sqlResult && (
              <ScrollArea className="max-h-64">
                <pre className="bg-slate-900 text-green-400 p-3 rounded-lg text-xs font-mono whitespace-pre-wrap">
                  {sqlResult}
                </pre>
              </ScrollArea>
            )}
          </div>
        </TabsContent>

        <TabsContent value="explorer" className="flex-1 overflow-auto mt-0">
          <ExplorerTree />
        </TabsContent>
      </Tabs>
    )
  }

  // ═══════════════════════════════════════════════════════════
  // LANDING PAGE
  // ═══════════════════════════════════════════════════════════
  if (view === 'landing') {
    return (
      <div className="min-h-screen flex flex-col bg-gradient-to-br from-slate-50 to-slate-100">
        {/* Nav */}
        <motion.nav
          initial={{ y: -20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          className="border-b bg-white/80 backdrop-blur-sm sticky top-0 z-50"
        >
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
              <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}>
                <Button size="sm" className="bg-gradient-to-r from-amber-600 to-red-700 hover:from-amber-700 hover:to-red-800 text-white" onClick={() => setView('dashboard')}>
                  Get Started
                </Button>
              </motion.div>
            </div>
          </div>
        </motion.nav>

        {/* Hero */}
        <main className="flex-1">
          <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 lg:py-28">
            <div className="grid lg:grid-cols-2 gap-12 items-center">
              <motion.div
                initial={{ opacity: 0, x: -30 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.6 }}
              >
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
                  <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}>
                    <Button size="lg" className="bg-gradient-to-r from-amber-600 to-red-700 hover:from-amber-700 hover:to-red-800 text-white" onClick={() => setView('dashboard')}>
                      Start Generating <ArrowRight className="ml-2 h-4 w-4" />
                    </Button>
                  </motion.div>
                  <Button size="lg" variant="outline">
                    View Documentation
                  </Button>
                </div>
              </motion.div>
              <motion.div
                initial={{ opacity: 0, x: 30, y: 20 }}
                animate={{ opacity: 1, x: 0, y: 0 }}
                transition={{ duration: 0.6, delay: 0.2 }}
                className="relative"
              >
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
              </motion.div>
            </div>
          </section>

          {/* Features */}
          <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="text-center mb-12"
            >
              <h2 className="text-3xl font-bold mb-4">Everything You Need for Synthetic Data</h2>
              <p className="text-muted-foreground text-lg max-w-2xl mx-auto">From schema definition to export, SynthForge AI handles the entire synthetic data lifecycle.</p>
            </motion.div>
            <motion.div
              variants={staggerContainer}
              initial="initial"
              whileInView="animate"
              viewport={{ once: true }}
              className="grid md:grid-cols-2 lg:grid-cols-3 gap-6"
            >
              {[
                { icon: MessageSquare, title: 'AI Data Agent', desc: 'Describe your data needs in natural language. Our AI generates realistic, domain-specific synthetic data instantly.' },
                { icon: Table2, title: 'Schema-Aware Generation', desc: 'Upload SQL DDL, JSON schemas, or CSV headers. The AI understands relationships and maintains referential integrity.' },
                { icon: Download, title: 'Multi-Format Export', desc: 'Export as JSON, CSV, SQL INSERT statements, or directly push to connected databases with one click.' },
                { icon: Sparkles, title: 'PII Protection', desc: 'Automatic detection and masking of personally identifiable information. All generated data is privacy-safe by design.' },
                { icon: Code2, title: 'SQL Transparency', desc: 'Every generation action produces viewable SQL. Copy, audit, or modify the generated statements.' },
                { icon: RefreshCw, title: 'Iterative Refinement', desc: 'Chat with the AI to refine your data. Add columns, adjust distributions, or regenerate specific tables.' }
              ].map((feature, i) => (
                <motion.div key={i} variants={staggerItem} whileHover={{ y: -4, transition: { duration: 0.2 } }}>
                  <Card className="hover:shadow-lg transition-shadow h-full group">
                    <CardContent className="pt-6">
                      <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-amber-100 to-red-50 flex items-center justify-center mb-3 group-hover:from-amber-200 group-hover:to-red-100 transition-colors">
                        <feature.icon className="h-5 w-5 text-amber-700" />
                      </div>
                      <h3 className="font-semibold text-lg mb-2">{feature.title}</h3>
                      <p className="text-sm text-muted-foreground">{feature.desc}</p>
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </motion.div>
          </section>
        </main>

        {/* Footer */}
        <footer className="border-t py-8 bg-white mt-auto">
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
  // DASHBOARD VIEW
  // ═══════════════════════════════════════════════════════════
  if (view === 'dashboard') {
    return (
      <div className="min-h-screen flex bg-background">
        {/* Sidebar */}
        <AnimatePresence>
          {(sidebarOpen || (typeof window !== 'undefined' && window.innerWidth >= 768)) && (
            <motion.aside
              initial={{ x: -280, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: -280, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 300, damping: 30 }}
              className="fixed md:relative z-40 w-64 border-r bg-card h-screen flex flex-col md:translate-x-0"
            >
              {/* Sidebar Header */}
              <div className="h-14 flex items-center gap-2 px-4 border-b shrink-0">
                <div className="h-7 w-7 rounded-md bg-gradient-to-br from-amber-600 to-red-700 flex items-center justify-center">
                  <Zap className="h-4 w-4 text-white" />
                </div>
                <span className="font-bold text-sm">SynthForge AI</span>
                <Button variant="ghost" size="sm" className="ml-auto md:hidden h-7 w-7 p-0" onClick={() => setSidebarOpen(false)}>
                  <X className="h-4 w-4" />
                </Button>
              </div>

              {/* Sidebar Content */}
              <ScrollArea className="flex-1">
                <div className="p-3 space-y-1">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 px-2">Workspaces</p>
                  {workspaces.map(ws => (
                    <button
                      key={ws.id}
                      className={`w-full text-left p-2 rounded-md text-sm transition-colors ${activeWorkspace?.id === ws.id ? 'bg-muted font-medium' : 'hover:bg-muted/50'}`}
                      onClick={() => { setActiveWorkspace(ws); loadProjects(ws.id) }}
                    >
                      <div className="flex items-center gap-2">
                        <LayoutDashboard className="h-4 w-4 text-muted-foreground" />
                        {ws.name}
                      </div>
                    </button>
                  ))}
                </div>

                <Separator className="my-2" />

                <div className="p-3 space-y-1">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 px-2">Projects</p>
                  {projects.map(proj => (
                    <div key={proj.id} className="px-2">
                      <p className="text-sm font-medium py-1">{proj.name}</p>
                      {(proj.databases || []).map(db => (
                        <motion.button
                          key={db.id}
                          whileHover={{ x: 2 }}
                          className="w-full text-left p-2 rounded-md text-xs hover:bg-muted/50 transition-colors flex items-center gap-2"
                          onClick={() => openDatabase(db)}
                        >
                          <Database className="h-3.5 w-3.5 text-amber-700 shrink-0" />
                          <span className="truncate">{db.name}</span>
                          {db._count?.datasets !== undefined && (
                            <Badge variant="secondary" className="text-[9px] ml-auto">{db._count.datasets}</Badge>
                          )}
                        </motion.button>
                      ))}
                    </div>
                  ))}
                </div>
              </ScrollArea>

              {/* Sidebar Footer */}
              <div className="p-3 border-t shrink-0">
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full text-xs"
                  onClick={() => setView('landing')}
                >
                  <ArrowRight className="h-3 w-3 mr-1 rotate-180" /> Back to Home
                </Button>
              </div>
            </motion.aside>
          )}
        </AnimatePresence>

        {/* Sidebar overlay for mobile */}
        {sidebarOpen && typeof window !== 'undefined' && window.innerWidth < 768 && (
          <div className="fixed inset-0 bg-black/50 z-30" onClick={() => setSidebarOpen(false)} />
        )}

        {/* Main Content */}
        <main className="flex-1 min-h-screen">
          {/* Dashboard Header */}
          <header className="h-14 border-b flex items-center px-4 gap-3 shrink-0 bg-card">
            <Button variant="ghost" size="sm" className="md:hidden h-8 w-8 p-0" onClick={() => setSidebarOpen(true)}>
              <Menu className="h-4 w-4" />
            </Button>
            <h1 className="font-semibold text-lg">Dashboard</h1>
            <div className="ml-auto">
              <Dialog open={showNewDbDialog} onOpenChange={setShowNewDbDialog}>
                <DialogTrigger asChild>
                  <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}>
                    <Button size="sm" className="bg-gradient-to-r from-amber-600 to-red-700 hover:from-amber-700 hover:to-red-800 text-white gap-1">
                      <Plus className="h-4 w-4" /> New Database
                    </Button>
                  </motion.div>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Create New Database</DialogTitle>
                    <DialogDescription>Create a new synthetic database to generate data with AI.</DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Database Name</label>
                      <Input
                        value={newDbName}
                        onChange={(e) => setNewDbName(e.target.value)}
                        placeholder="e.g., E-Commerce Store"
                        onKeyDown={(e) => e.key === 'Enter' && createDatabase()}
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Schema (Optional JSON)</label>
                      <Textarea
                        value={newDbSchema}
                        onChange={(e) => setNewDbSchema(e.target.value)}
                        placeholder='{"users": {"columns": {"id": "SERIAL", "name": "VARCHAR"}}}'
                        className="font-mono text-xs min-h-[80px]"
                      />
                    </div>
                    <Button onClick={createDatabase} className="w-full bg-gradient-to-r from-amber-600 to-red-700 hover:from-amber-700 hover:to-red-800 text-white">
                      Create Database
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
          </header>

          {/* Dashboard Content */}
          <ScrollArea className="h-[calc(100vh-56px)]">
            <div className="p-6 max-w-6xl mx-auto">
              {/* Quick Actions */}
              <motion.div
                variants={staggerContainer}
                initial="initial"
                animate="animate"
                className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8"
              >
                {[
                  { icon: <MessageSquare className="h-5 w-5 text-amber-700" />, title: 'Chat to Generate', desc: 'Describe data in natural language', action: () => allDatabases[0] ? openDatabase(allDatabases[0]) : null },
                  { icon: <Upload className="h-5 w-5 text-amber-700" />, title: 'Upload Schema', desc: 'Import SQL, CSV, or JSON', action: () => setShowNewDbDialog(true) },
                  { icon: <Wand2 className="h-5 w-5 text-amber-700" />, title: 'Auto Mode', desc: 'Plan & generate in one step', action: () => { setAgentMode('auto'); if (allDatabases[0]) openDatabase(allDatabases[0]) } },
                  { icon: <Download className="h-5 w-5 text-amber-700" />, title: 'Export Data', desc: 'Download in any format', action: () => toast({ title: 'Export', description: 'Open a database first to export data' }) }
                ].map((action, i) => (
                  <motion.div key={i} variants={staggerItem} whileHover={{ y: -2, transition: { duration: 0.15 } }}>
                    <Card className="cursor-pointer hover:shadow-md transition-all group" onClick={action.action}>
                      <CardContent className="pt-5 pb-4">
                        <div className="h-9 w-9 rounded-lg bg-gradient-to-br from-amber-100 to-red-50 flex items-center justify-center mb-2.5 group-hover:from-amber-200 group-hover:to-red-100 transition-colors">
                          {action.icon}
                        </div>
                        <h3 className="font-semibold text-sm">{action.title}</h3>
                        <p className="text-xs text-muted-foreground mt-0.5">{action.desc}</p>
                      </CardContent>
                    </Card>
                  </motion.div>
                ))}
              </motion.div>

              {/* Databases Grid */}
              <div className="mb-4">
                <h2 className="text-lg font-semibold mb-4">Your Databases</h2>
                {allDatabases.length === 0 ? (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="text-center py-16"
                  >
                    <Database className="h-12 w-12 mx-auto text-muted-foreground/30 mb-3" />
                    <p className="text-sm font-medium text-muted-foreground mb-1">No databases yet</p>
                    <p className="text-xs text-muted-foreground mb-4">Create your first database to start generating synthetic data</p>
                    <Button
                      size="sm"
                      className="bg-gradient-to-r from-amber-600 to-red-700 hover:from-amber-700 hover:to-red-800 text-white"
                      onClick={() => setShowNewDbDialog(true)}
                    >
                      <Plus className="h-4 w-4 mr-1" /> Create Database
                    </Button>
                  </motion.div>
                ) : (
                  <motion.div
                    variants={staggerContainer}
                    initial="initial"
                    animate="animate"
                    className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"
                  >
                    {allDatabases.map(db => (
                      <motion.div key={db.id} variants={staggerItem} whileHover={{ y: -3, transition: { duration: 0.15 } }}>
                        <Card className="cursor-pointer hover:shadow-lg transition-all group" onClick={() => openDatabase(db)}>
                          <CardHeader className="pb-2">
                            <div className="flex items-center justify-between">
                              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                                <Database className="h-4 w-4 text-amber-700" />
                                <span className="truncate">{db.name}</span>
                              </CardTitle>
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                                  <Button variant="ghost" size="sm" className="h-7 w-7 p-0 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent>
                                  <DropdownMenuItem className="text-destructive" onClick={(e) => { e.stopPropagation(); deleteDatabase(db.id) }}>
                                    <Trash2 className="h-3.5 w-3.5 mr-2" /> Delete
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </div>
                          </CardHeader>
                          <CardContent>
                            <div className="flex items-center gap-2 mb-2">
                              <Badge variant="secondary" className="text-xs">{db.dbType}</Badge>
                              {db._count?.datasets !== undefined && (
                                <Badge variant="outline" className="text-xs">{db._count.datasets} datasets</Badge>
                              )}
                              {db._count?.conversations !== undefined && db._count.conversations > 0 && (
                                <Badge variant="outline" className="text-xs">{db._count.conversations} chats</Badge>
                              )}
                            </div>
                            {db.schemaJson && db.schemaJson !== '{}' && (() => {
                              try {
                                const schema = JSON.parse(db.schemaJson)
                                const tableNames = Object.keys(schema)
                                return (
                                  <div className="flex flex-wrap gap-1 mt-2">
                                    {tableNames.slice(0, 3).map(t => (
                                      <Badge key={t} variant="outline" className="text-[10px] font-mono px-1.5 py-0">
                                        <Table2 className="h-2.5 w-2.5 mr-0.5 text-amber-700" />
                                        {t}
                                      </Badge>
                                    ))}
                                    {tableNames.length > 3 && (
                                      <Badge variant="outline" className="text-[10px] px-1.5 py-0">+{tableNames.length - 3}</Badge>
                                    )}
                                  </div>
                                )
                              } catch { return null }
                            })()}
                          </CardContent>
                        </Card>
                      </motion.div>
                    ))}
                  </motion.div>
                )}
              </div>
            </div>
          </ScrollArea>
        </main>
      </div>
    )
  }

  // ═══════════════════════════════════════════════════════════
  // STUDIO VIEW
  // ═══════════════════════════════════════════════════════════
  if (view === 'studio' && activeDb) {
    const allTables = getTablesFromMessages()

    return (
      <div className="h-screen flex flex-col bg-background">
        {/* Studio Header */}
        <header className="border-b bg-card h-12 flex items-center px-3 gap-2 shrink-0">
          <Button variant="ghost" size="sm" onClick={() => setView('dashboard')} className="gap-1 text-xs h-7">
            <ChevronRight className="h-3 w-3 rotate-180" />
            <span className="hidden sm:inline">Back</span>
          </Button>
          <Separator orientation="vertical" className="h-5" />
          <Database className="h-4 w-4 text-amber-700 shrink-0" />
          <span className="font-semibold text-sm truncate max-w-[150px]">{activeDb.name}</span>
          <Badge variant="secondary" className="text-xs hidden sm:inline-flex">{activeDb.dbType}</Badge>

          {/* Agent Mode Selector */}
          <Separator orientation="vertical" className="h-5 hidden md:block" />
          <div className="items-center gap-2 hidden md:flex">
            <span className="text-xs text-muted-foreground">Agent:</span>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div>
                    <Select value={agentMode} onValueChange={(v) => setAgentMode(v as AgentMode)}>
                      <SelectTrigger className="h-7 w-[120px] text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="plan">
                          <span className="flex items-center gap-1.5"><Brain className="h-3 w-3 text-sky-600" /> Plan</span>
                        </SelectItem>
                        <SelectItem value="execute">
                          <span className="flex items-center gap-1.5"><Play className="h-3 w-3 text-emerald-600" /> Execute</span>
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

          <div className="ml-auto flex items-center gap-1.5">
            {/* Mobile Tab Toggle */}
            <div className="flex md:hidden items-center gap-0.5 bg-muted rounded-md p-0.5">
              <Button
                variant={mobileStudioTab === 'chat' ? 'secondary' : 'ghost'}
                size="sm"
                className="h-6 text-xs px-2"
                onClick={() => setMobileStudioTab('chat')}
              >
                <MessageSquare className="h-3 w-3" />
              </Button>
              <Button
                variant={mobileStudioTab === 'data' ? 'secondary' : 'ghost'}
                size="sm"
                className="h-6 text-xs px-2"
                onClick={() => setMobileStudioTab('data')}
              >
                <Table2 className="h-3 w-3" />
              </Button>
            </div>

            {Object.keys(allTables).length > 0 && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="gap-1 text-xs h-7">
                    <Download className="h-3 w-3" /> <span className="hidden sm:inline">Export</span>
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
        {/* Mobile: single panel with tabs */}
        <div className="flex-1 overflow-hidden md:hidden">
          {mobileStudioTab === 'chat' ? <ChatPanel /> : <DataWorkspace />}
        </div>

        {/* Desktop: Resizable Panels */}
        <div className="flex-1 overflow-hidden hidden md:block">
          <ResizablePanelGroup direction="horizontal">
            <ResizablePanel defaultSize={55} minSize={30}>
              <ChatPanel />
            </ResizablePanel>
            <ResizableHandle withHandle />
            <ResizablePanel defaultSize={45} minSize={30}>
              <DataWorkspace />
            </ResizablePanel>
          </ResizablePanelGroup>
        </div>
      </div>
    )
  }

  // Fallback: if studio but no activeDb
  if (view === 'studio' && !activeDb) {
    setView('dashboard')
    return null
  }

  // Default fallback
  return null
}
