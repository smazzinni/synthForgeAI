'use client'

import React from 'react'
import { Gauge, AlertCircle } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'

export const QualityBadge = React.memo(function QualityBadge({ score }: { score: number }) {
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
})
