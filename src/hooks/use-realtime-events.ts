'use client'

import { useEffect, useRef, useState, useCallback } from 'react'

interface UseRealtimeEventsOptions {
  /** Target room: e.g. 'conv:abc123' or 'db:def456' */
  target?: string
  /** Callback for agent step events */
  onAgentStep?: (data: { stepIndex: number; agent: string; task: string; status: string; output?: string }) => void
  /** Callback for agent reasoning events */
  onAgentReasoning?: (data: { type: string; label: string; description: string; status: string; output?: string }) => void
  /** Callback for data chunk events */
  onDataChunk?: (data: { tableName: string; rows: Record<string, unknown>[]; offset: number; total: number }) => void
  /** Callback for data complete events */
  onDataComplete?: (data: { tables: string[]; totalRows: number }) => void
  /** Callback for pipeline progress events */
  onPipelineProgress?: (data: { pipelineId: string; stepIndex: number; status: string }) => void
  /** Whether to auto-connect (default: true) */
  autoConnect?: boolean
}

interface RealtimeEvent {
  type: string
  data: Record<string, unknown>
  timestamp: number
  target?: string
}

/**
 * Hook for subscribing to real-time server-sent events (SSE).
 * This provides WebSocket-like functionality using HTTP streaming,
 * compatible with Next.js API routes.
 *
 * CRITICAL FIX: Uses refs for callbacks to prevent infinite reconnection loops
 * caused by unstable callback references in the dependency array.
 */
export function useRealtimeEvents(options: UseRealtimeEventsOptions = {}) {
  const {
    target,
    onAgentStep,
    onAgentReasoning,
    onDataChunk,
    onDataComplete,
    onPipelineProgress,
    autoConnect = true,
  } = options

  const [isConnected, setIsConnected] = useState(false)
  const [lastEvent, setLastEvent] = useState<RealtimeEvent | null>(null)
  const [eventCount, setEventCount] = useState(0)
  const abortRef = useRef<AbortController | null>(null)
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Use refs for callbacks to prevent reconnection loops when callbacks change
  const onAgentStepRef = useRef(onAgentStep)
  const onAgentReasoningRef = useRef(onAgentReasoning)
  const onDataChunkRef = useRef(onDataChunk)
  const onDataCompleteRef = useRef(onDataComplete)
  const onPipelineProgressRef = useRef(onPipelineProgress)

  // Update refs when callbacks change (without triggering reconnect)
  useEffect(() => {
    onAgentStepRef.current = onAgentStep
    onAgentReasoningRef.current = onAgentReasoning
    onDataChunkRef.current = onDataChunk
    onDataCompleteRef.current = onDataComplete
    onPipelineProgressRef.current = onPipelineProgress
  }, [onAgentStep, onAgentReasoning, onDataChunk, onDataComplete, onPipelineProgress])

  const disconnect = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort()
      abortRef.current = null
    }
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current)
      reconnectTimerRef.current = null
    }
    setIsConnected(false)
  }, [])

  const connect = useCallback(() => {
    if (!target || !autoConnect) return

    // Disconnect existing connection
    disconnect()

    const controller = new AbortController()
    abortRef.current = controller

    const connectSSE = async () => {
      // Don't attempt if aborted
      if (controller.signal.aborted) return

      try {
        const response = await fetch(`/api/events?target=${encodeURIComponent(target)}&since=${Date.now()}`, {
          signal: controller.signal,
          headers: { 'Accept': 'text/event-stream' }
        })

        if (!response.ok || !response.body) {
          // Only schedule reconnect if not aborted and autoConnect is still true
          if (!controller.signal.aborted && autoConnect) {
            reconnectTimerRef.current = setTimeout(connectSSE, 5000) // Increased from 3s to 5s
          }
          return
        }

        setIsConnected(true)

        const reader = response.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ''

        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          if (controller.signal.aborted) break

          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split('\n')
          buffer = lines.pop() || ''

          for (const line of lines) {
            // Skip comments (heartbeats)
            if (line.startsWith(':')) continue
            if (!line.startsWith('data: ')) continue

            const jsonStr = line.slice(6).trim()
            if (!jsonStr) continue

            try {
              const event: RealtimeEvent = JSON.parse(jsonStr)
              setLastEvent(event)
              setEventCount(prev => prev + 1)

              // Route to appropriate callback using refs (stable references)
              switch (event.type) {
                case 'agent:step':
                  onAgentStepRef.current?.(event.data as any)
                  break
                case 'agent:reasoning':
                  onAgentReasoningRef.current?.(event.data as any)
                  break
                case 'data:chunk':
                  onDataChunkRef.current?.(event.data as any)
                  break
                case 'data:complete':
                  onDataCompleteRef.current?.(event.data as any)
                  break
                case 'pipeline:progress':
                  onPipelineProgressRef.current?.(event.data as any)
                  break
              }
            } catch {
              // Invalid JSON, skip
            }
          }
        }

        setIsConnected(false)
        // Auto-reconnect after connection closes (with longer delay to prevent loops)
        if (autoConnect && !controller.signal.aborted) {
          reconnectTimerRef.current = setTimeout(connectSSE, 5000) // Increased from 2s to 5s
        }
      } catch (err) {
        setIsConnected(false)
        if (err instanceof DOMException && err.name === 'AbortError') return
        // Auto-reconnect on error (with longer delay)
        if (autoConnect && !controller.signal.aborted) {
          reconnectTimerRef.current = setTimeout(connectSSE, 10000) // Increased from 5s to 10s
        }
      }
    }

    connectSSE()
  }, [target, autoConnect, disconnect]) // Removed callback deps - they're in refs now

  // Auto-connect when target changes
  useEffect(() => {
    if (target && autoConnect) {
      connect()
    }
    return () => {
      disconnect()
    }
  }, [target, autoConnect, connect, disconnect])

  return {
    isConnected,
    lastEvent,
    eventCount,
    connect,
    disconnect,
  }
}
