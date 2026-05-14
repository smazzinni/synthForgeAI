'use client'

import React from 'react'
import { Brain, Play, Wand2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'

export const AgentBadge = React.memo(function AgentBadge({ name }: { name: string }) {
  const isPlan = name.includes('plan')
  const isExec = name.includes('exec')
  const color = isPlan ? 'bg-sky-100 text-sky-800 border-sky-200' : isExec ? 'bg-emerald-100 text-emerald-800 border-emerald-200' : 'bg-amber-100 text-amber-800 border-amber-200'
  const icon = isPlan ? <Brain className="h-3 w-3" /> : isExec ? <Play className="h-3 w-3" /> : <Wand2 className="h-3 w-3" />
  return (
    <Badge className={`text-xs ${color} gap-1`}>
      {icon} {name}
    </Badge>
  )
})
