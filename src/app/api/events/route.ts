// SSE (Server-Sent Events) endpoint for real-time updates
// This provides WebSocket-like functionality through HTTP streaming,
// compatible with Next.js API routes (no custom server needed)

import { NextRequest, NextResponse } from 'next/server'
import { eventBroadcaster } from '@/lib/websocket'

export const dynamic = 'force-dynamic'

// Track active connections to prevent connection flooding
const activeConnections = new Map<string, number>()
const MAX_CONNECTIONS_PER_TARGET = 3
const MAX_GLOBAL_CONNECTIONS = 20
let totalActiveConnections = 0

// GET /api/events?target=conv:xxx&since=0 - SSE stream for real-time updates
export async function GET(request: NextRequest) {
  try {
    const target = request.nextUrl.searchParams.get('target')
    const since = parseInt(request.nextUrl.searchParams.get('since') || '0', 10)

    if (!target) {
      return new Response(JSON.stringify({ error: 'target parameter required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      })
    }

    // Validate target format to prevent injection
    if (!/^[a-zA-Z0-9_-]+:[a-zA-Z0-9_-]+$/.test(target)) {
      return new Response(JSON.stringify({ error: 'Invalid target format' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      })
    }

    // Global connection limit to prevent server overload
    if (totalActiveConnections >= MAX_GLOBAL_CONNECTIONS) {
      return new Response(JSON.stringify({ error: 'Server connection limit reached. Try again later.' }), {
        status: 429,
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
    totalActiveConnections++

    // Create a readable stream that emits SSE events
    const encoder = new TextEncoder()
    let streamClosed = false
    // Track all intervals/timeouts for proper cleanup
    let heartbeatInterval: ReturnType<typeof setInterval> | null = null
    let maxTimeout: ReturnType<typeof setTimeout> | null = null
    let unsubscribeFn: (() => void) | null = null

    const cleanup = () => {
      if (!streamClosed) {
        streamClosed = true
        const count = activeConnections.get(target) || 1
        activeConnections.set(target, Math.max(0, count - 1))
        totalActiveConnections = Math.max(0, totalActiveConnections - 1)
      }
      // Clear all timers
      if (heartbeatInterval) { clearInterval(heartbeatInterval); heartbeatInterval = null }
      if (maxTimeout) { clearTimeout(maxTimeout); maxTimeout = null }
      // Unsubscribe from event broadcaster
      if (unsubscribeFn) { unsubscribeFn(); unsubscribeFn = null }
    }

    const stream = new ReadableStream({
      start(controller) {
        // Send recent events first (for reconnection)
        try {
          const recentEvents = eventBroadcaster.getRecentEvents(target, since)
          for (const event of recentEvents) {
            try {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`))
            } catch { break }
          }
        } catch {
          // getRecentEvents may fail if eventBroadcaster is not initialized
        }

        // Send a heartbeat comment to keep the connection alive
        heartbeatInterval = setInterval(() => {
          if (streamClosed) {
            if (heartbeatInterval) { clearInterval(heartbeatInterval); heartbeatInterval = null }
            return
          }
          try {
            controller.enqueue(encoder.encode(':heartbeat\n\n'))
          } catch {
            cleanup()
            try { controller.close() } catch { /* */ }
          }
        }, 15_000)

        // Subscribe to new events
        unsubscribeFn = eventBroadcaster.subscribe(target, (event) => {
          if (streamClosed) return
          try {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`))
          } catch {
            cleanup()
            try { controller.close() } catch { /* */ }
          }
        })

        // 60 second max SSE connection (increased from 30s, prevents resource exhaustion)
        maxTimeout = setTimeout(() => {
          if (!streamClosed) {
            // Send a reconnect hint before closing
            try {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'connection', data: { action: 'reconnect', reason: 'timeout' } })}\n\n`))
            } catch { /* connection already broken */ }
            cleanup()
            try { controller.close() } catch { /* */ }
          }
        }, 60_000)
      },
      cancel() {
        cleanup()
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
  } catch (error) {
    console.error('[Events API] Unhandled error:', error)
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    })
  }
}
