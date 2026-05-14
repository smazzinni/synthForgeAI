import { NextRequest, NextResponse } from 'next/server'
import { agentRegistry, SKILLS } from '@/lib/agent-registry'
import { agentBus } from '@/lib/agent-bus'
import { heartbeatMonitor, ensureHeartbeatStarted } from '@/lib/agent-heartbeat'
import { agentOrchestrator } from '@/lib/agent-orchestrator'

// Ensure heartbeat monitoring is started
ensureHeartbeatStarted()

// GET /api/agents - Get agent registry status, skills, and heartbeat info
export async function GET(request: NextRequest) {
  try {
    const view = request.nextUrl.searchParams.get('view') || 'status'

    if (view === 'skills') {
      // Return skills registry
      const skills = agentOrchestrator.getSkillsRegistry()
      const categories = [...new Set(skills.map(s => s.category))]
      return NextResponse.json({
        skills,
        categories,
        totalSkills: skills.length,
        skillDefinitions: Object.fromEntries(
          Object.entries(SKILLS).map(([key, skill]) => [key, {
            id: skill.id,
            name: skill.name,
            category: skill.category,
            description: skill.description,
            inputSchema: skill.inputSchema,
            outputSchema: skill.outputSchema,
            estimatedDurationMs: skill.estimatedDurationMs,
            priority: skill.priority
          }])
        )
      })
    }

    if (view === 'heartbeat') {
      // Return heartbeat status for all agents
      return NextResponse.json({
        agents: heartbeatMonitor.getStatus(),
        config: heartbeatMonitor.getConfig()
      })
    }

    if (view === 'bus') {
      // Return message bus status
      const limit = parseInt(request.nextUrl.searchParams.get('limit') || '50')
      const channel = request.nextUrl.searchParams.get('channel') || undefined
      return NextResponse.json({
        messages: agentBus.getHistory({ channel, limit }),
        pipelineStates: agentBus.getStateByPrefix('pipeline:')
      })
    }

    if (view === 'system') {
      // Return full system diagnostics
      return NextResponse.json(agentOrchestrator.getSystemStatus())
    }

    // Default: Return agent status overview
    const agents = agentRegistry.getAll().map(a => ({
      id: a.id,
      name: a.name,
      role: a.role,
      phase: a.phase,
      status: a.status,
      skills: a.skills.map(s => ({ id: s.id, name: s.name, category: s.category })),
      activeTasks: a.activeTaskIds.length,
      maxConcurrency: a.maxConcurrency,
      tasksCompleted: a.tasksCompleted,
      tasksFailed: a.tasksFailed,
      avgExecutionTimeMs: a.avgExecutionTimeMs,
      lastHeartbeat: a.lastHeartbeat
    }))

    const summary = agentRegistry.getSummary()

    return NextResponse.json({
      agents,
      summary,
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('[Agents API] Error:', error)
    return NextResponse.json({ error: 'Failed to get agent status' }, { status: 500 })
  }
}

// POST /api/agents - Send heartbeat, update agent status, or route tasks
export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as {
      action: 'heartbeat' | 'route' | 'reset' | 'ping'
      agentId?: string
      skillId?: string
      priority?: number
    }

    const { action, agentId, skillId, priority } = body

    if (action === 'heartbeat' && agentId) {
      heartbeatMonitor.processHeartbeat(agentId)
      const agent = agentRegistry.get(agentId)
      return NextResponse.json({
        agentId,
        status: agent?.status || 'unknown',
        lastHeartbeat: agent?.lastHeartbeat || new Date().toISOString()
      })
    }

    if (action === 'ping' && agentId) {
      heartbeatMonitor.ping(agentId)
      return NextResponse.json({ agentId, pong: true })
    }

    if (action === 'route' && skillId) {
      const bestAgent = agentOrchestrator.routeTask(skillId, priority || 0)
      return NextResponse.json({
        skillId,
        assignedAgent: bestAgent ? {
          id: bestAgent.id,
          name: bestAgent.name,
          status: bestAgent.status,
          activeTasks: bestAgent.activeTaskIds.length,
          maxConcurrency: bestAgent.maxConcurrency
        } : null
      })
    }

    if (action === 'reset') {
      // Reset agent metrics (for testing)
      for (const agent of agentRegistry.getAll()) {
        agentRegistry.updateStatus(agent.id, 'available')
        heartbeatMonitor.ping(agent.id)
      }
      agentBus.reset()
      return NextResponse.json({ message: 'Agent system reset' })
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
  } catch (error) {
    console.error('[Agents API] Error:', error)
    return NextResponse.json({ error: 'Failed to process agent action' }, { status: 500 })
  }
}
