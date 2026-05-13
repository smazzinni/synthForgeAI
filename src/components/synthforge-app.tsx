'use client'

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Database, MessageSquare, Plus, Send, ChevronRight,
  Table2, Download, Copy, Sparkles, LayoutDashboard,
  Code2, FileJson, FileText, Trash2, Zap, Upload, X, Check,
  Loader2, ArrowRight, Hash, Play, FolderTree,
  Brain, Wand2, AlertCircle,
  Columns3, Key, Link2, RefreshCw, Menu, Eye, EyeOff,
  PanelLeftClose, PanelLeft, Shield, RotateCcw, Gauge, GitBranch,
  Activity, Users, BarChart3, Clock, Settings,
  FileDown, ClipboardCheck, Rows3, Target, Network, StopCircle,
  WifiOff, ArrowDown, CheckCircle2, XCircle, Ban, HelpCircle,
  AlignLeft, Terminal, ZoomIn, ZoomOut, Maximize2, Move,
  GitFork, Search, AlertTriangle, ListOrdered,
  Wrench, Bug, CheckCheck, Clock3, Bot, Cpu
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
import { Skeleton } from '@/components/ui/skeleton'
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable'
import { useToast } from '@/hooks/use-toast'
import { structuredLog } from '@/components/error-boundary'

// Extracted components
import { TableTreeView } from '@/components/synthforge/table-tree-view'
import { DataTable } from '@/components/synthforge/data-table'
import { SchemaCard } from '@/components/synthforge/schema-card'
import { ChatPanel } from '@/components/synthforge/chat-panel'
import { QualityReportPanel } from '@/components/synthforge/quality-report-panel'
import { ERDiagram } from '@/components/synthforge/er-diagram'
import { ExplorerPanel } from '@/components/explorer-panel'

// Shared types and animation variants
import type { Workspace, Project, Database_, Message, Conversation, AgentStepUI, QualityReportData, View, AgentMode, ReasoningStep } from '@/components/synthforge/types'
import { fadeInUp, staggerContainer, staggerItem, gradientStyle } from '@/components/synthforge/types'

// ─── Main App ──────────────────────────────────────────
export default function SynthForgeApp({ initialDatabaseId }: { initialDatabaseId?: string }) {
  const [view, setView] = useState<View>('landing')
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [activeWorkspace, setActiveWorkspace] = useState<Workspace | null>(null)
  const [projects, setProjects] = useState<Project[]>([])
  const [activeDb, setActiveDb] = useState<Database_ | null>(null)
  const [conversation, setConversation] = useState<Conversation | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [showNewDbDialog, setShowNewDbDialog] = useState(false)
  const [newDbName, setNewDbName] = useState('')
  const [newDbSchema, setNewDbSchema] = useState('')
  const [agentMode, setAgentMode] = useState<AgentMode>('auto')
  const [attachedFiles, setAttachedFiles] = useState<{ name: string; content: string; type: string }[]>([])
  const [rightTab, setRightTab] = useState('preview')
  const [sqlQuery, setSqlQuery] = useState('')
  const [sqlResult, setSqlResult] = useState<string>('')
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [mobileStudioTab, setMobileStudioTab] = useState<'chat' | 'data'>('chat')
  const [schemaVersionCount, setSchemaVersionCount] = useState(0)
  const [isDragOver, setIsDragOver] = useState(false)
  const [totalTokens, setTotalTokens] = useState(0)
  const [selectedTableName, setSelectedTableName] = useState<string | null>(null)
  const [isOnline, setIsOnline] = useState(true)
  const [sqlSuggestion, setSqlSuggestion] = useState<string>('')
  const [showSqlSuggestion, setShowSqlSuggestion] = useState(false)
  const [sqlValidationError, setSqlValidationError] = useState<string>('')
  const [explorerView, setExplorerView] = useState<'tree' | 'graph'>('tree')
  const [topologicalSortResult, setTopologicalSortResult] = useState<string[] | null>(null)
  const [cutpoints, setCutpoints] = useState<string[] | null>(null)
  const [selectedGraphNode, setSelectedGraphNode] = useState<string | null>(null)
  const [reachableTables, setReachableTables] = useState<string[] | null>(null)
  const [constraintClosureResult, setConstraintClosureResult] = useState<{ from: string; to: string; via: string; cascades: string[] }[] | null>(null)
  const [qualityReport, setQualityReport] = useState<QualityReportData | null>(null)
  const [isQualityCheckRunning, setIsQualityCheckRunning] = useState(false)
  const [showQualityReport, setShowQualityReport] = useState(false)
  const [agentSteps, setAgentSteps] = useState<AgentStepUI[]>([])

  const graphSvgRef = useRef<SVGSVGElement>(null)
  const erSvgRef = useRef<SVGSVGElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const abortControllerRef = useRef<AbortController | null>(null)
  const streamingIdRef = useRef<string | null>(null)
  const { toast } = useToast()

  // ─── Network status tracking ────────────────────────
  useEffect(() => {
    const handleOnline = () => { setIsOnline(true) ; structuredLog('info', 'Network back online') }
    const handleOffline = () => { setIsOnline(false) ; structuredLog('warn', 'Network went offline') }
    setIsOnline(navigator.onLine)
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  // Load workspaces on mount
  useEffect(() => {
    const init = async () => {
      await loadWorkspaces()
      if (initialDatabaseId) {
        try {
          const res = await fetch('/api/databases')
          const data = await res.json()
          const db = data.databases?.find((d: Database_) => d.id === initialDatabaseId)
          if (db) openDatabase(db)
        } catch { /* silent */ }
      }
    }
    init()
  }, [initialDatabaseId])

  // Track total tokens
  useEffect(() => {
    const total = messages.reduce((sum, m) => sum + m.tokensIn + m.tokensOut, 0)
    setTotalTokens(total)
  }, [messages])

  // Cleanup abort controller on unmount
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
      }
    }
  }, [])

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
      if (data.projects) setProjects(data.projects)
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

  const allDatabases = useMemo(() => projects.flatMap(p => p.databases || []), [projects])

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
      const dbDetail = await fetch('/api/databases')
      const dbData = await dbDetail.json()
      const currentDb = dbData.databases?.find((d: Database_) => d.id === db.id)
      if (currentDb) setActiveDb(currentDb)
    } catch { /* silent */ }
  }

  // ─── Core Send Message (with SSE streaming for real-time agent reasoning) ───
  const sendMessage = useCallback(async (messageText: string, files: { name: string; content: string; type: string }[] = []) => {
    const msgText = messageText.trim()
    if ((!msgText && files.length === 0) || isLoading || !activeDb) return

    setIsLoading(true)
    setAgentSteps([])

    const tempId = `usr-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
    const tempUserMsg: Message = {
      id: tempId, role: 'user',
      content: msgText + (files.length > 0 ? `\n\n[Attached: ${files.map(f => f.name).join(', ')}]` : ''),
      sqlCode: '', tokensIn: 0, tokensOut: 0, cost: 0,
      createdAt: new Date().toISOString(), agentName: '',
      reasoningSteps: '[]', options: '[]', tablesJson: '{}'
    }
    setMessages(prev => [...prev, tempUserMsg])

    const controller = new AbortController()
    abortControllerRef.current = controller

    const streamId = `asst-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
    const streamMsg: Message = {
      id: streamId, role: 'assistant', content: '', sqlCode: '',
      tokensIn: 0, tokensOut: 0, cost: 0,
      createdAt: new Date().toISOString(), agentName: agentMode + '-agent',
      reasoningSteps: '[]', options: '[]', tablesJson: '{}',
      isStreaming: true, generationStatus: 'thinking'
    }
    streamingIdRef.current = streamId
    setMessages(prev => [...prev, streamMsg])

    // Track streaming state
    let fullContent = ''
    let reasoningStepsArr: ReasoningStep[] = []
    let currentAgentSteps: AgentStepUI[] = []

    try {
      // Use streaming mode for real-time agent reasoning display
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversationId: conversation?.id || null,
          databaseId: activeDb.id,
          workspaceId: activeWorkspace?.id,
          message: msgText,
          stream: true,
          agentMode,
          files: files.map(f => ({ name: f.name, content: f.content, type: f.type }))
        }),
        signal: controller.signal
      })

      if (!res.ok) {
        let errMsg = 'Chat request failed'
        try { const errData = await res.json(); errMsg = errData.error || errData.hint || errMsg } catch { errMsg = `Request failed (${res.status})` }
        throw new Error(errMsg)
      }

      // Extract conversation ID from headers
      const convId = res.headers.get('X-Conversation-Id')
      if (!conversation && convId) {
        setConversation({ id: convId, title: msgText.slice(0, 60), messages: [] })
      }

      // Process SSE stream
      const reader = res.body?.getReader()
      if (!reader) throw new Error('No response stream')

      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        if (controller.signal.aborted) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const jsonStr = line.slice(6).trim()
          if (!jsonStr) continue

          try {
            const event = JSON.parse(jsonStr)

            if (event.type === 'reasoning') {
              // Update reasoning steps in real-time
              const step = event.data as ReasoningStep
              const existingIdx = reasoningStepsArr.findIndex(s => s.label === step.label && s.type === step.type)
              if (existingIdx >= 0) {
                reasoningStepsArr[existingIdx] = step
              } else {
                reasoningStepsArr.push(step)
              }
              const stepsJson = JSON.stringify(reasoningStepsArr)
              setMessages(prev => prev.map(m =>
                m.id === streamId ? { ...m, reasoningSteps: stepsJson, generationStatus: 'thinking' as const } : m
              ))
            }

            if (event.type === 'content') {
              fullContent += event.data
              setMessages(prev => prev.map(m =>
                m.id === streamId ? { ...m, content: fullContent, generationStatus: 'generating' as const } : m
              ))
            }

            if (event.type === 'agent_step') {
              const stepData = event.data as { stepIndex: number; agent: string; task: string; status: string; output?: string; tables?: string[] }
              const existingStepIdx = currentAgentSteps.findIndex((s, i) => i === stepData.stepIndex)
              const newStep: AgentStepUI = {
                agent: stepData.agent,
                task: stepData.task,
                status: stepData.status as AgentStepUI['status'],
                output: stepData.output,
                tables: stepData.tables
              }
              if (existingStepIdx >= 0) {
                currentAgentSteps[existingStepIdx] = newStep
              } else {
                currentAgentSteps.push(newStep)
              }
              setAgentSteps([...currentAgentSteps])
            }

            if (event.type === 'done') {
              const tokensIn = event.data?.tokensIn || 0
              const tokensOut = event.data?.tokensOut || 0
              setMessages(prev => prev.map(m =>
                m.id === streamId ? { ...m, tokensIn, tokensOut } : m
              ))
            }

            if (event.type === 'error') {
              throw new Error(event.data || 'AI service error')
            }
          } catch (parseErr) {
            if (parseErr instanceof Error && parseErr.message !== 'AI service error') {
              // Not a JSON line or non-fatal parse error, skip
            } else {
              throw parseErr
            }
          }
        }
      }

      // Parse the final full content to extract structured data
      const finalParsed = parseFullContent(fullContent)
      setMessages(prev => prev.map(m =>
        m.id === streamId
          ? {
              ...m, isStreaming: false, generationStatus: 'completed' as const,
              content: fullContent,
              tablesJson: finalParsed.tablesJson,
              sqlCode: finalParsed.sqlCode,
              agentName: finalParsed.agentName || agentMode + '-agent',
              reasoningSteps: finalParsed.reasoningSteps || m.reasoningSteps,
              options: finalParsed.options,
              qualityScore: finalParsed.qualityScore,
              piiCheck: finalParsed.piiCheck
            }
          : m
      ))

      await refreshDatabase(activeDb.id)
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        structuredLog('info', 'Chat request aborted by user')
        setMessages(prev => prev.map(m =>
          m.id === streamId ? { ...m, isStreaming: false, isCancelled: true, generationStatus: 'cancelled' as const } : m
        ))
      } else {
        setMessages(prev => prev.filter(m => m.id !== streamId))
        const errMsg = error instanceof Error ? error.message : 'Failed to get response'
        structuredLog('error', 'Chat request failed', errMsg)
        setMessages(prev => prev.map(m => m.id === tempId ? { ...m, isError: true } : m))
        toast({ title: 'Error', description: errMsg, variant: 'destructive' })
      }
    } finally {
      setIsLoading(false)
      abortControllerRef.current = null
      streamingIdRef.current = null
      setAgentSteps([])
    }
  }, [isLoading, activeDb, conversation, activeWorkspace, toast, agentMode])

  // ─── Parse full SSE content into structured message fields ──
  const parseFullContent = useCallback((content: string) => {
    let tablesJson = '{}'
    let sqlCode = ''
    let agentName = ''
    let reasoningSteps = ''
    let options = '[]'
    let qualityScore: { overall: number; breakdown: { completeness: number; uniqueness: number; distribution: number; referentialIntegrity: number } } | null = null
    let piiCheck: { hasPII: boolean; findings: { type: string; field: string; count: number }[] } | null = null

    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0])
        if (parsed.tables) tablesJson = JSON.stringify(parsed.tables)
        if (parsed.sqlCode) sqlCode = parsed.sqlCode
        if (parsed.agentName) agentName = parsed.agentName
        if (parsed.reasoningSteps) reasoningSteps = JSON.stringify(parsed.reasoningSteps)
        if (parsed.options) options = JSON.stringify(parsed.options)
        if (parsed.explanation) {
          // The display content is the explanation; keep full JSON for data extraction
        }
      }
    } catch { /* not JSON */ }

    return { tablesJson, sqlCode, agentName, reasoningSteps, options, qualityScore, piiCheck }
  }, [])

  const handleAbort = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
      abortControllerRef.current = null
      setIsLoading(false)
      if (streamingIdRef.current) {
        setMessages(prev => prev.map(m =>
          m.id === streamingIdRef.current ? { ...m, isStreaming: false, isCancelled: true, generationStatus: 'cancelled' as const } : m
        ))
        streamingIdRef.current = null
      }
    }
  }, [])

  const handleRetry = useCallback((msgId: string) => {
    const msg = messages.find(m => m.id === msgId)
    if (!msg) return
    setMessages(prev => prev.map(m => m.id === msgId ? { ...m, isError: false } : m))
    const originalText = msg.content.replace(/ \(Generate approximately \d+ rows per table\)/, '')
    sendMessage(originalText)
  }, [messages, sendMessage])

  const handleRegenerate = useCallback((msgId: string) => {
    const msgIdx = messages.findIndex(m => m.id === msgId)
    if (msgIdx < 1) return
    const prevMsg = messages[msgIdx - 1]
    if (prevMsg.role !== 'user') return
    setMessages(prev => prev.filter(m => m.id !== msgId))
    const originalText = prevMsg.content.replace(/ \(Generate approximately \d+ rows per table\)/, '')
    sendMessage(originalText)
  }, [messages, sendMessage])

  const handleSendMessage = useCallback(async (messageText: string, files: { name: string; content: string; type: string }[] = []) => {
    const msgText = messageText.trim() || 'Generate data from the attached file(s)'
    setAttachedFiles([])
    await sendMessage(msgText, files)
  }, [sendMessage])

  // ─── Memoized computed values ──────────────────────────
  const getTablesFromMessages = useMemo((): Record<string, Record<string, unknown>[]> => {
    const allTables: Record<string, Record<string, unknown>[]> = {}
    if (activeDb?.dataJson) {
      try {
        const dbData = JSON.parse(activeDb.dataJson)
        if (dbData && typeof dbData === 'object') {
          for (const [k, v] of Object.entries(dbData)) { if (Array.isArray(v)) allTables[k] = v }
        }
      } catch { /* */ }
    }
    for (const msg of messages) {
      if (msg.role === 'assistant') {
        try {
          const tables = JSON.parse(msg.tablesJson || '{}')
          for (const [k, v] of Object.entries(tables)) { if (Array.isArray(v)) allTables[k] = v }
        } catch { /* */ }
      }
    }
    return allTables
  }, [activeDb?.dataJson, messages])

  const getSchemaFromDb = useMemo((): Record<string, { columns: Record<string, string>; relationships?: string[] }> => {
    if (!activeDb?.schemaJson) return {}
    try { return JSON.parse(activeDb.schemaJson) } catch { return {} }
  }, [activeDb?.schemaJson])

  const copyToClipboard = useCallback((text: string) => {
    navigator.clipboard.writeText(text)
    toast({ title: 'Copied!', description: 'Content copied to clipboard' })
  }, [toast])

  const handleFileUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
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
  }, [])

  const removeFile = useCallback((index: number) => {
    setAttachedFiles(prev => prev.filter((_, i) => i !== index))
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); setIsDragOver(true) }, [])
  const handleDragLeave = useCallback((e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); setIsDragOver(false) }, [])
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation(); setIsDragOver(false)
    const files = Array.from(e.dataTransfer.files)
    files.forEach(file => {
      const reader = new FileReader()
      reader.onload = (ev) => {
        const content = ev.target?.result as string
        const ext = file.name.split('.').pop()?.toLowerCase() || ''
        const type = ext === 'sql' ? 'sql' : ext === 'csv' ? 'csv' : ext === 'json' ? 'json' : ext === 'xml' ? 'xml' : 'text'
        setAttachedFiles(prev => [...prev, { name: file.name, content, type }])
      }
      reader.readAsText(file)
    })
  }, [])

  const createDatabase = async () => {
    if (!newDbName.trim() || !projects[0]) return
    let schemaObj = {}
    if (newDbSchema.trim()) {
      try { schemaObj = JSON.parse(newDbSchema) } catch {
        toast({ title: 'Invalid JSON', description: 'Schema must be valid JSON', variant: 'destructive' }); return
      }
    }
    try {
      const res = await fetch('/api/databases', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newDbName, dbType: 'postgresql', schemaJson: schemaObj, projectId: projects[0].id })
      })
      const data = await res.json()
      if (data.database) {
        await loadProjects(activeWorkspace!.id)
        setShowNewDbDialog(false); setNewDbName(''); setNewDbSchema('')
        toast({ title: 'Database Created', description: `${newDbName} is ready` })
      }
    } catch { toast({ title: 'Error', description: 'Failed to create database', variant: 'destructive' }) }
  }

  const deleteDatabase = async (dbId: string) => {
    try {
      await fetch(`/api/databases?id=${dbId}`, { method: 'DELETE' })
      if (activeDb?.id === dbId) { setActiveDb(null); setView('dashboard') }
      await loadProjects(activeWorkspace!.id)
      toast({ title: 'Deleted', description: 'Database removed' })
    } catch { toast({ title: 'Error', description: 'Failed to delete database', variant: 'destructive' }) }
  }

  // ─── Export functions ──────────────────────────────────
  const exportData = useCallback((tables: Record<string, Record<string, unknown>[]>, format: string) => {
    let content = ''; let filename = 'synthforge-data'; let type = 'text/plain'
    if (format === 'json') { content = JSON.stringify(tables, null, 2); filename += '.json'; type = 'application/json' }
    else if (format === 'csv') {
      const parts: string[] = []
      for (const [tableName, rows] of Object.entries(tables)) {
        if (rows?.length > 0) {
          const headers = Object.keys(rows[0])
          parts.push(`-- Table: ${tableName}`); parts.push(headers.map(h => `"${tableName}.${h}"`).join(','))
          for (const row of rows) { parts.push(headers.map(h => { const v = row[h]; if (v === null || v === undefined) return '""'; const s = String(v).replace(/"/g, '""'); return `"${s}"` }).join(',')) }
          parts.push('')
        }
      }
      content = parts.join('\n'); filename += '.csv'; type = 'text/csv'
    } else if (format === 'sql-insert') {
      const statements: string[] = []
      for (const [tableName, rows] of Object.entries(tables)) {
        if (rows?.length > 0) {
          const cols = Object.keys(rows[0])
          for (const row of rows) { const values = cols.map(c => { const v = row[c]; return typeof v === 'string' ? `'${v.replace(/'/g, "''")}'` : String(v ?? 'NULL') }); statements.push(`INSERT INTO ${tableName} (${cols.join(', ')}) VALUES (${values.join(', ')});`) }
        }
      }
      content = statements.join('\n'); filename += '.sql'; type = 'text/plain'
    } else if (format === 'sql-full') {
      const statements: string[] = []
      for (const [tableName, rows] of Object.entries(tables)) {
        if (rows?.length > 0) {
          const cols = Object.keys(rows[0])
          const colDefs = cols.map(c => {
            const sampleVal = rows[0][c]; let sqlType = 'VARCHAR(255)'
            if (typeof sampleVal === 'number') sqlType = Number.isInteger(sampleVal) ? 'INTEGER' : 'DECIMAL(10,2)'
            else if (typeof sampleVal === 'boolean') sqlType = 'BOOLEAN'
            else if (c === 'id') sqlType = 'SERIAL PRIMARY KEY'
            else if (c.endsWith('_id')) sqlType = 'INTEGER REFERENCES ' + c.replace(/_id$/, '') + 's(id)'
            else if (typeof sampleVal === 'string' && /^\d{4}-\d{2}-\d{2}/.test(sampleVal)) sqlType = 'TIMESTAMP'
            return `${c} ${sqlType}`
          })
          statements.push(`CREATE TABLE ${tableName} (\n  ${colDefs.join(',\n  ')}\n);\n`)
          for (const row of rows) { const values = cols.map(c => { const v = row[c]; return typeof v === 'string' ? `'${v.replace(/'/g, "''")}'` : String(v ?? 'NULL') }); statements.push(`INSERT INTO ${tableName} (${cols.join(', ')}) VALUES (${values.join(', ')});`) }
          statements.push('')
        }
      }
      content = statements.join('\n'); filename += '.sql'; type = 'text/plain'
    }
    const blob = new Blob([content], { type }); const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = filename; a.click(); URL.revokeObjectURL(url)
    toast({ title: 'Exported!', description: `Downloaded as ${filename}` })
  }, [toast])

  const exportTable = useCallback((tableName: string, rows: Record<string, unknown>[], format: string) => {
    exportData({ [tableName]: rows }, format)
  }, [exportData])

  const copyTable = useCallback((tableName: string, rows: Record<string, unknown>[]) => {
    navigator.clipboard.writeText(JSON.stringify({ [tableName]: rows }, null, 2))
    toast({ title: 'Copied!', description: `${tableName} data copied to clipboard` })
  }, [toast])

  const copyAllData = useCallback((tables: Record<string, Record<string, unknown>[]>, format: string) => {
    let content = ''
    if (format === 'json') { content = JSON.stringify(tables, null, 2) }
    else if (format === 'sql') {
      const statements: string[] = []
      for (const [tableName, rows] of Object.entries(tables)) {
        if (rows?.length > 0) { const cols = Object.keys(rows[0]); for (const row of rows) { const values = cols.map(c => { const v = row[c]; return typeof v === 'string' ? `'${v.replace(/'/g, "''")}'` : String(v ?? 'NULL') }); statements.push(`INSERT INTO ${tableName} (${cols.join(', ')}) VALUES (${values.join(', ')});`) } }
      }
      content = statements.join('\n')
    } else { content = JSON.stringify(tables, null, 2) }
    navigator.clipboard.writeText(content)
    toast({ title: 'Copied!', description: 'Data copied to clipboard' })
  }, [toast])

  const runSqlPlayground = () => {
    if (!sqlQuery.trim()) return
    const tables = getTablesFromMessages
    const tableName = sqlQuery.match(/FROM\s+(\w+)/i)?.[1] || sqlQuery.match(/from\s+(\w+)/i)?.[1]
    if (tableName && tables[tableName]) {
      setSqlResult(`Found ${tables[tableName].length} rows in "${tableName}"\n\n${JSON.stringify(tables[tableName].slice(0, 5), null, 2)}${tables[tableName].length > 5 ? '\n\n... and more' : ''}`)
    } else {
      setSqlResult(`Query executed (simulated)\n\nAvailable tables: ${Object.keys(tables).join(', ') || 'None'}\n\nNote: SQL Playground runs in preview mode. Generated data is available for inspection.`)
    }
  }

  const validateSql = useCallback((sql: string) => {
    if (!sql.trim()) { setSqlValidationError(''); return }
    let parenCount = 0
    for (const char of sql) { if (char === '(') parenCount++; if (char === ')') parenCount--; if (parenCount < 0) { setSqlValidationError('Unbalanced parentheses: extra closing ")"'); return } }
    if (parenCount > 0) { setSqlValidationError(`Unbalanced parentheses: missing ${parenCount} closing ")"`); return }
    const upperSql = sql.toUpperCase().trim()
    if (upperSql.endsWith('FROM') || upperSql.endsWith('SELECT') || upperSql.endsWith('WHERE') || upperSql.endsWith('JOIN') || upperSql.endsWith('ON')) { setSqlValidationError('Query appears incomplete (ends with a keyword)'); return }
    setSqlValidationError('')
  }, [])

  const regenerateTable = useCallback(async (tableName: string) => {
    if (!activeDb || !conversation) return
    await sendMessage(`Regenerate data for the ${tableName} table with different values`)
  }, [activeDb, conversation, sendMessage])

  const runQualityCheck = useCallback(async (autoFix = false) => {
    if (!activeDb || isQualityCheckRunning) return
    setIsQualityCheckRunning(true)
    try {
      const res = await fetch('/api/quality', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ databaseId: activeDb.id, autoFix }) })
      const data = await res.json()
      if (data.report) {
        setQualityReport(data.report); setShowQualityReport(true)
        if (autoFix && data.report.fixesApplied > 0) { toast({ title: 'Fixes Applied', description: `${data.report.fixesApplied} issue(s) auto-fixed` }); await refreshDatabase(activeDb.id) }
      }
    } catch { toast({ title: 'Error', description: 'Quality check failed', variant: 'destructive' }) }
    finally { setIsQualityCheckRunning(false) }
  }, [activeDb, isQualityCheckRunning, toast])

  // ─── Graph analysis utilities ─────────────────────────
  const buildDependencyGraph = useCallback(() => {
    const schema = getSchemaFromDb; const tables = getTablesFromMessages
    const allTableNames = new Set([...Object.keys(tables), ...Object.keys(schema)])
    const edges: { from: string; to: string; via: string }[] = []
    const adj: Record<string, string[]> = {}; const revAdj: Record<string, string[]> = {}
    for (const name of allTableNames) { adj[name] = []; revAdj[name] = [] }
    for (const tableName of allTableNames) {
      const tableSchema = schema[tableName]
      if (tableSchema?.columns) {
        for (const colName of Object.keys(tableSchema.columns)) {
          if (colName.endsWith('_id') && colName !== 'id') {
            const refTableName = colName.replace(/_id$/, '') + 's'
            if (allTableNames.has(refTableName)) {
              edges.push({ from: tableName, to: refTableName, via: colName }); adj[tableName].push(refTableName); revAdj[refTableName].push(tableName)
            }
          }
        }
      }
    }
    return { allTableNames, edges, adj, revAdj }
  }, [getSchemaFromDb, getTablesFromMessages])

  const topologicalSort = useCallback(() => {
    const { allTableNames, adj } = buildDependencyGraph()
    const sorted: string[] = []; const queue: string[] = []; const visited = new Set<string>()
    for (const name of allTableNames) { if (adj[name].length === 0) queue.push(name) }
    while (queue.length > 0) {
      const current = queue.shift()!; if (visited.has(current)) continue
      visited.add(current); sorted.push(current)
      const { revAdj: ra } = buildDependencyGraph()
      for (const dependent of ra[current] || []) { const allDepsVisited = adj[dependent].every((dep: string) => visited.has(dep)); if (allDepsVisited && !visited.has(dependent)) queue.push(dependent) }
    }
    for (const name of allTableNames) { if (!visited.has(name)) sorted.push(name) }
    setTopologicalSortResult(sorted); return sorted
  }, [buildDependencyGraph])

  const findCutpoints = useCallback(() => {
    const { allTableNames, adj } = buildDependencyGraph()
    if (allTableNames.size <= 2) { setCutpoints(Array.from(allTableNames)); return Array.from(allTableNames) }
    const undirectedAdj: Record<string, Set<string>> = {}
    for (const name of allTableNames) undirectedAdj[name] = new Set()
    for (const name of allTableNames) { for (const dep of adj[name]) { undirectedAdj[name].add(dep); undirectedAdj[dep].add(name) } }
    const disc: Record<string, number> = {}; const low: Record<string, number> = {}; const parent: Record<string, string | null> = {}; const ap: Set<string> = new Set(); let time = 0
    const dfs = (u: string) => {
      let children = 0; disc[u] = low[u] = time++
      for (const v of undirectedAdj[u]) {
        if (disc[v] === undefined) { children++; parent[v] = u; dfs(v); low[u] = Math.min(low[u], low[v]); if ((parent[u] === null && children > 1) || (parent[u] !== null && low[v] >= disc[u])) ap.add(u) }
        else if (v !== parent[u]) low[u] = Math.min(low[u], disc[v])
      }
    }
    for (const name of allTableNames) { if (disc[name] === undefined) { parent[name] = null; dfs(name) } }
    for (const name of allTableNames) { if (undirectedAdj[name].size === 0) ap.add(name) }
    const result = Array.from(ap); setCutpoints(result); return result
  }, [buildDependencyGraph])

  const bfsReachable = useCallback((startNode: string) => {
    const { allTableNames, adj } = buildDependencyGraph()
    const undirectedAdj: Record<string, Set<string>> = {}
    for (const name of allTableNames) undirectedAdj[name] = new Set()
    for (const name of allTableNames) { for (const dep of adj[name]) { undirectedAdj[name].add(dep); undirectedAdj[dep].add(name) } }
    const visited = new Set<string>(); const queue = [startNode]; visited.add(startNode)
    while (queue.length > 0) { const current = queue.shift()!; for (const neighbor of undirectedAdj[current]) { if (!visited.has(neighbor)) { visited.add(neighbor); queue.push(neighbor) } } }
    const result = Array.from(visited).filter(n => n !== startNode)
    setReachableTables(result); setSelectedGraphNode(startNode); return result
  }, [buildDependencyGraph])

  const computeConstraintClosure = useCallback(() => {
    const { edges, adj } = buildDependencyGraph()
    const result: { from: string; to: string; via: string; cascades: string[] }[] = []
    for (const edge of edges) {
      const cascades: string[] = []; const visited = new Set<string>(); const queue = [edge.to]; visited.add(edge.to)
      while (queue.length > 0) { const current = queue.shift()!; for (const dep of adj[current]) { if (!visited.has(dep)) { visited.add(dep); cascades.push(dep); queue.push(dep) } } }
      result.push({ from: edge.from, to: edge.to, via: edge.via, cascades })
    }
    setConstraintClosureResult(result); return result
  }, [buildDependencyGraph])

  // ═══════════════════════════════════════════════════════════
  // LANDING PAGE
  // ═══════════════════════════════════════════════════════════
  if (view === 'landing') {
    return (
      <div className="min-h-screen flex flex-col bg-white overflow-x-hidden">
        <style>{gradientStyle}</style>
        <motion.nav initial={{ y: -20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="border-b bg-white/80 backdrop-blur-sm sticky top-0 z-50">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-amber-600 to-red-700 flex items-center justify-center"><Zap className="h-5 w-5 text-white" /></div>
              <span className="text-xl font-bold tracking-tight">SynthForge AI</span>
            </div>
            <div className="hidden sm:flex items-center gap-6 text-sm text-muted-foreground">
              <button className="hover:text-foreground transition-colors">Features</button>
              <button className="hover:text-foreground transition-colors">Pricing</button>
              <button className="hover:text-foreground transition-colors">Docs</button>
            </div>
            <div className="flex items-center gap-3">
              <Button variant="ghost" size="sm" onClick={() => setView('dashboard')}>Dashboard</Button>
              <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}>
                <Button size="sm" className="bg-gradient-to-r from-amber-600 to-red-700 hover:from-amber-700 hover:to-red-800 text-white" onClick={() => setView('dashboard')}>Get Started Free</Button>
              </motion.div>
            </div>
          </div>
        </motion.nav>

        <main className="flex-1">
          <section className="relative overflow-hidden">
            <div className="absolute inset-0 opacity-30" style={{ background: 'linear-gradient(135deg, #f59e0b15, #ef444415, #f59e0b15, #8b5cf615)', backgroundSize: '400% 400%', animation: 'gradientShift 15s ease infinite' }} />
            <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 lg:py-32">
              <div className="grid lg:grid-cols-2 gap-8 lg:gap-12 items-center">
                <motion.div initial={{ opacity: 0, x: -30 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.6 }}>
                  <Badge className="mb-4 bg-amber-100 text-amber-800 border-amber-200"><Sparkles className="h-3 w-3 mr-1" /> AI-Powered Synthetic Data</Badge>
                  <h1 className="text-3xl sm:text-4xl lg:text-6xl font-bold tracking-tight mb-6 leading-tight">
                    Generate <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-600 to-red-700">Realistic Data</span> in Seconds
                  </h1>
                  <p className="text-base sm:text-lg text-muted-foreground mb-8 leading-relaxed max-w-xl">
                    Create privacy-safe, relationally intact synthetic data from scratch. Just describe what you need and our multi-agent AI generates statistically accurate datasets instantly.
                  </p>
                  <div className="flex flex-wrap gap-3 mb-8">
                    <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}>
                      <Button size="lg" className="bg-gradient-to-r from-amber-600 to-red-700 hover:from-amber-700 hover:to-red-800 text-white text-base px-8" onClick={() => setView('dashboard')}>
                        Start Generating <ArrowRight className="ml-2 h-4 w-4" />
                      </Button>
                    </motion.div>
                    <Button size="lg" variant="outline" className="text-base" onClick={() => setView('dashboard')}>Try Demo</Button>
                  </div>
                  <div className="flex gap-6 sm:gap-8">
                    {[{ value: '10M+', label: 'Rows Generated' }, { value: '99.2%', label: 'FK Integrity' }, { value: '<3s', label: 'Avg Gen Time' }].map((stat, i) => (
                      <motion.div key={i} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 + i * 0.1 }}>
                        <p className="text-2xl font-bold text-amber-700">{stat.value}</p><p className="text-xs text-muted-foreground">{stat.label}</p>
                      </motion.div>
                    ))}
                  </div>
                </motion.div>
                <motion.div initial={{ opacity: 0, x: 30, y: 20 }} animate={{ opacity: 1, x: 0, y: 0 }} transition={{ duration: 0.6, delay: 0.2 }} className="relative hidden sm:block">
                  <Card className="shadow-2xl border-0 bg-white">
                    <CardHeader className="pb-3">
                      <div className="flex items-center gap-2">
                        <div className="h-3 w-3 rounded-full bg-red-400" /><div className="h-3 w-3 rounded-full bg-amber-400" /><div className="h-3 w-3 rounded-full bg-green-400" />
                        <span className="ml-2 text-xs text-muted-foreground font-mono">SynthForge AI Studio</span>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="bg-muted rounded-lg p-3 text-sm"><span className="text-amber-700 font-medium">You:</span> Generate realistic sample data for my project</div>
                      <div className="bg-primary/5 rounded-lg p-3 text-sm space-y-2">
                        <div className="flex items-center gap-2"><span className="text-primary font-medium">SynthForge:</span><Badge className="text-[10px] bg-amber-100 text-amber-800 border-amber-200"><Wand2 className="h-2.5 w-2.5 mr-0.5" /> auto-agent</Badge></div>
                        <p className="text-muted-foreground">I&apos;ll design a schema and generate realistic synthetic data based on your requirements.</p>
                        <div className="bg-white rounded border p-2 font-mono text-xs overflow-hidden">
                          <p className="text-green-700">-- 3 tables generated</p><p className="text-muted-foreground">users (50 rows) | orders (127 rows) | products (30 rows)</p>
                          <p className="text-amber-700 mt-1">-- Referential integrity: OK</p><p className="text-amber-700">-- PII check: All synthetic</p><p className="text-sky-700">-- Quality score: 94/100</p>
                        </div>
                        <div className="flex items-center gap-1 text-[11px] text-muted-foreground"><Brain className="h-3 w-3" /> 6 reasoning steps completed</div>
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
          <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-20 bg-slate-50/50">
            <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} className="text-center mb-12">
              <Badge variant="outline" className="mb-4">Core Features</Badge>
              <h2 className="text-2xl sm:text-3xl font-bold mb-4">Everything You Need for Synthetic Data</h2>
              <p className="text-muted-foreground text-base sm:text-lg max-w-2xl mx-auto">From schema definition to export, SynthForge AI handles the entire synthetic data lifecycle.</p>
            </motion.div>
            <motion.div variants={staggerContainer} initial="initial" whileInView="animate" viewport={{ once: true }} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
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
          <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-20">
            <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} className="text-center mb-12">
              <h2 className="text-2xl sm:text-3xl font-bold mb-4">How It Works</h2>
              <p className="text-muted-foreground text-base sm:text-lg">Three steps from idea to data</p>
            </motion.div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              {[
                { step: '1', title: 'Describe', desc: 'Tell the AI what data you need in natural language, or upload a schema file.', icon: MessageSquare },
                { step: '2', title: 'Generate', desc: 'Our multi-agent AI plans the schema, generates realistic data, and validates integrity.', icon: Wand2 },
                { step: '3', title: 'Export', desc: 'Preview the data, refine it with chat, and export in your preferred format.', icon: Download }
              ].map((item, i) => (
                <motion.div key={i} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.15 }} className="text-center">
                  <div className="h-14 w-14 rounded-full bg-gradient-to-br from-amber-600 to-red-700 flex items-center justify-center mx-auto mb-4 text-white font-bold text-lg">{item.step}</div>
                  <h3 className="font-semibold text-lg mb-2 flex items-center justify-center gap-2"><item.icon className="h-5 w-5 text-amber-700" />{item.title}</h3>
                  <p className="text-sm text-muted-foreground max-w-xs mx-auto">{item.desc}</p>
                </motion.div>
              ))}
            </div>
          </section>

          {/* CTA */}
          <section className="bg-gradient-to-r from-amber-600 to-red-700 py-12 sm:py-16">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
              <h2 className="text-2xl sm:text-3xl font-bold text-white mb-4">Ready to Generate Synthetic Data?</h2>
              <p className="text-white/80 text-base sm:text-lg mb-8 max-w-xl mx-auto">Start creating privacy-safe, realistic synthetic data in seconds. No credit card required.</p>
              <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}>
                <Button size="lg" className="bg-white text-amber-700 hover:bg-white/90 text-base px-8 font-semibold" onClick={() => setView('dashboard')}>
                  Get Started Free <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </motion.div>
            </div>
          </section>
        </main>

        <footer className="border-t py-8 bg-white mt-auto">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between">
            <div className="flex items-center gap-2"><Zap className="h-4 w-4 text-amber-700" /><span className="text-sm font-medium">SynthForge AI</span></div>
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
    const totalTables = allDatabases.reduce((sum, db) => { try { return sum + Object.keys(JSON.parse(db.schemaJson || '{}')).length } catch { return sum } }, 0)
    const totalRows = allDatabases.reduce((sum, db) => { try { return sum + Object.values(JSON.parse(db.dataJson || '{}')).reduce((s: number, rows) => s + (Array.isArray(rows) ? rows.length : 0), 0) } catch { return sum } }, 0) as number
    const totalConversations = allDatabases.reduce((sum, db) => sum + (db._count?.conversations || 0), 0)

    return (
      <div className="min-h-screen flex bg-background overflow-x-hidden">
        <AnimatePresence>
          {(sidebarOpen || (typeof window !== 'undefined' && window.innerWidth >= 768)) && (
            <motion.aside initial={{ x: -280, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: -280, opacity: 0 }} transition={{ type: 'spring', stiffness: 300, damping: 30 }} className="fixed md:relative z-40 w-64 border-r bg-card h-screen flex flex-col md:translate-x-0">
              <div className="h-14 flex items-center gap-2 px-4 border-b shrink-0">
                <div className="h-7 w-7 rounded-md bg-gradient-to-br from-amber-600 to-red-700 flex items-center justify-center"><Zap className="h-4 w-4 text-white" /></div>
                <span className="font-bold text-sm">SynthForge AI</span>
                <Button variant="ghost" size="sm" className="ml-auto md:hidden h-7 w-7 p-0" onClick={() => setSidebarOpen(false)} aria-label="Close sidebar"><X className="h-4 w-4" /></Button>
              </div>
              <ScrollArea className="flex-1">
                <div className="p-3 space-y-1">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 px-2">Workspaces</p>
                  {workspaces.map(ws => (
                    <button key={ws.id} className={`w-full text-left p-2 rounded-md text-sm transition-colors ${activeWorkspace?.id === ws.id ? 'bg-muted font-medium' : 'hover:bg-muted/50'}`} onClick={() => { setActiveWorkspace(ws); loadProjects(ws.id) }}>
                      <div className="flex items-center gap-2"><LayoutDashboard className="h-4 w-4 text-muted-foreground" />{ws.name}</div>
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
                        <motion.button key={db.id} whileHover={{ x: 2 }} className="w-full text-left p-2 rounded-md text-xs hover:bg-muted/50 transition-colors flex items-center gap-2" onClick={() => openDatabase(db)} aria-label={`Open ${db.name}`}>
                          <Database className="h-3.5 w-3.5 text-amber-700 shrink-0" /><span className="truncate">{db.name}</span>
                          {db._count?.datasets !== undefined && <Badge variant="secondary" className="text-[9px] ml-auto">{db._count.datasets}</Badge>}
                        </motion.button>
                      ))}
                    </div>
                  ))}
                </div>
              </ScrollArea>
              <div className="p-3 border-t shrink-0"><Button variant="outline" size="sm" className="w-full text-xs" onClick={() => setView('landing')}><ArrowRight className="h-3 w-3 mr-1 rotate-180" /> Back to Home</Button></div>
            </motion.aside>
          )}
        </AnimatePresence>
        {sidebarOpen && typeof window !== 'undefined' && window.innerWidth < 768 && <div className="fixed inset-0 bg-black/50 z-30" onClick={() => setSidebarOpen(false)} />}

        <main className="flex-1 min-h-screen min-w-0">
          <header className="h-14 border-b flex items-center px-4 gap-3 shrink-0 bg-card">
            <Button variant="ghost" size="sm" className="md:hidden h-8 w-8 p-0" onClick={() => setSidebarOpen(true)} aria-label="Open sidebar"><Menu className="h-4 w-4" /></Button>
            <h1 className="font-semibold text-lg">Dashboard</h1>
            <div className="ml-auto flex items-center gap-2">
              <Dialog open={showNewDbDialog} onOpenChange={setShowNewDbDialog}>
                <DialogTrigger asChild><motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}><Button size="sm" className="bg-gradient-to-r from-amber-600 to-red-700 hover:from-amber-700 hover:to-red-800 text-white gap-1"><Plus className="h-4 w-4" /> New Database</Button></motion.div></DialogTrigger>
                <DialogContent>
                  <DialogHeader><DialogTitle>Create New Database</DialogTitle><DialogDescription>Create a new synthetic database to generate data with AI.</DialogDescription></DialogHeader>
                  <div className="space-y-4 py-4">
                    <div className="space-y-2"><label className="text-sm font-medium" htmlFor="new-db-name">Database Name</label><Input id="new-db-name" value={newDbName} onChange={(e) => setNewDbName(e.target.value)} placeholder="e.g., My Database" onKeyDown={(e) => e.key === 'Enter' && createDatabase()} /></div>
                    <div className="space-y-2"><label className="text-sm font-medium" htmlFor="new-db-schema">Schema (Optional JSON)</label><Textarea id="new-db-schema" value={newDbSchema} onChange={(e) => setNewDbSchema(e.target.value)} placeholder='{"users": {"columns": {"id": "SERIAL", "name": "VARCHAR"}}}' className="font-mono text-xs min-h-[80px]" /></div>
                    <Button onClick={createDatabase} className="w-full bg-gradient-to-r from-amber-600 to-red-700 hover:from-amber-700 hover:to-red-800 text-white">Create Database</Button>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
          </header>

          <ScrollArea className="h-[calc(100vh-56px)]">
            <div className="p-4 sm:p-6 max-w-6xl mx-auto">
              <motion.div variants={staggerContainer} initial="initial" animate="animate" className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-8">
                {[
                  { icon: <Database className="h-4 w-4 text-amber-700" />, label: 'Databases', value: allDatabases.length, color: 'from-amber-100 to-amber-50' },
                  { icon: <Table2 className="h-4 w-4 text-emerald-700" />, label: 'Total Tables', value: totalTables, color: 'from-emerald-100 to-emerald-50' },
                  { icon: <Rows3 className="h-4 w-4 text-sky-700" />, label: 'Total Rows', value: totalRows > 1000 ? `${(totalRows / 1000).toFixed(1)}k` : totalRows, color: 'from-sky-100 to-sky-50' },
                  { icon: <MessageSquare className="h-4 w-4 text-purple-700" />, label: 'Conversations', value: totalConversations, color: 'from-purple-100 to-purple-50' }
                ].map((stat, i) => (
                  <motion.div key={i} variants={staggerItem}><Card><CardContent className="pt-4 pb-3"><div className={`h-8 w-8 rounded-lg bg-gradient-to-br ${stat.color} flex items-center justify-center mb-2`}>{stat.icon}</div><p className="text-xl sm:text-2xl font-bold">{stat.value}</p><p className="text-xs text-muted-foreground">{stat.label}</p></CardContent></Card></motion.div>
                ))}
              </motion.div>

              <motion.div variants={staggerContainer} initial="initial" animate="animate" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 mb-8">
                {[
                  { icon: <MessageSquare className="h-5 w-5 text-amber-700" />, title: 'Chat to Generate', desc: 'Describe data in natural language', action: () => allDatabases[0] ? openDatabase(allDatabases[0]) : setShowNewDbDialog(true) },
                  { icon: <Upload className="h-5 w-5 text-amber-700" />, title: 'Upload Schema', desc: 'Import SQL, CSV, or JSON', action: () => setShowNewDbDialog(true) },
                  { icon: <Wand2 className="h-5 w-5 text-amber-700" />, title: 'Auto Mode', desc: 'Plan & generate in one step', action: () => { setAgentMode('auto'); if (allDatabases[0]) openDatabase(allDatabases[0]) } }
                ].map((action, i) => (
                  <motion.div key={i} variants={staggerItem} whileHover={{ y: -2, transition: { duration: 0.15 } }}>
                    <Card className="cursor-pointer hover:shadow-md transition-all group" onClick={action.action}>
                      <CardContent className="pt-5 pb-4"><div className="h-9 w-9 rounded-lg bg-gradient-to-br from-amber-100 to-red-50 flex items-center justify-center mb-2.5 group-hover:from-amber-200 group-hover:to-red-100 transition-colors">{action.icon}</div><h3 className="font-semibold text-sm">{action.title}</h3><p className="text-xs text-muted-foreground mt-0.5">{action.desc}</p></CardContent>
                    </Card>
                  </motion.div>
                ))}
              </motion.div>

              {messages.length > 0 && (
                <div className="mb-8">
                  <h2 className="text-lg font-semibold mb-4 flex items-center gap-2"><Activity className="h-4 w-4 text-muted-foreground" /> Recent Activity</h2>
                  <Card><CardContent className="pt-4"><div className="space-y-3">{messages.slice(-5).reverse().map(msg => (
                    <div key={msg.id} className="flex items-start gap-3 text-xs">
                      <div className="h-6 w-6 rounded-full bg-muted flex items-center justify-center shrink-0 mt-0.5">{msg.role === 'user' ? <Hash className="h-3 w-3" /> : <Sparkles className="h-3 w-3 text-amber-600" />}</div>
                      <div className="min-w-0 flex-1"><p className="truncate">{msg.content.slice(0, 100)}</p><p className="text-muted-foreground mt-0.5"><Clock className="h-2.5 w-2.5 inline mr-1" />{new Date(msg.createdAt).toLocaleTimeString()}{msg.tokensIn > 0 && <span className="ml-2">{msg.tokensIn + msg.tokensOut} tokens</span>}</p></div>
                    </div>
                  ))}</div></CardContent></Card>
                </div>
              )}

              <div className="mb-4">
                <h2 className="text-lg font-semibold mb-4">Your Databases</h2>
                {allDatabases.length === 0 ? (
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center py-16">
                    <Database className="h-12 w-12 mx-auto text-muted-foreground/30 mb-3" /><p className="text-sm font-medium text-muted-foreground mb-1">No databases yet</p><p className="text-xs text-muted-foreground mb-4">Create your first database to start generating synthetic data</p>
                    <Button size="sm" className="bg-gradient-to-r from-amber-600 to-red-700 hover:from-amber-700 hover:to-red-800 text-white" onClick={() => setShowNewDbDialog(true)}><Plus className="h-4 w-4 mr-1" /> Create Database</Button>
                  </motion.div>
                ) : (
                  <motion.div variants={staggerContainer} initial="initial" animate="animate" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {allDatabases.map(db => {
                      let tableCount = 0; let rowCount = 0
                      try { const s = JSON.parse(db.schemaJson || '{}'); tableCount = Object.keys(s).length; const d = JSON.parse(db.dataJson || '{}'); rowCount = Object.values(d).reduce((s: number, rows) => s + (Array.isArray(rows) ? rows.length : 0), 0) } catch { /* */ }
                      return (
                        <motion.div key={db.id} variants={staggerItem} whileHover={{ y: -3, transition: { duration: 0.15 } }}>
                          <Card className="cursor-pointer hover:shadow-lg transition-all group" onClick={() => openDatabase(db)}>
                            <CardHeader className="pb-2"><div className="flex items-center justify-between"><CardTitle className="text-sm font-semibold flex items-center gap-2"><Database className="h-4 w-4 text-amber-700" /><span className="truncate">{db.name}</span></CardTitle>
                              <DropdownMenu><DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}><Button variant="ghost" size="sm" className="h-7 w-7 p-0 opacity-0 group-hover:opacity-100 transition-opacity" aria-label="Database options"><Trash2 className="h-3.5 w-3.5 text-muted-foreground" /></Button></DropdownMenuTrigger><DropdownMenuContent><DropdownMenuItem className="text-destructive" onClick={(e) => { e.stopPropagation(); deleteDatabase(db.id) }}><Trash2 className="h-3.5 w-3.5 mr-2" /> Delete</DropdownMenuItem></DropdownMenuContent></DropdownMenu>
                            </div></CardHeader>
                            <CardContent>
                              <div className="flex items-center gap-2 mb-2 flex-wrap">
                                <Badge variant="secondary" className="text-xs">{db.dbType}</Badge>
                                {tableCount > 0 && <Badge variant="outline" className="text-xs gap-0.5"><Table2 className="h-2.5 w-2.5" /> {tableCount} tables</Badge>}
                                {rowCount > 0 && <Badge variant="outline" className="text-xs gap-0.5"><Rows3 className="h-2.5 w-2.5" /> {rowCount} rows</Badge>}
                              </div>
                              {db.schemaJson && db.schemaJson !== '{}' && (() => { try { const s = JSON.parse(db.schemaJson); const tn = Object.keys(s); return <div className="flex flex-wrap gap-1 mt-2">{tn.slice(0, 3).map(t => <Badge key={t} variant="outline" className="text-[10px] font-mono px-1.5 py-0"><Table2 className="h-2.5 w-2.5 mr-0.5 text-amber-700" />{t}</Badge>)}{tn.length > 3 && <Badge variant="outline" className="text-[10px] px-1.5 py-0">+{tn.length - 3}</Badge>}</div> } catch { return null } })()}
                              <p className="text-[10px] text-muted-foreground mt-2"><Clock className="h-2.5 w-2.5 inline mr-1" />Updated {new Date(db.updatedAt).toLocaleDateString()}</p>
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
    const allTables = getTablesFromMessages
    const schemaObj = getSchemaFromDb

    // Data Workspace Panel (rendered inline since it's deeply integrated with state)
    const DataWorkspacePanel = () => (
      <Tabs value={rightTab} onValueChange={setRightTab} className="flex flex-col h-full">
        <TabsList className="w-full justify-start rounded-none border-b bg-transparent h-10 px-3 shrink-0">
          <TabsTrigger value="preview" className="text-xs data-[state=active]:bg-muted">Data</TabsTrigger>
          <TabsTrigger value="schema" className="text-xs data-[state=active]:bg-muted">Schema</TabsTrigger>
          <TabsTrigger value="relationships" className="text-xs data-[state=active]:bg-muted">ER Diagram</TabsTrigger>
          <TabsTrigger value="sql" className="text-xs data-[state=active]:bg-muted">SQL</TabsTrigger>
          <TabsTrigger value="explorer" className="text-xs data-[state=active]:bg-muted">Explorer</TabsTrigger>
        </TabsList>

        <TabsContent value="preview" className="flex-1 overflow-auto mt-0">
          <div className="flex h-full">
            <div className="w-48 shrink-0 border-r bg-muted/20 overflow-y-auto">
              <div className="p-2">
                <TableTreeView tableNames={Object.keys(allTables)} tableRowCounts={Object.fromEntries(Object.entries(allTables).map(([k, v]) => [k, v.length]))} selectedTable={selectedTableName} onSelectTable={setSelectedTableName} />
              </div>
            </div>
            <div className="flex-1 overflow-auto">
              <ScrollArea className="h-full">
                <div className="p-4 space-y-4">
                  {isLoading && Object.keys(allTables).length === 0 ? (
                    <div className="space-y-4">{[1, 2].map(i => <Card key={i}><CardHeader className="pb-2"><div className="flex items-center justify-between"><Skeleton className="h-4 w-24" /><Skeleton className="h-5 w-14" /></div></CardHeader><CardContent><div className="space-y-2"><div className="flex gap-4">{[1, 2, 3, 4].map(j => <Skeleton key={j} className="h-3 w-16" />)}</div>{[1, 2, 3, 4, 5].map(j => <div key={j} className="flex gap-4">{[1, 2, 3, 4].map(k => <Skeleton key={k} className="h-3 w-20" />)}</div>)}</div></CardContent></Card>)}</div>
                  ) : selectedTableName && allTables[selectedTableName] ? (
                    <>
                      <div className="flex items-center gap-2 flex-wrap">
                        <Button variant="ghost" size="sm" className="text-xs h-7" onClick={() => setSelectedTableName(null)}><ChevronRight className="h-3 w-3 mr-1" />All Tables</Button>
                        <span className="text-xs text-muted-foreground">{selectedTableName} · {allTables[selectedTableName].length} rows</span>
                        <div className="ml-auto flex items-center gap-1">
                          <Button variant="outline" size="sm" className="gap-1 text-xs h-7 hover:bg-amber-50 hover:border-amber-300" onClick={() => runQualityCheck(false)} disabled={isQualityCheckRunning}>{isQualityCheckRunning ? <Loader2 className="h-3 w-3 animate-spin" /> : <Bug className="h-3 w-3" />}Quality</Button>
                          <DropdownMenu><DropdownMenuTrigger asChild><Button variant="outline" size="sm" className="gap-1 text-xs h-7"><Download className="h-3 w-3" /> Export</Button></DropdownMenuTrigger><DropdownMenuContent>
                            <DropdownMenuItem onClick={() => exportData(allTables, 'json')}><FileJson className="h-3.5 w-3.5 mr-2" /> Export as JSON</DropdownMenuItem>
                            <DropdownMenuItem onClick={() => exportData(allTables, 'csv')}><FileText className="h-3.5 w-3.5 mr-2" /> Export as CSV</DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={() => exportData(allTables, 'sql-insert')}><Code2 className="h-3.5 w-3.5 mr-2" /> SQL INSERT statements</DropdownMenuItem>
                            <DropdownMenuItem onClick={() => exportData(allTables, 'sql-full')}><Database className="h-3.5 w-3.5 mr-2" /> Full SQL dump (CREATE + INSERT)</DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={() => copyAllData(allTables, 'json')}><Copy className="h-3.5 w-3.5 mr-2" /> Copy JSON to clipboard</DropdownMenuItem>
                            <DropdownMenuItem onClick={() => copyAllData(allTables, 'sql')}><ClipboardCheck className="h-3.5 w-3.5 mr-2" /> Copy SQL to clipboard</DropdownMenuItem>
                          </DropdownMenuContent></DropdownMenu>
                        </div>
                      </div>
                      <DataTable key={selectedTableName} tableName={selectedTableName} allRows={allTables[selectedTableName]} schemaObj={schemaObj} onRegenerate={regenerateTable} isLoading={isLoading} onExportTable={exportTable} onCopyTable={copyTable} />
                    </>
                  ) : !selectedTableName && Object.keys(allTables).length > 0 ? (
                    <>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs text-muted-foreground">{Object.keys(allTables).length} table{Object.keys(allTables).length !== 1 ? 's' : ''} · {Object.values(allTables).reduce((s, r) => s + r.length, 0)} total rows</span>
                        <div className="ml-auto flex items-center gap-1">
                          <Button variant="outline" size="sm" className="gap-1 text-xs h-7 hover:bg-amber-50 hover:border-amber-300" onClick={() => runQualityCheck(false)} disabled={isQualityCheckRunning}>{isQualityCheckRunning ? <Loader2 className="h-3 w-3 animate-spin" /> : <Bug className="h-3 w-3" />}Quality</Button>
                          <DropdownMenu><DropdownMenuTrigger asChild><Button variant="outline" size="sm" className="gap-1 text-xs h-7"><Download className="h-3 w-3" /> Export</Button></DropdownMenuTrigger><DropdownMenuContent>
                            <DropdownMenuItem onClick={() => exportData(allTables, 'json')}><FileJson className="h-3.5 w-3.5 mr-2" /> Export as JSON</DropdownMenuItem>
                            <DropdownMenuItem onClick={() => exportData(allTables, 'csv')}><FileText className="h-3.5 w-3.5 mr-2" /> Export as CSV</DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={() => exportData(allTables, 'sql-insert')}><Code2 className="h-3.5 w-3.5 mr-2" /> SQL INSERT statements</DropdownMenuItem>
                            <DropdownMenuItem onClick={() => exportData(allTables, 'sql-full')}><Database className="h-3.5 w-3.5 mr-2" /> Full SQL dump (CREATE + INSERT)</DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={() => copyAllData(allTables, 'json')}><Copy className="h-3.5 w-3.5 mr-2" /> Copy JSON to clipboard</DropdownMenuItem>
                            <DropdownMenuItem onClick={() => copyAllData(allTables, 'sql')}><ClipboardCheck className="h-3.5 w-3.5 mr-2" /> Copy SQL to clipboard</DropdownMenuItem>
                          </DropdownMenuContent></DropdownMenu>
                        </div>
                      </div>
                      {Object.entries(allTables).map(([tableName, rows]) => <DataTable key={tableName} tableName={tableName} allRows={rows} schemaObj={schemaObj} onRegenerate={regenerateTable} isLoading={isLoading} onExportTable={exportTable} onCopyTable={copyTable} />)}
                    </>
                  ) : (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center py-20">
                      <div className="h-16 w-16 rounded-2xl bg-gradient-to-br from-amber-100 to-red-50 flex items-center justify-center mx-auto mb-4"><Table2 className="h-8 w-8 text-amber-700/50" /></div>
                      <p className="text-sm font-medium text-muted-foreground mb-1">No data yet</p>
                      <p className="text-xs text-muted-foreground mb-4">Chat with the AI to generate synthetic data</p>
                      <Button variant="outline" size="sm" className="text-xs" onClick={() => setMobileStudioTab('chat')}><MessageSquare className="h-3 w-3 mr-1" /> Start Chat</Button>
                    </motion.div>
                  )}
                </div>
              </ScrollArea>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="schema" className="flex-1 overflow-auto mt-0">
          <ScrollArea className="h-full">
            <div className="p-4 space-y-4">
              {Object.keys(schemaObj).length === 0 ? (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center py-20">
                  <div className="h-16 w-16 rounded-2xl bg-gradient-to-br from-amber-100 to-red-50 flex items-center justify-center mx-auto mb-4"><Columns3 className="h-8 w-8 text-amber-700/50" /></div>
                  <p className="text-sm font-medium text-muted-foreground mb-1">No schema defined</p>
                  <p className="text-xs text-muted-foreground mb-4">Ask the AI to design a database schema</p>
                  <Button variant="outline" size="sm" className="text-xs" onClick={() => setMobileStudioTab('chat')}><MessageSquare className="h-3 w-3 mr-1" /> Start Chat</Button>
                </motion.div>
              ) : Object.entries(schemaObj).map(([tableName, def]) => <SchemaCard key={tableName} tableName={tableName} columns={(def as { columns: Record<string, string> }).columns} />)}
            </div>
          </ScrollArea>
        </TabsContent>

        <TabsContent value="relationships" className="flex-1 mt-0 overflow-hidden">
          <ERDiagram schema={schemaObj} tables={allTables} erSvgRef={erSvgRef} />
        </TabsContent>

        <TabsContent value="sql" className="flex-1 flex flex-col mt-0">
          <div className="p-4 space-y-3 flex-1 flex flex-col">
            <div className="flex items-center gap-2"><Code2 className="h-4 w-4 text-amber-700" /><span className="text-sm font-semibold">SQL Playground</span><Badge variant="secondary" className="text-[10px] ml-auto">Preview Mode</Badge></div>

            {showSqlSuggestion && sqlSuggestion && (
              <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} className="border border-amber-200 bg-amber-50/50 rounded-lg p-3 space-y-2">
                <div className="flex items-center gap-2"><Sparkles className="h-3.5 w-3.5 text-amber-700" /><span className="text-xs font-semibold text-amber-800">AI Suggestion</span></div>
                <ScrollArea className="max-h-32"><pre className="text-[11px] font-mono whitespace-pre-wrap text-amber-900">{sqlSuggestion}</pre></ScrollArea>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" className="h-6 text-[10px] gap-1 border-green-300 text-green-700 hover:bg-green-50" onClick={() => { setSqlQuery(sqlSuggestion); setShowSqlSuggestion(false); setSqlSuggestion(''); toast({ title: 'SQL Accepted', description: 'AI suggestion applied to editor' }) }}><Check className="h-2.5 w-2.5" /> Accept</Button>
                  <Button variant="outline" size="sm" className="h-6 text-[10px] gap-1 border-red-300 text-red-700 hover:bg-red-50" onClick={() => { setShowSqlSuggestion(false); setSqlSuggestion('') }}><X className="h-2.5 w-2.5" /> Reject</Button>
                </div>
              </motion.div>
            )}

            <div className="flex-1 relative">
              <Textarea value={sqlQuery} onChange={(e) => { setSqlQuery(e.target.value); validateSql(e.target.value); setShowSqlSuggestion(false) }} placeholder={"-- Write a comment like: Get all users older than 30\n-- Or type SQL directly:\nSELECT * FROM users LIMIT 10;"} className="min-h-[120px] font-mono text-xs flex-1" aria-label="SQL query input" />
              {sqlValidationError && <div className="absolute bottom-1 left-1 right-1 flex items-center gap-1 text-[10px] text-red-600 bg-red-50 px-2 py-1 rounded"><AlertCircle className="h-3 w-3 shrink-0" />{sqlValidationError}</div>}
            </div>

            <div className="flex items-center gap-1.5 flex-wrap">
              <Button size="sm" className="bg-gradient-to-r from-amber-600 to-red-700 hover:from-amber-700 hover:to-red-800 text-white h-7 text-xs" onClick={runSqlPlayground} disabled={!sqlQuery.trim()}><Play className="h-3 w-3 mr-1" /> Run</Button>
              <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={() => { const commentMatch = sqlQuery.match(/^--\s*(.+)$/m); if (commentMatch) sendMessage(`Generate SQL for: ${commentMatch[1]}`); else if (sqlQuery.trim()) sendMessage(`Generate an improved or alternative SQL query for: ${sqlQuery.trim()}`); else toast({ title: 'No query', description: 'Write a comment (-- text) or SQL query first', variant: 'destructive' }) }} disabled={isLoading || !sqlQuery.trim()}><Wand2 className="h-3 w-3" /> Ask AI</Button>
              <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={() => { if (!sqlQuery.trim()) { toast({ title: 'No query', description: 'Write a SQL query first', variant: 'destructive' }); return } sendMessage(`Explain this SQL query in plain English: ${sqlQuery.trim()}`) }} disabled={isLoading || !sqlQuery.trim()}><HelpCircle className="h-3 w-3" /> Explain</Button>
              <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={() => { if (!sqlQuery.trim()) return; let formatted = sqlQuery.replace(/\b(SELECT|FROM|WHERE|JOIN|LEFT JOIN|RIGHT JOIN|INNER JOIN|OUTER JOIN|ON|AND|OR|ORDER BY|GROUP BY|HAVING|INSERT INTO|VALUES|UPDATE|SET|DELETE FROM|CREATE TABLE|ALTER TABLE|DROP TABLE|AS|IN|NOT|IS|NULL|LIKE|BETWEEN|EXISTS|DISTINCT|LIMIT|OFFSET|UNION|CASE|WHEN|THEN|ELSE|END)\b/gi, '\n$1').replace(/^\n/, '').replace(/\n\n+/g, '\n'); setSqlQuery(formatted) }}><AlignLeft className="h-3 w-3" /> Format</Button>
            </div>

            {sqlResult && <ScrollArea className="max-h-64"><pre className="bg-slate-900 text-green-400 p-3 rounded-lg text-xs font-mono whitespace-pre-wrap">{sqlResult}</pre></ScrollArea>}
          </div>
        </TabsContent>

        <TabsContent value="explorer" className="flex-1 mt-0 overflow-hidden">
          <ExplorerPanel
            tables={allTables} schema={schemaObj} explorerView={explorerView} setExplorerView={setExplorerView}
            cutpoints={cutpoints} reachableTables={reachableTables} selectedGraphNode={selectedGraphNode}
            constraintClosureResult={constraintClosureResult} topologicalSortResult={topologicalSortResult}
            buildDependencyGraph={buildDependencyGraph} topologicalSort={topologicalSort}
            findCutpoints={findCutpoints} bfsReachable={bfsReachable}
            computeConstraintClosure={computeConstraintClosure}
            onNavigateToData={() => setRightTab('preview')}
            graphSvgRef={graphSvgRef}
          />
        </TabsContent>
      </Tabs>
    )

    return (
      <div className="h-screen flex flex-col bg-background overflow-hidden">
        {/* Studio Header */}
        <header className="border-b bg-card h-12 flex items-center px-3 gap-2 shrink-0">
          <Button variant="ghost" size="sm" onClick={() => setView('dashboard')} className="gap-1 text-xs h-7" aria-label="Back to dashboard"><ChevronRight className="h-3 w-3 rotate-180" /><span className="hidden sm:inline">Back</span></Button>
          <Separator orientation="vertical" className="h-5" />
          <Database className="h-4 w-4 text-amber-700 shrink-0" />
          <span className="font-semibold text-sm truncate max-w-[150px]">{activeDb.name}</span>
          <Badge variant="secondary" className="text-xs hidden sm:inline-flex">{activeDb.dbType}</Badge>
          {(schemaVersionCount > 0 || messages.some(m => m.schemaVersion && m.schemaVersion > 0)) && (
            <Badge variant="outline" className="text-[10px] gap-1 font-mono hidden sm:inline-flex"><GitBranch className="h-2.5 w-2.5" /> v{schemaVersionCount || messages.reduce((max, m) => Math.max(max, m.schemaVersion || 0), 0) || 1}</Badge>
          )}

          <Separator orientation="vertical" className="h-5 hidden md:block" />
          <div className="items-center gap-1 hidden md:flex">
            <span className="text-[10px] text-muted-foreground mr-1">Agent:</span>
            {(['plan', 'execute', 'auto'] as AgentMode[]).map((mode) => {
              const isPlan = mode === 'plan'; const isExec = mode === 'execute'
              const icon = isPlan ? <Brain className="h-3 w-3" /> : isExec ? <Play className="h-3 w-3" /> : <Wand2 className="h-3 w-3" />
              const label = isPlan ? 'Plan' : isExec ? 'Execute' : 'Auto'
              const activeColor = isPlan ? 'bg-sky-100 text-sky-800 border-sky-300' : isExec ? 'bg-emerald-100 text-emerald-800 border-emerald-300' : 'bg-amber-100 text-amber-800 border-amber-300'
              return <Button key={mode} variant="outline" size="sm" className={`h-7 text-[11px] gap-1 px-2.5 ${agentMode === mode ? activeColor : 'text-muted-foreground'}`} onClick={() => setAgentMode(mode)} aria-label={`${label} mode`}>{icon} {label}</Button>
            })}
          </div>

          <div className="ml-auto flex items-center gap-1.5">
            {totalTokens > 0 && <Badge variant="outline" className="text-[10px] gap-1 font-mono hidden sm:inline-flex"><Zap className="h-2.5 w-2.5 text-amber-600" /> {totalTokens > 1000 ? `${(totalTokens / 1000).toFixed(1)}k` : totalTokens} tok</Badge>}

            <div className="flex md:hidden items-center gap-0.5 bg-muted rounded-md p-0.5">
              <Button variant={mobileStudioTab === 'chat' ? 'secondary' : 'ghost'} size="sm" className="h-6 text-xs px-2" onClick={() => setMobileStudioTab('chat')} aria-label="Chat tab"><MessageSquare className="h-3 w-3" /></Button>
              <Button variant={mobileStudioTab === 'data' ? 'secondary' : 'ghost'} size="sm" className="h-6 text-xs px-2" onClick={() => setMobileStudioTab('data')} aria-label="Data tab"><Table2 className="h-3 w-3" /></Button>
            </div>

            {Object.keys(allTables).length > 0 && (
              <DropdownMenu><DropdownMenuTrigger asChild><Button variant="outline" size="sm" className="gap-1 text-xs h-7"><Download className="h-3 w-3" /> <span className="hidden sm:inline">Export</span></Button></DropdownMenuTrigger><DropdownMenuContent>
                <DropdownMenuItem onClick={() => exportData(allTables, 'json')}><FileJson className="h-3.5 w-3.5 mr-2" /> Export as JSON</DropdownMenuItem>
                <DropdownMenuItem onClick={() => exportData(allTables, 'csv')}><FileText className="h-3.5 w-3.5 mr-2" /> Export as CSV</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => exportData(allTables, 'sql-insert')}><Code2 className="h-3.5 w-3.5 mr-2" /> SQL INSERT statements</DropdownMenuItem>
                <DropdownMenuItem onClick={() => exportData(allTables, 'sql-full')}><Database className="h-3.5 w-3.5 mr-2" /> Full SQL dump</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => copyAllData(allTables, 'json')}><Copy className="h-3.5 w-3.5 mr-2" /> Copy JSON</DropdownMenuItem>
                <DropdownMenuItem onClick={() => copyAllData(allTables, 'sql')}><ClipboardCheck className="h-3.5 w-3.5 mr-2" /> Copy SQL</DropdownMenuItem>
              </DropdownMenuContent></DropdownMenu>
            )}
          </div>
        </header>

        <div className="flex-1 overflow-hidden md:hidden">
          {mobileStudioTab === 'chat' ? <ChatPanel messages={messages} isLoading={isLoading} isDragOver={isDragOver} isOnline={isOnline} onSendMessage={sendMessage} onAbort={handleAbort} onHandleSendMessage={handleSendMessage} attachedFiles={attachedFiles} onFileUpload={handleFileUpload} onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop} onRemoveFile={removeFile} fileInputRef={fileInputRef} onRetry={handleRetry} onRegenerate={handleRegenerate} onCopyToClipboard={copyToClipboard} onExportData={exportData} onCopyAllData={copyAllData} agentSteps={agentSteps} allTables={allTables} /> : <DataWorkspacePanel />}
        </div>
        <div className="flex-1 overflow-hidden hidden md:block">
          <ResizablePanelGroup direction="horizontal">
            <ResizablePanel defaultSize={25} minSize={15} maxSize={50}>
              <ChatPanel messages={messages} isLoading={isLoading} isDragOver={isDragOver} isOnline={isOnline} onSendMessage={sendMessage} onAbort={handleAbort} onHandleSendMessage={handleSendMessage} attachedFiles={attachedFiles} onFileUpload={handleFileUpload} onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop} onRemoveFile={removeFile} fileInputRef={fileInputRef} onRetry={handleRetry} onRegenerate={handleRegenerate} onCopyToClipboard={copyToClipboard} onExportData={exportData} onCopyAllData={copyAllData} agentSteps={agentSteps} allTables={allTables} />
            </ResizablePanel>
            <ResizableHandle withHandle />
            <ResizablePanel defaultSize={75} minSize={40}>
              <DataWorkspacePanel />
            </ResizablePanel>
          </ResizablePanelGroup>
        </div>

        <QualityReportPanel qualityReport={qualityReport} showQualityReport={showQualityReport} setShowQualityReport={setShowQualityReport} onRunQualityCheck={runQualityCheck} isQualityCheckRunning={isQualityCheckRunning} />
      </div>
    )
  }

  // Fallback
  if (view === 'studio' && !activeDb) { setView('dashboard'); return null }
  return <>{qualityReport && <QualityReportPanel qualityReport={qualityReport} showQualityReport={showQualityReport} setShowQualityReport={setShowQualityReport} onRunQualityCheck={runQualityCheck} isQualityCheckRunning={isQualityCheckRunning} />}</>
}
