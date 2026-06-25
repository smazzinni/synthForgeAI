'use client'

import {
  Sparkles,
  GitBranch,
  Database,
  CheckCircle2,
  Shield,
} from 'lucide-react'
import { getAgentByName } from '@/lib/ai-agents'

// ─── Agent icon helper ───
// Renders a colored circle with the agent's icon. Used in the chat header
// and message bubbles.

export function AgentIcon({ agentName, size = 'sm' }: { agentName?: string; size?: 'sm' | 'md' }) {
  const agent = getAgentByName(agentName || '')
  const sizeClass = size === 'sm' ? 'h-5 w-5' : 'h-6 w-6'
  const iconSize = size === 'sm' ? 'h-2.5 w-2.5' : 'h-3 w-3'

  if (agent?.id === 'schema_architect') {
    return (
      <div className={`${sizeClass} rounded-full bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shrink-0`}>
        <GitBranch className={`${iconSize} text-white`} />
      </div>
    )
  }
  if (agent?.id === 'data_generator') {
    return (
      <div className={`${sizeClass} rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shrink-0`}>
        <Database className={`${iconSize} text-white`} />
      </div>
    )
  }
  if (agent?.id === 'quality_analyst') {
    return (
      <div className={`${sizeClass} rounded-full bg-gradient-to-br from-sky-500 to-blue-600 flex items-center justify-center shrink-0`}>
        <CheckCircle2 className={`${iconSize} text-white`} />
      </div>
    )
  }
  if (agent?.id === 'privacy_officer') {
    return (
      <div className={`${sizeClass} rounded-full bg-gradient-to-br from-rose-500 to-pink-600 flex items-center justify-center shrink-0`}>
        <Shield className={`${iconSize} text-white`} />
      </div>
    )
  }
  // Default: Orchestrator
  return (
    <div className={`${sizeClass} rounded-full bg-gradient-to-br from-amber-500 to-red-600 flex items-center justify-center shrink-0`}>
      <Sparkles className={`${iconSize} text-white`} />
    </div>
  )
}
