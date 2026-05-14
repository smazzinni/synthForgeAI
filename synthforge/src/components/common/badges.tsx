'use client'

import React from 'react'
import { Gauge, AlertCircle, Shield, Brain, Play, Wand2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import type { PIICheck } from '@/lib/types'

export function QualityBadge({ score }: { score: number }) {
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

export function PIIShieldBadge({ piiCheck }: { piiCheck: PIICheck | null }) {
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

export function AgentBadge({ name }: { name: string }) {
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
