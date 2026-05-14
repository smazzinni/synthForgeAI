'use client'

import { CheckCircle2, Loader2, XCircle, Clock } from 'lucide-react'
import type { AgentState } from '@/components/studio/studio-app'

interface AgentPipelineProps {
  agents: AgentState[]
}

const statusIcons: Record<string, React.ReactNode> = {
  idle: <Clock className="h-4 w-4 text-muted-foreground" />,
  running: <Loader2 className="h-4 w-4 text-primary animate-spin" />,
  completed: <CheckCircle2 className="h-4 w-4 text-green-500" />,
  failed: <XCircle className="h-4 w-4 text-destructive" />,
}

const statusColors: Record<string, string> = {
  idle: 'border-border',
  running: 'border-primary bg-primary/5',
  completed: 'border-green-500/30 bg-green-500/5',
  failed: 'border-destructive/30 bg-destructive/5',
}

export function AgentPipeline({ agents }: AgentPipelineProps) {
  return (
    <div className="space-y-2">
      {agents.map((agent, i) => (
        <div key={agent.name}>
          <div
            className={`flex items-center gap-3 p-3 rounded-lg border transition-all ${statusColors[agent.status]}`}
          >
            {statusIcons[agent.status]}
            <div className="min-w-0">
              <p className={`text-sm font-medium ${
                agent.status === 'running' ? 'text-primary' : ''
              }`}>
                {agent.label}
              </p>
              <p className="text-xs text-muted-foreground truncate">
                {agent.status === 'running' ? 'Processing...' : agent.description}
              </p>
            </div>
          </div>

          {/* Connector line */}
          {i < agents.length - 1 && (
            <div className="flex justify-center py-1">
              <div className="w-px h-4 bg-border" />
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
