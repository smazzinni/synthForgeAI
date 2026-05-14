'use client'

import React, { useState, useRef, useCallback, useMemo } from 'react'
import ReactMarkdown from 'react-markdown'
import { motion } from 'framer-motion'
import {
  MessageSquare, Send, ChevronRight, ChevronDown,
  Table2, Download, Copy, Sparkles,
  Code2, FileJson, FileText, Plus, X, Check,
  Loader2, Hash, Play, Brain, Wand2, AlertCircle, Circle,
  RefreshCw, Shield, Gauge, Ban, StopCircle,
  CheckCircle2, XCircle
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ScrollArea as ScrollAreaComponent } from '@/components/ui/scroll-area'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { messageSlideIn, staggerContainer, staggerItem } from './constants'
import type { Message, ClarificationOption, ReasoningStep, AgentStepUI, QualityScore, PIICheck } from './types'

function AnimatedDots() {
  const [dots, setDots] = useState('.')
  React.useEffect(() => {
    const interval = setInterval(() => {
      setDots(prev => prev.length >= 3 ? '.' : prev + '.')
    }, 400)
    return () => clearInterval(interval)
  }, [])
  return <span>{dots}</span>
}

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

// ─── Chat Message component (memoized) ────────────────────
const ChatMessage = React.memo(function ChatMessage({
  msg,
  onRetry,
  onRegenerate,
  onSendMessage,
  onCopyToClipboard,
  agentSteps,
  isLoading,
  exportData,
  copyAllData,
}: {
  msg: Message
  onRetry: (id: string) => void
  onRegenerate: (id: string) => void
  onSendMessage: (text: string) => void
  onCopyToClipboard: (text: string) => void
  agentSteps: AgentStepUI[]
  isLoading: boolean
  exportData: (tables: Record<string, Record<string, unknown>[]>, format: string) => void
  copyAllData: (tables: Record<string, Record<string, unknown>[]>, format: string) => void
}) {
  const [expandedReasoning, setExpandedReasoning] = useState<Record<string, boolean>>({})
  const [expandedSql, setExpandedSql] = useState<Record<string, boolean>>({})

  const isUser = msg.role === 'user'

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

  if (isUser) {
    return (
      <motion.div {...messageSlideIn} className="flex justify-end">
        <div className="max-w-[90%] bg-gradient-to-br from-amber-600 to-red-700 text-white rounded-xl rounded-br-sm px-3 py-2 shadow-sm relative">
          <p className="text-xs whitespace-pre-wrap">{msg.content}</p>
          {msg.isError && (
            <div className="mt-2 pt-1.5 border-t border-white/20 flex items-center gap-2">
              <AlertCircle className="h-3 w-3 text-red-200" />
              <span className="text-[10px] text-red-200">Failed to send</span>
              <Button
                variant="ghost"
                size="sm"
                className="h-5 text-[10px] px-2 text-white hover:bg-white/20"
                onClick={() => onRetry(msg.id)}
                aria-label="Retry sending message"
              >
                <RefreshCw className="h-2.5 w-2.5 mr-1" /> Retry
              </Button>
            </div>
          )}
        </div>
      </motion.div>
    )
  }

  // Assistant message
  let parsedOptions: ClarificationOption[] = []
  let parsedSteps: ReasoningStep[] = []
  try { parsedOptions = JSON.parse(msg.options || '[]') } catch { /* */ }
  try { parsedSteps = JSON.parse(msg.reasoningSteps || '[]') } catch { /* */ }

  let hasGeneratedTables = false
  let tablesFromMsg: Record<string, Record<string, unknown>[]> = {}
  try {
    tablesFromMsg = JSON.parse(msg.tablesJson || '{}')
    hasGeneratedTables = Object.keys(tablesFromMsg).length > 0
  } catch { /* */ }

  const renderStatusBadge = () => {
    if (msg.isStreaming && !msg.content) {
      return (
        <Badge className="text-[10px] bg-amber-100 text-amber-800 border-amber-200 gap-1">
          <Loader2 className="h-2.5 w-2.5 animate-spin" /> Processing
        </Badge>
      )
    }
    if (msg.isStreaming && msg.content) {
      return (
        <Badge className="text-[10px] bg-sky-100 text-sky-800 border-sky-200 gap-1">
          <Loader2 className="h-2.5 w-2.5 animate-spin" /> Generating
        </Badge>
      )
    }
    if (msg.generationStatus === 'completed') {
      return (
        <Badge className="text-[10px] bg-green-100 text-green-800 border-green-200 gap-1">
          <CheckCircle2 className="h-2.5 w-2.5" /> Completed
        </Badge>
      )
    }
    if (msg.generationStatus === 'failed' || msg.isError) {
      return (
        <Badge className="text-[10px] bg-red-100 text-red-800 border-red-200 gap-1">
          <XCircle className="h-2.5 w-2.5" /> Failed
        </Badge>
      )
    }
    if (msg.isCancelled || msg.generationStatus === 'cancelled') {
      return (
        <Badge className="text-[10px] bg-gray-100 text-gray-700 border-gray-300 gap-1">
          <Ban className="h-2.5 w-2.5" /> Cancelled
        </Badge>
      )
    }
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
          {msg.tokensIn > 0 && (
            <span className="text-[9px] text-muted-foreground">
              {msg.tokensIn + msg.tokensOut} tok
            </span>
          )}
          {!msg.isStreaming && !msg.isCancelled && msg.generationStatus === 'completed' && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-5 w-5 p-0 text-muted-foreground hover:text-amber-700 hover:bg-amber-50"
                    onClick={() => onRegenerate(msg.id)}
                    aria-label="Regenerate response"
                  >
                    <RefreshCw className="h-2.5 w-2.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Regenerate response</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>

        {msg.isStreaming && !msg.content ? (
          <div className="space-y-2">
            {parsedSteps.length > 0 ? (
              <div className="mt-1">
                <div className="flex items-center gap-1 text-xs text-muted-foreground mb-2">
                  <Loader2 className="h-4 w-4 animate-spin text-amber-600" />
                  <span className="font-medium">Agent Reasoning</span>
                </div>
                <div className="space-y-1.5 pl-1">
                  {parsedSteps.map((step, i) => (
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
              </div>
            ) : (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin text-amber-600" />
                <span>Thinking<AnimatedDots /></span>
              </div>
            )}
          </div>
        ) : (
          <>
            {renderAssistantContent(msg.content)}
            {msg.isCancelled && msg.content && (
              <div className="mt-2 pt-1.5 border-t border-border/50 flex items-center gap-1.5 text-xs text-muted-foreground">
                <Ban className="h-3 w-3" />
                <span>Generation was cancelled. Partial content shown above.</span>
              </div>
            )}
          </>
        )}

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
                <ScrollAreaComponent className="max-h-36">
                  <pre className="bg-slate-900 text-green-400 p-2 rounded-md text-[10px] font-mono overflow-x-auto">
                    <code>{msg.sqlCode}</code>
                  </pre>
                </ScrollAreaComponent>
                <div className="absolute top-1 right-1 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-5 w-5 p-0 bg-slate-800 text-slate-300 hover:text-white"
                    onClick={() => onCopyToClipboard(msg.sqlCode)}
                    aria-label="Copy SQL code"
                  >
                    <Copy className="h-2.5 w-2.5" />
                  </Button>
                </div>
              </div>
            </CollapsibleContent>
          </Collapsible>
        )}

        {/* Reasoning Timeline */}
        {parsedSteps.length > 0 && (
          <Collapsible open={expandedReasoning[msg.id] ?? false} onOpenChange={(o) => setExpandedReasoning(prev => ({ ...prev, [msg.id]: o }))}>
            <CollapsibleTrigger className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors mt-2 cursor-pointer">
              {expandedReasoning[msg.id] ?? false ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
              <Brain className="h-3 w-3" /> Reasoning ({parsedSteps.length})
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="mt-2 space-y-1.5 pl-1">
                {parsedSteps.map((step, i) => (
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
        )}

        {/* Clarification Options */}
        {parsedOptions.length > 0 && (
          <div className="mt-3 space-y-2">
            <p className="text-xs font-medium text-muted-foreground">Choose an option:</p>
            <div className="flex flex-wrap gap-2">
              {parsedOptions.map((opt) => (
                <motion.div key={opt.id} whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-auto py-1.5 px-3 text-xs hover:bg-amber-50 hover:border-amber-300 transition-colors"
                    onClick={() => onSendMessage(opt.value)}
                    disabled={isLoading}
                  >
                    {opt.label}
                  </Button>
                </motion.div>
              ))}
            </div>
          </div>
        )}

        {/* Quick Actions */}
        {hasGeneratedTables && !msg.isStreaming && (
          <div className="flex flex-wrap gap-1.5 mt-3 pt-2 border-t border-border/50">
            <Button
              variant="outline"
              size="sm"
              className="h-6 text-[11px] gap-1 hover:bg-amber-50 hover:border-amber-300"
              onClick={() => exportData(tablesFromMsg, 'json')}
              aria-label="Export as JSON"
            >
              <FileJson className="h-3 w-3" /> Export JSON
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-6 text-[11px] gap-1 hover:bg-amber-50 hover:border-amber-300"
              onClick={() => exportData(tablesFromMsg, 'csv')}
              aria-label="Export as CSV"
            >
              <FileText className="h-3 w-3" /> Export CSV
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-6 text-[11px] gap-1 hover:bg-amber-50 hover:border-amber-300"
              onClick={() => copyAllData(tablesFromMsg, 'json')}
              aria-label="Copy data to clipboard"
            >
              <Copy className="h-3 w-3" /> Copy
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-6 text-[11px] gap-1 hover:bg-amber-50 hover:border-amber-300"
              onClick={() => onSendMessage('Add more rows to each table')}
              disabled={isLoading}
              aria-label="Add more data"
            >
              <Plus className="h-3 w-3" /> Add More
            </Button>
          </div>
        )}
      </div>
    </motion.div>
  )
})

// ─── Chat Messages List ────────────────────────────────────
interface ChatMessagesProps {
  messages: Message[]
  isLoading: boolean
  onRetry: (id: string) => void
  onRegenerate: (id: string) => void
  onSendMessage: (text: string) => void
  onCopyToClipboard: (text: string) => void
  agentSteps: AgentStepUI[]
  exportData: (tables: Record<string, Record<string, unknown>[]>, format: string) => void
  copyAllData: (tables: Record<string, Record<string, unknown>[]>, format: string) => void
  chatScrollRef: React.RefObject<HTMLDivElement | null>
  messagesEndRef: React.RefObject<HTMLDivElement | null>
  showScrollToBottom: boolean
  isOnline: boolean
  onScrollToBottom: () => void
}

export const ChatMessages = React.memo(function ChatMessages({
  messages,
  isLoading,
  onRetry,
  onRegenerate,
  onSendMessage,
  onCopyToClipboard,
  agentSteps,
  exportData,
  copyAllData,
  chatScrollRef,
  messagesEndRef,
  showScrollToBottom,
  isOnline,
  onScrollToBottom,
}: ChatMessagesProps) {
  return (
    <div className="flex flex-col h-full border-r min-w-[280px]">
      {/* Offline Banner */}
      {!isOnline && (
        <div className="bg-red-50 border-b border-red-200 px-3 py-1.5 flex items-center gap-2 shrink-0" role="alert">
          <span className="text-xs text-red-700">You are offline. Some features may not work.</span>
        </div>
      )}

      {/* Messages Area */}
      <div ref={chatScrollRef} className="flex-1 overflow-y-auto chat-scroll-area" style={{ scrollBehavior: 'smooth' }}>
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

              <motion.div
                variants={staggerContainer}
                initial="initial"
                animate="animate"
                className="grid grid-cols-1 gap-1.5 w-full"
              >
                {[
                  { icon: <Hash className="h-3 w-3" />, text: 'Generate sample data' },
                  { icon: <Table2 className="h-3 w-3" />, text: 'Create a database schema' },
                  { icon: <MessageSquare className="h-3 w-3" />, text: 'Design tables with relationships' },
                  { icon: <Code2 className="h-3 w-3" />, text: 'Generate 50 rows of data' }
                ].map((suggestion, i) => (
                  <motion.button
                    key={i}
                    variants={staggerItem}
                    whileHover={{ scale: 1.01, y: -1 }}
                    whileTap={{ scale: 0.98 }}
                    className="flex items-center gap-2 p-2 rounded-md border bg-card hover:bg-muted/50 transition-colors text-left text-xs text-muted-foreground hover:text-foreground"
                    onClick={() => onSendMessage(suggestion.text)}
                  >
                    {suggestion.icon}
                    <span>{suggestion.text}</span>
                  </motion.button>
                ))}
              </motion.div>
            </motion.div>
          )}

          {messages.map((msg) => (
            <ChatMessage
              key={msg.id}
              msg={msg}
              onRetry={onRetry}
              onRegenerate={onRegenerate}
              onSendMessage={onSendMessage}
              onCopyToClipboard={onCopyToClipboard}
              agentSteps={agentSteps}
              isLoading={isLoading}
              exportData={exportData}
              copyAllData={copyAllData}
            />
          ))}

          {/* Loading Indicator - only show if no streaming message already visible */}
          {isLoading && !messages.some(m => m.isStreaming || m.generationStatus === 'thinking') && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex justify-start"
            >
              <div className="bg-muted/50 rounded-2xl rounded-bl-md px-3 py-2.5 flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin text-amber-600" />
                <span className="text-sm text-muted-foreground">Processing<AnimatedDots /></span>
              </div>
            </motion.div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Scroll to Bottom Button */}
        {showScrollToBottom && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            className="absolute bottom-16 left-1/2 -translate-x-1/2 z-10"
          >
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 w-7 p-0 rounded-full shadow-md bg-background border-amber-200 hover:bg-amber-50"
                    onClick={onScrollToBottom}
                    aria-label="Scroll to bottom"
                  >
                    <ChevronDown className="h-3.5 w-3.5 text-amber-700" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Scroll to bottom</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </motion.div>
        )}
      </div>
    </div>
  )
})
