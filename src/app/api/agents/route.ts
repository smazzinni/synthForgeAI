import { NextRequest, NextResponse } from 'next/server'

// Lazy-loaded agent modules to prevent background intervals from running on startup
let _agentRegistry: typeof import('@/lib/agent-registry').agentRegistry | null = null
let _heartbeatMonitor: typeof import('@/lib/agent-heartbeat').heartbeatMonitor | null = null
let _agentOrchestrator: typeof import('@/lib/agent-orchestrator').agentOrchestrator | null = null
let _agentBus: typeof import('@/lib/agent-bus').agentBus | null = null
let _SKILLS: typeof import('@/lib/agent-registry').SKILLS | null = null

async function loadModules() {
  if (!_agentRegistry) {
    const registry = await import('@/lib/agent-registry')
    _agentRegistry = registry.agentRegistry
    _SKILLS = registry.SKILLS
    
    const heartbeat = await import('@/lib/agent-heartbeat')
    _heartbeatMonitor = heartbeat.heartbeatMonitor
    
    const orchestrator = await import('@/lib/agent-orchestrator')
    _agentOrchestrator = orchestrator.agentOrchestrator
    
    const bus = await import('@/lib/agent-bus')
    _agentBus = bus.agentBus
  }
}

// GET /api/agents - Get agent registry status, skills, and heartbeat info
export async function GET(request: NextRequest) {
  try {
    await loadModules()
    
    const view = request.nextUrl.searchParams.get('view') || 'status'

    if (view === 'skills' && _agentOrchestrator && _SKILLS) {
      const skills = _agentOrchestrator.getSkillsRegistry()
      const categories = [...new Set(skills.map(s => s.category))]
      return NextResponse.json({
        skills,
        categories,
        totalSkills: skills.length,
        skillDefinitions: Object.fromEntries(
          Object.entries(_SKILLS).map(([key, skill]) => [key, {
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

    if (view === 'heartbeat' && _heartbeatMonitor) {
      return NextResponse.json({
        agents: _heartbeatMonitor.getStatus(),
        config: _heartbeatMonitor.getConfig()
      })
    }

    if (view === 'bus' && _agentBus) {
      const limit = parseInt(request.nextUrl.searchParams.get('limit') || '50')
      const channel = request.nextUrl.searchParams.get('channel') || undefined
      return NextResponse.json({
        messages: _agentBus.getHistory({ channel, limit }),
        pipelineStates: _agentBus.getStateByPrefix('pipeline:')
      })
    }

    if (view === 'system' && _agentOrchestrator) {
      return NextResponse.json(_agentOrchestrator.getSystemStatus())
    }

    // Default: Return agent status overview
    if (!_agentRegistry) {
      return NextResponse.json({ error: 'Agent registry not available' }, { status: 503 })
    }

    const agents = _agentRegistry.getAll().map(a => ({
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

    const summary = _agentRegistry.getSummary()

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
    await loadModules()
    
    let body: Record<string, unknown>
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    const { action, agentId, skillId, priority } = body as {
      action?: 'heartbeat' | 'route' | 'reset' | 'ping'
      agentId?: string
      skillId?: string
      priority?: number
    }

    if (!action || typeof action !== 'string') {
      return NextResponse.json({ error: 'action required' }, { status: 400 })
    }

    if (action === 'heartbeat' && agentId && _heartbeatMonitor && _agentRegistry) {
      _heartbeatMonitor.processHeartbeat(agentId)
      const agent = _agentRegistry.get(agentId)
      return NextResponse.json({
        agentId,
        status: agent?.status || 'unknown',
        lastHeartbeat: agent?.lastHeartbeat || new Date().toISOString()
      })
    }

    if (action === 'ping' && agentId && _heartbeatMonitor) {
      _heartbeatMonitor.ping(agentId)
      return NextResponse.json({ agentId, pong: true })
    }

    if (action === 'route' && skillId && _agentOrchestrator) {
      const bestAgent = _agentOrchestrator.routeTask(skillId, priority || 0)
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

    if (action === 'reset' && _agentRegistry && _heartbeatMonitor && _agentBus) {
      for (const agent of _agentRegistry.getAll()) {
        _agentRegistry.updateStatus(agent.id, 'available')
        _heartbeatMonitor.ping(agent.id)
      }
      _agentBus.reset()
      return NextResponse.json({ message: 'Agent system reset' })
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
  } catch (error) {
    console.error('[Agents API] Error:', error)
    return NextResponse.json({ error: 'Failed to process agent action' }, { status: 500 })
  }
}
