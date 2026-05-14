// WebSocket Infrastructure for SynthForge AI
// Uses a custom HTTP-based event stream since Next.js API routes don't support
// native WebSocket upgrade. For full WebSocket support, a custom server.ts would be needed.
// This module provides the server-side event broadcasting infrastructure.

export interface WSEvent {
  type: 'agent:status' | 'agent:step' | 'agent:reasoning' | 
        'data:chunk' | 'data:complete' | 
        'quality:check' | 
        'pipeline:start' | 'pipeline:progress' | 'pipeline:complete' |
        'chat:typing' | 'chat:message'
  data: Record<string, unknown>
  timestamp: number
  target?: string // conversationId or databaseId for room-based delivery
}

// In-memory event store for real-time updates
// Events are stored per-conversation and per-database for targeted delivery
class EventBroadcaster {
  private events: Map<string, WSEvent[]> = new Map()
  private maxEventsPerRoom = 100
  private listeners: Map<string, Set<(event: WSEvent) => void>> = new Map()

  /**
   * Broadcast an event to a specific room (conversation or database)
   */
  broadcast(target: string, event: Omit<WSEvent, 'timestamp'>): void {
    const fullEvent: WSEvent = { ...event, timestamp: Date.now(), target }
    
    // Store event
    const roomEvents = this.events.get(target) || []
    roomEvents.push(fullEvent)
    if (roomEvents.length > this.maxEventsPerRoom) {
      roomEvents.shift()
    }
    this.events.set(target, roomEvents)

    // Notify listeners
    const roomListeners = this.listeners.get(target)
    if (roomListeners) {
      for (const listener of roomListeners) {
        try { listener(fullEvent) } catch { /* listener error */ }
      }
    }

    // Also notify global listeners
    const globalListeners = this.listeners.get('*')
    if (globalListeners) {
      for (const listener of globalListeners) {
        try { listener(fullEvent) } catch { /* listener error */ }
      }
    }
  }

  /**
   * Subscribe to events for a specific room or all events ('*')
   */
  subscribe(target: string, listener: (event: WSEvent) => void): () => void {
    if (!this.listeners.has(target)) {
      this.listeners.set(target, new Set())
    }
    this.listeners.get(target)!.add(listener)
    
    // Return unsubscribe function
    return () => {
      const roomListeners = this.listeners.get(target)
      if (roomListeners) {
        roomListeners.delete(listener)
        if (roomListeners.size === 0) {
          this.listeners.delete(target)
        }
      }
    }
  }

  /**
   * Get recent events for a room (for polling/SSE reconnection)
   */
  getRecentEvents(target: string, since?: number): WSEvent[] {
    const roomEvents = this.events.get(target) || []
    if (since) {
      return roomEvents.filter(e => e.timestamp > since)
    }
    return roomEvents
  }

  /**
   * Clean up old events
   */
  cleanup(maxAgeMs = 300_000): void {
    const cutoff = Date.now() - maxAgeMs
    for (const [target, events] of this.events) {
      const filtered = events.filter(e => e.timestamp > cutoff)
      if (filtered.length === 0) {
        this.events.delete(target)
      } else {
        this.events.set(target, filtered)
      }
    }
  }

  /**
   * Get stats about active rooms and listeners
   */
  getStats(): { rooms: number; totalEvents: number; totalListeners: number } {
    let totalEvents = 0
    let totalListeners = 0
    for (const events of this.events.values()) totalEvents += events.length
    for (const listeners of this.listeners.values()) totalListeners += listeners.size
    return { rooms: this.events.size, totalEvents, totalListeners }
  }
}

// Singleton broadcaster
export const eventBroadcaster = new EventBroadcaster()

// Cleanup old events every 5 minutes
if (typeof setInterval !== 'undefined') {
  setInterval(() => eventBroadcaster.cleanup(), 300_000)
}

// ─── Helper functions for common event types ────────────────────────

export function broadcastAgentStep(conversationId: string, data: {
  stepIndex: number; agent: string; task: string; status: string; output?: string
}) {
  eventBroadcaster.broadcast(`conv:${conversationId}`, {
    type: 'agent:step',
    data: data as Record<string, unknown>
  })
}

export function broadcastAgentReasoning(conversationId: string, data: {
  type: string; label: string; description: string; status: string; output?: string
}) {
  eventBroadcaster.broadcast(`conv:${conversationId}`, {
    type: 'agent:reasoning',
    data: data as Record<string, unknown>
  })
}

export function broadcastDataChunk(databaseId: string, data: {
  tableName: string; rows: Record<string, unknown>[]; offset: number; total: number
}) {
  eventBroadcaster.broadcast(`db:${databaseId}`, {
    type: 'data:chunk',
    data: data as Record<string, unknown>
  })
}

export function broadcastDataComplete(databaseId: string, tables: string[], totalRows: number) {
  eventBroadcaster.broadcast(`db:${databaseId}`, {
    type: 'data:complete',
    data: { tables, totalRows }
  })
}

export function broadcastPipelineProgress(conversationId: string, data: {
  pipelineId: string; stepIndex: number; status: string
}) {
  eventBroadcaster.broadcast(`conv:${conversationId}`, {
    type: 'pipeline:progress',
    data: data as Record<string, unknown>
  })
}

export function broadcastChatTyping(conversationId: string, isTyping: boolean) {
  eventBroadcaster.broadcast(`conv:${conversationId}`, {
    type: 'chat:typing',
    data: { isTyping }
  })
}

export function broadcastQualityCheck(databaseId: string, data: {
  status: string; score?: number; issues?: number
}) {
  eventBroadcaster.broadcast(`db:${databaseId}`, {
    type: 'quality:check',
    data: data as Record<string, unknown>
  })
}
