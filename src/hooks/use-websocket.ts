'use client'

import { useEffect, useRef, useState, useCallback } from 'react'

// ─── WebSocket Hook for SynthForge AI ──────────────────────────────
// Provides real-time updates alongside SSE.
// When WebSocket is unavailable, SSE handles all real-time communication.

interface UseWebSocketOptions {
  conversationId?: string
  databaseId?: string
  onAgentStep?: (data: { stepIndex: number; agent: string; task: string; status: string; output?: string }) => void
  onAgentReasoning?: (data: { type: string; label: string; description: string; status: string; output?: string }) => void
  onDataChunk?: (data: { tableName: string; rows: Record<string, unknown>[]; offset: number; total: number }) => void
  onDataComplete?: (data: { tables: string[]; totalRows: number }) => void
  onPipelineProgress?: (data: { pipelineId: string; stepIndex: number; status: string }) => void
}

/**
 * Hook for WebSocket real-time updates.
 * Currently operates in SSE-fallback mode since the hosting platform
 * uses Next.js API routes (which don't support WebSocket natively).
 * SSE events in the chat route handle all real-time communication.
 *
 * This hook is ready for when a custom server with Socket.IO is deployed.
 */
export function useWebSocket(_options: UseWebSocketOptions = {}) {
  const [isConnected, setIsConnected] = useState(false)
  const wsRef = useRef<unknown>(null)

  useEffect(() => {
    // In SSE fallback mode, WebSocket is not connected.
    // When a custom server with Socket.IO is available, connect here:
    // const socket = io({ path: '/api/ws', transports: ['websocket', 'polling'] })
    // wsRef.current = socket
    // socket.on('connect', () => setIsConnected(true))
    // socket.on('disconnect', () => setIsConnected(false))
    // Register event handlers from options
    // if (options.onAgentStep) socket.on('agent:step', options.onAgentStep)
    // etc.

    return () => {
      // Cleanup: socket.disconnect()
      wsRef.current = null
      setIsConnected(false)
    }
  }, [_options.conversationId, _options.databaseId])

  const emit = useCallback((_event: string, _data: unknown) => {
    // When WebSocket is connected:
    // if (wsRef.current?.connected) wsRef.current.emit(event, data)
  }, [])

  return { isConnected, emit }
}
