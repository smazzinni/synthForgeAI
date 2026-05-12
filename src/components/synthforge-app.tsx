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
  PanelLeftClose, PanelLeft, Shield, RotateCcw, Gauge, GitBranch,
  Activity, Users, BarChart3, Clock, Layers, Settings,
  FileDown, ClipboardCheck, Rows3, Target, Network
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
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger
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
import { Slider } from '@/components/ui/slider'
import { useToast } from '@/hooks/use-toast'

// ─── Types ─────────────────────────────────────────────
interface Workspace { id: string; name: string; slug: string; agentInstructions: string }
interface Project { id: string; name: string; description: string; workspaceId: string; databases?: Database_[] }
interface Database_ { id: string; name: string; dbType: string; schemaJson: string; dataJson: string; projectId: string; updatedAt: string; _count?: { datasets: number; conversations: number } }
interface QualityScore { overall: number; breakdown: { completeness: number; uniqueness: number; distribution: number; referentialIntegrity: number } }
interface PIICheck { hasPII: boolean; findings: { type: string; field: string; count: number }[] }
interface Message { id: string; role: string; content: string; sqlCode: string; tokensIn: number; tokensOut: number; cost: number; createdAt: string; agentName: string; reasoningSteps: string; options: string; tablesJson: string; qualityScore?: QualityScore | null; piiCheck?: PIICheck | null; schemaVersion?: number }
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
  transition: { type: 'spring' as const, stiffness: 300, damping: 24 }
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

// ─── Gradient background animation keyframes ──────────
const gradientStyle = `
@keyframes gradientShift {
  0%, 100% { background-position: 0% 50%; }
  50% { background-position: 100% 50%; }
}
`

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
  const [schemaVersionCount, setSchemaVersionCount] = useState(0)
  const [rowCount, setRowCount] = useState(10)
  const [isDragOver, setIsDragOver] = useState(false)
  const [totalTokens, setTotalTokens] = useState(0)
  const [showSchemaTemplates, setShowSchemaTemplates] = useState(false)
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

  // Track total tokens
  useEffect(() => {
    const total = messages.reduce((sum, m) => sum + m.tokensIn + m.tokensOut, 0)
    setTotalTokens(total)
  }, [messages])

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
    setRightTab('preview')
    setAgentMode('auto')
    setSqlQuery('')
    setSqlResult('')
    setAttachedFiles([])
    setMobileStudioTab('chat')
    setView('studio')

    try {
      const res = await fetch(`/api/chat?databaseId=${db.id}`)
      const data = await res.json()
      if (data.conversation && data.conversation.messages?.length > 0) {
        setConversation({ id: data.conversation.id, title: data.conversation.title, messages: data.conversation.messages })
        setMessages(data.conversation.messages)
      } else {
        setConversation(null)
        setMessages([])
      }
    } catch {
      setConversation(null)
      setMessages([])
    }

    try {
      const dbDetail = await fetch(`/api/databases`)
      const dbData = await dbDetail.json()
      const currentDb = dbData.databases?.find((d: Database_) => d.id === db.id)
      if (currentDb) setActiveDb(currentDb)
    } catch { /* silent */ }
  }

  // ─── Core Send Message ────────────────
  const sendMessage = useCallback(async (messageText: string, files: { name: string; content: string; type: string }[] = []) => {
    if ((!messageText.trim() && files.length === 0) || isLoading || !activeDb) return

    const msgText = messageText.trim() || 'Generate data from the attached file(s)'
    setInput('')
    setIsLoading(true)

    // Add row count context if specified
    const rowContext = rowCount !== 10 ? ` (Generate ${rowCount} rows per table)` : ''

    const tempUserMsg: Message = {
      id: 'temp-' + Date.now(),
      role: 'user',
      content: msgText + rowContext + (files.length > 0 ? `\n\n[Attached: ${files.map(f => f.name).join(', ')}]` : ''),
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
          message: msgText + rowContext,
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
        setConversation({ id: data.conversationId, title: msgText.slice(0, 60), messages: [] })
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
        tablesJson: data.message.tablesJson || '{}',
        qualityScore: data.message.qualityScore || null,
        piiCheck: data.message.piiCheck || null,
        schemaVersion: data.message.schemaVersion || 0
      }
      setMessages(prev => [...prev, assistantMsg])

      if (data.message.schemaVersion) {
        setSchemaVersionCount(data.message.schemaVersion)
      }

      await refreshDatabase(activeDb.id)
    } catch (error) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to get response',
        variant: 'destructive',
        action: <Button size="sm" variant="outline" onClick={() => sendMessage(msgText, files)}>Retry</Button>
      })
      setMessages(prev => prev.filter(m => m.id !== tempUserMsg.id))
    } finally {
      setIsLoading(false)
    }
  }, [isLoading, activeDb, conversation, activeWorkspace, toast, agentMode, rowCount])

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

  const getSchemaFromDb = (): Record<string, { columns: Record<string, string>; relationships?: string[] }> => {
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
        const type = ext === 'sql' ? 'sql' : ext === 'csv' ? 'csv' : ext === 'json' ? 'json' : ext === 'xml' ? 'xml' : 'text'
        setAttachedFiles(prev => [...prev, { name: file.name, content, type }])
      }
      reader.readAsText(file)
    })
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  // ─── Drag & Drop handler ────────────────────────────
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(true)
  }
  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
  }
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
    const files = e.dataTransfer.files
    if (!files || files.length === 0) return

    Array.from(files).forEach(file => {
      const reader = new FileReader()
      reader.onload = (ev) => {
        const content = ev.target?.result as string
        const ext = file.name.split('.').pop()?.toLowerCase() || ''
        const type = ext === 'sql' ? 'sql' : ext === 'csv' ? 'csv' : ext === 'json' ? 'json' : ext === 'xml' ? 'xml' : 'text'
        setAttachedFiles(prev => [...prev, { name: file.name, content, type }])
      }
      reader.readAsText(file)
    })
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

  // ─── Enhanced Export with multiple formats ────────────────
  const exportData = (tables: Record<string, Record<string, unknown>[]>, format: string) => {
    let content = ''
    let filename = 'synthforge-data'
    let type = 'text/plain'

    if (format === 'json') {
      content = JSON.stringify(tables, null, 2)
      filename += '.json'
      type = 'application/json'
    } else if (format === 'csv') {
      // Export all tables - each table gets a header
      const parts: string[] = []
      for (const [tableName, rows] of Object.entries(tables)) {
        if (rows?.length > 0) {
          const headers = Object.keys(rows[0])
          parts.push(`-- Table: ${tableName}`)
          parts.push(headers.map(h => `"${tableName}.${h}"`).join(','))
          for (const row of rows) {
            parts.push(headers.map(h => {
              const v = row[h]
              if (v === null || v === undefined) return '""'
              const s = String(v).replace(/"/g, '""')
              return `"${s}"`
            }).join(','))
          }
          parts.push('')
        }
      }
      content = parts.join('\n')
      filename += '.csv'
      type = 'text/csv'
    } else if (format === 'sql-insert') {
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
    } else if (format === 'sql-full') {
      const statements: string[] = []
      for (const [tableName, rows] of Object.entries(tables)) {
        if (rows?.length > 0) {
          const cols = Object.keys(rows[0])
          const colDefs = cols.map(c => {
            const sampleVal = rows[0][c]
            let sqlType = 'VARCHAR(255)'
            if (typeof sampleVal === 'number') sqlType = Number.isInteger(sampleVal) ? 'INTEGER' : 'DECIMAL(10,2)'
            else if (typeof sampleVal === 'boolean') sqlType = 'BOOLEAN'
            else if (c === 'id') sqlType = 'SERIAL PRIMARY KEY'
            else if (c.endsWith('_id')) sqlType = 'INTEGER REFERENCES ' + c.replace(/_id$/, '') + 's(id)'
            else if (typeof sampleVal === 'string' && /^\d{4}-\d{2}-\d{2}/.test(sampleVal)) sqlType = 'TIMESTAMP'
            return `${c} ${sqlType}`
          })
          statements.push(`CREATE TABLE ${tableName} (\n  ${colDefs.join(',\n  ')}\n);\n`)
          for (const row of rows) {
            const values = cols.map(c => {
              const v = row[c]
              return typeof v === 'string' ? `'${v.replace(/'/g, "''")}'` : String(v ?? 'NULL')
            })
            statements.push(`INSERT INTO ${tableName} (${cols.join(', ')}) VALUES (${values.join(', ')});`)
          }
          statements.push('')
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
    toast({ title: 'Exported!', description: `Downloaded as ${filename}` })
  }

  // ─── Copy all data to clipboard ──────────────────────
  const copyAllData = (tables: Record<string, Record<string, unknown>[]>, format: string) => {
    let content = ''
    if (format === 'json') {
      content = JSON.stringify(tables, null, 2)
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
    } else {
      content = JSON.stringify(tables, null, 2)
    }
    navigator.clipboard.writeText(content)
    toast({ title: 'Copied!', description: 'Data copied to clipboard' })
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

  // ─── Schema templates ────────────────────────────────
  const schemaTemplates: { name: string; desc: string; schema: Record<string, unknown> }[] = [
    { name: 'E-Commerce', desc: 'Users, Products, Orders', schema: { users: { columns: { id: 'SERIAL', first_name: 'VARCHAR', last_name: 'VARCHAR', email: 'VARCHAR', phone: 'VARCHAR', city: 'VARCHAR', state: 'VARCHAR', created_at: 'TIMESTAMP' } }, products: { columns: { id: 'SERIAL', name: 'VARCHAR', category: 'VARCHAR', price: 'DECIMAL', stock: 'INTEGER', description: 'VARCHAR' } }, orders: { columns: { id: 'SERIAL', user_id: 'INTEGER', product_id: 'INTEGER', quantity: 'INTEGER', total_amount: 'DECIMAL', status: 'VARCHAR', order_date: 'TIMESTAMP' } } } },
    { name: 'Healthcare', desc: 'Patients, Doctors, Appointments', schema: { patients: { columns: { id: 'SERIAL', first_name: 'VARCHAR', last_name: 'VARCHAR', email: 'VARCHAR', age: 'INTEGER', diagnosis: 'VARCHAR', admission_date: 'TIMESTAMP', status: 'VARCHAR' } }, doctors: { columns: { id: 'SERIAL', first_name: 'VARCHAR', last_name: 'VARCHAR', specialty: 'VARCHAR', email: 'VARCHAR' } }, appointments: { columns: { id: 'SERIAL', patient_id: 'INTEGER', doctor_id: 'INTEGER', date: 'TIMESTAMP', notes: 'VARCHAR', status: 'VARCHAR' } } } },
    { name: 'Education', desc: 'Students, Courses, Enrollments', schema: { students: { columns: { id: 'SERIAL', first_name: 'VARCHAR', last_name: 'VARCHAR', email: 'VARCHAR', age: 'INTEGER', enrollment_date: 'TIMESTAMP', status: 'VARCHAR' } }, courses: { columns: { id: 'SERIAL', name: 'VARCHAR', category: 'VARCHAR', credits: 'INTEGER', instructor: 'VARCHAR' } }, enrollments: { columns: { id: 'SERIAL', student_id: 'INTEGER', course_id: 'INTEGER', grade: 'VARCHAR', enrolled_at: 'TIMESTAMP' } } } },
    { name: 'HR/Employee', desc: 'Employees, Departments, Salaries', schema: { employees: { columns: { id: 'SERIAL', first_name: 'VARCHAR', last_name: 'VARCHAR', email: 'VARCHAR', department_id: 'INTEGER', hire_date: 'TIMESTAMP', status: 'VARCHAR' } }, departments: { columns: { id: 'SERIAL', name: 'VARCHAR', budget: 'DECIMAL', location: 'VARCHAR' } }, salaries: { columns: { id: 'SERIAL', employee_id: 'INTEGER', amount: 'DECIMAL', effective_date: 'TIMESTAMP' } } } },
    { name: 'Fintech', desc: 'Accounts, Transactions, Cards', schema: { accounts: { columns: { id: 'SERIAL', holder_name: 'VARCHAR', email: 'VARCHAR', balance: 'DECIMAL', account_type: 'VARCHAR', created_at: 'TIMESTAMP' } }, transactions: { columns: { id: 'SERIAL', account_id: 'INTEGER', amount: 'DECIMAL', type: 'VARCHAR', description: 'VARCHAR', timestamp: 'TIMESTAMP' } }, cards: { columns: { id: 'SERIAL', account_id: 'INTEGER', card_type: 'VARCHAR', limit: 'DECIMAL', expiry: 'VARCHAR', status: 'VARCHAR' } } } },
  ]

  // ─── Render Helper: Quality Score Badge ───────────────────
  const QualityBadge = ({ score }: { score: number }) => {
    const color = score >= 80 ? 'bg-green-100 text-green-800 border-green-200' : score >= 60 ? 'bg-yellow-100 text-yellow-800 border-yellow-200' : 'bg-red-100 text-red-800 border-red-200'
    const icon = score >= 80 ? <Gauge className="h-3 w-3" /> : score >= 60 ? <Gauge className="h-3 w-3" /> : <AlertCircle className="h-3 w-3" />
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge className={`text-[10px] ${color} gap-1 cursor-help`}>
              {icon} {score}/100
            </Badge>
          </TooltipTrigger>
          <TooltipContent>Data Quality Score</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    )
  }

  // ─── Render Helper: PII Shield Badge ────────────────────
  const PIIShieldBadge = ({ piiCheck }: { piiCheck: PIICheck | null }) => {
    if (!piiCheck) return null
    const hasNoPII = !piiCheck.hasPII
    const color = hasNoPII ? 'bg-emerald-100 text-emerald-800 border-emerald-200' : 'bg-red-100 text-red-800 border-red-200'
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge className={`text-[10px] ${color} gap-1 cursor-help`}>
              <Shield className="h-3 w-3" /> {hasNoPII ? 'PII Safe' : 'PII Found'}
            </Badge>
          </TooltipTrigger>
          <TooltipContent>
            {hasNoPII ? 'No personally identifiable information detected' : `${piiCheck.findings.length} PII finding(s) detected`}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    )
  }

  // ─── Regenerate table data ────────────────────────────────
  const regenerateTable = async (tableName: string) => {
    if (!activeDb || !conversation) return
    await sendMessage(`Regenerate data for the ${tableName} table with different values`)
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
          <Brain className="h-3 w-3" /> Reasoning ({steps.length})
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
      </div>
    )
  }

  // ─── Quick Action Buttons (after generation) ─────────
  const QuickActions = ({ msg }: { msg: Message }) => {
    const tables = getTablesFromMessages()
    if (msg.role !== 'assistant' || Object.keys(tables).length === 0) return null

    return (
      <div className="flex flex-wrap gap-1.5 mt-3 pt-2 border-t border-border/50">
        <Button
          variant="outline"
          size="sm"
          className="h-6 text-[11px] gap-1 hover:bg-amber-50 hover:border-amber-300"
          onClick={() => exportData(tables, 'json')}
        >
          <FileJson className="h-3 w-3" /> Export JSON
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="h-6 text-[11px] gap-1 hover:bg-amber-50 hover:border-amber-300"
          onClick={() => exportData(tables, 'csv')}
        >
          <FileText className="h-3 w-3" /> Export CSV
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="h-6 text-[11px] gap-1 hover:bg-amber-50 hover:border-amber-300"
          onClick={() => copyAllData(tables, 'json')}
        >
          <Copy className="h-3 w-3" /> Copy
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="h-6 text-[11px] gap-1 hover:bg-amber-50 hover:border-amber-300"
          onClick={() => sendMessage('Add 10 more rows to each table')}
          disabled={isLoading}
        >
          <Plus className="h-3 w-3" /> Add More
        </Button>
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
    const schema = getSchemaFromDb()
    const tableSchema = schema[tableName]

    // Column type highlighting
    const getColumnType = (colName: string): string => {
      if (tableSchema?.columns?.[colName]) return tableSchema.columns[colName]
      if (colName === 'id') return 'PK'
      if (colName.endsWith('_id')) return 'FK'
      return ''
    }

    const columnTypeColor = (colType: string): string => {
      if (!colType) return ''
      if (colType === 'PK' || colType.includes('SERIAL') || colType.includes('PRIMARY')) return 'bg-amber-100 text-amber-800'
      if (colType === 'FK' || colType.includes('REFERENCES') || colType.includes('INTEGER')) return 'bg-sky-100 text-sky-800'
      if (colType.includes('VARCHAR') || colType.includes('TEXT')) return 'bg-emerald-100 text-emerald-800'
      if (colType.includes('DECIMAL') || colType.includes('FLOAT') || colType.includes('NUMERIC')) return 'bg-purple-100 text-purple-800'
      if (colType.includes('TIMESTAMP') || colType.includes('DATE')) return 'bg-orange-100 text-orange-800'
      if (colType.includes('BOOLEAN') || colType.includes('BOOL')) return 'bg-pink-100 text-pink-800'
      return 'bg-gray-100 text-gray-800'
    }

    return (
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Table2 className="h-4 w-4 text-amber-700" />
              {tableName}
            </CardTitle>
            <div className="flex items-center gap-1.5">
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0 hover:bg-amber-50"
                      onClick={() => regenerateTable(tableName)}
                      disabled={isLoading}
                    >
                      <RotateCcw className="h-3 w-3 text-amber-700" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Regenerate {tableName}</TooltipContent>
                </Tooltip>
              </TooltipProvider>
              <Badge variant="secondary" className="text-xs">{rows.length} rows</Badge>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {pageRows.length > 0 ? (
            <ScrollArea className="max-h-80">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b bg-muted/30 sticky top-0">
                    {Object.keys(pageRows[0]).map(key => {
                      const colType = getColumnType(key)
                      return (
                        <th key={key} className="text-left py-1.5 px-2 whitespace-nowrap">
                          <div className="flex items-center gap-1">
                            <span className="font-medium text-muted-foreground">{key}</span>
                            {colType && (
                              <Badge className={`text-[8px] px-1 py-0 h-3.5 font-mono ${columnTypeColor(colType)}`}>
                                {colType === 'PK' ? 'PK' : colType === 'FK' ? 'FK' : colType.split('(')[0]}
                              </Badge>
                            )}
                          </div>
                        </th>
                      )
                    })}
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map((row, i) => (
                    <tr key={i} className="border-b last:border-0 hover:bg-amber-50/30 transition-colors">
                      {Object.entries(row).map(([key, val], j) => {
                        const colType = getColumnType(key)
                        const isPK = colType === 'PK' || key === 'id'
                        const isFK = colType === 'FK' || key.endsWith('_id')
                        return (
                          <td key={j} className={`py-1.5 px-2 whitespace-nowrap max-w-[200px] truncate ${isPK ? 'font-mono font-semibold text-amber-700' : isFK ? 'font-mono text-sky-700' : ''}`}>
                            {val === null ? <span className="text-muted-foreground italic">null</span> : String(val)}
                          </td>
                        )
                      })}
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

  // ─── Render: Entity-Relationship Diagram (text-based) ──
  const SchemaVisualization = () => {
    const schema = getSchemaFromDb()
    const tables = getTablesFromMessages()
    const allTableNames = new Set([...Object.keys(tables), ...Object.keys(schema)])

    if (allTableNames.size === 0) {
      return (
        <div className="text-center py-20">
          <div className="h-16 w-16 rounded-2xl bg-gradient-to-br from-amber-100 to-red-50 flex items-center justify-center mx-auto mb-4">
            <Network className="h-8 w-8 text-amber-700/50" />
          </div>
          <p className="text-sm font-medium text-muted-foreground mb-1">No schema to visualize</p>
          <p className="text-xs text-muted-foreground mb-4">Ask the AI to generate data with related tables</p>
        </div>
      )
    }

    // Build relationships
    const relationships: { from: string; to: string; via: string }[] = []
    for (const tableName of allTableNames) {
      const tableSchema = schema[tableName]
      if (tableSchema?.columns) {
        for (const colName of Object.keys(tableSchema.columns)) {
          if (colName.endsWith('_id') && colName !== 'id') {
            const refTableName = colName.replace(/_id$/, '') + 's'
            if (allTableNames.has(refTableName)) {
              relationships.push({ from: tableName, to: refTableName, via: colName })
            }
          }
        }
      }
    }

    return (
      <div className="space-y-6">
        {/* Relationship Overview */}
        {relationships.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Link2 className="h-4 w-4 text-sky-600" />
                Relationships
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {relationships.map((rel, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs bg-muted/30 p-2 rounded-md">
                    <Badge variant="outline" className="font-mono text-xs">{rel.from}</Badge>
                    <ArrowRight className="h-3 w-3 text-sky-500" />
                    <span className="text-muted-foreground font-mono">{rel.via}</span>
                    <ArrowRight className="h-3 w-3 text-sky-500" />
                    <Badge variant="outline" className="font-mono text-xs">{rel.to}</Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Entity Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {Array.from(allTableNames).map(tableName => {
            const tableSchema = schema[tableName]
            const tableRows = tables[tableName]
            const columns = tableSchema?.columns || {}
            const pks = Object.keys(columns).filter(c => c === 'id')
            const fks = Object.keys(columns).filter(c => c.endsWith('_id') && c !== 'id')
            const others = Object.keys(columns).filter(c => !pks.includes(c) && !fks.includes(c))

            return (
              <Card key={tableName} className="border-2 border-amber-200/50">
                <CardHeader className="pb-1 pt-3 px-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-xs font-bold uppercase tracking-wider text-amber-700 flex items-center gap-1.5">
                      <Table2 className="h-3.5 w-3.5" />
                      {tableName}
                    </CardTitle>
                    {tableRows && <Badge variant="secondary" className="text-[9px]">{tableRows.length} rows</Badge>}
                  </div>
                </CardHeader>
                <CardContent className="px-3 pb-3">
                  <div className="space-y-0.5">
                    {pks.map(col => (
                      <div key={col} className="flex items-center gap-1.5 text-[11px] py-0.5">
                        <Key className="h-2.5 w-2.5 text-amber-500" />
                        <span className="font-mono font-semibold text-amber-700">{col}</span>
                        <span className="text-muted-foreground ml-auto font-mono">{columns[col]}</span>
                      </div>
                    ))}
                    {fks.map(col => (
                      <div key={col} className="flex items-center gap-1.5 text-[11px] py-0.5">
                        <Link2 className="h-2.5 w-2.5 text-sky-500" />
                        <span className="font-mono text-sky-700">{col}</span>
                        <span className="text-muted-foreground ml-auto font-mono">{columns[col]}</span>
                      </div>
                    ))}
                    {others.map(col => (
                      <div key={col} className="flex items-center gap-1.5 text-[11px] py-0.5">
                        <Columns3 className="h-2.5 w-2.5 text-gray-400" />
                        <span className="font-mono">{col}</span>
                        <span className="text-muted-foreground ml-auto font-mono">{columns[col]}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      </div>
    )
  }

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
          <div className="max-w-[90%] bg-gradient-to-br from-amber-600 to-red-700 text-white rounded-xl rounded-br-sm px-3 py-2 shadow-sm">
            <p className="text-xs whitespace-pre-wrap">{msg.content}</p>
          </div>
        </motion.div>
      )
    }

    // Assistant message
    let parsedOptions: ClarificationOption[] = []
    let parsedSteps: ReasoningStep[] = []
    try { parsedOptions = JSON.parse(msg.options || '[]') } catch { /* */ }
    try { parsedSteps = JSON.parse(msg.reasoningSteps || '[]') } catch { /* */ }

    // Check if this message has generated tables
    let hasGeneratedTables = false
    try {
      const tables = JSON.parse(msg.tablesJson || '{}')
      hasGeneratedTables = Object.keys(tables).length > 0
    } catch { /* */ }

    return (
      <motion.div {...messageSlideIn} className="flex justify-start">
        <div className="max-w-[95%] bg-muted/50 rounded-xl rounded-bl-sm px-3 py-2.5 shadow-sm">
          {/* Agent Badge & Indicators */}
          <div className="flex items-center gap-1.5 mb-1.5 flex-wrap">
            <AgentBadge name={msg.agentName} />
            {msg.qualityScore && <QualityBadge score={msg.qualityScore.overall} />}
            <PIIShieldBadge piiCheck={msg.piiCheck || null} />
            {msg.tokensIn > 0 && (
              <span className="text-[9px] text-muted-foreground">
                {msg.tokensIn + msg.tokensOut} tok
              </span>
            )}
          </div>

          {/* Explanation */}
          {renderAssistantContent(msg.content)}

          {/* SQL Code Section */}
          {msg.sqlCode && (
            <Collapsible
              open={expandedSql[msg.id] ?? false}
              onOpenChange={(o) => setExpandedSql(prev => ({ ...prev, [msg.id]: o }))}
            >
              <CollapsibleTrigger className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors mt-2 cursor-pointer">
                {expandedSql[msg.id] ?? false ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                <Code2 className="h-3 w-3" /> SQL
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="mt-1 relative group">
                  <ScrollArea className="max-h-36">
                    <pre className="bg-slate-900 text-green-400 p-2 rounded-md text-[10px] font-mono overflow-x-auto">
                      <code>{msg.sqlCode}</code>
                    </pre>
                  </ScrollArea>
                  <div className="absolute top-1 right-1 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-5 w-5 p-0 bg-slate-800 text-slate-300 hover:text-white"
                      onClick={() => copyToClipboard(msg.sqlCode)}
                    >
                      <Copy className="h-2.5 w-2.5" />
                    </Button>
                  </div>
                </div>
              </CollapsibleContent>
            </Collapsible>
          )}

          {/* Reasoning Steps */}
          <ReasoningTimeline steps={parsedSteps} msgId={msg.id} />

          {/* Clarification Options */}
          <ClarificationOptions options={parsedOptions} />

          {/* Quick Actions after generation */}
          {hasGeneratedTables && <QuickActions msg={msg} />}
        </div>
      </motion.div>
    )
  }

  // ─── Render: Chat Panel ────────────────────────────────
  const ChatPanel = () => (
    <div
      className={`flex flex-col h-full border-r transition-colors ${isDragOver ? 'bg-amber-50/50 border-amber-300' : ''}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Drag overlay */}
      {isDragOver && (
        <div className="absolute inset-0 z-50 bg-amber-50/80 backdrop-blur-sm flex items-center justify-center pointer-events-none">
          <div className="text-center">
            <Upload className="h-10 w-10 text-amber-600 mx-auto mb-2" />
            <p className="text-sm font-semibold text-amber-700">Drop files here</p>
            <p className="text-xs text-amber-600">SQL, CSV, JSON, XML</p>
          </div>
        </div>
      )}

      {/* Messages Area */}
      <ScrollArea className="flex-1">
        <div className="p-3 space-y-3">
          {messages.length === 0 && !isLoading && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="flex flex-col items-center justify-center text-center py-10"
            >
              <motion.div
                initial={{ rotate: -10 }}
                animate={{ rotate: 0 }}
                transition={{ type: 'spring', stiffness: 200 }}
                className="h-12 w-12 rounded-xl bg-gradient-to-br from-amber-600 to-red-700 flex items-center justify-center mb-3 shadow-lg"
              >
                <Sparkles className="h-6 w-6 text-white" />
              </motion.div>
              <h2 className="text-base font-bold mb-1">SynthForge AI</h2>
              <p className="text-muted-foreground max-w-[200px] mb-4 text-xs">
                Describe the data you need. AI generates realistic synthetic data.
              </p>

              {/* Row Count Control */}
              <div className="w-full mb-4 p-2 bg-muted/30 rounded-lg">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[11px] text-muted-foreground">Rows per table:</span>
                  <span className="text-xs font-semibold text-amber-700">{rowCount}</span>
                </div>
                <Slider
                  value={[rowCount]}
                  onValueChange={(v) => setRowCount(v[0])}
                  min={5}
                  max={100}
                  step={5}
                  className="w-full"
                />
              </div>

              <motion.div
                variants={staggerContainer}
                initial="initial"
                animate="animate"
                className="grid grid-cols-1 gap-1.5 w-full"
              >
                {[
                  { icon: <Hash className="h-3 w-3" />, text: `Generate ${rowCount} users` },
                  { icon: <Table2 className="h-3 w-3" />, text: 'E-commerce orders' },
                  { icon: <Database className="h-3 w-3" />, text: 'Hospital DB schema' },
                  { icon: <Code2 className="h-3 w-3" />, text: 'Student enrollment' }
                ].map((suggestion, i) => (
                  <motion.button
                    key={i}
                    variants={staggerItem}
                    whileHover={{ scale: 1.01, y: -1 }}
                    whileTap={{ scale: 0.98 }}
                    className="flex items-center gap-2 p-2 rounded-md border bg-card hover:bg-muted/50 transition-colors text-left text-xs text-muted-foreground hover:text-foreground"
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
              <div className="bg-muted/50 rounded-2xl rounded-bl-md px-3 py-2.5 flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin text-amber-600" />
                <span className="text-sm text-muted-foreground">Thinking<AnimatedDots /></span>
              </div>
            </motion.div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </ScrollArea>

      {/* Input Area */}
      <div className="border-t bg-background p-2.5 shrink-0">
        {/* Attached Files */}
        {attachedFiles.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-1.5">
            {attachedFiles.map((file, i) => (
              <Badge key={i} variant="secondary" className="gap-1 text-[10px] py-0.5 px-1.5">
                <Paperclip className="h-2.5 w-2.5" />
                <span className="truncate max-w-[60px]">{file.name}</span>
                <button onClick={() => removeFile(i)} className="hover:text-destructive transition-colors">
                  <X className="h-2.5 w-2.5" />
                </button>
              </Badge>
            ))}
          </div>
        )}

        {/* Row count quick setting */}
        <div className="flex items-center gap-2 mb-1.5">
          <span className="text-[10px] text-muted-foreground whitespace-nowrap">Rows:</span>
          <div className="flex items-center gap-1 flex-1">
            {[5, 10, 25, 50, 100].map(n => (
              <Button
                key={n}
                variant={rowCount === n ? 'default' : 'outline'}
                size="sm"
                className={`h-5 text-[10px] px-1.5 py-0 ${rowCount === n ? 'bg-amber-600 text-white' : ''}`}
                onClick={() => setRowCount(n)}
              >
                {n}
              </Button>
            ))}
          </div>
        </div>

        <div className="flex items-end gap-1.5">
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            multiple
            accept=".sql,.csv,.json,.txt,.xml"
            onChange={handleFileUpload}
          />
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 shrink-0 p-0"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Paperclip className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Attach files (or drag & drop)</TooltipContent>
            </Tooltip>
          </TooltipProvider>

          <div className="flex-1 relative">
            <Textarea
              ref={chatInputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Describe data..."
              className="min-h-[34px] max-h-24 resize-none text-xs py-1.5 px-2.5"
              disabled={isLoading}
              rows={1}
            />
          </div>

          <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
            <Button
              size="sm"
              className="h-7 w-7 p-0 bg-gradient-to-r from-amber-600 to-red-700 hover:from-amber-700 hover:to-red-800 text-white shrink-0"
              onClick={handleSubmit}
              disabled={isLoading || (!input.trim() && attachedFiles.length === 0)}
            >
              <Send className="h-3.5 w-3.5" />
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
        <TabsList className="w-full justify-start rounded-none border-b bg-transparent h-10 px-3 shrink-0">
          <TabsTrigger value="preview" className="text-xs data-[state=active]:bg-muted">Data</TabsTrigger>
          <TabsTrigger value="schema" className="text-xs data-[state=active]:bg-muted">Schema</TabsTrigger>
          <TabsTrigger value="relationships" className="text-xs data-[state=active]:bg-muted">ER Diagram</TabsTrigger>
          <TabsTrigger value="sql" className="text-xs data-[state=active]:bg-muted">SQL</TabsTrigger>
          <TabsTrigger value="explorer" className="text-xs data-[state=active]:bg-muted">Explorer</TabsTrigger>
        </TabsList>

        <TabsContent value="preview" className="flex-1 overflow-auto mt-0">
          <ScrollArea className="h-full">
            <div className="p-4 space-y-4">
              {isLoading && Object.keys(allTables).length === 0 ? (
                <div className="space-y-4">
                  {[1, 2].map(i => (
                    <Card key={i}>
                      <CardHeader className="pb-2">
                        <div className="flex items-center justify-between">
                          <Skeleton className="h-4 w-24" />
                          <Skeleton className="h-5 w-14" />
                        </div>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-2">
                          <div className="flex gap-4">
                            {[1, 2, 3, 4].map(j => <Skeleton key={j} className="h-3 w-16" />)}
                          </div>
                          {[1, 2, 3, 4, 5].map(j => (
                            <div key={j} className="flex gap-4">
                              {[1, 2, 3, 4].map(k => <Skeleton key={k} className="h-3 w-20" />)}
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              ) : Object.keys(allTables).length === 0 ? (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="text-center py-20"
                >
                  <div className="h-16 w-16 rounded-2xl bg-gradient-to-br from-amber-100 to-red-50 flex items-center justify-center mx-auto mb-4">
                    <Table2 className="h-8 w-8 text-amber-700/50" />
                  </div>
                  <p className="text-sm font-medium text-muted-foreground mb-1">No data yet</p>
                  <p className="text-xs text-muted-foreground mb-4">Chat with the AI to generate synthetic data</p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-xs"
                    onClick={() => setMobileStudioTab('chat')}
                  >
                    <MessageSquare className="h-3 w-3 mr-1" /> Start Chat
                  </Button>
                </motion.div>
              ) : (
                <>
                  {/* Export bar */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs text-muted-foreground">
                      {Object.keys(allTables).length} table{Object.keys(allTables).length !== 1 ? 's' : ''} · {Object.values(allTables).reduce((s, r) => s + r.length, 0)} total rows
                    </span>
                    <div className="ml-auto flex items-center gap-1">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="outline" size="sm" className="gap-1 text-xs h-7">
                            <Download className="h-3 w-3" /> Export
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent>
                          <DropdownMenuItem onClick={() => exportData(allTables, 'json')}>
                            <FileJson className="h-3.5 w-3.5 mr-2" /> Export as JSON
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => exportData(allTables, 'csv')}>
                            <FileText className="h-3.5 w-3.5 mr-2" /> Export as CSV
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onClick={() => exportData(allTables, 'sql-insert')}>
                            <Code2 className="h-3.5 w-3.5 mr-2" /> SQL INSERT statements
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => exportData(allTables, 'sql-full')}>
                            <Database className="h-3.5 w-3.5 mr-2" /> Full SQL dump (CREATE + INSERT)
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onClick={() => copyAllData(allTables, 'json')}>
                            <Copy className="h-3.5 w-3.5 mr-2" /> Copy JSON to clipboard
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => copyAllData(allTables, 'sql')}>
                            <ClipboardCheck className="h-3.5 w-3.5 mr-2" /> Copy SQL to clipboard
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                  {Object.entries(allTables).map(([tableName, rows]) => (
                    <DataTable key={tableName} tableName={tableName} rows={rows} />
                  ))}
                </>
              )}
            </div>
          </ScrollArea>
        </TabsContent>

        <TabsContent value="schema" className="flex-1 overflow-auto mt-0">
          <ScrollArea className="h-full">
            <div className="p-4 space-y-4">
              {/* Schema templates */}
              <div className="mb-4">
                <Button
                  variant="outline"
                  size="sm"
                  className="text-xs gap-1"
                  onClick={() => setShowSchemaTemplates(!showSchemaTemplates)}
                >
                  <Layers className="h-3 w-3" /> Schema Templates
                  <ChevronDown className={`h-3 w-3 transition-transform ${showSchemaTemplates ? 'rotate-180' : ''}`} />
                </Button>
                {showSchemaTemplates && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-3"
                  >
                    {schemaTemplates.map((tmpl) => (
                      <Card
                        key={tmpl.name}
                        className="cursor-pointer hover:shadow-md hover:border-amber-300 transition-all"
                        onClick={() => {
                          setNewDbSchema(JSON.stringify(tmpl.schema))
                          sendMessage(`Generate data for a ${tmpl.name.toLowerCase()} system with these tables: ${Object.keys(tmpl.schema).join(', ')}`)
                        }}
                      >
                        <CardContent className="p-3">
                          <h4 className="text-xs font-semibold">{tmpl.name}</h4>
                          <p className="text-[10px] text-muted-foreground">{tmpl.desc}</p>
                        </CardContent>
                      </Card>
                    ))}
                  </motion.div>
                )}
              </div>

              {Object.keys(schemaObj).length === 0 ? (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="text-center py-20"
                >
                  <div className="h-16 w-16 rounded-2xl bg-gradient-to-br from-amber-100 to-red-50 flex items-center justify-center mx-auto mb-4">
                    <Columns3 className="h-8 w-8 text-amber-700/50" />
                  </div>
                  <p className="text-sm font-medium text-muted-foreground mb-1">No schema defined</p>
                  <p className="text-xs text-muted-foreground mb-4">Ask the AI to design a database schema</p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-xs"
                    onClick={() => setMobileStudioTab('chat')}
                  >
                    <MessageSquare className="h-3 w-3 mr-1" /> Start Chat
                  </Button>
                </motion.div>
              ) : (
                Object.entries(schemaObj).map(([tableName, def]) => (
                  <SchemaCard key={tableName} tableName={tableName} columns={(def as { columns: Record<string, string> }).columns} />
                ))
              )}
            </div>
          </ScrollArea>
        </TabsContent>

        <TabsContent value="relationships" className="flex-1 overflow-auto mt-0">
          <ScrollArea className="h-full">
            <div className="p-4">
              <SchemaVisualization />
            </div>
          </ScrollArea>
        </TabsContent>

        <TabsContent value="sql" className="flex-1 flex flex-col mt-0">
          <div className="p-4 space-y-3 flex-1 flex flex-col">
            <div className="flex items-center gap-2">
              <Code2 className="h-4 w-4 text-amber-700" />
              <span className="text-sm font-semibold">SQL Playground</span>
              <Badge variant="secondary" className="text-[10px] ml-auto">Preview Mode</Badge>
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
              disabled={!sqlQuery.trim()}
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
      <div className="min-h-screen flex flex-col bg-white">
        <style>{gradientStyle}</style>
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
            <div className="hidden sm:flex items-center gap-6 text-sm text-muted-foreground">
              <button className="hover:text-foreground transition-colors">Features</button>
              <button className="hover:text-foreground transition-colors">Pricing</button>
              <button className="hover:text-foreground transition-colors">Docs</button>
            </div>
            <div className="flex items-center gap-3">
              <Button variant="ghost" size="sm" onClick={() => setView('dashboard')}>
                Dashboard
              </Button>
              <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}>
                <Button size="sm" className="bg-gradient-to-r from-amber-600 to-red-700 hover:from-amber-700 hover:to-red-800 text-white" onClick={() => setView('dashboard')}>
                  Get Started Free
                </Button>
              </motion.div>
            </div>
          </div>
        </motion.nav>

        {/* Hero */}
        <main className="flex-1">
          <section className="relative overflow-hidden">
            {/* Animated gradient background */}
            <div
              className="absolute inset-0 opacity-30"
              style={{
                background: 'linear-gradient(135deg, #f59e0b15, #ef444415, #f59e0b15, #8b5cf615)',
                backgroundSize: '400% 400%',
                animation: 'gradientShift 15s ease infinite'
              }}
            />
            <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 lg:py-32">
              <div className="grid lg:grid-cols-2 gap-12 items-center">
                <motion.div
                  initial={{ opacity: 0, x: -30 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.6 }}
                >
                  <Badge className="mb-4 bg-amber-100 text-amber-800 border-amber-200">
                    <Sparkles className="h-3 w-3 mr-1" /> AI-Powered Synthetic Data
                  </Badge>
                  <h1 className="text-4xl lg:text-6xl font-bold tracking-tight mb-6 leading-tight">
                    Generate <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-600 to-red-700">Realistic Data</span> in Seconds
                  </h1>
                  <p className="text-lg text-muted-foreground mb-8 leading-relaxed max-w-xl">
                    Create privacy-safe, relationally intact synthetic data from scratch.
                    Just describe what you need and our multi-agent AI generates statistically accurate datasets instantly.
                  </p>
                  <div className="flex gap-3 mb-8">
                    <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}>
                      <Button size="lg" className="bg-gradient-to-r from-amber-600 to-red-700 hover:from-amber-700 hover:to-red-800 text-white text-base px-8" onClick={() => setView('dashboard')}>
                        Start Generating <ArrowRight className="ml-2 h-4 w-4" />
                      </Button>
                    </motion.div>
                    <Button size="lg" variant="outline" className="text-base" onClick={() => setView('dashboard')}>
                      Try Demo
                    </Button>
                  </div>
                  {/* Stats */}
                  <div className="flex gap-8">
                    {[
                      { value: '10M+', label: 'Rows Generated' },
                      { value: '99.2%', label: 'FK Integrity' },
                      { value: '<3s', label: 'Avg Gen Time' }
                    ].map((stat, i) => (
                      <motion.div
                        key={i}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.5 + i * 0.1 }}
                      >
                        <p className="text-2xl font-bold text-amber-700">{stat.value}</p>
                        <p className="text-xs text-muted-foreground">{stat.label}</p>
                      </motion.div>
                    ))}
                  </div>
                </motion.div>
                <motion.div
                  initial={{ opacity: 0, x: 30, y: 20 }}
                  animate={{ opacity: 1, x: 0, y: 0 }}
                  transition={{ duration: 0.6, delay: 0.2 }}
                  className="relative"
                >
                  <Card className="shadow-2xl border-0 bg-white">
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
                          <p className="text-sky-700">-- Quality score: 94/100</p>
                        </div>
                        <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                          <Brain className="h-3 w-3" /> 6 reasoning steps completed
                        </div>
                        <div className="flex gap-1.5">
                          <Badge variant="outline" className="text-[9px] gap-0.5"><FileJson className="h-2.5 w-2.5" />JSON</Badge>
                          <Badge variant="outline" className="text-[9px] gap-0.5"><FileText className="h-2.5 w-2.5" />CSV</Badge>
                          <Badge variant="outline" className="text-[9px] gap-0.5"><Code2 className="h-2.5 w-2.5" />SQL</Badge>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              </div>
            </div>
          </section>

          {/* Features */}
          <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 bg-slate-50/50">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="text-center mb-12"
            >
              <Badge variant="outline" className="mb-4">Core Features</Badge>
              <h2 className="text-3xl font-bold mb-4">Everything You Need for Synthetic Data</h2>
              <p className="text-muted-foreground text-lg max-w-2xl mx-auto">From schema definition to export, SynthForge AI handles the entire synthetic data lifecycle.</p>
            </motion.div>
            <motion.div
              variants={staggerContainer}
              initial="initial"
              whileInView="animate"
              viewport={{ once: true }}
              className="grid md:grid-cols-2 lg:grid-cols-4 gap-6"
            >
              {[
                { icon: Sparkles, title: 'AI-Powered Generation', desc: 'Describe data in natural language. Multi-agent AI generates realistic, domain-specific synthetic data instantly.', color: 'from-amber-100 to-amber-50' },
                { icon: Shield, title: 'Privacy-First', desc: 'Automatic PII detection and masking. All generated data is privacy-safe by design with quality scoring.', color: 'from-emerald-100 to-emerald-50' },
                { icon: Download, title: 'Multi-Format Export', desc: 'Export as JSON, CSV, SQL INSERT, or full SQL dump with CREATE TABLE statements. Copy to clipboard.', color: 'from-sky-100 to-sky-50' },
                { icon: Eye, title: 'Real-time Preview', desc: 'Instantly preview generated data with column type highlighting, FK indicators, and pagination.', color: 'from-purple-100 to-purple-50' }
              ].map((feature, i) => (
                <motion.div key={i} variants={staggerItem} whileHover={{ y: -4, transition: { duration: 0.2 } }}>
                  <Card className="hover:shadow-lg transition-shadow h-full group">
                    <CardContent className="pt-6">
                      <div className={`h-10 w-10 rounded-lg bg-gradient-to-br ${feature.color} flex items-center justify-center mb-3 group-hover:scale-110 transition-transform`}>
                        <feature.icon className="h-5 w-5 text-foreground" />
                      </div>
                      <h3 className="font-semibold text-base mb-2">{feature.title}</h3>
                      <p className="text-sm text-muted-foreground">{feature.desc}</p>
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </motion.div>
          </section>

          {/* How it works */}
          <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="text-center mb-12"
            >
              <h2 className="text-3xl font-bold mb-4">How It Works</h2>
              <p className="text-muted-foreground text-lg">Three steps from idea to data</p>
            </motion.div>
            <div className="grid md:grid-cols-3 gap-8">
              {[
                { step: '1', title: 'Describe', desc: 'Tell the AI what data you need in natural language, or upload a schema file.', icon: MessageSquare },
                { step: '2', title: 'Generate', desc: 'Our multi-agent AI plans the schema, generates realistic data, and validates integrity.', icon: Wand2 },
                { step: '3', title: 'Export', desc: 'Preview the data, refine it with chat, and export in your preferred format.', icon: Download }
              ].map((item, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.15 }}
                  className="text-center"
                >
                  <div className="h-14 w-14 rounded-full bg-gradient-to-br from-amber-600 to-red-700 flex items-center justify-center mx-auto mb-4 text-white font-bold text-lg">
                    {item.step}
                  </div>
                  <h3 className="font-semibold text-lg mb-2 flex items-center justify-center gap-2">
                    <item.icon className="h-5 w-5 text-amber-700" />
                    {item.title}
                  </h3>
                  <p className="text-sm text-muted-foreground max-w-xs mx-auto">{item.desc}</p>
                </motion.div>
              ))}
            </div>
          </section>

          {/* Social Proof / CTA */}
          <section className="bg-gradient-to-r from-amber-600 to-red-700 py-16">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
              <h2 className="text-3xl font-bold text-white mb-4">Ready to Generate Synthetic Data?</h2>
              <p className="text-white/80 text-lg mb-8 max-w-xl mx-auto">Start creating privacy-safe, realistic synthetic data in seconds. No credit card required.</p>
              <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}>
                <Button
                  size="lg"
                  className="bg-white text-amber-700 hover:bg-white/90 text-base px-8 font-semibold"
                  onClick={() => setView('dashboard')}
                >
                  Get Started Free <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </motion.div>
            </div>
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
    // Compute stats
    const totalTables = allDatabases.reduce((sum, db) => {
      try {
        const schema = JSON.parse(db.schemaJson || '{}')
        return sum + Object.keys(schema).length
      } catch { return sum }
    }, 0)
    const totalRows = allDatabases.reduce((sum, db) => {
      try {
        const data = JSON.parse(db.dataJson || '{}')
        return sum + Object.values(data).reduce((s: number, rows) => s + (Array.isArray(rows) ? rows.length : 0), 0)
      } catch { return sum }
    }, 0) as number
    const totalConversations = allDatabases.reduce((sum, db) => sum + (db._count?.conversations || 0), 0)

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
            <div className="ml-auto flex items-center gap-2">
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
                    {/* Schema Templates */}
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Or choose a template:</label>
                      <div className="grid grid-cols-3 gap-2">
                        {schemaTemplates.map(tmpl => (
                          <Button
                            key={tmpl.name}
                            variant="outline"
                            size="sm"
                            className="h-auto py-2 text-[11px]"
                            onClick={() => {
                              setNewDbSchema(JSON.stringify(tmpl.schema))
                              setNewDbName(tmpl.name + ' DB')
                            }}
                          >
                            {tmpl.name}
                          </Button>
                        ))}
                      </div>
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
              {/* Workspace Stats */}
              <motion.div
                variants={staggerContainer}
                initial="initial"
                animate="animate"
                className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8"
              >
                {[
                  { icon: <Database className="h-4 w-4 text-amber-700" />, label: 'Databases', value: allDatabases.length, color: 'from-amber-100 to-amber-50' },
                  { icon: <Table2 className="h-4 w-4 text-emerald-700" />, label: 'Total Tables', value: totalTables, color: 'from-emerald-100 to-emerald-50' },
                  { icon: <Rows3 className="h-4 w-4 text-sky-700" />, label: 'Total Rows', value: totalRows > 1000 ? `${(totalRows / 1000).toFixed(1)}k` : totalRows, color: 'from-sky-100 to-sky-50' },
                  { icon: <MessageSquare className="h-4 w-4 text-purple-700" />, label: 'Conversations', value: totalConversations, color: 'from-purple-100 to-purple-50' }
                ].map((stat, i) => (
                  <motion.div key={i} variants={staggerItem}>
                    <Card>
                      <CardContent className="pt-4 pb-3">
                        <div className={`h-8 w-8 rounded-lg bg-gradient-to-br ${stat.color} flex items-center justify-center mb-2`}>
                          {stat.icon}
                        </div>
                        <p className="text-2xl font-bold">{stat.value}</p>
                        <p className="text-xs text-muted-foreground">{stat.label}</p>
                      </CardContent>
                    </Card>
                  </motion.div>
                ))}
              </motion.div>

              {/* Quick Actions */}
              <motion.div
                variants={staggerContainer}
                initial="initial"
                animate="animate"
                className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8"
              >
                {[
                  { icon: <MessageSquare className="h-5 w-5 text-amber-700" />, title: 'Chat to Generate', desc: 'Describe data in natural language', action: () => allDatabases[0] ? openDatabase(allDatabases[0]) : setShowNewDbDialog(true) },
                  { icon: <Upload className="h-5 w-5 text-amber-700" />, title: 'Upload Schema', desc: 'Import SQL, CSV, or JSON', action: () => setShowNewDbDialog(true) },
                  { icon: <Wand2 className="h-5 w-5 text-amber-700" />, title: 'Auto Mode', desc: 'Plan & generate in one step', action: () => { setAgentMode('auto'); if (allDatabases[0]) openDatabase(allDatabases[0]) } },
                  { icon: <Layers className="h-5 w-5 text-amber-700" />, title: 'Use Template', desc: 'Start from a domain template', action: () => setShowNewDbDialog(true) }
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

              {/* Recent Activity */}
              {messages.length > 0 && (
                <div className="mb-8">
                  <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                    <Activity className="h-4 w-4 text-muted-foreground" /> Recent Activity
                  </h2>
                  <Card>
                    <CardContent className="pt-4">
                      <div className="space-y-3">
                        {messages.slice(-5).reverse().map(msg => (
                          <div key={msg.id} className="flex items-start gap-3 text-xs">
                            <div className="h-6 w-6 rounded-full bg-muted flex items-center justify-center shrink-0 mt-0.5">
                              {msg.role === 'user' ? <Hash className="h-3 w-3" /> : <Sparkles className="h-3 w-3 text-amber-600" />}
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="truncate">{msg.content.slice(0, 100)}</p>
                              <p className="text-muted-foreground mt-0.5">
                                <Clock className="h-2.5 w-2.5 inline mr-1" />
                                {new Date(msg.createdAt).toLocaleTimeString()}
                                {msg.tokensIn > 0 && <span className="ml-2">{msg.tokensIn + msg.tokensOut} tokens</span>}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                </div>
              )}

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
                    {allDatabases.map(db => {
                      // Parse schema and data for stats
                      let tableCount = 0
                      let rowCount = 0
                      try {
                        const schema = JSON.parse(db.schemaJson || '{}')
                        tableCount = Object.keys(schema).length
                        const data = JSON.parse(db.dataJson || '{}')
                        rowCount = Object.values(data).reduce((s: number, rows) => s + (Array.isArray(rows) ? rows.length : 0), 0)
                      } catch { /* */ }

                      return (
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
                              <div className="flex items-center gap-2 mb-2 flex-wrap">
                                <Badge variant="secondary" className="text-xs">{db.dbType}</Badge>
                                {tableCount > 0 && (
                                  <Badge variant="outline" className="text-xs gap-0.5">
                                    <Table2 className="h-2.5 w-2.5" /> {tableCount} tables
                                  </Badge>
                                )}
                                {rowCount > 0 && (
                                  <Badge variant="outline" className="text-xs gap-0.5">
                                    <Rows3 className="h-2.5 w-2.5" /> {rowCount} rows
                                  </Badge>
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
                              <p className="text-[10px] text-muted-foreground mt-2">
                                <Clock className="h-2.5 w-2.5 inline mr-1" />
                                Updated {new Date(db.updatedAt).toLocaleDateString()}
                              </p>
                            </CardContent>
                          </Card>
                        </motion.div>
                      )
                    })}
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
          {(schemaVersionCount > 0 || messages.some(m => m.schemaVersion && m.schemaVersion > 0)) && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Badge variant="outline" className="text-[10px] gap-1 font-mono hidden sm:inline-flex">
                    <GitBranch className="h-2.5 w-2.5" /> v{schemaVersionCount || messages.reduce((max, m) => Math.max(max, m.schemaVersion || 0), 0) || 1}
                  </Badge>
                </TooltipTrigger>
                <TooltipContent>Schema version (evolution tracking)</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}

          {/* Agent Mode Selector - Prominent buttons */}
          <Separator orientation="vertical" className="h-5 hidden md:block" />
          <div className="items-center gap-1 hidden md:flex">
            <span className="text-[10px] text-muted-foreground mr-1">Agent:</span>
            {(['plan', 'execute', 'auto'] as AgentMode[]).map((mode) => {
              const isPlan = mode === 'plan'
              const isExec = mode === 'execute'
              const isAuto = mode === 'auto'
              const icon = isPlan ? <Brain className="h-3 w-3" /> : isExec ? <Play className="h-3 w-3" /> : <Wand2 className="h-3 w-3" />
              const label = isPlan ? 'Plan' : isExec ? 'Execute' : 'Auto'
              const activeColor = isPlan ? 'bg-sky-100 text-sky-800 border-sky-300' : isExec ? 'bg-emerald-100 text-emerald-800 border-emerald-300' : 'bg-amber-100 text-amber-800 border-amber-300'

              return (
                <Button
                  key={mode}
                  variant="outline"
                  size="sm"
                  className={`h-7 text-[11px] gap-1 px-2.5 ${agentMode === mode ? activeColor : 'text-muted-foreground'}`}
                  onClick={() => setAgentMode(mode)}
                >
                  {icon} {label}
                </Button>
              )
            })}
          </div>

          <div className="ml-auto flex items-center gap-1.5">
            {/* Token usage indicator */}
            {totalTokens > 0 && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Badge variant="outline" className="text-[10px] gap-1 font-mono hidden sm:inline-flex">
                      <Zap className="h-2.5 w-2.5 text-amber-600" /> {totalTokens > 1000 ? `${(totalTokens / 1000).toFixed(1)}k` : totalTokens} tok
                    </Badge>
                  </TooltipTrigger>
                  <TooltipContent>Total tokens used in this session</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}

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
                    <FileJson className="h-3.5 w-3.5 mr-2" /> Export as JSON
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => exportData(allTables, 'csv')}>
                    <FileText className="h-3.5 w-3.5 mr-2" /> Export as CSV
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => exportData(allTables, 'sql-insert')}>
                    <Code2 className="h-3.5 w-3.5 mr-2" /> SQL INSERT statements
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => exportData(allTables, 'sql-full')}>
                    <Database className="h-3.5 w-3.5 mr-2" /> Full SQL dump
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => copyAllData(allTables, 'json')}>
                    <Copy className="h-3.5 w-3.5 mr-2" /> Copy JSON
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => copyAllData(allTables, 'sql')}>
                    <ClipboardCheck className="h-3.5 w-3.5 mr-2" /> Copy SQL
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </header>

        {/* Main Studio Content */}
        {/* Mobile: tab-based switching between chat and data */}
        <div className="flex-1 overflow-hidden md:hidden">
          {mobileStudioTab === 'chat' ? <ChatPanel /> : <DataWorkspace />}
        </div>

        {/* Desktop: Resizable Panels — Chat 25% | Data 75% */}
        <div className="flex-1 overflow-hidden hidden md:block">
          <ResizablePanelGroup direction="horizontal">
            <ResizablePanel defaultSize={25} minSize={15} maxSize={50}>
              <ChatPanel />
            </ResizablePanel>
            <ResizableHandle withHandle />
            <ResizablePanel defaultSize={75} minSize={40}>
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
