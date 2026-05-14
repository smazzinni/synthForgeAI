'use client'

import React, { useState, useMemo, useRef } from 'react'
import { motion } from 'framer-motion'
import { CheckCircle2, XCircle, Check, Loader2, Clock3, Bot, Cpu, Database, BarChart3, Code2, Eye, Brain } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import type { AgentStepUI } from '@/lib/types'

interface AgentPipelineProps {
  steps: AgentStepUI[]
}

export const AgentPipeline = React.memo(function AgentPipeline({ steps }: AgentPipelineProps) {
  if (!steps || steps.length === 0) return null
  const completedCount = steps.filter(s => s.status === 'completed' || s.status === 'failed').length
  const progress = steps.length > 0 ? (completedCount / steps.length) * 100 : 0
  const [pipelineStartTime] = useState(Date.now())
  const [pipelineElapsed, setPipelineElapsed] = useState('')

  React.useEffect(() => {
    if (completedCount >= steps.length) return
    const interval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - pipelineStartTime) / 1000)
      const mins = Math.floor(elapsed / 60)
      const secs = elapsed % 60
      setPipelineElapsed(mins > 0 ? `${mins}m ${secs}s` : `${secs}s`)
    }, 1000)
    return () => clearInterval(interval)
  }, [completedCount, steps.length, pipelineStartTime])

  const getAgentIcon = (agentName: string) => {
    if (agentName.includes('schema')) return <Brain className="h-3.5 w-3.5" />
    if (agentName.includes('data')) return <Database className="h-3.5 w-3.5" />
    if (agentName.includes('quality')) return <Check className="h-3.5 w-3.5" />
    if (agentName.includes('sql')) return <Code2 className="h-3.5 w-3.5" />
    if (agentName.includes('analysis')) return <BarChart3 className="h-3.5 w-3.5" />
    if (agentName.includes('viz')) return <Eye className="h-3.5 w-3.5" />
    return <Bot className="h-3.5 w-3.5" />
  }

  const getStatusIcon = (status: string) => {
    if (status === 'completed') return <Check className="h-3 w-3 text-green-600" />
    if (status === 'running') return <Loader2 className="h-3 w-3 text-amber-600 animate-spin" />
    if (status === 'failed') return <XCircle className="h-3 w-3 text-red-600" />
    return <Clock3 className="h-3 w-3 text-slate-400" />
  }

  return (
    <div className="mt-3 pt-2 border-t border-border/50">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <Cpu className="h-3.5 w-3.5" /> Agent Pipeline
          {completedCount < steps.length && (
            <motion.div
              animate={{ opacity: [0.5, 1, 0.5] }}
              transition={{ duration: 1.5, repeat: Infinity }}
              className="w-1.5 h-1.5 rounded-full bg-amber-500"
            />
          )}
        </div>
        <div className="flex items-center gap-2">
          {pipelineElapsed && completedCount < steps.length && (
            <span className="text-[10px] text-amber-600 font-mono flex items-center gap-0.5">
              <Clock3 className="h-2.5 w-2.5" /> {pipelineElapsed}
            </span>
          )}
          <span className="text-[10px] text-muted-foreground">
            Step {completedCount}/{steps.length}
          </span>
        </div>
      </div>
      <div className="h-1.5 bg-muted rounded-full overflow-hidden mb-2">
        <motion.div
          className="h-full bg-gradient-to-r from-amber-500 to-amber-600 rounded-full"
          initial={{ width: 0 }}
          animate={{ width: `${progress}%` }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
        />
      </div>
      <div className="space-y-1.5">
        {steps.map((step, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.1 }}
            className="flex items-start gap-2"
          >
            <div className="mt-0.5 shrink-0">{getStatusIcon(step.status)}</div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-medium">{getAgentIcon(step.agent)} {step.agent}</span>
                <Badge variant="outline" className="text-[9px] px-1 py-0 h-3.5">
                  {step.status}
                </Badge>
              </div>
              <p className="text-[11px] text-muted-foreground">{step.task}</p>
              {step.output && step.status === 'completed' && (
                <p className="text-[10px] text-green-700 mt-0.5 font-mono leading-tight truncate max-w-[300px]">
                  {step.output}
                </p>
              )}
              {step.output && step.status === 'failed' && (
                <p className="text-[10px] text-red-700 mt-0.5 font-mono leading-tight truncate max-w-[300px]">
                  {step.output}
                </p>
              )}
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  )
})
