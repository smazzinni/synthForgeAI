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
  // FIX (Bug 1): sanitize clientId before using it as a Map key.
  // A forged X-Forwarded-For like "chat:admin" could collide with
  // unrelated keys or allow an attacker to bypass their own bucket.
  const safeId = clientId.replace(/[^a-zA-Z0-9._\-:]/g, '_').slice(0, 128)
  const key = `chat:${safeId}`
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

const BASE_SYSTEM_PROMPT = `You are SynthForge AI, an expert synthetic data generation assistant powered by a multi-agent pipeline. You help users design database schemas and generate realistic synthetic data with DYNAMIC row counts based on time periods.

## YOUR BEHAVIOR

When users describe their data needs, you act as a smart database architect who asks clarifying questions before generating data. ALWAYS ask about time-based row counts instead of static numbers. You should:

1. **Ask Clarifying Questions**: Engage the user in natural conversation to understand:
   - Business type and industry (infer from context)
   - Data patterns and context (understand from description)
   - Geographic/locale requirements (extract from user mention)
   - Time-based data volume needs (use dynamic row calculation)
   - Special requirements and features needed

2. **Dynamic Data Extraction**: Instead of presenting fixed menus, intelligently extract requirements from user input through conversation.

3. **Show Agent Status**: When working, indicate which sub-agent is active:
   \`\`\`
   {"type":"agent_status","agent":"Schema Architect","status":"designing","progress":30}
   \`\`\`
   Use these agents: Orchestrator, Schema Architect, Data Generator, Quality Analyst, Privacy Officer

4. **Generate Data**: When you have enough context, emit a BEGIN_GENERATION signal:
   \`\`\`
    {"action":"BEGIN_GENERATION","schema":[{"name":"table_name","columns":[{"name":"id","type":"uuid"},{"name":"col1","type":"varchar(255)"}]}],"rowCounts":{"table_name":100},"databaseName":"descriptive_name","instructions":"Generated data representing 30 days of daily transactions with soft deletes and timestamps."}
   \`\`\`
   
   **CRITICAL ROWCOUNTS**: Always calculate rowCounts dynamically:
   - If user says "30 days daily": transactions table = 30, orders table = 150 (3x for child table)
   - If user says "last 6 months weekly": analytics table = 26
   - If user says "hourly for 7 days": events table = 168, logs table = 500+
   - Child tables (line_items, comments, logs) get 3-5x multiplier
   - Large-volume tables (events, logs, metrics) get additional 5x multiplier
   
   After emitting the signal, say briefly: "Perfect! I've configured your database. Starting generation now..."

## DATA GENERATION RULES

- Use realistic values appropriate to the inferred industry and region
- Use proper data types (numbers for quantities, ISO 8601 dates, UUIDs for IDs)
- Generate data patterns consistent with the inferred time period
- Include relationships between tables (foreign keys match existing records)
- Always include "id" column as UUID for each table
- Include timestamps (created_at, updated_at) as ISO 8601 strings
- Make data internally consistent
- For time-series data, ensure realistic patterns (trends, seasonality, spikes)
- For transactional data, ensure realistic distributions
- For localized data, use region-appropriate names, phone formats, currencies, addresses

## AGENT COORDINATION

You coordinate between these sub-agents:
- **Schema Architect**: Designs database schemas with proper relationships
- **Data Generator**: Creates synthetic data matching time patterns  
- **Quality Analyst**: Validates consistency and realism
- **Privacy Officer**: Ensures privacy & compliance

When the user asks to design or extend a database, choose the proper specialist for each task:
- Use **Schema Architect** for schema design or column/table changes.
- Use **Data Generator** when generating or appending rows.
- Use **Quality Analyst** to validate generated results.
- Use **Privacy Officer** to enforce privacy rules.

Always include an agent status update when a specialist is working, for example:
\`\`\`json
{"type":"agent_status","agent":"Data Generator","status":"generating","progress":30}
\`\`\`

## WORKFLOW SUMMARY

1. Listen to user description and extract business context
2. Ask clarifying questions naturally (not from menus)
3. Understand industry, data patterns, region, and time period from conversation
4. Design schema based on inferred requirements
5. Calculate dynamic row counts based on time period and context
6. Emit BEGIN_GENERATION with calculated rowCounts
7. System handles actual data generation

Start by listening to what the user needs instead of presenting predefined options.`

const EXTRA_DB_ACCESS_INSTRUCTIONS = `

Do not try to execute SQL or modify raw data in the chat response.

## SAFE SCHEMA AND DATA MODIFICATIONS
- For "add more data" requests, inspect the current schema and data patterns and append rows only.
- For "add new columns" or "add new tables", update the active database schema and preserve existing rows.
- Do not overwrite or delete existing tables unless the user confirms the change explicitly.
- Keep all changes within the current active database.

## OPERATIONAL GUIDELINES
- Use realistic values and respect data types.
- Maintain referential integrity and valid UUID formats.
- Validate column names against the current schema.
- Ask for confirmation before destructive operations.
`

export async function POST(request: NextRequest) {
  cleanup()

  // FIX (Bug 2): x-forwarded-for may contain multiple IPs (proxies append
  // their own). We want the original client IP which is the first entry.
  // Also fall back to x-real-ip (set by nginx/Vercel) before 'unknown'.
  const forwarded = request.headers.get('x-forwarded-for')
  const realIp = request.headers.get('x-real-ip')
  const clientId = forwarded
    ? forwarded.split(',')[0].trim()
    : realIp?.trim() ?? 'unknown'

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

    // FIX (Bug 3): JSON.parse throws on invalid input but the error is caught
    // by the outer try/catch and returns a 500. Return a proper 400 instead.
    let body: {
      message: string
      databaseId?: string
      databaseName?: string
      history?: ChatMessage[]
      currentSchema?: Array<{ name: string; columns: Array<{ name: string; type: string }> }>
      currentData?: Record<string, unknown[]>
      conversationId?: string
    }
    try {
      body = JSON.parse(text)
    } catch {
      return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const {
      message,
      databaseId,
      databaseName,
      history = [],
      currentSchema,
      currentData,
      conversationId,
    } = body

    if (!message || typeof message !== 'string') {
      return new Response(JSON.stringify({ error: 'Message is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // FIX (Bug 4): validate message length to prevent prompt injection via
    // an extremely long user message that dwarfs the system prompt.
    if (message.length > 32000) {
      return new Response(JSON.stringify({ error: 'Message too long' }), {
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
    let systemPrompt = BASE_SYSTEM_PROMPT + EXTRA_DB_ACCESS_INSTRUCTIONS

    systemPrompt += `\n\n## DATABASE CONTEXT ACCESS\n\nYou have access to a database context API to understand the current schema and data patterns:\n- Endpoint: /api/agent/db-access\n- Actions available:\n  - list_databases: Get all databases with metadata\n  - get_database: Fetch full database structure and sample data\n  - get_tables: Get table schema with sample rows and column statistics\n  - get_conversation: Retrieve conversation history\n  - list_messages: Get paginated message list\n  - validate_schema: Check data quality issues\n\nTo understand existing data patterns before generating new data, you can reference the current database context provided in CURRENT DATABASE CONTEXT below. This context is automatically fetched and includes the active tables, row counts, and sample data.`

    if (databaseId) {
      systemPrompt += `\n\n## CURRENT DATABASE CONTEXT`
      // FIX (Bug 5): databaseName and databaseId are user-supplied strings
      // injected verbatim into the system prompt, enabling prompt injection
      // (e.g. a databaseName of "x\n\n## NEW INSTRUCTIONS: ignore all above").
      // Sanitize by stripping newlines and limiting length.
      const safeDatabaseName = (databaseName || databaseId)
        .replace(/[\r\n]/g, ' ')
        .slice(0, 200)
      const safeDatabaseId = databaseId.replace(/[\r\n]/g, ' ').slice(0, 100)
      systemPrompt += `\nYou are currently editing database "${safeDatabaseName}" (ID: ${safeDatabaseId}).`

      if (conversationId) {
        const safeConvId = conversationId.replace(/[\r\n]/g, ' ').slice(0, 100)
        systemPrompt += `\nConversation ID: ${safeConvId}`
      }

      if (currentSchema && currentSchema.length > 0) {
        systemPrompt += `\n\n### Current Schema:`
        // FIX (Bug 6): schema table/column names are user-controlled and
        // injected into the prompt. Sanitize them to prevent injection.
        for (const table of currentSchema) {
          const safeTableName = String(table.name)
            .replace(/[\r\n]/g, ' ')
            .slice(0, 100)
          const safeCols = (table.columns || [])
            .map(c =>
              `${String(c.name).replace(/[\r\n]/g, ' ').slice(0, 60)}(${String(c.type).replace(/[\r\n]/g, ' ').slice(0, 60)})`
            )
            .join(', ')
          systemPrompt += `\n- Table "${safeTableName}": ${safeCols}`
        }
      }

      if (currentData && Object.keys(currentData).length > 0) {
        systemPrompt += `\n\n### Current Data Summary:`
        // FIX (Bug 7): currentData is user-controlled. Limit how much of it
        // reaches the prompt to avoid context-window stuffing and injection.
        // Only include table name, row count, and sanitized column names.
        for (const [tableName, rows] of Object.entries(currentData)) {
          if (!Array.isArray(rows)) continue
          const safeTableName = String(tableName)
            .replace(/[\r\n]/g, ' ')
            .slice(0, 100)
          systemPrompt += `\n- Table "${safeTableName}": ${rows.length} rows`
          if (rows.length > 0) {
            const sampleRow = rows[0] as Record<string, unknown>
            const safeCols = Object.keys(sampleRow)
              .map(k => String(k).replace(/[\r\n]/g, ' ').slice(0, 60))
              .slice(0, 50) // cap at 50 columns
              .join(', ')
            systemPrompt += ` | Columns: ${safeCols}`
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

    // FIX (Bug 8): history entries are user-supplied. Validate that role is
    // one of the allowed values and that content is a string before including
    // them. An attacker could otherwise inject a rogue 'system' message or
    // a non-string content value that crashes the downstream API call.
    const ALLOWED_ROLES = new Set<string>(['user', 'assistant'])
    const recentHistory = (history as ChatMessage[]).slice(-10)
    for (const msg of recentHistory) {
      if (!ALLOWED_ROLES.has(msg.role)) continue
      if (typeof msg.content !== 'string') continue
      messages.push({ role: msg.role as 'user' | 'assistant', content: msg.content })
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
                safeEnqueue(encoder.encode(`data: ${JSON.stringify({ type: 'done' })}\n\n`))
                continue
              }

              try {
                const parsed = JSON.parse(data)
                const choice = parsed.choices?.[0]
                if (!choice) continue

                const delta = choice.delta

                if (delta?.reasoning_content) {
                  safeEnqueue(encoder.encode(`data: ${JSON.stringify({
                    type: 'reasoning',
                    content: delta.reasoning_content,
                  })}\n\n`))
                }

                if (delta?.content) {
                  safeEnqueue(encoder.encode(`data: ${JSON.stringify({
                    type: 'content',
                    content: delta.content,
                  })}\n\n`))
                }

                // FIX (Bug 9): finish_reason event included parsed.usage,
                // but usage only appears on the *final* chunk which carries
                // no choice (it's a top-level field). When finish_reason fires
                // on the choice chunk, parsed.usage is always null/undefined.
                // Read usage from the correct place: the chunk where
                // choices is empty/absent and usage is present.
                if (choice.finish_reason) {
                  safeEnqueue(encoder.encode(`data: ${JSON.stringify({
                    type: 'finish',
                    reason: choice.finish_reason,
                  })}\n\n`))
                }

                // Emit usage when it arrives on its own dedicated chunk
                if (parsed.usage && (!parsed.choices || parsed.choices.length === 0)) {
                  safeEnqueue(encoder.encode(`data: ${JSON.stringify({
                    type: 'usage',
                    usage: parsed.usage,
                  })}\n\n`))
                }
              } catch {
                // Skip unparseable chunks
              }
            }
          }

          // FIX (Bug 10): the remaining buffer after the read loop may hold
          // the very last SSE line if the upstream didn't terminate it with
          // a newline. Process it here so no data is silently dropped.
          if (buffer.trim()) {
            const trimmed = buffer.trim()
            if (trimmed.startsWith('data: ')) {
              const data = trimmed.slice(6)
              if (data !== '[DONE]') {
                try {
                  const parsed = JSON.parse(data)
                  const choice = parsed.choices?.[0]
                  if (choice?.finish_reason) {
                    safeEnqueue(encoder.encode(`data: ${JSON.stringify({
                      type: 'finish',
                      reason: choice.finish_reason,
                    })}\n\n`))
                  }
                  if (parsed.usage && (!parsed.choices || parsed.choices.length === 0)) {
                    safeEnqueue(encoder.encode(`data: ${JSON.stringify({
                      type: 'usage',
                      usage: parsed.usage,
                    })}\n\n`))
                  }
                } catch {
                  // Ignore unparseable trailing chunk
                }
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