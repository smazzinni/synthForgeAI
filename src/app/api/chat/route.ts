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

4. **Generate Data**: When you have enough context to generate data, you MUST emit a BEGIN_GENERATION signal instead of generating the data directly in your response. Emit this JSON block:
   \`\`\`
   {"action":"BEGIN_GENERATION","schema":[{"name":"table_name","columns":[{"name":"id","type":"uuid"},{"name":"col1","type":"varchar(255)"}]}],"rowCounts":{"table_name":10},"database_name":"descriptive_name","instructions":"any additional context for data generation"}
   \`\`\`
   After emitting the signal, include a brief human-readable message like "I have enough context to generate your database. Starting generation now..." — but do NOT include any data in your response. The system will handle the actual data generation automatically.
   
   **CRITICAL**: Never output raw JSON data arrays or code blocks containing table data. Only use the BEGIN_GENERATION signal. The data generation is handled by a separate streaming pipeline.

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
- Data Generator: Creates realistic synthetic data rows (handled by the streaming pipeline, not in-chat)
- Quality Analyst: Validates data quality and consistency
- Privacy Officer: Ensures privacy compliance

WORKFLOW SUMMARY:
1. Ask clarifying questions using option blocks
2. Show agent status while planning
3. When ready to generate data, emit {"action":"BEGIN_GENERATION",...} signal — do NOT generate data in chat
4. After the signal, say something brief like "Starting generation..." — the system handles the rest`

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
      connectionId,
      connectionName,
      connectionDialect,
    } = body as {
      message: string
      databaseId?: string
      databaseName?: string
      history?: ChatMessage[]
      currentSchema?: Array<{ name: string; columns: Array<{ name: string; type: string }> }>
      currentData?: Record<string, unknown[]>
      conversationId?: string
      // ─── External DB connection context ───
      // When set, the AI knows it is talking to a LIVE external DB and
      // should respond with SQL inside ```sql ... ``` code blocks instead
      // of using the synthetic BEGIN_GENERATION pipeline.
      connectionId?: string
      connectionName?: string
      connectionDialect?: 'postgres' | 'mysql'
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

    // ─── External live DB mode ───
    // When a connectionId is supplied, the AI operates against a real
    // external database (Postgres or MySQL). It must respond with SQL
    // inside ```sql ... ``` code blocks; the frontend intercepts those
    // blocks and offers to execute them live against the DB (with a
    // confirmation dialog for destructive statements).
    if (connectionId) {
      systemPrompt += `\n\n## LIVE EXTERNAL DATABASE MODE

You are connected to a LIVE external database:
- Connection name: ${connectionName || '(unnamed)'}
- Dialect: ${connectionDialect || 'postgres'}

### CRITICAL RULES
1. When the user asks you to perform ANY data operation (insert, update, delete, drop, create, alter, truncate, select, etc.) you MUST respond with a SQL code block using exactly this format:
   \`\`\`sql
   -- brief explanation of what this does
   <the SQL statement(s)>
   \`\`\`
2. Only emit ONE \`\`\`sql block per response unless the user explicitly asks for multiple statements. Multiple statements inside a single block are allowed (separated by semicolons).
3. Always use the correct dialect-specific syntax (e.g. \`SERIAL\`/\`RETURNING\` for Postgres, \`AUTO_INCREMENT\` for MySQL).
4. Before destructive operations (DROP, TRUNCATE, DELETE without WHERE, mass UPDATE), include a comment like \`-- DESTRUCTIVE: this will permanently delete all rows in <table>\` on the line above the statement. The frontend will still ask the user for confirmation, but the warning helps them decide.
5. Do NOT emit BEGIN_GENERATION signals or option-block JSON in this mode — the user is working with real data, not synthetic generation.
6. If the user asks an open-ended question ("show me what's in the users table", "how many orders were placed yesterday"), respond with a SELECT query in a \`\`\`sql block. The frontend will execute it and show the rows.
7. If you need to inspect the schema to answer a question, ask the user to run \`SELECT * FROM information_schema.columns WHERE table_name='X'\` — do not guess.

### CURRENT EXTERNAL SCHEMA`
      if (currentSchema && currentSchema.length > 0) {
        systemPrompt += `\nTables:`
        for (const table of currentSchema) {
          systemPrompt += `\n- ${table.name} (${table.columns.map(c => `${c.name} ${c.type}`).join(', ')})`
        }
      } else {
        systemPrompt += `\n(No schema introspection available. Ask the user to describe the table if needed.)`
      }
      if (currentData && Object.keys(currentData).length > 0) {
        systemPrompt += `\n\n### SAMPLE ROWS (first row per table)`
        for (const [tableName, rows] of Object.entries(currentData)) {
          if (Array.isArray(rows) && rows.length > 0) {
            systemPrompt += `\n- ${tableName}: ${JSON.stringify(rows[0])}`
          }
        }
      }
      // Skip the synthetic-DB context block below
    } else if (databaseId) {
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
