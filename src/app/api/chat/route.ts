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

const BASE_SYSTEM_PROMPT = `You are SynthForge AI, an expert synthetic data generation assistant powered by a multi-agent pipeline. You help users design database schemas and generate realistic synthetic data.

## YOUR BEHAVIOR

When users describe their data needs, you act as a smart database architect who asks clarifying questions before generating data. You should:

1. **Ask Interactive Questions**: Before generating, ask about:
   - Business type and Industry (offer choices)
   - Target country/region for localized data
   - Data size (how many rows per table)
   - Data realism level (basic/demo vs. production-quality)
   - Special requirements (timestamps, soft deletes, audit trails)

2. **Use Structured Options**: When asking questions, embed option blocks in your response:
   For single-choice questions:
   \`\`\`
   {"type":"options","question":"What industry is this database for?","choices":[{"label":"E-commerce","value":"ecommerce"},{"label":"Healthcare","value":"healthcare"},{"label":"Finance","value":"finance"},{"label":"Education","value":"education"},{"label":"SaaS/Tech","value":"saas"}],"multi":false}
   \`\`\`

   For multiple-choice:
   \`\`\`
   {"type":"options","question":"What features should be included?","choices":[{"label":"Soft deletes","value":"soft_deletes"},{"label":"Audit trail","value":"audit_trail"},{"label":"Multi-tenant","value":"multi_tenant"},{"label":"UUIDs","value":"uuids"}],"multi":true}
   \`\`\`

3. **Show Agent Status**: When working, indicate which sub-agent is active:
   \`\`\`
   {"type":"agent_status","agent":"Schema Architect","status":"designing","progress":30}
   \`\`\`
   Use these agents: Orchestrator, Schema Architect, Data Generator, Quality Analyst, Privacy Officer

4. **Generate Data**: When generating data, you MUST respond with a JSON code block in this exact format:
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

## DATA GENERATION RULES

- Use realistic values (real-looking names, emails, addresses, phone numbers, cities, companies)
- Use proper data types (numbers for quantities, ISO dates for timestamps, UUIDs for IDs)
- Include foreign key relationships between tables where appropriate
- Generate 5-10 rows per table (or as requested)
- Always include an "id" column as UUID for each table
- Include timestamps (created_at) as ISO 8601 strings
- Make data internally consistent (e.g., order dates after customer registration, etc.)
- Each column should have realistic constraints
- For localized data, use appropriate names, phone formats, currencies, and addresses
- For time-series data, ensure realistic patterns (trends, seasonality, anomalies)
- For transactional data, ensure realistic distributions

## CONTEXT-AWARE OPERATIONS

When the user references "add more rows", "delete duplicates", "modify the schema", etc., they are ALWAYS referring to the currently selected database. You must:
- Understand the current database schema and data
- Apply operations to the correct tables
- Show previews of what will change before executing
- For destructive actions (DELETE, DROP, TRUNCATE, mass UPDATE), ask for confirmation:
  "⚠️ This will [description of action]. Are you sure you want to proceed?"

## SMART DEFAULTS

When the user doesn't specify, make intelligent assumptions:
- Database name: based on the business domain
- Table names: plural, snake_case
- Row count: 10 rows per table
- Include common fields: id (UUID), created_at, updated_at
- Use appropriate data types for each column

Current agent: Orchestrator
You coordinate between these sub-agents:
- Schema Architect: Designs database schemas and relationships
- Data Generator: Creates realistic synthetic data rows
- Quality Analyst: Validates data quality and consistency
- Privacy Officer: Ensures privacy compliance`

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
    if (text.length > 200000) {
      return new Response(JSON.stringify({ error: 'Message too long' }), {
        status: 413,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const body = JSON.parse(text)
    const {
      message,
      databaseId,
      databaseName,
      history = [],
      currentSchema,
      currentData,
      conversationId,
    } = body as {
      message: string
      databaseId?: string
      databaseName?: string
      history?: ChatMessage[]
      currentSchema?: Array<{ name: string; columns: Array<{ name: string; type: string }> }>
      currentData?: Record<string, unknown[]>
      conversationId?: string
    }

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

    // Build system prompt with context
    let systemPrompt = BASE_SYSTEM_PROMPT

    // Add context about existing database
    if (databaseId) {
      systemPrompt += `\n\n## CURRENT DATABASE CONTEXT`
      systemPrompt += `\nYou are currently editing database "${databaseName || databaseId}" (ID: ${databaseId}).`
      if (conversationId) {
        systemPrompt += `\nConversation ID: ${conversationId}`
      }

      if (currentSchema && currentSchema.length > 0) {
        systemPrompt += `\n\n### Current Schema:`
        for (const table of currentSchema) {
          systemPrompt += `\n- Table "${table.name}": ${table.columns.map(c => `${c.name}(${c.type})`).join(', ')}`
        }
      }

      if (currentData && Object.keys(currentData).length > 0) {
        systemPrompt += `\n\n### Current Data Summary:`
        for (const [tableName, rows] of Object.entries(currentData)) {
          if (Array.isArray(rows)) {
            systemPrompt += `\n- Table "${tableName}": ${rows.length} rows`
            if (rows.length > 0) {
              const sampleRow = rows[0] as Record<string, unknown>
              systemPrompt += ` | Columns: ${Object.keys(sampleRow).join(', ')}`
            }
          }
        }
        systemPrompt += `\n\nWhen the user says "add more rows", "delete", "update", etc., they are referring to THIS database.`
      }

      systemPrompt += `\n\nIMPORTANT: When modifying existing data, include ALL tables in your response (both modified and unmodified). Do not omit tables that haven't changed.`
    }

    // Build messages array with history
    const messages: ChatMessage[] = [
      { role: 'system', content: systemPrompt },
    ]

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
        max_tokens: 16384,
        stream_options: { include_usage: true },
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
        let closed = false

        const safeEnqueue = (data: Uint8Array) => {
          if (closed) return
          try {
            controller.enqueue(data)
          } catch {
            closed = true
          }
        }

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
                safeEnqueue(encoder.encode(`data: ${JSON.stringify({ type: 'done' })}\n\n`))
                continue
              }

              try {
                const parsed = JSON.parse(data)
                const choice = parsed.choices?.[0]
                if (!choice) continue

                const delta = choice.delta

                // Handle reasoning content (Chain of Thought)
                if (delta?.reasoning_content) {
                  safeEnqueue(encoder.encode(`data: ${JSON.stringify({
                    type: 'reasoning',
                    content: delta.reasoning_content,
                  })}\n\n`))
                }

                // Handle main content (answer)
                if (delta?.content) {
                  safeEnqueue(encoder.encode(`data: ${JSON.stringify({
                    type: 'content',
                    content: delta.content,
                  })}\n\n`))
                }

                // Handle finish
                if (choice.finish_reason) {
                  safeEnqueue(encoder.encode(`data: ${JSON.stringify({
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
          safeEnqueue(encoder.encode(`data: ${JSON.stringify({
            type: 'error',
            content: 'Stream interrupted',
          })}\n\n`))
        } finally {
          if (!closed) {
            try {
              controller.close()
            } catch {
              // Already closed
            }
          }
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
