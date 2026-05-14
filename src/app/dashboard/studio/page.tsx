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
  Sparkles,
  Copy,
  Download,
  Bot,
  User,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react'
import { toast } from 'sonner'

interface Message {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  agentName?: string
  timestamp: Date
}

interface ChatState {
  messages: Message[]
  loading: boolean
  currentAgent: string | null
}

// Schema type derived from AI responses
interface SchemaTable {
  name: string
  columns: { name: string; type: string }[]
}

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
  const [generatedSchema, setGeneratedSchema] = useState<SchemaTable[]>([])
  const [generatedData, setGeneratedData] = useState<Record<string, unknown[]>>({})
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chatState.messages])

  // Try to parse schema/data from assistant message content
  const tryParseResponse = useCallback((content: string) => {
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0])

        // Extract schema
        if (parsed.tables) {
          const schema: SchemaTable[] = []
          for (const [tableName, tableData] of Object.entries(parsed.tables)) {
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
          if (schema.length > 0) setGeneratedSchema(schema)
        }

        // Extract data
        if (parsed.tables) {
          const data: Record<string, unknown[]> = {}
          for (const [tableName, tableData] of Object.entries(parsed.tables)) {
            if (Array.isArray(tableData)) {
              data[tableName] = tableData
            }
          }
          if (Object.keys(data).length > 0) setGeneratedData(data)
        }
      }
    } catch {
      // Not JSON or couldn't parse - that's fine
    }
  }, [])

  const hasGeneratedData = generatedSchema.length > 0 || Object.keys(generatedData).length > 0

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

      const data = await response.json()

      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: data.content || 'No response generated.',
        agentName: data.agent || 'Orchestrator',
        timestamp: new Date(),
      }

      setChatState((prev) => ({
        ...prev,
        messages: [...prev.messages, assistantMessage],
        loading: false,
        currentAgent: null,
      }))

      // Try to extract schema/data from the response
      tryParseResponse(assistantMessage.content)
    } catch {
      // Error - show error message in chat
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: 'Sorry, I encountered an error connecting to the AI service. Please try again.',
        agentName: 'System',
        timestamp: new Date(),
      }
      setChatState((prev) => ({
        ...prev,
        messages: [...prev.messages, errorMessage],
        loading: false,
        currentAgent: null,
      }))
    }
  }, [input, chatState.loading, tryParseResponse])

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
            {hasGeneratedData ? (
              <Badge variant="outline" className="text-xs gap-1">
                <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                Data Generated
              </Badge>
            ) : (
              <Badge variant="outline" className="text-xs gap-1">
                <Sparkles className="h-3 w-3 text-amber-500" />
                Ready
              </Badge>
            )}
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

      {/* Data Panel - only shows when data has been generated */}
      <div className="hidden md:flex flex-col w-1/2">
        {hasGeneratedData ? (
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
                {generatedSchema.map((table) => (
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
                {Object.entries(generatedData).map(([tableName, rows]) => (
                  <Card key={tableName}>
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Table2 className="h-4 w-4 text-amber-600" />
                          <CardTitle className="text-base">{tableName}</CardTitle>
                          <Badge variant="outline" className="text-xs">{rows.length} rows</Badge>
                        </div>
                        <div className="flex gap-1">
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => copyToClipboard(JSON.stringify(rows, null, 2))}>
                            <Copy className="h-3.5 w-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => downloadJSON(rows, `${tableName}.json`)}>
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
                                <th key={key} className="text-left py-2 px-3 font-medium text-muted-foreground whitespace-nowrap">
                                  {key}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {rows.map((row, i) => (
                              <tr key={i} className="border-b last:border-0 hover:bg-muted/50">
                                {Object.values(row as Record<string, unknown>).map((val, j) => (
                                  <td key={j} className="py-2 px-3 font-mono text-xs whitespace-nowrap">
                                    {String(val ?? '')}
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
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Shield className="h-5 w-5 text-amber-600" />
                      Quality Report
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-center py-8 text-muted-foreground">
                      <CheckCircle2 className="h-10 w-10 mx-auto mb-3 text-emerald-500" />
                      <p className="font-medium">Data Generated Successfully</p>
                      <p className="text-sm mt-1">Quality analysis will be available once the data pipeline completes.</p>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>
          </Tabs>
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-center p-8">
            <Database className="h-16 w-16 text-muted-foreground/20 mb-4" />
            <h3 className="text-lg font-medium text-muted-foreground mb-2">No Data Yet</h3>
            <p className="text-sm text-muted-foreground max-w-xs">
              Describe the database you need in the chat, and the AI will generate the schema and data for you.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
