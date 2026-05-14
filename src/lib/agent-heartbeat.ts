// ─── Agent Heartbeat Monitor ─────────────────────────────────────────
// Implements heartbeat monitoring inspired by:
// - Kubernetes liveness/readiness probes (periodic health checks)
// - Erlang/OTP supervisor trees (linked process monitoring)
// - Akka Cluster heartbeat (distributed failure detection)
//
// Key patterns:
// 1. Each agent sends periodic heartbeat signals
// 2. The monitor tracks heartbeat timestamps per agent
// 3. If an agent misses N consecutive heartbeats, it's marked suspect -> offline
// 4. The monitor emits events for status changes (for UI and alerting)
// 5. Supports configurable timeouts per agent type

import { agentRegistry, type AgentStatus } from './agent-registry'

export interface HeartbeatConfig {
  /** Interval between heartbeats in ms (default: 15000 = 15s) */
  intervalMs: number
  /** Number of missed heartbeats before marking suspect (default: 2) */
  missedThreshold: number
  /** Time after which agent is considered offline (default: 60000 = 60s) */
  offlineTimeoutMs: number
  /** Whether to automatically check stale agents (default: true) */
  autoCheck: boolean
  /** Auto-check interval in ms (default: 10000 = 10s) */
  autoCheckIntervalMs: number
}

export interface HeartbeatEvent {
  agentId: string
  previousStatus: AgentStatus
  newStatus: AgentStatus
  timestamp: string
  missedCount: number
  lastHeartbeatAge: number
}

type HeartbeatEventHandler = (event: HeartbeatEvent) => void

class HeartbeatMonitor {
  private config: HeartbeatConfig
  private missedCounts: Map<string, number> = new Map()
  private handlers: Set<HeartbeatEventHandler> = new Set()
  private checkInterval: ReturnType<typeof setInterval> | null = null
  private agentHeartbeatTimers: Map<string, ReturnType<typeof setInterval>> = new Map()
  private static instance: HeartbeatMonitor | null = null

  private constructor(config?: Partial<HeartbeatConfig>) {
    this.config = {
      intervalMs: 15000,
      missedThreshold: 2,
      offlineTimeoutMs: 60000,
      autoCheck: true,
      autoCheckIntervalMs: 10000,
      ...config
    }
  }

  static getInstance(config?: Partial<HeartbeatConfig>): HeartbeatMonitor {
    if (!HeartbeatMonitor.instance) {
      HeartbeatMonitor.instance = new HeartbeatMonitor(config)
    }
    return HeartbeatMonitor.instance
  }

  // ─── Event Handlers ────────────────────────────────────────────

  /** Register a handler for heartbeat events */
  onStatusChange(handler: HeartbeatEventHandler): () => void {
    this.handlers.add(handler)
    return () => this.handlers.delete(handler)
  }

  private emitEvent(event: HeartbeatEvent): void {
    for (const handler of this.handlers) {
      try {
        handler(event)
      } catch (err) {
        console.error('[HeartbeatMonitor] Error in event handler:', err)
      }
    }
  }

  // ─── Heartbeat Processing ──────────────────────────────────────

  /** Process an incoming heartbeat from an agent */
  processHeartbeat(agentId: string): void {
    const agent = agentRegistry.get(agentId)
    if (!agent) {
      console.warn(`[HeartbeatMonitor] Unknown agent: ${agentId}`)
      return
    }

    const previousStatus = agent.status
    agent.lastHeartbeat = new Date().toISOString()
    this.missedCounts.set(agentId, 0)

    // If agent was offline/error, mark it as available
    if (previousStatus === 'offline' || previousStatus === 'error') {
      agent.status = 'available'
      this.emitEvent({
        agentId,
        previousStatus,
        newStatus: 'available',
        timestamp: new Date().toISOString(),
        missedCount: 0,
        lastHeartbeatAge: 0
      })
    }
  }

  /** Simulate a heartbeat for an agent (used when agent completes a task) */
  ping(agentId: string): void {
    this.processHeartbeat(agentId)
  }

  // ─── Stale Agent Detection ─────────────────────────────────────

  /** Check all agents for stale heartbeats */
  checkAll(): HeartbeatEvent[] {
    const events: HeartbeatEvent[] = []
    const now = Date.now()

    for (const agent of agentRegistry.getAll()) {
      if (agent.status === 'offline') continue // Already offline

      const lastBeat = new Date(agent.lastHeartbeat).getTime()
      const age = now - lastBeat
      const missedCount = this.missedCounts.get(agent.id) || 0

      if (age > this.config.offlineTimeoutMs) {
        // Mark as offline
        const previousStatus = agent.status
        agent.status = 'offline'
        this.missedCounts.set(agent.id, missedCount + 1)

        const event: HeartbeatEvent = {
          agentId: agent.id,
          previousStatus,
          newStatus: 'offline',
          timestamp: new Date().toISOString(),
          missedCount: missedCount + 1,
          lastHeartbeatAge: age
        }
        events.push(event)
        this.emitEvent(event)

      } else if (age > this.config.intervalMs * this.config.missedThreshold) {
        // Mark as suspect (still "available" but might be unhealthy)
        const previousStatus = agent.status
        if (previousStatus === 'available') {
          // Keep as available but increment missed count
          this.missedCounts.set(agent.id, missedCount + 1)
        }
      } else {
        // Reset missed count
        this.missedCounts.set(agent.id, 0)
      }
    }

    return events
  }

  // ─── Background Monitoring ─────────────────────────────────────

  /** Start the background heartbeat checker */
  start(): void {
    if (this.checkInterval) return // Already running

    // Initialize heartbeat timers for all registered agents
    for (const agent of agentRegistry.getAll()) {
      this.startAgentHeartbeat(agent.id)
    }

    if (this.config.autoCheck) {
      this.checkInterval = setInterval(() => {
        this.checkAll()
      }, this.config.autoCheckIntervalMs)
    }

    console.log('[HeartbeatMonitor] Started with config:', this.config)
  }

  /** Stop the background heartbeat checker */
  stop(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval)
      this.checkInterval = null
    }
    for (const timer of this.agentHeartbeatTimers.values()) {
      clearInterval(timer)
    }
    this.agentHeartbeatTimers.clear()
    console.log('[HeartbeatMonitor] Stopped')
  }

  /** Start sending simulated heartbeats for an agent */
  private startAgentHeartbeat(agentId: string): void {
    // Clear existing timer if any
    if (this.agentHeartbeatTimers.has(agentId)) {
      clearInterval(this.agentHeartbeatTimers.get(agentId)!)
    }

    // For server-side agents, we simulate heartbeats since they run in-process
    // In a distributed setup, each agent process would send heartbeats via the bus
    const timer = setInterval(() => {
      const agent = agentRegistry.get(agentId)
      if (agent && agent.status !== 'offline') {
        // Simulate heartbeat - in production this would be a real health check
        this.processHeartbeat(agentId)
      }
    }, this.config.intervalMs)

    this.agentHeartbeatTimers.set(agentId, timer)
  }

  // ─── Status Queries ────────────────────────────────────────────

  /** Get heartbeat status for all agents */
  getStatus(): Array<{
    agentId: string
    name: string
    status: AgentStatus
    lastHeartbeat: string
    ageMs: number
    missedCount: number
    isHealthy: boolean
  }> {
    const now = Date.now()
    return agentRegistry.getAll().map(agent => {
      const age = now - new Date(agent.lastHeartbeat).getTime()
      const missed = this.missedCounts.get(agent.id) || 0
      return {
        agentId: agent.id,
        name: agent.name,
        status: agent.status,
        lastHeartbeat: agent.lastHeartbeat,
        ageMs: age,
        missedCount: missed,
        isHealthy: age < this.config.offlineTimeoutMs && missed < this.config.missedThreshold
      }
    })
  }

  /** Check if a specific agent is available and healthy */
  isAvailable(agentId: string): boolean {
    const agent = agentRegistry.get(agentId)
    if (!agent) return false
    const now = Date.now()
    const age = now - new Date(agent.lastHeartbeat).getTime()
    return agent.status === 'available' && age < this.config.offlineTimeoutMs
  }

  /** Get config */
  getConfig(): HeartbeatConfig {
    return { ...this.config }
  }

  /** Update config (requires restart to take effect for auto-check) */
  updateConfig(updates: Partial<HeartbeatConfig>): void {
    this.config = { ...this.config, ...updates }
    // Restart auto-check if running
    if (this.checkInterval && this.config.autoCheck) {
      clearInterval(this.checkInterval)
      this.checkInterval = setInterval(() => {
        this.checkAll()
      }, this.config.autoCheckIntervalMs)
    }
  }
}

export const heartbeatMonitor = HeartbeatMonitor.getInstance()

// ─── Convenience: Start heartbeat monitoring on import ────────────────
// In a production system, this would be started explicitly. For this app,
// we auto-start with default config when the module is imported on the server.

let autoStarted = false

export function ensureHeartbeatStarted(): void {
  if (!autoStarted) {
    heartbeatMonitor.start()
    autoStarted = true
  }
}
