'use client'

import React from 'react'
import { Brain, Play, Wand2, Gauge, FileEdit, ArrowLeftRight, Search, ShieldCheck, Database } from 'lucide-react'
import { Badge } from '@/components/ui/badge'

const AGENT_CONFIG: Record<string, { color: string; icon: React.ReactNode; label: string }> = {
  'plan': { color: 'bg-sky-100 text-sky-800 border-sky-200', icon: <Brain className="h-3 w-3" />, label: 'Plan' },
  'exec': { color: 'bg-emerald-100 text-emerald-800 border-emerald-200', icon: <Play className="h-3 w-3" />, label: 'Execute' },
  'auto': { color: 'bg-amber-100 text-amber-800 border-amber-200', icon: <Wand2 className="h-3 w-3" />, label: 'Auto' },
  'discovery': { color: 'bg-purple-100 text-purple-800 border-purple-200', icon: <Search className="h-3 w-3" />, label: 'Discovery' },
  'schema': { color: 'bg-blue-100 text-blue-800 border-blue-200', icon: <Database className="h-3 w-3" />, label: 'Schema' },
  'data': { color: 'bg-teal-100 text-teal-800 border-teal-200', icon: <Database className="h-3 w-3" />, label: 'Data' },
  'validation': { color: 'bg-indigo-100 text-indigo-800 border-indigo-200', icon: <ShieldCheck className="h-3 w-3" />, label: 'Validation' },
  'quality': { color: 'bg-green-100 text-green-800 border-green-200', icon: <ShieldCheck className="h-3 w-3" />, label: 'Quality' },
  'optimization': { color: 'bg-orange-100 text-orange-800 border-orange-200', icon: <Gauge className="h-3 w-3" />, label: 'Optimization' },
  'prompt-engineering': { color: 'bg-pink-100 text-pink-800 border-pink-200', icon: <FileEdit className="h-3 w-3" />, label: 'Prompt Eng' },
  'transform': { color: 'bg-cyan-100 text-cyan-800 border-cyan-200', icon: <ArrowLeftRight className="h-3 w-3" />, label: 'Transform' },
  'orchestrator': { color: 'bg-violet-100 text-violet-800 border-violet-200', icon: <Wand2 className="h-3 w-3" />, label: 'Orchestrator' },
}

export const AgentBadge = React.memo(function AgentBadge({ name }: { name: string }) {
  const key = Object.keys(AGENT_CONFIG).find(k => name.includes(k)) || 'auto'
  const config = AGENT_CONFIG[key]
  
  return (
    <Badge className={`text-xs ${config.color} gap-1`}>
      {config.icon} {config.label}
    </Badge>
  )
})
