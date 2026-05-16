import { NextRequest } from 'next/server'

// ─── Rate limiter ───
const chatRateLimiter = new Map<string, { count: number; resetAt: number }>()
const CHAT_RATE_LIMIT = 20
const CHAT_RATE_WINDOW = 60000

let lastCleanup = Date.now()
const CLEANUP_INTERVAL = 120000

function cleanup() {
  const now = Date.now()
  if (now - lastCleanup < CLEANUP_INTERVAL) return
  lastCleanup = now
  for (const [key, entry] of chatRateLimiter.entries()) {
    if (now > entry.resetAt) chatRateLimiter.delete(key)
  }
}

function checkRateLimit(clientId: string): boolean {
  const key = `chat:${clientId}`
  const now = Date.now()
  const entry = chatRateLimiter.get(key)
  if (!entry || now > entry.resetAt) {
    chatRateLimiter.set(key, { count: 1, resetAt: now + CHAT_RATE_WINDOW })
    return true
  }
  if (entry.count >= CHAT_RATE_LIMIT) return false
  entry.count++
  return true
}

// ─── DeepSeek API streaming ───
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY
const DEEPSEEK_API_URL = process.env.DEEPSEEK_API_URL || 'https://api.deepseek.com'

interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

const SYSTEM_PROMPT = `You are SynthForge AI, an expert synthetic data generation assistant powered by a multi-agent pipeline. You help users design database schemas and generate realistic synthetic data.

When users describe their data needs:
1. Understand their requirements (tables, relationships, constraints, volume)
2. Design an appropriate database schema with proper types
3. Generate realistic sample data (5-10 rows per table minimum)
4. Ensure privacy compliance and data quality
5. Make data realistic - use real-looking names, emails, addresses, phone numbers, etc.

IMPORTANT: When generating data, you MUST respond with a JSON code block in this exact format:
\`\`\`json
{
  "database_name": "descriptive_name",
  "tables": {
    "table_name": [
      {"column1": "value1", "column2": "value2"},
      {"column1": "value1", "column2": "value2"}
    ]
  }
}
\`\`\`

Rules for data generation:
- Use realistic values (real-looking names, emails, addresses, phone numbers, cities, companies)
- Use proper data types (numbers for quantities, ISO dates for timestamps, UUIDs for IDs)
- Include foreign key relationships between tables where appropriate
- Generate 5-10 rows per table
- Always include an "id" column as UUID for each table
- Include timestamps (created_at) as ISO 8601 strings
- Make data internally consistent (e.g., order dates after customer registration, etc.)
- Each column should have realistic constraints (not null, unique where appropriate)

Current agent: Orchestrator
You coordinate between these sub-agents:
- Schema Architect: Designs database schemas and relationships
- Data Generator: Creates realistic synthetic data rows
- Quality Analyst: Validates data quality and consistency
- Privacy Officer: Ensures privacy compliance

When responding, explain your design decisions briefly, then provide the JSON data block.`

export async function POST(request: NextRequest) {
  cleanup()

  const forwarded = request.headers.get('x-forwarded-for')
  const clientId = forwarded ? forwarded.split(',')[0] : 'unknown'
  if (!checkRateLimit(clientId)) {
    return new Response(JSON.stringify({ error: 'Rate limit exceeded' }), {
      status: 429,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  try {
    const text = await request.text()
    if (text.length > 50000) {
      return new Response(JSON.stringify({ error: 'Message too long' }), {
        status: 413,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const body = JSON.parse(text)
    const { message, databaseId, databaseName, history = [] } = body

    if (!message || typeof message !== 'string') {
      return new Response(JSON.stringify({ error: 'Message is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    if (!DEEPSEEK_API_KEY) {
      return new Response(JSON.stringify({ error: 'DeepSeek API key not configured' }), {
        status: 503,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // Build messages array with history
    const messages: ChatMessage[] = [
      { role: 'system', content: SYSTEM_PROMPT },
    ]

    // Add context about existing database
    if (databaseId) {
      messages[0].content += `\n\nThe user is currently editing database "${databaseName || databaseId}" (ID: ${databaseId}). Help them modify or extend the existing data.`
    }

    // Add conversation history (last 10 messages for context)
    const recentHistory = (history as ChatMessage[]).slice(-10)
    for (const msg of recentHistory) {
      if (msg.role === 'user' || msg.role === 'assistant') {
        messages.push({ role: msg.role, content: msg.content })
      }
    }

    // Add current user message
    messages.push({ role: 'user', content: message })

    // Call DeepSeek API with streaming
    const deepseekResponse = await fetch(`${DEEPSEEK_API_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${DEEPSEEK_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'deepseek-reasoner',
        messages,
        stream: true,
        max_tokens: 8192,
      }),
    })

    if (!deepseekResponse.ok) {
      const errorText = await deepseekResponse.text().catch(() => 'Unknown error')
      console.error('[Chat API] DeepSeek error:', deepseekResponse.status, errorText)
      return new Response(JSON.stringify({
        error: 'AI service error',
        content: 'I encountered an error connecting to the AI service. Please try again.',
      }), {
        status: deepseekResponse.status,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // Stream the response back to the client using SSE
    const encoder = new TextEncoder()
    const reader = deepseekResponse.body?.getReader()

    if (!reader) {
      return new Response(JSON.stringify({ error: 'No response stream' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const stream = new ReadableStream({
      async start(controller) {
        const decoder = new TextDecoder()
        let buffer = ''

        try {
          while (true) {
            const { done, value } = await reader.read()
            if (done) break

            buffer += decoder.decode(value, { stream: true })
            const lines = buffer.split('\n')
            buffer = lines.pop() || ''

            for (const line of lines) {
              const trimmed = line.trim()
              if (!trimmed || !trimmed.startsWith('data: ')) continue

              const data = trimmed.slice(6)
              if (data === '[DONE]') {
                // Send completion event
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'done' })}\n\n`))
                continue
              }

              try {
                const parsed = JSON.parse(data)
                const choice = parsed.choices?.[0]
                if (!choice) continue

                const delta = choice.delta

                // Handle reasoning content (Chain of Thought)
                if (delta?.reasoning_content) {
                  controller.enqueue(encoder.encode(`data: ${JSON.stringify({
                    type: 'reasoning',
                    content: delta.reasoning_content,
                  })}\n\n`))
                }

                // Handle main content (answer)
                if (delta?.content) {
                  controller.enqueue(encoder.encode(`data: ${JSON.stringify({
                    type: 'content',
                    content: delta.content,
                  })}\n\n`))
                }

                // Handle finish
                if (choice.finish_reason) {
                  controller.enqueue(encoder.encode(`data: ${JSON.stringify({
                    type: 'finish',
                    reason: choice.finish_reason,
                    usage: parsed.usage || null,
                  })}\n\n`))
                }
              } catch {
                // Skip unparseable chunks
              }
            }
          }
        } catch (err) {
          console.error('[Chat API] Stream error:', err)
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({
            type: 'error',
            content: 'Stream interrupted',
          })}\n\n`))
        } finally {
          controller.close()
        }
      },
    })

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no',
      },
    })
  } catch (error) {
    console.error('[Chat API] Unhandled error:', error)
    return new Response(JSON.stringify({
      error: 'Internal server error',
      content: 'I apologize, but I encountered an error processing your request.',
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}
