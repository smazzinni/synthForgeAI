'use client'

import React, { useState, useEffect, useRef, useCallback } from 'react'
import {
  Database, MessageSquare, Plus, Send, ChevronRight, ChevronDown,
  Table2, Download, Copy, RotateCcw, Sparkles, FolderOpen, LayoutDashboard,
  Code2, FileJson, FileText, MoreVertical, Trash2, Settings, Zap,
  Upload, X, Check, Loader2, ArrowRight, Hash
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useToast } from '@/hooks/use-toast'

// ─── Types ─────────────────────────────────────────────
interface Workspace { id: string; name: string; slug: string; agentInstructions: string }
interface Project { id: string; name: string; description: string; workspaceId: string; databases?: Database[] }
interface Database_ { id: string; name: string; dbType: string; schemaJson: string; projectId: string; _count?: { datasets: number; conversations: number } }
interface Message { id: string; role: string; content: string; sqlCode: string; tokensIn: number; tokensOut: number; cost: number; createdAt: string }
interface Conversation { id: string; title: string; messages: Message[] }

type View = 'landing' | 'dashboard' | 'studio'

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
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const { toast } = useToast()

  // Load workspaces on mount
  useEffect(() => {
    loadWorkspaces()
  }, [])

  const loadWorkspaces = async () => {
    const res = await fetch('/api/workspaces')
    const data = await res.json()
    if (data.workspaces?.length > 0) {
      setWorkspaces(data.workspaces)
      setActiveWorkspace(data.workspaces[0])
      loadProjects(data.workspaces[0].id)
    }
  }

  const loadProjects = async (workspaceId: string) => {
    const res = await fetch(`/api/projects?workspaceId=${workspaceId}`)
    const data = await res.json()
    if (data.projects) {
      setProjects(data.projects)
      // Load databases from first project
      if (data.projects.length > 0 && data.projects[0].databases?.length > 0) {
        // Don't auto-select, just make available
      }
    }
  }

  const allDatabases = projects.flatMap(p => p.databases || [])

  const openDatabase = async (db: Database_) => {
    setActiveDb(db)
    setConversation(null)
    setMessages([])
    setView('studio')
  }

  // ─── Chat Submit ──────────────────────────────────────
  const handleSubmit = useCallback(async () => {
    if (!input.trim() || isStreaming || !activeDb) return

    const userMessage = input.trim()
    setInput('')
    setIsStreaming(true)
    setStreamingContent('')

    // Add user message immediately
    const tempUserMsg: Message = {
      id: 'temp-' + Date.now(),
      role: 'user',
      content: userMessage,
      sqlCode: '',
      tokensIn: 0,
      tokensOut: 0,
      cost: 0,
      createdAt: new Date().toISOString()
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
          message: userMessage,
          stream: true
        })
      })

      if (!res.ok) throw new Error('Chat request failed')

      const convId = res.headers.get('X-Conversation-Id')
      if (convId && !conversation) {
        setConversation({ id: convId, title: userMessage.slice(0, 60), messages: [] })
      }

      // Read SSE stream
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

      // Add assistant message
      const assistantMsg: Message = {
        id: 'msg-' + Date.now(),
        role: 'assistant',
        content: fullContent,
        sqlCode: extractSqlCode(fullContent),
        tokensIn: 0,
        tokensOut: 0,
        cost: 0,
        createdAt: new Date().toISOString()
      }
      setMessages(prev => [...prev, assistantMsg])
      setStreamingContent('')

    } catch (error) {
      toast({ title: 'Error', description: 'Failed to get AI response. Please try again.', variant: 'destructive' })
      // Remove the temp user message on error
      setMessages(prev => prev.filter(m => m.id !== tempUserMsg.id))
    } finally {
      setIsStreaming(false)
    }
  }, [input, isStreaming, activeDb, conversation, activeWorkspace, toast])

  const extractSqlCode = (content: string): string => {
    try {
      const match = content.match(/\{[\s\S]*\}/)
      if (match) {
        const parsed = JSON.parse(match[0])
        return parsed.sqlCode || ''
      }
    } catch { /* */ }
    // Also try to find SQL in markdown code blocks
    const sqlMatch = content.match(/```sql\n([\s\S]*?)```/)
    return sqlMatch ? sqlMatch[1] : ''
  }

  const extractTables = (content: string): Record<string, Record<string, unknown>[]> | null => {
    try {
      const match = content.match(/\{[\s\S]*\}/)
      if (match) {
        const parsed = JSON.parse(match[0])
        return parsed.tables || null
      }
    } catch { /* */ }
    return null
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

  const createDatabase = async () => {
    if (!newDbName.trim() || !projects[0]) return

    let schemaObj = {}
    if (newDbSchema.trim()) {
      try {
        schemaObj = JSON.parse(newDbSchema)
      } catch {
        // Try to parse as simple schema format
        toast({ title: 'Invalid JSON', description: 'Schema must be valid JSON', variant: 'destructive' })
        return
      }
    }

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
      // Convert first table to CSV
      const tableName = Object.keys(tables)[0]
      const rows = tables[tableName]
      if (rows?.length > 0) {
        const headers = Object.keys(rows[0])
        content = [headers.join(','), ...rows.map(r => headers.map(h => `"${r[h] ?? ''}"`).join(','))].join('\n')
      }
      filename += '.csv'
      type = 'text/csv'
    } else if (format === 'sql') {
      // Generate INSERT statements
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

  // ─── Landing Page ─────────────────────────────────────
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
                      <span className="text-primary font-medium">SynthForge:</span>
                      <p className="text-muted-foreground">I&apos;ll create a realistic e-commerce dataset with 50 users, their orders, and a product catalog.</p>
                      <div className="bg-white rounded border p-2 font-mono text-xs overflow-hidden">
                        <p className="text-green-700">-- 3 tables generated</p>
                        <p className="text-muted-foreground">users (50 rows) | orders (127 rows) | products (30 rows)</p>
                        <p className="text-amber-700 mt-1">-- Referential integrity: OK</p>
                        <p className="text-amber-700">-- PII check: All synthetic</p>
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
            <div className="grid md:grid-cols-3 gap-6">
              {[
                { icon: MessageSquare, title: 'AI Data Agent', desc: 'Describe your data needs in natural language. Our AI generates realistic, domain-specific synthetic data instantly.' },
                { icon: Table2, title: 'Schema-Aware Generation', desc: 'Upload SQL DDL, JSON schemas, or CSV headers. The AI understands relationships and maintains referential integrity.' },
                { icon: Download, title: 'Multi-Format Export', desc: 'Export as JSON, CSV, SQL INSERT statements, or directly push to connected databases with one click.' },
                { icon: Sparkles, title: 'PII Protection', desc: 'Automatic detection and masking of personally identifiable information. All generated data is privacy-safe by design.' },
                { icon: Code2, title: 'SQL Transparency', desc: 'Every generation action produces viewable SQL. Copy, audit, or modify the generated statements.' },
                { icon: FileJson, title: 'Iterative Refinement', desc: 'Chat with the AI to refine your data. Add columns, adjust distributions, or regenerate specific tables.' }
              ].map((feature, i) => (
                <Card key={i} className="hover:shadow-md transition-shadow">
                  <CardContent className="pt-6">
                    <feature.icon className="h-10 w-10 mb-3 text-amber-700" />
                    <h3 className="font-semibold text-lg mb-2">{feature.title}</h3>
                    <p className="text-sm text-muted-foreground">{feature.desc}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </section>
        </main>

        {/* Footer */}
        <footer className="border-t py-8">
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

  // ─── Studio View (Chat + Data Preview) ────────────────
  if (view === 'studio' && activeDb) {
    const lastAssistantMsg = [...messages].reverse().find(m => m.role === 'assistant')
    const lastTables = lastAssistantMsg ? extractTables(lastAssistantMsg.content) : null
    const schemaObj = (() => { try { return JSON.parse(activeDb.schemaJson) } catch { return {} } })()

    return (
      <div className="h-screen flex flex-col">
        {/* Studio Header */}
        <header className="border-b bg-white h-12 flex items-center px-4 gap-3 shrink-0">
          <Button variant="ghost" size="sm" onClick={() => setView('dashboard')} className="gap-1">
            <ChevronRight className="h-4 w-4 rotate-180" />
            Back
          </Button>
          <Separator orientation="vertical" className="h-6" />
          <Database className="h-4 w-4 text-amber-700" />
          <span className="font-semibold text-sm">{activeDb.name}</span>
          <Badge variant="secondary" className="text-xs">{activeDb.dbType}</Badge>
          <div className="ml-auto flex items-center gap-2">
            {lastTables && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="gap-1">
                    <Download className="h-3 w-3" /> Export
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  <DropdownMenuItem onClick={() => exportData(lastTables, 'json')}>
                    <FileJson className="h-3 w-3 mr-2" /> JSON
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => exportData(lastTables, 'csv')}>
                    <FileText className="h-3 w-3 mr-2" /> CSV
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => exportData(lastTables, 'sql')}>
                    <Code2 className="h-3 w-3 mr-2" /> SQL
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </header>

        <div className="flex-1 flex overflow-hidden">
          {/* Chat Panel */}
          <div className="flex-1 flex flex-col border-r">
            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
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

              {messages.map((msg, i) => (
                <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[80%] rounded-lg p-3 ${
                    msg.role === 'user'
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted'
                  }`}>
                    {msg.role === 'assistant' ? (
                      <div className="space-y-2">
                        <div className="text-sm whitespace-pre-wrap">
                          {renderAssistantContent(msg.content)}
                        </div>
                        {msg.sqlCode && (
                          <details className="mt-2">
                            <summary className="text-xs text-muted-foreground cursor-pointer flex items-center gap-1">
                              <Code2 className="h-3 w-3" /> View SQL
                            </summary>
                            <div className="mt-1 bg-white rounded border p-2 font-mono text-xs overflow-x-auto max-h-48">
                              <pre>{msg.sqlCode}</pre>
                            </div>
                          </details>
                        )}
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
              ))}

              {isStreaming && streamingContent && (
                <div className="flex justify-start">
                  <div className="max-w-[80%] rounded-lg p-3 bg-muted">
                    <div className="text-sm whitespace-pre-wrap">
                      {renderAssistantContent(streamingContent)}
                    </div>
                    <Loader2 className="h-3 w-3 animate-spin mt-2 text-muted-foreground" />
                  </div>
                </div>
              )}

              {isStreaming && !streamingContent && (
                <div className="flex justify-start">
                  <div className="rounded-lg p-3 bg-muted">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Generating...
                    </div>
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div className="border-t p-3 bg-white">
              <div className="flex gap-2 max-w-4xl mx-auto">
                <div className="flex-1 relative">
                  <Textarea
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Describe the data you want to generate..."
                    className="resize-none min-h-[44px] max-h-[120px] pr-10"
                    rows={1}
                    disabled={isStreaming}
                  />
                </div>
                <Button
                  onClick={handleSubmit}
                  disabled={!input.trim() || isStreaming}
                  className="bg-gradient-to-r from-amber-600 to-red-700 hover:from-amber-700 hover:to-red-800 text-white self-end"
                >
                  <Send className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>

          {/* Right Panel - Data Preview & Schema */}
          <div className="w-[45%] flex flex-col bg-slate-50">
            <Tabs defaultValue="preview" className="flex-1 flex flex-col">
              <TabsList className="w-full justify-start rounded-none border-b bg-white h-10 px-4">
                <TabsTrigger value="preview" className="text-xs">
                  <Table2 className="h-3 w-3 mr-1" /> Data Preview
                </TabsTrigger>
                <TabsTrigger value="schema" className="text-xs">
                  <FileJson className="h-3 w-3 mr-1" /> Schema
                </TabsTrigger>
              </TabsList>

              <TabsContent value="preview" className="flex-1 overflow-auto p-4 mt-0">
                {lastTables ? (
                  <div className="space-y-4">
                    {Object.entries(lastTables).map(([tableName, rows]) => (
                      <Card key={tableName}>
                        <CardHeader className="pb-2">
                          <div className="flex items-center justify-between">
                            <CardTitle className="text-sm font-semibold flex items-center gap-2">
                              <Table2 className="h-4 w-4 text-amber-700" />
                              {tableName}
                            </CardTitle>
                            <Badge variant="secondary" className="text-xs">
                              {Array.isArray(rows) ? rows.length : 0} rows
                            </Badge>
                          </div>
                        </CardHeader>
                        <CardContent>
                          {Array.isArray(rows) && rows.length > 0 ? (
                            <div className="overflow-x-auto">
                              <table className="w-full text-xs">
                                <thead>
                                  <tr className="border-b">
                                    {Object.keys(rows[0]).map(key => (
                                      <th key={key} className="text-left py-1.5 px-2 font-medium text-muted-foreground whitespace-nowrap">
                                        {key}
                                      </th>
                                    ))}
                                  </tr>
                                </thead>
                                <tbody>
                                  {rows.slice(0, 20).map((row, i) => (
                                    <tr key={i} className="border-b last:border-0 hover:bg-white/50">
                                      {Object.values(row).map((val: unknown, j) => (
                                        <td key={j} className="py-1.5 px-2 whitespace-nowrap max-w-[200px] truncate">
                                          {val === null ? <span className="text-muted-foreground italic">null</span> : String(val)}
                                        </td>
                                      ))}
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                              {rows.length > 20 && (
                                <p className="text-xs text-muted-foreground mt-2 text-center">
                                  Showing 20 of {rows.length} rows
                                </p>
                              )}
                            </div>
                          ) : (
                            <p className="text-xs text-muted-foreground">No data rows</p>
                          )}
                        </CardContent>
                      </Card>
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

              <TabsContent value="schema" className="flex-1 overflow-auto p-4 mt-0">
                {Object.keys(schemaObj).length > 0 ? (
                  <div className="space-y-3">
                    {Object.entries(schemaObj).map(([tableName, tableDef]: [string, unknown]) => {
                      const def = tableDef as { columns?: Record<string, string> }
                      return (
                        <Card key={tableName}>
                          <CardHeader className="pb-2">
                            <CardTitle className="text-sm font-semibold flex items-center gap-2">
                              <Table2 className="h-4 w-4 text-amber-700" />
                              {tableName}
                            </CardTitle>
                          </CardHeader>
                          <CardContent>
                            {def.columns ? (
                              <div className="space-y-1">
                                {Object.entries(def.columns).map(([colName, colType]) => (
                                  <div key={colName} className="flex items-center justify-between text-xs py-1 border-b last:border-0">
                                    <span className="font-mono font-medium">{colName}</span>
                                    <Badge variant="secondary" className="text-xs font-mono">{colType as string}</Badge>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <p className="text-xs text-muted-foreground">No column definitions</p>
                            )}
                          </CardContent>
                        </Card>
                      )
                    })}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center h-full text-center py-20">
                    <FileJson className="h-12 w-12 text-muted-foreground/30 mb-3" />
                    <h3 className="font-semibold text-muted-foreground mb-1">No Schema Defined</h3>
                    <p className="text-sm text-muted-foreground">Ask the AI to generate data and a schema will be created</p>
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </div>
    )
  }

  // ─── Dashboard View ───────────────────────────────────
  return (
    <div className="min-h-screen flex">
      {/* Sidebar */}
      <aside className="w-64 border-r bg-slate-50 flex flex-col">
        <div className="p-4 border-b">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-amber-600 to-red-700 flex items-center justify-center">
              <Zap className="h-5 w-5 text-white" />
            </div>
            <span className="font-bold">SynthForge AI</span>
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

          {allDatabases.map(db => (
            <button
              key={db.id}
              className={`w-full text-left p-2 rounded-lg mb-1 text-sm transition-colors ${
                activeDb?.id === db.id ? 'bg-white shadow-sm border' : 'hover:bg-white/50'
              }`}
              onClick={() => openDatabase(db)}
            >
              <div className="flex items-center gap-2">
                <Database className="h-4 w-4 text-amber-700 shrink-0" />
                <div className="min-w-0">
                  <p className="font-medium truncate">{db.name}</p>
                  <p className="text-xs text-muted-foreground">{db.dbType}</p>
                </div>
              </div>
            </button>
          ))}

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
        <div className="max-w-5xl mx-auto p-8">
          <div className="mb-8">
            <h1 className="text-3xl font-bold mb-2">Dashboard</h1>
            <p className="text-muted-foreground">Select a database to start generating synthetic data, or create a new one.</p>
          </div>

          {/* Quick Actions */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
            <Card className="hover:shadow-md transition-shadow cursor-pointer" onClick={() => setShowNewDbDialog(true)}>
              <CardContent className="pt-6 flex items-center gap-4">
                <div className="h-12 w-12 rounded-xl bg-amber-100 flex items-center justify-center">
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
            }}>
              <CardContent className="pt-6 flex items-center gap-4">
                <div className="h-12 w-12 rounded-xl bg-blue-50 flex items-center justify-center">
                  <MessageSquare className="h-6 w-6 text-blue-700" />
                </div>
                <div>
                  <h3 className="font-semibold">Chat with AI</h3>
                  <p className="text-xs text-muted-foreground">Describe data to generate</p>
                </div>
              </CardContent>
            </Card>
            <Card className="hover:shadow-md transition-shadow cursor-pointer" onClick={() => {
              if (allDatabases.length > 0) openDatabase(allDatabases[0])
            }}>
              <CardContent className="pt-6 flex items-center gap-4">
                <div className="h-12 w-12 rounded-xl bg-green-50 flex items-center justify-center">
                  <Upload className="h-6 w-6 text-green-700" />
                </div>
                <div>
                  <h3 className="font-semibold">Upload Schema</h3>
                  <p className="text-xs text-muted-foreground">SQL DDL, JSON, or Prisma</p>
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
                  const schemaObj = (() => { try { return JSON.parse(db.schemaJson) } catch { return {} } })()
                  const tableCount = Object.keys(schemaObj).length
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
                        <div className="flex items-center gap-4 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Table2 className="h-3 w-3" /> {tableCount} tables
                          </span>
                          <span className="flex items-center gap-1">
                            <MessageSquare className="h-3 w-3" /> {db._count?.conversations || 0} chats
                          </span>
                        </div>
                        <div className="mt-3 flex flex-wrap gap-1">
                          {Object.keys(schemaObj).slice(0, 5).map(name => (
                            <Badge key={name} variant="outline" className="text-xs">{name}</Badge>
                          ))}
                          {tableCount > 5 && (
                            <Badge variant="outline" className="text-xs">+{tableCount - 5}</Badge>
                          )}
                        </div>
                        <Button size="sm" className="mt-3 w-full opacity-0 group-hover:opacity-100 transition-opacity bg-gradient-to-r from-amber-600 to-red-700 text-white">
                          Open Studio <ArrowRight className="ml-1 h-3 w-3" />
                        </Button>
                      </CardContent>
                    </Card>
                  )
                })}
              </div>
            ) : (
              <Card>
                <CardContent className="py-12 text-center">
                  <Database className="h-12 w-12 text-muted-foreground/30 mx-auto mb-3" />
                  <h3 className="font-semibold mb-1">No Databases Yet</h3>
                  <p className="text-sm text-muted-foreground mb-4">Create your first database to start generating synthetic data.</p>
                  <Button onClick={() => setShowNewDbDialog(true)} className="bg-gradient-to-r from-amber-600 to-red-700 text-white">
                    <Plus className="h-4 w-4 mr-1" /> Create Database
                  </Button>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Agent Capabilities */}
          <div>
            <h2 className="text-lg font-semibold mb-4">AI Agent Capabilities</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {[
                { title: 'Schema Analysis', desc: 'Parse SQL DDL, JSON Schema, Prisma, and Swagger specs', icon: FileJson },
                { title: 'Data Generation', desc: 'Generate realistic synthetic data for any domain', icon: Sparkles },
                { title: 'PII Detection', desc: 'Automatic detection and masking of sensitive information', icon: Settings },
                { title: 'Referential Integrity', desc: 'Maintain FK relationships across generated tables', icon: Table2 },
                { title: 'Multi-Format Export', desc: 'JSON, CSV, SQL INSERT statements', icon: Download },
                { title: 'Iterative Refinement', desc: 'Refine and adjust data through conversation', icon: MessageSquare },
              ].map((cap, i) => (
                <div key={i} className="flex items-start gap-3 p-3 rounded-lg border bg-white">
                  <cap.icon className="h-5 w-5 text-amber-700 shrink-0 mt-0.5" />
                  <div>
                    <h4 className="text-sm font-semibold">{cap.title}</h4>
                    <p className="text-xs text-muted-foreground">{cap.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}

// ─── Render Helpers ──────────────────────────────────────
function renderAssistantContent(content: string): React.ReactNode {
  // Try to parse as structured agent response
  try {
    const jsonMatch = content.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0])
      if (parsed.explanation) {
        return (
          <div>
            <p className="mb-2">{parsed.explanation}</p>
            {parsed.tables && Object.keys(parsed.tables).length > 0 && (
              <div className="flex flex-wrap gap-1 mt-1">
                {Object.entries(parsed.tables).map(([name, rows]: [string, unknown]) => (
                  <Badge key={name} variant="secondary" className="text-xs">
                    {name}: {Array.isArray(rows) ? rows.length : 0} rows
                  </Badge>
                ))}
              </div>
            )}
          </div>
        )
      }
    }
  } catch { /* not structured */ }

  // Fallback: render as text with basic markdown-like formatting
  return content.split('\n').map((line, i) => {
    if (line.startsWith('```')) return null
    if (line.startsWith('--')) return <p key={i} className="text-muted-foreground italic">{line}</p>
    if (line.startsWith('INSERT')) return <p key={i} className="font-mono text-xs bg-white/50 rounded px-1">{line}</p>
    return <p key={i}>{line}</p>
  })
}
