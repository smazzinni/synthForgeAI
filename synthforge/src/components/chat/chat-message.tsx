'use client'

import React from 'react'
import ReactMarkdown from 'react-markdown'
import { motion } from 'framer-motion'
import {
  ChevronRight, ChevronDown, Code2, Copy, RefreshCw,
  Loader2, AlertCircle, Circle, Check, Ban, Plus,
  FileJson, FileText, StopCircle, CheckCircle2, XCircle,
  Brain, Paperclip, X
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { useAppStore } from '@/stores/app-store'
import { AnimatedDots } from '@/components/common/animated-dots'
import { QualityBadge, PIIShieldBadge, AgentBadge } from '@/components/common/badges'
import { AgentPipeline } from '@/components/visualization/agent-pipeline'
import type { Message, ReasoningStep, ClarificationOption, SchemaDef } from '@/lib/types'
import { messageSlideIn } from '@/lib/constants'

interface ChatMessageProps {
  msg: Message
  onRetry: (msgId: string) => void
  onRegenerate: (msgId: string) => void
  onSendMessage: (text: string) => void
  onCopyToClipboard: (text: string) => void
  allTables: Record<string, Record<string, unknown>[]>
  onExportData: (tables: Record<string, Record<string, unknown>[]>, format: string) => void
  onCopyAllData: (tables: Record<string, Record<string, unknown>[]>, format: string) => void
}

// ─── ReasoningTimeline ───────────────────────────────────
const ReasoningTimeline = React.memo(function ReasoningTimeline({ steps, msgId }: { steps: ReasoningStep[]; msgId: string }) {
  const expandedReasoning = useAppStore((s) => s.expandedReasoning)
  const setExpandedReasoning = useAppStore((s) => s.setExpandedReasoning)
  const isOpen = expandedReasoning[msgId] ?? true
  if (!steps || steps.length === 0) return null
  const firstOutput = steps.find(s => s.output)?.output
  return (
    <Collapsible open={isOpen} onOpenChange={(o) => setExpandedReasoning(prev => ({ ...prev, [msgId]: o }))}>
      <CollapsibleTrigger className="flex items-center gap-1.5 text-xs text-amber-700 hover:text-amber-900 transition-colors mt-2 cursor-pointer bg-amber-50/60 hover:bg-amber-100/60 rounded-md px-2 py-1 border border-amber-200/50">
        {isOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        <Brain className="h-3.5 w-3.5" /> <span className="font-medium">Chain of Reasoning ({steps.length} steps)</span>
      </CollapsibleTrigger>
      {!isOpen && firstOutput && (
        <p className="text-[10px] text-muted-foreground mt-1 pl-6 truncate">{firstOutput}</p>
      )}
      <CollapsibleContent>
        <div className="mt-2 space-y-1.5 pl-1 border-l-2 border-amber-200 ml-1">
          {steps.map((step, i) => (
            <motion.div key={i} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.08, duration: 0.3 }} className="flex items-start gap-2 text-xs ml-2">
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
                {step.output && <p className="text-green-700 mt-0.5 font-mono text-[11px] leading-tight">{step.output}</p>}
              </div>
            </motion.div>
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
})

// ─── ClarificationOptions ────────────────────────────────
const ClarificationOptions = React.memo(function ClarificationOptions({ options, onSendMessage, isLoading }: { options: ClarificationOption[]; onSendMessage: (text: string) => void; isLoading: boolean }) {
  if (!options || options.length === 0) return null
  return (
    <div className="mt-3 space-y-2">
      <p className="text-xs font-medium text-muted-foreground">Choose an option:</p>
      <div className="flex flex-wrap gap-2">
        {options.map((opt) => (
          <motion.div key={opt.id} whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}>
            <Button variant="outline" size="sm" className="h-auto py-2 px-3 text-xs hover:bg-amber-50 hover:border-amber-300 transition-colors group flex flex-col items-start gap-0.5" onClick={() => onSendMessage(opt.value)} disabled={isLoading}>
              <span className="font-medium">{opt.label}</span>
              {opt.description && <span className="text-[10px] text-muted-foreground group-hover:text-amber-600">{opt.description}</span>}
            </Button>
          </motion.div>
        ))}
      </div>
    </div>
  )
})

// ─── QuickActions ────────────────────────────────────────
const QuickActions = React.memo(function QuickActions({ allTables, onExportData, onCopyAllData, onSendMessage, isLoading }: {
  allTables: Record<string, Record<string, unknown>[]>
  onExportData: (tables: Record<string, Record<string, unknown>[]>, format: string) => void
  onCopyAllData: (tables: Record<string, Record<string, unknown>[]>, format: string) => void
  onSendMessage: (text: string) => void
  isLoading: boolean
}) {
  if (Object.keys(allTables).length === 0) return null
  return (
    <div className="flex flex-wrap gap-1.5 mt-3 pt-2 border-t border-border/50">
      <Button variant="outline" size="sm" className="h-6 text-[11px] gap-1 hover:bg-amber-50 hover:border-amber-300" onClick={() => onExportData(allTables, 'json')} aria-label="Export as JSON"><FileJson className="h-3 w-3" /> Export JSON</Button>
      <Button variant="outline" size="sm" className="h-6 text-[11px] gap-1 hover:bg-amber-50 hover:border-amber-300" onClick={() => onExportData(allTables, 'csv')} aria-label="Export as CSV"><FileText className="h-3 w-3" /> Export CSV</Button>
      <Button variant="outline" size="sm" className="h-6 text-[11px] gap-1 hover:bg-amber-50 hover:border-amber-300" onClick={() => onCopyAllData(allTables, 'json')} aria-label="Copy data"><Copy className="h-3 w-3" /> Copy</Button>
      <Button variant="outline" size="sm" className="h-6 text-[11px] gap-1 hover:bg-amber-50 hover:border-amber-300" onClick={() => onSendMessage('Add more rows to each table')} disabled={isLoading} aria-label="Add more data"><Plus className="h-3 w-3" /> Add More</Button>
    </div>
  )
})

// ─── renderAssistantContent ──────────────────────────────
function renderAssistantContent(content: string) {
  let displayContent = content
  try {
    const jsonMatch = content.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0])
      if (parsed.explanation) displayContent = parsed.explanation
    }
  } catch { /* use raw content */ }
  return (
    <div className="prose prose-sm max-w-none dark:prose-invert prose-p:my-1 prose-headings:my-2 prose-pre:my-1 prose-pre:bg-white prose-pre:border prose-code:text-xs">
      <ReactMarkdown>{displayContent}</ReactMarkdown>
    </div>
  )
}

// ─── ChatMessage ─────────────────────────────────────────
export const ChatMessage = React.memo(function ChatMessage({
  msg, onRetry, onRegenerate, onSendMessage, onCopyToClipboard, allTables, onExportData, onCopyAllData
}: ChatMessageProps) {
  const isLoading = useAppStore((s) => s.isLoading)
  const agentSteps = useAppStore((s) => s.agentSteps)
  const expandedSql = useAppStore((s) => s.expandedSql)
  const setExpandedSql = useAppStore((s) => s.setExpandedSql)

  const isUser = msg.role === 'user'
  if (isUser) {
    return (
      <motion.div {...messageSlideIn} className="flex justify-end">
        <div className="max-w-[90%] bg-gradient-to-br from-amber-600 to-red-700 text-white rounded-xl rounded-br-sm px-3 py-2 shadow-sm relative">
          <p className="text-xs whitespace-pre-wrap">{msg.content}</p>
          {msg.isError && (
            <div className="mt-2 pt-1.5 border-t border-white/20 flex items-center gap-2">
              <AlertCircle className="h-3 w-3 text-red-200" />
              <span className="text-[10px] text-red-200">Failed to send</span>
              <Button variant="ghost" size="sm" className="h-5 text-[10px] px-2 text-white hover:bg-white/20" onClick={() => onRetry(msg.id)} aria-label="Retry sending message">
                <RefreshCw className="h-2.5 w-2.5 mr-1" /> Retry
              </Button>
            </div>
          )}
        </div>
      </motion.div>
    )
  }

  let parsedOptions: ClarificationOption[] = []
  let parsedSteps: ReasoningStep[] = []
  try { parsedOptions = JSON.parse(msg.options || '[]') } catch { /* */ }
  try { parsedSteps = JSON.parse(msg.reasoningSteps || '[]') } catch { /* */ }

  let hasGeneratedTables = false
  try {
    const tables = JSON.parse(msg.tablesJson || '{}')
    hasGeneratedTables = Object.keys(tables).length > 0
  } catch { /* */ }

  const renderStatusBadge = () => {
    if (msg.isStreaming && !msg.content) return (<Badge className="text-[10px] bg-amber-100 text-amber-800 border-amber-200 gap-1"><Loader2 className="h-2.5 w-2.5 animate-spin" /> Thinking<AnimatedDots /></Badge>)
    if (msg.isStreaming && msg.content) return (<Badge className="text-[10px] bg-sky-100 text-sky-800 border-sky-200 gap-1"><Loader2 className="h-2.5 w-2.5 animate-spin" /> Generating</Badge>)
    if (msg.generationStatus === 'completed') return (<Badge className="text-[10px] bg-green-100 text-green-800 border-green-200 gap-1"><CheckCircle2 className="h-2.5 w-2.5" /> Completed</Badge>)
    if (msg.generationStatus === 'failed' || msg.isError) return (<Badge className="text-[10px] bg-red-100 text-red-800 border-red-200 gap-1"><XCircle className="h-2.5 w-2.5" /> Failed</Badge>)
    if (msg.isCancelled || msg.generationStatus === 'cancelled') return (<Badge className="text-[10px] bg-gray-100 text-gray-700 border-gray-300 gap-1"><Ban className="h-2.5 w-2.5" /> Cancelled</Badge>)
    return null
  }

  return (
    <motion.div {...messageSlideIn} className="flex justify-start">
      <div className="max-w-[95%] bg-muted/50 rounded-xl rounded-bl-sm px-3 py-2.5 shadow-sm">
        <div className="flex items-center gap-1.5 mb-1.5 flex-wrap">
          <AgentBadge name={msg.agentName} />
          {msg.qualityScore && <QualityBadge score={msg.qualityScore.overall} />}
          <PIIShieldBadge piiCheck={msg.piiCheck || null} />
          {renderStatusBadge()}
          {msg.tokensIn > 0 && (<span className="text-[9px] text-muted-foreground">{msg.tokensIn + msg.tokensOut} tok</span>)}
          {!msg.isStreaming && (msg.generationStatus === 'completed' || msg.generationStatus === 'failed' || msg.generationStatus === 'cancelled' || msg.isCancelled || msg.isError) && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-5 w-5 p-0 text-muted-foreground hover:text-amber-700 hover:bg-amber-50" onClick={() => onRegenerate(msg.id)} aria-label="Regenerate response">
                    <RefreshCw className="h-2.5 w-2.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Regenerate response</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>
        {msg.isStreaming && !msg.content ? (
          <div className="h-2" />
        ) : (
          <>
            {renderAssistantContent(msg.content)}
            {msg.isCancelled && msg.content && (<div className="mt-2 pt-1.5 border-t border-border/50 flex items-center gap-1.5 text-xs text-muted-foreground"><Ban className="h-3 w-3" /><span>Generation was cancelled. Partial content shown above.</span></div>)}
          </>
        )}
        {msg.sqlCode && (
          <Collapsible open={expandedSql[msg.id] ?? false} onOpenChange={(o) => setExpandedSql(prev => ({ ...prev, [msg.id]: o }))}>
            <CollapsibleTrigger className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors mt-2 cursor-pointer">
              {expandedSql[msg.id] ?? false ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
              <Code2 className="h-3 w-3" /> SQL
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="mt-1 relative group">
                <ScrollArea className="max-h-36">
                  <pre className="bg-slate-900 text-green-400 p-2 rounded-md text-[10px] font-mono overflow-x-auto"><code>{msg.sqlCode}</code></pre>
                </ScrollArea>
                <div className="absolute top-1 right-1 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Button variant="ghost" size="sm" className="h-5 w-5 p-0 bg-slate-800 text-slate-300 hover:text-white" onClick={() => onCopyToClipboard(msg.sqlCode)} aria-label="Copy SQL code"><Copy className="h-2.5 w-2.5" /></Button>
                </div>
              </div>
            </CollapsibleContent>
          </Collapsible>
        )}
        <ReasoningTimeline steps={parsedSteps} msgId={msg.id} />
        {agentSteps.length > 0 && <AgentPipeline steps={agentSteps} />}
        <ClarificationOptions options={parsedOptions} onSendMessage={onSendMessage} isLoading={isLoading} />
        {hasGeneratedTables && !msg.isStreaming && <QuickActions allTables={allTables} onExportData={onExportData} onCopyAllData={onCopyAllData} onSendMessage={onSendMessage} isLoading={isLoading} />}
      </div>
    </motion.div>
  )
})
