'use client'

import React, { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Brain, Database, CheckCheck, Bot, Check, Loader2, XCircle, Clock3, Cpu,
  ChevronDown, ChevronRight, Eye, Wand2, Shield, Gauge, FileEdit, ArrowLeftRight, Search
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import type { AgentStepUI } from './types'

export const AgentPipeline = React.memo(function AgentPipeline({ steps }: { steps: AgentStepUI[] }) {
  const [isExpanded, setIsExpanded] = useState(true)
  if (!steps || steps.length === 0) return null

  const completedCount = steps.filter(s => s.status === 'completed' || s.status === 'failed').length
  const progress = steps.length > 0 ? (completedCount / steps.length) * 100 : 0
  const allCompleted = completedCount === steps.length

  const getAgentIcon = (agentName: string) => {
    if (agentName.includes('discovery')) return <Search className="h-3.5 w-3.5 text-purple-600" />
    if (agentName.includes('schema')) return <Brain className="h-3.5 w-3.5 text-purple-600" />
    if (agentName.includes('data')) return <Database className="h-3.5 w-3.5 text-blue-600" />
    if (agentName.includes('quality')) return <Shield className="h-3.5 w-3.5 text-green-600" />
    if (agentName.includes('validation')) return <Shield className="h-3.5 w-3.5 text-indigo-600" />
    if (agentName.includes('plan')) return <Eye className="h-3.5 w-3.5 text-sky-600" />
    if (agentName.includes('exec')) return <Wand2 className="h-3.5 w-3.5 text-amber-600" />
    if (agentName.includes('optimization')) return <Gauge className="h-3.5 w-3.5 text-orange-600" />
    if (agentName.includes('prompt-engineering') || agentName.includes('prompt_engineering')) return <FileEdit className="h-3.5 w-3.5 text-pink-600" />
    if (agentName.includes('transform')) return <ArrowLeftRight className="h-3.5 w-3.5 text-cyan-600" />
    if (agentName.includes('orchestrat')) return <Cpu className="h-3.5 w-3.5 text-indigo-600" />
    return <Bot className="h-3.5 w-3.5 text-slate-600" />
  }

  const getAgentColor = (agentName: string) => {
    if (agentName.includes('discovery')) return 'border-purple-200 bg-purple-50'
    if (agentName.includes('schema')) return 'border-purple-200 bg-purple-50'
    if (agentName.includes('data')) return 'border-blue-200 bg-blue-50'
    if (agentName.includes('quality')) return 'border-green-200 bg-green-50'
    if (agentName.includes('validation')) return 'border-indigo-200 bg-indigo-50'
    if (agentName.includes('plan')) return 'border-sky-200 bg-sky-50'
    if (agentName.includes('exec')) return 'border-amber-200 bg-amber-50'
    if (agentName.includes('optimization')) return 'border-orange-200 bg-orange-50'
    if (agentName.includes('prompt-engineering') || agentName.includes('prompt_engineering')) return 'border-pink-200 bg-pink-50'
    if (agentName.includes('transform')) return 'border-cyan-200 bg-cyan-50'
    if (agentName.includes('orchestrat')) return 'border-indigo-200 bg-indigo-50'
    return 'border-slate-200 bg-slate-50'
  }

  const getAgentBadgeColor = (agentName: string) => {
    if (agentName.includes('discovery')) return 'bg-purple-100 text-purple-800 border-purple-200'
    if (agentName.includes('schema')) return 'bg-purple-100 text-purple-800 border-purple-200'
    if (agentName.includes('data')) return 'bg-blue-100 text-blue-800 border-blue-200'
    if (agentName.includes('quality')) return 'bg-green-100 text-green-800 border-green-200'
    if (agentName.includes('validation')) return 'bg-indigo-100 text-indigo-800 border-indigo-200'
    if (agentName.includes('plan')) return 'bg-sky-100 text-sky-800 border-sky-200'
    if (agentName.includes('exec')) return 'bg-amber-100 text-amber-800 border-amber-200'
    if (agentName.includes('optimization')) return 'bg-orange-100 text-orange-800 border-orange-200'
    if (agentName.includes('prompt-engineering') || agentName.includes('prompt_engineering')) return 'bg-pink-100 text-pink-800 border-pink-200'
    if (agentName.includes('transform')) return 'bg-cyan-100 text-cyan-800 border-cyan-200'
    if (agentName.includes('orchestrat')) return 'bg-indigo-100 text-indigo-800 border-indigo-200'
    return 'bg-slate-100 text-slate-800 border-slate-200'
  }

  const getStatusIcon = (status: string) => {
    if (status === 'completed') return <Check className="h-3.5 w-3.5 text-green-600" />
    if (status === 'running') return <Loader2 className="h-3.5 w-3.5 text-amber-600 animate-spin" />
    if (status === 'failed') return <XCircle className="h-3.5 w-3.5 text-red-600" />
    return <Clock3 className="h-3.5 w-3.5 text-slate-400" />
  }

  const getStatusBadge = (status: string) => {
    if (status === 'completed') return <Badge className="text-[9px] bg-green-100 text-green-800 border-green-200">done</Badge>
    if (status === 'running') return <Badge className="text-[9px] bg-amber-100 text-amber-800 border-amber-200 gap-0.5"><Loader2 className="h-2 w-2 animate-spin" />running</Badge>
    if (status === 'failed') return <Badge className="text-[9px] bg-red-100 text-red-800 border-red-200">failed</Badge>
    return <Badge className="text-[9px] bg-slate-100 text-slate-600 border-slate-200">queued</Badge>
  }

  return (
    <div className="mt-3 pt-2 border-t border-border/50">
      <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
        <CollapsibleTrigger className="flex items-center gap-1.5 w-full text-left">
          {isExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
          <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <Cpu className="h-3.5 w-3.5" /> Multi-Agent Pipeline
          </div>
          <span className="text-[10px] text-muted-foreground ml-auto">
            {completedCount}/{steps.length} steps {allCompleted ? '✓' : ''}
          </span>
        </CollapsibleTrigger>

        <CollapsibleContent>
          {/* Progress bar */}
          <div className="h-1.5 bg-muted rounded-full overflow-hidden mb-3 mt-2">
            <motion.div
              className={`h-full rounded-full ${allCompleted ? 'bg-gradient-to-r from-green-500 to-green-600' : 'bg-gradient-to-r from-amber-500 to-amber-600'}`}
              initial={{ width: 0 }}
              animate={{ width: `${progress}%` }}
              transition={{ duration: 0.5, ease: 'easeOut' }}
            />
          </div>

          {/* Steps timeline */}
          <div className="space-y-2">
            <AnimatePresence>
              {steps.map((step, i) => (
                <motion.div
                  key={`${step.agent}-${i}`}
                  initial={{ opacity: 0, y: -8, scale: 0.97 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{ delay: i * 0.08, duration: 0.2 }}
                  className={`rounded-lg border p-2.5 ${getAgentColor(step.agent)} ${
                    step.status === 'running' ? 'ring-2 ring-amber-300 ring-offset-1' : ''
                  }`}
                >
                  <div className="flex items-start gap-2">
                    <div className="mt-0.5 shrink-0">{getStatusIcon(step.status)}</div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <Badge className={`text-[10px] gap-0.5 ${getAgentBadgeColor(step.agent)}`}>
                          {getAgentIcon(step.agent)} {step.agent}
                        </Badge>
                        {getStatusBadge(step.status)}
                        {step.tables && step.tables.length > 0 && step.status === 'completed' && (
                          <Badge className="text-[9px] bg-white/80 text-slate-700 border-slate-200 gap-0.5">
                            <Database className="h-2.5 w-2.5" /> {step.tables.length} table{step.tables.length > 1 ? 's' : ''}
                          </Badge>
                        )}
                      </div>
                      <p className="text-[11px] text-foreground font-medium mt-1">{step.task}</p>
                      {step.output && step.status === 'completed' && (
                        <p className="text-[10px] text-green-700 mt-1 leading-relaxed bg-green-50/50 rounded px-1.5 py-0.5">
                          {step.output.length > 200 ? step.output.slice(0, 200) + '...' : step.output}
                        </p>
                      )}
                      {step.output && step.status === 'failed' && (
                        <p className="text-[10px] text-red-700 mt-1 leading-relaxed bg-red-50/50 rounded px-1.5 py-0.5">
                          {step.output}
                        </p>
                      )}
                      {step.status === 'running' && (
                        <div className="flex items-center gap-1.5 mt-1">
                          <Loader2 className="h-2.5 w-2.5 animate-spin text-amber-600" />
                          <span className="text-[10px] text-amber-700">Processing...</span>
                        </div>
                      )}
                    </div>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  )
})
