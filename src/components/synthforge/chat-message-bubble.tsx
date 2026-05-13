'use client'

import React, { useState } from 'react'
import ReactMarkdown from 'react-markdown'
import { motion } from 'framer-motion'
import {
  Loader2, RefreshCw, AlertCircle, CheckCircle2, XCircle, Ban,
  ChevronDown, ChevronRight, Code2, Copy
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { AnimatedDots } from './animated-dots'
import { AgentBadge } from './agent-badge'
import { QualityBadge } from './quality-badge'
import { PIIShieldBadge } from './pii-shield-badge'
import { ReasoningTimeline } from './reasoning-timeline'
import { ClarificationOptions } from './clarification-options'
import { QuickActions } from './quick-actions'
import { AgentPipeline } from './agent-pipeline'
import { messageSlideIn } from './types'
import type { Message, ReasoningStep, ClarificationOption, AgentStepUI } from './types'

export const ChatMessageBubble = React.memo(function ChatMessageBubble({
  msg,
  onRetry,
  onRegenerate,
  onCopyToClipboard,
  onSendMessage,
  allTables,
  onExportData,
  onCopyAllData,
  isLoading,
  agentSteps
}: {
  msg: Message
  onRetry: (msgId: string) => void
  onRegenerate: (msgId: string) => void
  onCopyToClipboard: (text: string) => void
  onSendMessage: (message: string) => void
  allTables: Record<string, Record<string, unknown>[]>
  onExportData: (tables: Record<string, Record<string, unknown>[]>, format: string) => void
  onCopyAllData: (tables: Record<string, Record<string, unknown>[]>, format: string) => void
  isLoading: boolean
  agentSteps: AgentStepUI[]
}) {
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
  try {
    const tables = JSON.parse(msg.tablesJson || '{}')
    hasGeneratedTables = Object.keys(tables).length > 0
  } catch { /* */ }

  const renderStatusBadge = () => {
    if (msg.isStreaming && !msg.content) {
      return (
        <Badge className="text-[10px] bg-amber-100 text-amber-800 border-amber-200 gap-1">
          <Loader2 className="h-2.5 w-2.5 animate-spin" /> Thinking<AnimatedDots />
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
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin text-amber-600" />
              <span>Thinking<AnimatedDots /></span>
            </div>
            {/* Show real-time reasoning steps while thinking */}
            {parsedSteps.length > 0 && (
              <div className="mt-1">
                <ReasoningTimeline steps={parsedSteps} msgId={msg.id} />
              </div>
            )}
          </div>
        ) : (
          <>
            {renderAssistantContent(msg.content)}
            {/* Show reasoning steps during and after generation */}
            {msg.isStreaming && parsedSteps.length > 0 && (
              <div className="mt-1">
                <ReasoningTimeline steps={parsedSteps} msgId={msg.id} />
              </div>
            )}
            {/* Show agent pipeline during multi-step execution */}
            {msg.isStreaming && agentSteps.length > 0 && <AgentPipeline steps={agentSteps} />}
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

        <ReasoningTimeline steps={parsedSteps} msgId={msg.id} />
        {agentSteps.length > 0 && <AgentPipeline steps={agentSteps} />}
        <ClarificationOptions options={parsedOptions} onSelectOption={onSendMessage} isLoading={isLoading} />
        {hasGeneratedTables && !msg.isStreaming && (
          <QuickActions
            msg={msg}
            allTables={allTables}
            onExportData={onExportData}
            onCopyAllData={onCopyAllData}
            onSendMessage={onSendMessage}
            isLoading={isLoading}
          />
        )}
      </div>
    </motion.div>
  )
})
