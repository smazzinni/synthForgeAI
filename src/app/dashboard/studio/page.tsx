'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Send,
  Loader2,
  Database,
  Table2,
  Shield,
  Brain,
  Workflow,
  Sparkles,
  ChevronDown,
  Copy,
  Download,
  Bot,
  User,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react'

interface Message {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  agentName?: string
  reasoningSteps?: string[]
  tables?: { name: string; columns: { name: string; type: string }[] }[]
  data?: Record<string, unknown[]>
  timestamp: Date
}

interface ChatState {
  messages: Message[]
  loading: boolean
  currentAgent: string | null
}

const mockSchema = [
  { name: 'users', columns: [
    { name: 'id', type: 'uuid' },
    { name: 'email', type: 'varchar(255)' },
    { name: 'full_name', type: 'varchar(255)' },
    { name: 'created_at', type: 'timestamp' },
  ]},
  { name: 'orders', columns: [
    { name: 'id', type: 'uuid' },
    { name: 'user_id', type: 'uuid' },
    { name: 'total', type: 'decimal(10,2)' },
    { name: 'status', type: 'varchar(50)' },
    { name: 'created_at', type: 'timestamp' },
  ]},
]

const mockData = {
  users: [
    { id: 'a1b2c3d4', email: 'sarah.johnson@example.com', full_name: 'Sarah Johnson', created_at: '2026-01-15' },
    { id: 'e5f6g7h8', email: 'michael.chen@example.com', full_name: 'Michael Chen', created_at: '2026-02-03' },
    { id: 'i9j0k1l2', email: 'emma.wilson@example.com', full_name: 'Emma Wilson', created_at: '2026-02-20' },
    { id: 'm3n4o5p6', email: 'james.davis@example.com', full_name: 'James Davis', created_at: '2026-03-10' },
    { id: 'q7r8s9t0', email: 'olivia.brown@example.com', full_name: 'Olivia Brown', created_at: '2026-03-22' },
  ],
  orders: [
    { id: 'ord-001', user_id: 'a1b2c3d4', total: '$129.99', status: 'completed', created_at: '2026-03-01' },
    { id: 'ord-002', user_id: 'e5f6g7h8', total: '$59.50', status: 'pending', created_at: '2026-03-05' },
    { id: 'ord-003', user_id: 'i9j0k1l2', total: '$245.00', status: 'completed', created_at: '2026-03-08' },
    { id: 'ord-004', user_id: 'm3n4o5p6', total: '$89.99', status: 'shipped', created_at: '2026-03-12' },
  ],
}

const agentPipeline = [
  { name: 'Discovery', icon: Brain, status: 'complete', description: 'Understood requirements' },
  { name: 'Schema', icon: Database, status: 'complete', description: 'Designed schema' },
  { name: 'Generation', icon: Workflow, status: 'active', description: 'Generating data...' },
  { name: 'Validation', icon: CheckCircle2, status: 'pending', description: 'Quality check' },
  { name: 'PII Shield', icon: Shield, status: 'pending', description: 'Privacy scan' },
]

export default function StudioPage() {
  const [chatState, setChatState] = useState<ChatState>({
    messages: [
      {
        id: '1',
        role: 'assistant',
        content: 'Welcome to SynthForge AI Studio! I can help you generate synthetic data. Describe the database you need, and I\'ll design the schema, generate realistic data, and ensure quality compliance.\n\nFor example, try: "Generate an e-commerce database with users, orders, and products"',
        agentName: 'Orchestrator',
        timestamp: new Date(),
      },
    ],
    loading: false,
    currentAgent: null,
  })
  const [input, setInput] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chatState.messages])

  const sendMessage = useCallback(async () => {
    if (!input.trim() || chatState.loading) return

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input.trim(),
      timestamp: new Date(),
    }

    setChatState((prev) => ({
      ...prev,
      messages: [...prev.messages, userMessage],
      loading: true,
      currentAgent: 'Discovery',
    }))
    setInput('')

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: userMessage.content }),
      })

      if (!response.ok) throw new Error('Failed to get response')

      const reader = response.body?.getReader()
      const decoder = new TextDecoder()
      let assistantContent = ''

      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: '',
        agentName: 'Orchestrator',
        tables: [],
        timestamp: new Date(),
      }

      setChatState((prev) => ({
        ...prev,
        messages: [...prev.messages, assistantMessage],
      }))

      if (reader) {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          const chunk = decoder.decode(value, { stream: true })
          const lines = chunk.split('\n')

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = line.slice(6).trim()
              if (data === '[DONE]') continue

              try {
                const parsed = JSON.parse(data)
                if (parsed.content) {
                  assistantContent += parsed.content
                  setChatState((prev) => ({
                    ...prev,
                    messages: prev.messages.map((m) =>
                      m.id === assistantMessage.id
                        ? { ...m, content: assistantContent }
                        : m
                    ),
                  }))
                }
                if (parsed.agent) {
                  setChatState((prev) => ({
                    ...prev,
                    currentAgent: parsed.agent,
                    messages: prev.messages.map((m) =>
                      m.id === assistantMessage.id
                        ? { ...m, agentName: parsed.agent }
                        : m
                    ),
                  }))
                }
              } catch {
                // Not JSON, treat as plain text
                assistantContent += data
                setChatState((prev) => ({
                  ...prev,
                  messages: prev.messages.map((m) =>
                    m.id === assistantMessage.id
                      ? { ...m, content: assistantContent }
                      : m
                  ),
                }))
              }
            }
          }
        }
      }
    } catch {
      // Fallback: generate a mock response
      const fallbackMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: 'I\'ll create a synthetic database based on your requirements. Here\'s what I\'ve designed:\n\n**Schema:**\n- `users` table with id, email, full_name, created_at\n- `orders` table with id, user_id, total, status, created_at\n\nI\'ve generated 5 users and 4 orders with realistic data. Check the Data tab to see the results!',
        agentName: 'Schema Agent',
        tables: mockSchema,
        data: mockData,
        timestamp: new Date(),
      }
      setChatState((prev) => ({
        ...prev,
        messages: [...prev.messages.filter((m) => m.role !== 'assistant' || m.content), fallbackMessage],
      }))
    } finally {
      setChatState((prev) => ({ ...prev, loading: false, currentAgent: null }))
    }
  }, [input, chatState.loading])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  return (
    <div className="flex h-screen">
      {/* Chat Panel */}
      <div className="flex flex-col w-full md:w-1/2 border-r">
        {/* Chat Header */}
        <div className="p-4 border-b flex items-center justify-between">
          <div>
            <h2 className="font-semibold">AI Studio</h2>
            <p className="text-xs text-muted-foreground">
              {chatState.currentAgent ? `Agent: ${chatState.currentAgent}` : 'Multi-Agent Pipeline Active'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {agentPipeline.map((agent) => (
              <div
                key={agent.name}
                className={`h-2 w-2 rounded-full ${
                  agent.status === 'complete'
                    ? 'bg-emerald-500'
                    : agent.status === 'active'
                    ? 'bg-amber-500 animate-pulse'
                    : 'bg-muted'
                }`}
                title={`${agent.name}: ${agent.description}`}
              />
            ))}
          </div>
        </div>

        {/* Messages */}
        <ScrollArea className="flex-1 p-4">
          <div className="space-y-4">
            {chatState.messages.map((message) => (
              <div
                key={message.id}
                className={`flex gap-3 ${message.role === 'user' ? 'justify-end' : ''}`}
              >
                {message.role !== 'user' && (
                  <div className="h-8 w-8 rounded-full bg-gradient-to-br from-amber-500 to-red-600 flex items-center justify-center shrink-0">
                    <Bot className="h-4 w-4 text-white" />
                  </div>
                )}
                <div
                  className={`max-w-[85%] rounded-xl px-4 py-3 ${
                    message.role === 'user'
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted'
                  }`}
                >
                  {message.agentName && message.role !== 'user' && (
                    <p className="text-xs font-medium text-amber-600 mb-1">{message.agentName}</p>
                  )}
                  <div className="text-sm whitespace-pre-wrap">{message.content}</div>
                </div>
                {message.role === 'user' && (
                  <div className="h-8 w-8 rounded-full bg-primary flex items-center justify-center shrink-0">
                    <User className="h-4 w-4 text-primary-foreground" />
                  </div>
                )}
              </div>
            ))}
            {chatState.loading && (
              <div className="flex gap-3">
                <div className="h-8 w-8 rounded-full bg-gradient-to-br from-amber-500 to-red-600 flex items-center justify-center shrink-0">
                  <Bot className="h-4 w-4 text-white" />
                </div>
                <div className="bg-muted rounded-xl px-4 py-3">
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                </div>
              </div>
            )}
            <div ref={scrollRef} />
          </div>
        </ScrollArea>

        {/* Input */}
        <div className="p-4 border-t">
          <div className="flex gap-2">
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Describe the data you need..."
              disabled={chatState.loading}
              className="flex-1"
            />
            <Button
              onClick={sendMessage}
              disabled={chatState.loading || !input.trim()}
              className="bg-gradient-to-r from-amber-600 to-red-600 hover:from-amber-700 hover:to-red-700 text-white"
            >
              {chatState.loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      </div>

      {/* Data Panel */}
      <div className="hidden md:flex flex-col w-1/2">
        <Tabs defaultValue="schema" className="flex flex-col h-full">
          <div className="p-4 border-b">
            <TabsList className="w-full">
              <TabsTrigger value="schema" className="flex-1">
                <Database className="h-4 w-4 mr-2" />
                Schema
              </TabsTrigger>
              <TabsTrigger value="data" className="flex-1">
                <Table2 className="h-4 w-4 mr-2" />
                Data
              </TabsTrigger>
              <TabsTrigger value="quality" className="flex-1">
                <Shield className="h-4 w-4 mr-2" />
                Quality
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="schema" className="flex-1 overflow-auto m-0 p-4">
            <div className="space-y-4">
              {mockSchema.map((table) => (
                <Card key={table.name}>
                  <CardHeader className="pb-3">
                    <div className="flex items-center gap-2">
                      <Table2 className="h-4 w-4 text-amber-600" />
                      <CardTitle className="text-base">{table.name}</CardTitle>
                      <Badge variant="outline" className="text-xs">{table.columns.length} columns</Badge>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-1">
                      {table.columns.map((col) => (
                        <div key={col.name} className="flex items-center justify-between py-1 px-2 rounded hover:bg-muted text-sm">
                          <span className="font-mono">{col.name}</span>
                          <Badge variant="secondary" className="text-xs font-mono">{col.type}</Badge>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="data" className="flex-1 overflow-auto m-0 p-4">
            <div className="space-y-4">
              {Object.entries(mockData).map(([tableName, rows]) => (
                <Card key={tableName}>
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Table2 className="h-4 w-4 text-amber-600" />
                        <CardTitle className="text-base">{tableName}</CardTitle>
                      </div>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" className="h-7 w-7">
                          <Copy className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7">
                          <Download className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b">
                            {Object.keys(rows[0] || {}).map((key) => (
                              <th key={key} className="text-left py-2 px-3 font-medium text-muted-foreground">
                                {key}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {rows.map((row, i) => (
                            <tr key={i} className="border-b last:border-0 hover:bg-muted/50">
                              {Object.values(row).map((val, j) => (
                                <td key={j} className="py-2 px-3 font-mono text-xs">
                                  {String(val)}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="quality" className="flex-1 overflow-auto m-0 p-4">
            <div className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Quality Report</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Overall Score</span>
                    <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">95%</Badge>
                  </div>
                  <div className="space-y-3">
                    {[
                      { label: 'Data Realism', score: 97 },
                      { label: 'Referential Integrity', score: 100 },
                      { label: 'PII Compliance', score: 95 },
                      { label: 'Statistical Distribution', score: 89 },
                    ].map((item) => (
                      <div key={item.label} className="space-y-1">
                        <div className="flex items-center justify-between text-sm">
                          <span>{item.label}</span>
                          <span className={item.score >= 90 ? 'text-emerald-600' : 'text-amber-600'}>{item.score}%</span>
                        </div>
                        <div className="h-2 rounded-full bg-muted overflow-hidden">
                          <div
                            className={`h-full rounded-full ${item.score >= 90 ? 'bg-emerald-500' : 'bg-amber-500'}`}
                            style={{ width: `${item.score}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Agent Pipeline</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {agentPipeline.map((agent) => (
                      <div key={agent.name} className="flex items-center gap-3">
                        <div className={`h-8 w-8 rounded-lg flex items-center justify-center ${
                          agent.status === 'complete' ? 'bg-emerald-100 dark:bg-emerald-900/30' :
                          agent.status === 'active' ? 'bg-amber-100 dark:bg-amber-900/30' :
                          'bg-muted'
                        }`}>
                          <agent.icon className={`h-4 w-4 ${
                            agent.status === 'complete' ? 'text-emerald-600' :
                            agent.status === 'active' ? 'text-amber-600' :
                            'text-muted-foreground'
                          }`} />
                        </div>
                        <div className="flex-1">
                          <p className="text-sm font-medium">{agent.name}</p>
                          <p className="text-xs text-muted-foreground">{agent.description}</p>
                        </div>
                        {agent.status === 'complete' && <CheckCircle2 className="h-4 w-4 text-emerald-500" />}
                        {agent.status === 'active' && <Loader2 className="h-4 w-4 text-amber-500 animate-spin" />}
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
