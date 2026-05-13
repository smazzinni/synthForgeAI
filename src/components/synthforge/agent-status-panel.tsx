'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Brain, Database, Shield, Eye, Wand2, Cpu, Activity,
  Check, Loader2, XCircle, Clock3, Wifi, WifiOff,
  ChevronDown, ChevronRight, Heart, Zap, Target,
  Server, RefreshCw, AlertTriangle, BarChart3
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Progress } from '@/components/ui/progress'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { Skeleton } from '@/components/ui/skeleton'

// ─── Types ──────────────────────────────────────────────────────

interface AgentInfo {
  id: string
  name: string
  role: string
  phase: number
  status: 'available' | 'busy' | 'offline' | 'error'
  skills: Array<{ id: string; name: string; category: string }>
  activeTasks: number
  maxConcurrency: number
  tasksCompleted: number
  tasksFailed: number
  avgExecutionTimeMs: number
  lastHeartbeat: string
  isHealthy?: boolean
}

interface SkillInfo {
  id: string
  name: string
  category: string
  description: string
  assignedAgent: string
  estimatedDurationMs: number
}

interface RegistrySummary {
  totalAgents: number
  available: number
  busy: number
  offline: number
  error: number
  totalSkills: number
  totalTasksCompleted: number
  totalTasksFailed: number
}

// ─── Agent Icon & Color Helpers ──────────────────────────────────

function getAgentIcon(agentId: string) {
  if (agentId.includes('discovery')) return <Eye className="h-4 w-4 text-sky-600" />
  if (agentId.includes('schema')) return <Brain className="h-4 w-4 text-purple-600" />
  if (agentId.includes('data')) return <Database className="h-4 w-4 text-blue-600" />
  if (agentId.includes('validation')) return <Shield className="h-4 w-4 text-orange-600" />
  if (agentId.includes('quality')) return <Check className="h-4 w-4 text-green-600" />
  if (agentId.includes('orchestrat')) return <Cpu className="h-4 w-4 text-indigo-600" />
  return <Brain className="h-4 w-4 text-slate-600" />
}

function getStatusColor(status: string) {
  switch (status) {
    case 'available': return 'bg-green-100 text-green-800 border-green-200'
    case 'busy': return 'bg-amber-100 text-amber-800 border-amber-200'
    case 'offline': return 'bg-slate-100 text-slate-600 border-slate-200'
    case 'error': return 'bg-red-100 text-red-800 border-red-200'
    default: return 'bg-slate-100 text-slate-600 border-slate-200'
  }
}

function getStatusIcon(status: string, isHealthy: boolean) {
  switch (status) {
    case 'available': return isHealthy
      ? <Wifi className="h-3 w-3 text-green-600" />
      : <AlertTriangle className="h-3 w-3 text-amber-600" />
    case 'busy': return <Loader2 className="h-3 w-3 text-amber-600 animate-spin" />
    case 'offline': return <WifiOff className="h-3 w-3 text-slate-400" />
    case 'error': return <XCircle className="h-3 w-3 text-red-600" />
    default: return <Clock3 className="h-3 w-3 text-slate-400" />
  }
}

function getPhaseLabel(phase: number) {
  switch (phase) {
    case 1: return 'Discovery'
    case 2: return 'Schema'
    case 3: return 'Generation'
    default: return 'Unknown'
  }
}

function getPhaseColor(phase: number) {
  switch (phase) {
    case 1: return 'bg-sky-100 text-sky-800 border-sky-200'
    case 2: return 'bg-purple-100 text-purple-800 border-purple-200'
    case 3: return 'bg-blue-100 text-blue-800 border-blue-200'
    default: return 'bg-slate-100 text-slate-600 border-slate-200'
  }
}

function getCategoryColor(category: string) {
  switch (category) {
    case 'discovery': return 'bg-sky-50 text-sky-700 border-sky-200'
    case 'schema': return 'bg-purple-50 text-purple-700 border-purple-200'
    case 'generation': return 'bg-blue-50 text-blue-700 border-blue-200'
    case 'validation': return 'bg-orange-50 text-orange-700 border-orange-200'
    case 'quality': return 'bg-green-50 text-green-700 border-green-200'
    case 'pii': return 'bg-rose-50 text-rose-700 border-rose-200'
    case 'orchestration': return 'bg-indigo-50 text-indigo-700 border-indigo-200'
    default: return 'bg-slate-50 text-slate-700 border-slate-200'
  }
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
  return `${(ms / 60000).toFixed(1)}m`
}

function timeAgo(isoString: string): string {
  const diff = Date.now() - new Date(isoString).getTime()
  if (diff < 5000) return 'just now'
  if (diff < 60000) return `${Math.floor(diff / 1000)}s ago`
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`
  return `${Math.floor(diff / 3600000)}h ago`
}

// ─── Agent Card ─────────────────────────────────────────────────

const AgentCard = React.memo(function AgentCard({ agent }: { agent: AgentInfo }) {
  const [expanded, setExpanded] = useState(false)
  const isHealthy = agent.isHealthy ?? (agent.status === 'available' || agent.status === 'busy')

  return (
    <Collapsible open={expanded} onOpenChange={setExpanded}>
      <div className={`rounded-lg border p-3 transition-colors ${
        agent.status === 'busy' ? 'border-amber-200 bg-amber-50/50' :
        agent.status === 'available' ? 'border-green-200 bg-green-50/30' :
        agent.status === 'offline' ? 'border-slate-200 bg-slate-50/30' :
        'border-red-200 bg-red-50/30'
      }`}>
        <CollapsibleTrigger className="flex items-center gap-2 w-full text-left">
          {expanded ? <ChevronDown className="h-3 w-3 text-muted-foreground" /> : <ChevronRight className="h-3 w-3 text-muted-foreground" />}
          {getAgentIcon(agent.id)}
          <span className="text-sm font-medium flex-1">{agent.name}</span>
          <div className="flex items-center gap-1.5">
            {getStatusIcon(agent.status, isHealthy)}
            <Badge className={`text-[9px] ${getStatusColor(agent.status)}`}>{agent.status}</Badge>
            <Badge className={`text-[9px] ${getPhaseColor(agent.phase)}`}>P{agent.phase}</Badge>
          </div>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <div className="mt-2 space-y-2 pl-5">
            <p className="text-xs text-muted-foreground">{agent.role}</p>

            {/* Workload */}
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-muted-foreground w-14">Load</span>
              <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full ${
                    agent.activeTasks >= agent.maxConcurrency ? 'bg-red-500' :
                    agent.activeTasks > 0 ? 'bg-amber-500' : 'bg-green-500'
                  }`}
                  style={{ width: `${(agent.activeTasks / agent.maxConcurrency) * 100}%` }}
                />
              </div>
              <span className="text-[10px] text-muted-foreground">{agent.activeTasks}/{agent.maxConcurrency}</span>
            </div>

            {/* Stats */}
            <div className="flex items-center gap-3 text-[10px]">
              <span className="text-green-700 flex items-center gap-0.5"><Check className="h-2.5 w-2.5" />{agent.tasksCompleted}</span>
              <span className="text-red-700 flex items-center gap-0.5"><XCircle className="h-2.5 w-2.5" />{agent.tasksFailed}</span>
              {agent.avgExecutionTimeMs > 0 && (
                <span className="text-muted-foreground flex items-center gap-0.5"><Clock3 className="h-2.5 w-2.5" />{formatDuration(agent.avgExecutionTimeMs)}</span>
              )}
            </div>

            {/* Skills */}
            <div className="flex flex-wrap gap-1">
              {agent.skills.map(skill => (
                <Badge key={skill.id} variant="outline" className={`text-[8px] px-1 py-0 h-4 ${getCategoryColor(skill.category)}`}>
                  {skill.name}
                </Badge>
              ))}
            </div>

            {/* Heartbeat */}
            <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
              <Heart className={`h-2.5 w-2.5 ${isHealthy ? 'text-green-500' : 'text-red-500'}`} />
              <span>{timeAgo(agent.lastHeartbeat)}</span>
            </div>
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  )
})

// ─── Skills Grid ────────────────────────────────────────────────

const SkillsGrid = React.memo(function SkillsGrid({ skills }: { skills: SkillInfo[] }) {
  const categories = [...new Set(skills.map(s => s.category))]

  return (
    <div className="space-y-3">
      {categories.map(category => (
        <div key={category}>
          <h4 className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1.5">{category}</h4>
          <div className="grid grid-cols-2 gap-1.5">
            {skills.filter(s => s.category === category).map(skill => (
              <TooltipProvider key={skill.id}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className={`rounded border p-1.5 cursor-default ${getCategoryColor(category)}`}>
                      <div className="flex items-center gap-1">
                        <Zap className="h-2.5 w-2.5" />
                        <span className="text-[9px] font-medium truncate">{skill.name}</span>
                      </div>
                      <div className="text-[8px] opacity-70 mt-0.5">
                        {skill.assignedAgent} • {formatDuration(skill.estimatedDurationMs)}
                      </div>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="max-w-[250px]">
                    <p className="text-xs font-medium">{skill.name}</p>
                    <p className="text-[10px] text-muted-foreground mt-1">{skill.description}</p>
                    <p className="text-[9px] text-muted-foreground mt-1">Agent: {skill.assignedAgent} • Est: {formatDuration(skill.estimatedDurationMs)}</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
})

// ─── Main Component ─────────────────────────────────────────────

export const AgentStatusPanel = React.memo(function AgentStatusPanel() {
  const [agents, setAgents] = useState<AgentInfo[]>([])
  const [skills, setSkills] = useState<SkillInfo[]>([])
  const [summary, setSummary] = useState<RegistrySummary | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'agents' | 'skills' | 'system'>('agents')
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date())

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/agents')
      if (res.ok) {
        const data = await res.json()
        setAgents(data.agents || [])
        setSummary(data.summary || null)
      }
    } catch { /* silent */ }

    try {
      const res = await fetch('/api/agents?view=skills')
      if (res.ok) {
        const data = await res.json()
        setSkills(data.skills || [])
      }
    } catch { /* silent */ }

    setIsLoading(false)
    setLastRefresh(new Date())
  }, [])

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      await fetchStatus()
      if (cancelled) return
    }
    load()
    const interval = setInterval(fetchStatus, 15000) // Refresh every 15s
    return () => { cancelled = true; clearInterval(interval) }
  }, [fetchStatus])

  if (isLoading) {
    return (
      <div className="p-4 space-y-2">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-20 w-full" />
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {/* Header with Summary */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Server className="h-4 w-4 text-amber-600" />
          <h3 className="text-sm font-semibold">Agent Network</h3>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[9px] text-muted-foreground">
            Updated {timeAgo(lastRefresh.toISOString())}
          </span>
          <button onClick={fetchStatus} className="p-1 hover:bg-muted rounded">
            <RefreshCw className="h-3 w-3 text-muted-foreground" />
          </button>
        </div>
      </div>

      {/* Summary Bar */}
      {summary && (
        <div className="flex items-center gap-2 text-[10px]">
          <Badge className="bg-green-100 text-green-800 border-green-200 gap-0.5">
            <Wifi className="h-2 w-2" /> {summary.available} online
          </Badge>
          {summary.busy > 0 && (
            <Badge className="bg-amber-100 text-amber-800 border-amber-200 gap-0.5">
              <Loader2 className="h-2 w-2 animate-spin" /> {summary.busy} busy
            </Badge>
          )}
          {summary.offline > 0 && (
            <Badge className="bg-slate-100 text-slate-600 border-slate-200 gap-0.5">
              <WifiOff className="h-2 w-2" /> {summary.offline} offline
            </Badge>
          )}
          <span className="text-muted-foreground ml-auto">
            {summary.totalSkills} skills • {summary.totalTasksCompleted} completed
          </span>
        </div>
      )}

      {/* Tab Switcher */}
      <div className="flex gap-1 border-b pb-1">
        {(['agents', 'skills', 'system'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`text-[10px] px-2 py-1 rounded-sm transition-colors ${
              activeTab === tab ? 'bg-amber-100 text-amber-800 font-medium' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {tab === 'agents' ? 'Agents' : tab === 'skills' ? 'Skills' : 'System'}
          </button>
        ))}
      </div>

      {/* Content */}
      <AnimatePresence mode="wait">
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.15 }}
        >
          {activeTab === 'agents' && (
            <div className="space-y-2">
              {agents.map(agent => (
                <AgentCard key={agent.id} agent={agent} />
              ))}
              {agents.length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-4">No agents registered</p>
              )}
            </div>
          )}

          {activeTab === 'skills' && (
            <SkillsGrid skills={skills} />
          )}

          {activeTab === 'system' && (
            <div className="space-y-3">
              {/* Health Overview */}
              <div className="rounded-lg border p-3 bg-gradient-to-r from-amber-50/50 to-red-50/50">
                <div className="flex items-center gap-1.5 mb-2">
                  <Activity className="h-3.5 w-3.5 text-amber-600" />
                  <span className="text-xs font-medium">System Health</span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="text-center">
                    <p className="text-lg font-bold text-green-700">
                      {agents.filter(a => a.status === 'available' || a.status === 'busy').length}/{agents.length}
                    </p>
                    <p className="text-[9px] text-muted-foreground">Agents Online</p>
                  </div>
                  <div className="text-center">
                    <p className="text-lg font-bold text-amber-700">{skills.length}</p>
                    <p className="text-[9px] text-muted-foreground">Skills Available</p>
                  </div>
                </div>
              </div>

              {/* Agent Performance */}
              <div className="space-y-2">
                <h4 className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Performance</h4>
                {agents.map(agent => {
                  const total = agent.tasksCompleted + agent.tasksFailed
                  const successRate = total > 0 ? Math.round((agent.tasksCompleted / total) * 100) : 100
                  return (
                    <div key={agent.id} className="flex items-center gap-2">
                      {getAgentIcon(agent.id)}
                      <span className="text-[10px] font-medium w-24 truncate">{agent.name}</span>
                      <div className="flex-1">
                        <Progress value={successRate} className="h-1.5" />
                      </div>
                      <span className="text-[9px] text-muted-foreground w-8 text-right">{successRate}%</span>
                    </div>
                  )
                })}
              </div>

              {/* Heartbeat Config */}
              <div className="rounded-lg border p-2.5 bg-muted/30">
                <div className="flex items-center gap-1.5 mb-1">
                  <Heart className="h-3 w-3 text-red-500" />
                  <span className="text-[10px] font-medium">Heartbeat Monitor</span>
                </div>
                <p className="text-[9px] text-muted-foreground">
                  All agents reporting healthy • 15s interval • 60s timeout
                </p>
              </div>
            </div>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  )
})
