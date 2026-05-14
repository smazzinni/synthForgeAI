// ─── Inter-Agent Message Bus ─────────────────────────────────────────
// Implements a publish/subscribe message bus pattern inspired by:
// - LangGraph's StateGraph (shared state between nodes)
// - AutoGen's GroupChat (multi-agent conversation threading)
// - CrewAI's Process (sequential vs hierarchical delegation)
//
// The bus enables agents to:
// 1. Publish results/messages to named channels
// 2. Subscribe to channels to receive updates from other agents
// 3. Share state through a central store (for pipeline coordination)
// 4. Request capabilities from other agents via direct messages

export type MessagePriority = 'low' | 'normal' | 'high' | 'critical'

export interface BusMessage {
  id: string
  /** Sender agent ID */
  from: string
  /** Target agent ID (for direct messages) or channel name */
  to: string
  /** Message type */
  type: 'task_assignment' | 'task_result' | 'status_update' | 'error' | 'state_sync' | 'heartbeat' | 'capability_request' | 'capability_response'
  /** Message payload */
  payload: Record<string, unknown>
  /** Priority level */
  priority: MessagePriority
  /** Timestamp */
  timestamp: string
  /** Correlation ID for request/response pairing */
  correlationId?: string
  /** Whether this message requires acknowledgment */
  requiresAck: boolean
  /** Acknowledged by recipients */
  acknowledgedBy: string[]
}

export interface ChannelSubscription {
  agentId: string
  channel: string
  /** Filter function — only messages matching this filter are delivered */
  filter?: (msg: BusMessage) => boolean
}

export interface SharedStateEntry {
  key: string
  value: unknown
  updatedAt: string
  updatedBy: string
  /** Version number for optimistic concurrency */
  version: number
}

type MessageHandler = (message: BusMessage) => void | Promise<void>

// ─── Message Bus (singleton) ─────────────────────────────────────────

class AgentBus {
  private subscriptions: Map<string, Set<MessageHandler>> = new Map()
  private channelSubs: Map<string, Set<ChannelSubscription>> = new Map()
  private messageHistory: BusMessage[] = []
  private sharedState: Map<string, SharedStateEntry> = new Map()
  private static instance: AgentBus | null = null
  private maxHistorySize = 1000

  private constructor() {}

  static getInstance(): AgentBus {
    if (!AgentBus.instance) {
      AgentBus.instance = new AgentBus()
    }
    return AgentBus.instance
  }

  // ─── Publish/Subscribe ─────────────────────────────────────────

  /** Subscribe an agent to a channel */
  subscribe(channel: string, handler: MessageHandler): () => void {
    if (!this.subscriptions.has(channel)) {
      this.subscriptions.set(channel, new Set())
    }
    this.subscriptions.get(channel)!.add(handler)

    // Return unsubscribe function
    return () => {
      this.subscriptions.get(channel)?.delete(handler)
    }
  }

  /** Subscribe an agent to a channel with agent metadata */
  subscribeAgent(agentId: string, channel: string, handler: MessageHandler, filter?: (msg: BusMessage) => boolean): () => void {
    if (!this.channelSubs.has(channel)) {
      this.channelSubs.set(channel, new Set())
    }
    const sub: ChannelSubscription = { agentId, channel, filter }
    this.channelSubs.get(channel)!.add(sub)

    // Also register the handler
    const wrappedHandler: MessageHandler = filter
      ? (msg) => { if (filter(msg)) handler(msg) }
      : handler

    return this.subscribe(channel, wrappedHandler)
  }

  /** Publish a message to a channel */
  async publish(message: Omit<BusMessage, 'id' | 'timestamp' | 'acknowledgedBy'>): Promise<string> {
    const fullMessage: BusMessage = {
      ...message,
      id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      timestamp: new Date().toISOString(),
      acknowledgedBy: []
    }

    // Store in history
    this.messageHistory.push(fullMessage)
    if (this.messageHistory.length > this.maxHistorySize) {
      this.messageHistory = this.messageHistory.slice(-this.maxHistorySize)
    }

    // Deliver to subscribers
    const handlers = this.subscriptions.get(message.to)
    if (handlers) {
      const deliveryPromises = Array.from(handlers).map(handler => {
        try {
          return Promise.resolve(handler(fullMessage))
        } catch (err) {
          console.error(`[AgentBus] Error delivering message ${fullMessage.id}:`, err)
          return Promise.resolve()
        }
      })
      await Promise.all(deliveryPromises)
    }

    // Also deliver to agent-specific channel (direct messages)
    if (message.to.startsWith('agent:')) {
      const agentId = message.to.replace('agent:', '')
      const agentHandlers = this.subscriptions.get(`agent:${agentId}`)
      if (agentHandlers) {
        const deliveryPromises = Array.from(agentHandlers).map(handler => {
          try {
            return Promise.resolve(handler(fullMessage))
          } catch (err) {
            console.error(`[AgentBus] Error delivering direct message ${fullMessage.id}:`, err)
            return Promise.resolve()
          }
        })
        await Promise.all(deliveryPromises)
      }
    }

    return fullMessage.id
  }

  /** Send a direct message from one agent to another */
  async sendDirectMessage(
    from: string,
    to: string,
    type: BusMessage['type'],
    payload: Record<string, unknown>,
    options?: { priority?: MessagePriority; correlationId?: string; requiresAck?: boolean }
  ): Promise<string> {
    return this.publish({
      from,
      to: `agent:${to}`,
      type,
      payload,
      priority: options?.priority || 'normal',
      correlationId: options?.correlationId,
      requiresAck: options?.requiresAck || false
    })
  }

  /** Acknowledge a message */
  ack(messageId: string, agentId: string): void {
    const msg = this.messageHistory.find(m => m.id === messageId)
    if (msg && !msg.acknowledgedBy.includes(agentId)) {
      msg.acknowledgedBy.push(agentId)
    }
  }

  // ─── Shared State ──────────────────────────────────────────────

  /** Set a shared state value */
  setState(key: string, value: unknown, updatedBy: string): SharedStateEntry {
    const existing = this.sharedState.get(key)
    const entry: SharedStateEntry = {
      key,
      value,
      updatedAt: new Date().toISOString(),
      updatedBy,
      version: (existing?.version || 0) + 1
    }
    this.sharedState.set(key, entry)

    // Notify state subscribers
    this.publish({
      from: updatedBy,
      to: `state:${key}`,
      type: 'state_sync',
      payload: { key, value, version: entry.version },
      priority: 'low',
      requiresAck: false
    })

    return entry
  }

  /** Get a shared state value */
  getState(key: string): SharedStateEntry | undefined {
    return this.sharedState.get(key)
  }

  /** Get all shared state entries matching a prefix */
  getStateByPrefix(prefix: string): SharedStateEntry[] {
    const entries: SharedStateEntry[] = []
    for (const [key, entry] of this.sharedState) {
      if (key.startsWith(prefix)) entries.push(entry)
    }
    return entries
  }

  /** Compare-and-swap for atomic state updates */
  compareAndSwap(key: string, expectedVersion: number, newValue: unknown, updatedBy: string): boolean {
    const existing = this.sharedState.get(key)
    if (!existing || existing.version !== expectedVersion) return false
    this.setState(key, newValue, updatedBy)
    return true
  }

  // ─── Query Methods ─────────────────────────────────────────────

  /** Get message history for a specific channel or agent */
  getHistory(filter?: { channel?: string; from?: string; to?: string; type?: string; limit?: number }): BusMessage[] {
    let messages = [...this.messageHistory]
    if (filter?.channel) messages = messages.filter(m => m.to === filter.channel || m.to === `agent:${filter.channel}`)
    if (filter?.from) messages = messages.filter(m => m.from === filter.from)
    if (filter?.to) messages = messages.filter(m => m.to === filter.to || m.to === `agent:${filter.to}`)
    if (filter?.type) messages = messages.filter(m => m.type === filter.type)
    const limit = filter?.limit || 50
    return messages.slice(-limit)
  }

  /** Get unread messages for an agent since a given timestamp */
  getUnreadForAgent(agentId: string, sinceTimestamp: string): BusMessage[] {
    return this.messageHistory.filter(
      m => m.to === `agent:${agentId}` && new Date(m.timestamp) > new Date(sinceTimestamp)
    )
  }

  /** Get pending messages that require acknowledgment */
  getPendingAcks(agentId: string): BusMessage[] {
    return this.messageHistory.filter(
      m => m.requiresAck && m.to === `agent:${agentId}` && !m.acknowledgedBy.includes(agentId)
    )
  }

  // ─── Pipeline State Helpers ────────────────────────────────────

  /** Initialize pipeline state for a new TDM session */
  initPipelineState(sessionId: string, initiator: string): void {
    this.setState(`pipeline:${sessionId}:phase`, 1, initiator)
    this.setState(`pipeline:${sessionId}:status`, 'running', initiator)
    this.setState(`pipeline:${sessionId}:tables`, {}, initiator)
    this.setState(`pipeline:${sessionId}:reasoningSteps`, [], initiator)
    this.setState(`pipeline:${sessionId}:errors`, [], initiator)
  }

  /** Update pipeline phase */
  advancePipelinePhase(sessionId: string, newPhase: number, agentId: string): void {
    this.setState(`pipeline:${sessionId}:phase`, newPhase, agentId)
  }

  /** Add tables to pipeline state */
  addPipelineTables(sessionId: string, tables: Record<string, unknown[]>, agentId: string): void {
    const existing = (this.getState(`pipeline:${sessionId}:tables`)?.value || {}) as Record<string, unknown[]>
    this.setState(`pipeline:${sessionId}:tables`, { ...existing, ...tables }, agentId)
  }

  /** Add reasoning steps to pipeline state */
  addPipelineReasoning(sessionId: string, steps: unknown[], agentId: string): void {
    const existing = (this.getState(`pipeline:${sessionId}:reasoningSteps`)?.value || []) as unknown[]
    this.setState(`pipeline:${sessionId}:reasoningSteps`, [...existing, ...steps], agentId)
  }

  /** Mark pipeline as completed */
  completePipeline(sessionId: string, agentId: string): void {
    this.setState(`pipeline:${sessionId}:status`, 'completed', agentId)
  }

  /** Mark pipeline as failed */
  failPipeline(sessionId: string, error: string, agentId: string): void {
    this.setState(`pipeline:${sessionId}:status`, 'failed', agentId)
    const errors = (this.getState(`pipeline:${sessionId}:errors`)?.value || []) as string[]
    this.setState(`pipeline:${sessionId}:errors`, [...errors, error], agentId)
  }

  /** Get full pipeline state */
  getPipelineState(sessionId: string): {
    phase: number
    status: string
    tables: Record<string, unknown[]>
    reasoningSteps: unknown[]
    errors: string[]
  } | null {
    const phase = this.getState(`pipeline:${sessionId}:phase`)?.value as number | undefined
    if (phase === undefined) return null
    return {
      phase,
      status: (this.getState(`pipeline:${sessionId}:status`)?.value || 'unknown') as string,
      tables: (this.getState(`pipeline:${sessionId}:tables`)?.value || {}) as Record<string, unknown[]>,
      reasoningSteps: (this.getState(`pipeline:${sessionId}:reasoningSteps`)?.value || []) as unknown[],
      errors: (this.getState(`pipeline:${sessionId}:errors`)?.value || []) as string[]
    }
  }

  // ─── Cleanup ───────────────────────────────────────────────────

  /** Clear pipeline state for a session */
  clearPipelineState(sessionId: string): void {
    for (const key of this.sharedState.keys()) {
      if (key.startsWith(`pipeline:${sessionId}:`)) {
        this.sharedState.delete(key)
      }
    }
  }

  /** Reset the bus (for testing) */
  reset(): void {
    this.subscriptions.clear()
    this.channelSubs.clear()
    this.messageHistory = []
    this.sharedState.clear()
  }
}

export const agentBus = AgentBus.getInstance()
