// SSE (Server-Sent Events) endpoint for real-time updates
// This provides WebSocket-like functionality through HTTP streaming,
// compatible with Next.js API routes (no custom server needed)

import { NextRequest } from 'next/server'
import { eventBroadcaster } from '@/lib/websocket'

export const dynamic = 'force-dynamic'

// Track active connections to prevent connection flooding
const activeConnections = new Map<string, number>()
const MAX_CONNECTIONS_PER_TARGET = 3

// GET /api/events?target=conv:xxx&since=0 - SSE stream for real-time updates
export async function GET(request: NextRequest) {
  const target = request.nextUrl.searchParams.get('target')
  const since = parseInt(request.nextUrl.searchParams.get('since') || '0', 10)

  if (!target) {
    return new Response(JSON.stringify({ error: 'target parameter required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    })
  }

  // Connection limit per target to prevent flooding
  const currentCount = activeConnections.get(target) || 0
  if (currentCount >= MAX_CONNECTIONS_PER_TARGET) {
    return new Response(JSON.stringify({ error: 'Too many connections for this target' }), {
      status: 429,
      headers: { 'Content-Type': 'application/json' }
    })
  }
  activeConnections.set(target, currentCount + 1)

  // Create a readable stream that emits SSE events
  const encoder = new TextEncoder()
  let streamClosed = false

  const stream = new ReadableStream({
    start(controller) {
      // Send recent events first (for reconnection)
      const recentEvents = eventBroadcaster.getRecentEvents(target, since)
      for (const event of recentEvents) {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`))
        } catch { break }
      }

      // Send a heartbeat comment to keep the connection alive
      const heartbeatInterval = setInterval(() => {
        if (streamClosed) { clearInterval(heartbeatInterval); return }
        try {
          controller.enqueue(encoder.encode(':heartbeat\n\n'))
        } catch {
          streamClosed = true
          clearInterval(heartbeatInterval)
        }
      }, 15_000)

      // Subscribe to new events
      const unsubscribe = eventBroadcaster.subscribe(target, (event) => {
        if (streamClosed) return
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`))
        } catch {
          streamClosed = true
          unsubscribe()
          clearInterval(heartbeatInterval)
          try { controller.close() } catch { /* */ }
        }
      })

      // Clean up on close - 55 second max SSE connection (within 60s serverless limit)
      setTimeout(() => {
        if (!streamClosed) {
          streamClosed = true
          unsubscribe()
          clearInterval(heartbeatInterval)
          // Decrement connection count
          const count = activeConnections.get(target) || 1
          activeConnections.set(target, Math.max(0, count - 1))
          try { controller.close() } catch { /* */ }
        }
      }, 55_000)
    },
    cancel() {
      streamClosed = true
      // Decrement connection count
      const count = activeConnections.get(target) || 1
      activeConnections.set(target, Math.max(0, count - 1))
    }
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no', // Prevent nginx buffering
      'Access-Control-Allow-Origin': '*',
    }
  })
}
