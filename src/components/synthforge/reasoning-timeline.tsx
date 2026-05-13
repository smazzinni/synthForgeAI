'use client'

import React, { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ChevronDown, ChevronRight, Brain, Check, Loader2, AlertCircle, Circle,
  Search, GitBranch, Target, Database, Shield, Zap, Eye, Lightbulb, Cpu
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import type { ReasoningStep } from './types'

export const ReasoningTimeline = React.memo(function ReasoningTimeline({ steps, msgId }: { steps: ReasoningStep[]; msgId: string }) {
  const [isOpen, setIsOpen] = useState(false)
  if (!steps || steps.length === 0) return null

  const completedCount = steps.filter(s => s.status === 'completed').length
  const isRunning = steps.some(s => s.status === 'running')

  const getStepIcon = (type: string) => {
    switch (type) {
      case 'intent': return <Target className="h-3 w-3" />
      case 'domain_detection': return <Search className="h-3 w-3" />
      case 'entity_extraction': return <Database className="h-3 w-3" />
      case 'relationship_mapping': return <GitBranch className="h-3 w-3" />
      case 'constraint_planning': return <Shield className="h-3 w-3" />
      case 'data_strategy': return <Zap className="h-3 w-3" />
      case 'validation': return <Check className="h-3 w-3" />
      case 'execution': return <Cpu className="h-3 w-3" />
      case 'reflection': return <Lightbulb className="h-3 w-3" />
      default: return <Eye className="h-3 w-3" />
    }
  }

  const getStepColor = (type: string) => {
    switch (type) {
      case 'intent': return 'text-purple-600 bg-purple-50'
      case 'domain_detection': return 'text-blue-600 bg-blue-50'
      case 'entity_extraction': return 'text-cyan-600 bg-cyan-50'
      case 'relationship_mapping': return 'text-indigo-600 bg-indigo-50'
      case 'constraint_planning': return 'text-rose-600 bg-rose-50'
      case 'data_strategy': return 'text-amber-600 bg-amber-50'
      case 'validation': return 'text-green-600 bg-green-50'
      case 'execution': return 'text-orange-600 bg-orange-50'
      case 'reflection': return 'text-yellow-600 bg-yellow-50'
      default: return 'text-slate-600 bg-slate-50'
    }
  }

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <CollapsibleTrigger className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors mt-2 cursor-pointer group">
        {isOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        <Brain className="h-3 w-3 text-amber-600" />
        <span className="group-hover:text-foreground transition-colors">
          Agent Reasoning ({completedCount}/{steps.length})
        </span>
        {isRunning && <Loader2 className="h-2.5 w-2.5 animate-spin text-amber-500 ml-0.5" />}
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="mt-2 space-y-1.5 pl-1 relative">
          {/* Timeline connector line */}
          <div className="absolute left-[7px] top-2 bottom-2 w-px bg-border/50" />

          <AnimatePresence>
            {steps.map((step, i) => (
              <motion.div
                key={`${step.type}-${step.label}-${i}`}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.04, duration: 0.15 }}
                className="flex items-start gap-2.5 text-xs relative"
              >
                <div className="mt-0.5 shrink-0 relative z-10">
                  {step.status === 'completed' && (
                    <div className={`rounded-full p-0.5 ${getStepColor(step.type)}`}>
                      <Check className="h-2.5 w-2.5" />
                    </div>
                  )}
                  {step.status === 'running' && (
                    <div className="rounded-full p-0.5 bg-amber-50">
                      <Loader2 className="h-2.5 w-2.5 animate-spin text-amber-600" />
                    </div>
                  )}
                  {step.status === 'failed' && (
                    <div className="rounded-full p-0.5 bg-red-50">
                      <AlertCircle className="h-2.5 w-2.5 text-red-600" />
                    </div>
                  )}
                  {step.status === 'pending' && (
                    <div className="rounded-full p-0.5 bg-slate-50">
                      <Circle className="h-2.5 w-2.5 text-slate-300" />
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1 pb-0.5">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="font-medium text-foreground">{step.label}</span>
                    <Badge variant="outline" className={`text-[9px] px-1 py-0 h-3.5 font-mono ${getStepColor(step.type)} border-0`}>
                      {getStepIcon(step.type)} {step.type.replace(/_/g, ' ')}
                    </Badge>
                  </div>
                  <p className="text-muted-foreground text-[11px]">{step.description}</p>
                  {step.output && step.status === 'completed' && (
                    <p className="text-green-700 mt-0.5 font-mono text-[10px] leading-tight bg-green-50/50 rounded px-1 py-0.5 inline-block max-w-full truncate">
                      {step.output}
                    </p>
                  )}
                  {step.output && step.status === 'running' && (
                    <p className="text-amber-700 mt-0.5 font-mono text-[10px] leading-tight animate-pulse">
                      {step.output}
                    </p>
                  )}
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
})
