'use client'

import React from 'react'
import { Shield } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import type { PIICheck } from './types'

export const PIIShieldBadge = React.memo(function PIIShieldBadge({ piiCheck }: { piiCheck: PIICheck | null }) {
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
})
