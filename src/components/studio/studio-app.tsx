'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ChatPanel } from '@/components/studio/chat-panel'
import { DataPanel } from '@/components/studio/data-panel'
import { AgentPipeline } from '@/components/studio/agent-pipeline'
import {
  FlaskConical,
  MessageSquare,
  Table2,
  Workflow,
  PanelLeftClose,
  PanelLeftOpen,
  Database,
} from 'lucide-react'

export interface StudioMessage {
  id: string
  role: 'user' | 'assistant' | 'system' | 'agent'
  content: string
  agentName?: string
  reasoningSteps?: Array<{
    type: string
    label: string
    description: string
    status: 'pending' | 'running' | 'completed' | 'failed'
    output?: string
  }>
  options?: Array<{
    id: string
    label: string
    value: string
    description?: string
  }>
  tables?: Record<string, Record<string, unknown>[]>
  sqlCode?: string
  timestamp: Date
}

export interface AgentState {
  name: string
  label: string
  status: 'idle' | 'running' | 'completed' | 'failed'
  description: string
}

const initialAgents: AgentState[] = [
  { name: 'discovery', label: 'Discovery', status: 'idle', description: 'Gathering requirements' },
  { name: 'schema', label: 'Schema', status: 'idle', description: 'Designing database schema' },
  { name: 'generation', label: 'Generation', status: 'idle', description: 'Generating synthetic data' },
  { name: 'validation', label: 'Validation', status: 'idle', description: 'Validating constraints' },
  { name: 'quality', label: 'Quality', status: 'idle', description: 'Quality assurance review' },
]

export function StudioApp() {
  const [messages, setMessages] = useState<StudioMessage[]>([])
  const [agents, setAgents] = useState<AgentState[]>(initialAgents)
  const [currentData, setCurrentData] = useState<Record<string, Record<string, unknown>[]> | null>(null)
  const [currentSchema, setCurrentSchema] = useState<Record<string, unknown>[] | null>(null)
  const [isGenerating, setIsGenerating] = useState(false)
  const [showSidebar, setShowSidebar] = useState(true)
  const [activeTab, setActiveTab] = useState('chat')

  const addMessage = useCallback((message: Omit<StudioMessage, 'id' | 'timestamp'>) => {
    const newMsg: StudioMessage = {
      ...message,
      id: `msg-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      timestamp: new Date(),
    }
    setMessages(prev => [...prev, newMsg])

    // Update data/schema if present
    if (message.tables) {
      setCurrentData(message.tables)
    }
    if ((message as { schemaPlan?: Record<string, unknown> }).schemaPlan) {
      setCurrentSchema([(message as { schemaPlan: Record<string, unknown> }).schemaPlan])
    }

    return newMsg.id
  }, [])

  const updateAgentStatus = useCallback((name: string, status: AgentState['status']) => {
    setAgents(prev => prev.map(a => a.name === name ? { ...a, status } : a))
  }, [])

  const handleSendMessage = useCallback(async (content: string) => {
    // Add user message
    addMessage({ role: 'user', content })

    setIsGenerating(true)

    try {
      // Update discovery agent
      updateAgentStatus('discovery', 'running')

      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [
            ...messages.map(m => ({ role: m.role, content: m.content })),
            { role: 'user', content },
          ],
        }),
      })

      if (!response.ok) {
        throw new Error('Failed to get response')
      }

      const data = await response.json()

      updateAgentStatus('discovery', 'completed')

      // Parse the agent response
      const agentResponse = data.response || data
      const action = agentResponse.action || 'generate'
      const agentName = agentResponse.agentName || 'auto-agent'

      // Update pipeline based on action
      if (action === 'discovery') {
        updateAgentStatus('discovery', 'completed')
      } else if (action === 'plan' || action === 'generate' || action === 'preview') {
        updateAgentStatus('schema', 'completed')
        if (action === 'generate' || action === 'preview') {
          updateAgentStatus('generation', 'completed')
          updateAgentStatus('validation', 'completed')
          updateAgentStatus('quality', 'completed')
        }
      }

      addMessage({
        role: 'agent',
        content: agentResponse.explanation || 'Processing your request...',
        agentName,
        reasoningSteps: agentResponse.reasoningSteps,
        options: agentResponse.options,
        tables: agentResponse.tables || agentResponse.previewTables,
        sqlCode: agentResponse.sqlCode,
      })
    } catch (error) {
      updateAgentStatus('discovery', 'failed')
      addMessage({
        role: 'assistant',
        content: 'I apologize, but I encountered an error processing your request. Please try again.',
      })
    } finally {
      setIsGenerating(false)
    }
  }, [messages, addMessage, updateAgentStatus])

  const handleOptionSelect = useCallback(async (option: { value: string; label: string }) => {
    await handleSendMessage(option.label || option.value)
  }, [handleSendMessage])

  return (
    <div className="flex h-[calc(100vh-8rem)] gap-4">
      {/* Pipeline sidebar */}
      {showSidebar && (
        <div className="w-64 shrink-0 hidden lg:block">
          <Card className="h-full p-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <Workflow className="h-4 w-4" />
                Agent Pipeline
              </h3>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => setShowSidebar(false)}
              >
                <PanelLeftClose className="h-4 w-4" />
              </Button>
            </div>
            <AgentPipeline agents={agents} />
          </Card>
        </div>
      )}

      {/* Main content area */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-3">
          {!showSidebar && (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0"
              onClick={() => setShowSidebar(true)}
            >
              <PanelLeftOpen className="h-4 w-4" />
            </Button>
          )}
          <div className="flex items-center gap-2">
            <FlaskConical className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold">AI Studio</h2>
          </div>
          {isGenerating && (
            <Badge variant="secondary" className="gap-1 animate-pulse">
              <div className="h-2 w-2 rounded-full bg-primary animate-pulse" />
              Generating...
            </Badge>
          )}
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="h-[calc(100%-2.5rem)]">
          <TabsList>
            <TabsTrigger value="chat" className="gap-1.5">
              <MessageSquare className="h-3.5 w-3.5" />
              Chat
            </TabsTrigger>
            <TabsTrigger value="data" className="gap-1.5">
              <Table2 className="h-3.5 w-3.5" />
              Data
              {currentData && (
                <Badge variant="secondary" className="ml-1 text-xs px-1.5 py-0">
                  {Object.keys(currentData).length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="schema" className="gap-1.5">
              <Database className="h-3.5 w-3.5" />
              Schema
            </TabsTrigger>
          </TabsList>

          <TabsContent value="chat" className="h-[calc(100%-2.5rem)] mt-3">
            <ChatPanel
              messages={messages}
              onSendMessage={handleSendMessage}
              onOptionSelect={handleOptionSelect}
              isGenerating={isGenerating}
            />
          </TabsContent>

          <TabsContent value="data" className="h-[calc(100%-2.5rem)] mt-3">
            <DataPanel data={currentData} />
          </TabsContent>

          <TabsContent value="schema" className="h-[calc(100%-2.5rem)] mt-3">
            <SchemaViewer schema={currentSchema} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}

// Simple schema viewer component
function SchemaViewer({ schema }: { schema: Record<string, unknown>[] | null }) {
  if (!schema || schema.length === 0) {
    return (
      <Card className="h-full flex items-center justify-center">
        <div className="text-center text-muted-foreground p-8">
          <Database className="h-12 w-12 mx-auto mb-4 opacity-50" />
          <p className="text-lg font-medium">No schema generated yet</p>
          <p className="text-sm">Start a conversation in the Chat tab to generate a database schema.</p>
        </div>
      </Card>
    )
  }

  return (
    <Card className="h-full overflow-auto p-4">
      <div className="space-y-4">
        {schema.map((table, i) => {
          const tableName = (table as Record<string, unknown>).name as string || `Table ${i + 1}`
          const columns = (table as Record<string, unknown>).columns as Array<Record<string, unknown>> || []
          return (
            <div key={i} className="border rounded-lg p-4">
              <h3 className="font-semibold text-sm mb-3 flex items-center gap-2">
                <Table2 className="h-4 w-4 text-primary" />
                {tableName}
              </h3>
              <div className="space-y-1">
                {columns.map((col, j) => (
                  <div key={j} className="flex items-center gap-2 text-xs font-mono py-1 px-2 rounded bg-muted/50">
                    <span className="font-medium">{col.name as string}</span>
                    <span className="text-muted-foreground">{col.type as string}</span>
                    {Array.isArray(col.constraints) && (col.constraints as string[]).map((c: string) => (
                      <Badge key={c} variant="secondary" className="text-xs px-1 py-0">{c}</Badge>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </Card>
  )
}
