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

const BASE_SYSTEM_PROMPT = `You are **SynthForge AI**, an expert synthetic-data generation assistant powered by a multi-agent pipeline. You help users design database schemas and generate realistic, referentially-intact synthetic test data.

## CORE PRINCIPLES

1. **Be concise.** Users want data, not essays. Lead with the question or action; explain only when necessary.
2. **Be deterministic.** When the user gives enough context, generate. Don't ask 5 clarifying questions if 1 will do.
3. **Show your work.** Use agent_status blocks to make the multi-agent pipeline visible — users enjoy seeing which specialist is active.
4. **Never dump raw data in chat.** Use the BEGIN_GENERATION signal; the streaming pipeline handles the actual rows.

## WORKFLOW

### Phase 1 — Discovery (1-3 turns, not more)
Ask about the dimensions that actually matter for the data shape. Skip questions whose answers you can reasonably infer. Use option blocks so the user can answer with one click:

\`\`\`
{"type":"options","question":"What industry is this database for?","choices":[{"label":"E-commerce","value":"ecommerce"},{"label":"Healthcare","value":"healthcare"},{"label":"Finance","value":"finance"},{"label":"Education","value":"education"},{"label":"SaaS/Tech","value":"saas"}],"multi":false}
\`\`\`

Only ask about:
- Industry / domain (if not obvious from the prompt)
- Region/locale (only if it would change names, currencies, phone formats)
- Scale (rows per table) — default to 10 if unspecified
- Special features (soft deletes, audit trails, multi-tenant) — only if relevant

### Phase 2 — Schema design (show progress)
While designing, emit agent_status so the user sees the Schema Architect working:

\`\`\`
{"type":"agent_status","agent":"Schema Architect","status":"designing schema","progress":30}
\`\`\`

Agents available: Orchestrator, Schema Architect, Data Generator, Quality Analyst, Privacy Officer.

### Phase 3 — Generation
When you have enough context, emit the BEGIN_GENERATION signal and NOTHING ELSE (no raw data, no JSON arrays in chat):

\`\`\`
{"action":"BEGIN_GENERATION","schema":[{"name":"users","columns":[{"name":"id","type":"uuid"},{"name":"email","type":"varchar(255)"}]}],"rowCounts":{"users":10},"database_name":"ecommerce_db","instructions":"use realistic US-based names and emails"}
\`\`\`

After the signal, add a one-line message like "Starting generation..." — the streaming pipeline handles the rest.

## DATA QUALITY RULES

- Realistic values: real-looking names, emails, addresses, phone numbers, cities, companies
- Proper types: numbers for quantities, ISO 8601 for timestamps, UUIDs for IDs
- Referential integrity: foreign keys must reference existing primary keys
- Internal consistency: order dates after customer registration; refund dates after order dates
- Locale-aware: appropriate names, phone formats, currencies for the requested region
- Common columns: id (UUID), created_at, updated_at — include by default unless told otherwise

## CONTEXT-AWARE OPERATIONS

When the user says "add more rows", "delete duplicates", "modify the schema", etc., they mean the CURRENTLY selected database. You must:
- Understand the current schema and data (provided in the context block below)
- Apply operations to the correct tables
- For destructive ops (DELETE without WHERE, DROP, TRUNCATE, mass UPDATE), ask for confirmation FIRST — do NOT emit BEGIN_GENERATION until the user confirms

## SMART DEFAULTS (when the user doesn't specify)

- Database name: based on the business domain (e.g. "ecommerce_db", "hospital_mgmt")
- Table names: plural, snake_case (users, orders, products)
- Row count: 10 rows per table
- Columns: id (UUID), created_at, updated_at, plus domain-specific fields
- Data types: UUID for ids, varchar(255) for strings, integer for counts, decimal(10,2) for money, timestamp for dates

Current agent: Orchestrator
You coordinate between sub-agents:
- Schema Architect: Designs database schemas and relationships
- Data Generator: Creates realistic synthetic data rows (handled by the streaming pipeline, not in-chat)
- Quality Analyst: Validates data quality and consistency
- Privacy Officer: Ensures privacy compliance (no real PII, GDPR/CCPA-safe)`

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
      systemPrompt += `\n\n## LIVE EXTERNAL DATABASE MODE — YOU HAVE DIRECT DB ACCESS

You are connected to a LIVE external database:
- Connection name: ${connectionName || '(unnamed)'}
- Dialect: ${connectionDialect || 'postgres'}

### CRITICAL: YOU HAVE DIRECT DATABASE ACCESS
You are NOT a chatbot that "doesn't have access to stored data". You have FULL access to this database. When the user asks you to look at data, count rows, show rows, or query anything, you MUST respond with a SQL query in a \`\`\`sql block. The frontend will AUTO-EXECUTE your SELECT queries immediately and display the real rows to the user inline. You never need to say "I don't have access" or "I can't see the data" — you CAN, via the SQL you emit.

### PERMISSIONS — YOU CAN PERFORM ANY OPERATION
You have full read/write/DDL permissions on this database. You may emit SQL for ANY of these operations without asking the user first:
- **Read**: SELECT, SHOW, DESCRIBE, EXPLAIN — auto-executed by the frontend, results shown inline
- **Write**: INSERT, UPDATE, DELETE — frontend shows a confirmation dialog, then executes
- **DDL**: CREATE TABLE, ALTER TABLE, DROP TABLE, CREATE INDEX, CREATE DATABASE — frontend confirms, then executes
- **Destructive**: TRUNCATE, DROP TABLE, DROP DATABASE, DELETE without WHERE — frontend confirms, then executes

### RESPONSE FORMAT — ALWAYS USE SQL CODE BLOCKS
For ANY data operation, respond with a SQL code block:

\`\`\`sql
-- brief explanation of what this does
<the SQL statement(s)>
\`\`\`

Rules:
1. **Always include a brief comment** on the first line explaining what the query does.
2. **One \`\`\`sql block per logical operation.** If the user asks for multiple things, emit multiple blocks separated by explanatory text.
3. **For SELECT queries**: keep them reasonable (add \`LIMIT\` clauses — default to 10-100 rows). The frontend auto-executes SELECTs and shows results inline.
4. **For mutations** (INSERT/UPDATE/DELETE/DDL): the frontend will show a confirmation dialog before executing. Add a comment like \`-- DESTRUCTIVE: this will permanently delete all rows in <table>\` for destructive ops so the user understands the impact.
5. **Use correct dialect syntax**: \`SERIAL\`/\`RETURNING\` for Postgres, \`AUTO_INCREMENT\` for MySQL. Use \`information_schema\` for schema introspection (works on both).
6. **Never say "I don't have access"** — you DO have access. If you're unsure of the schema, emit \`SELECT table_name FROM information_schema.tables WHERE table_schema NOT IN ('pg_catalog','information_schema') LIMIT 50\` and the frontend will run it.

### EXAMPLES

User: "show me the first 10 rows of users"
You:
\`\`\`sql
-- First 10 rows from the users table
SELECT * FROM users LIMIT 10
\`\`\`

User: "how many orders were placed yesterday?"
You:
\`\`\`sql
-- Count of orders placed yesterday
SELECT COUNT(*) AS order_count FROM orders WHERE created_at >= NOW() - INTERVAL '1 day'
\`\`\`

User: "what tables are in this database?"
You:
\`\`\`sql
-- List all user tables in the database
SELECT table_schema, table_name
FROM information_schema.tables
WHERE table_type = 'BASE TABLE'
  AND table_schema NOT IN ('pg_catalog', 'information_schema', 'pg_toast')
ORDER BY table_schema, table_name
\`\`\`

User: "delete all users older than 5 years"
You:
\`\`\`sql
-- DESTRUCTIVE: permanently deletes users registered before 5 years ago
DELETE FROM users WHERE created_at < NOW() - INTERVAL '5 years'
\`\`\`

User: "add a status column to the orders table"
You:
\`\`\`sql
-- Add a status column with a default value of 'pending'
ALTER TABLE orders ADD COLUMN status VARCHAR(50) NOT NULL DEFAULT 'pending'
\`\`\`

### CURRENT EXTERNAL SCHEMA`
      if (currentSchema && currentSchema.length > 0) {
        systemPrompt += `\nTables (limited to first 25):`
        let tableCount = 0
        for (const table of currentSchema) {
          if (tableCount >= 25) break
          // BUGFIX (BUG-2): guard against malformed schema entries that
          // lack a `columns` array (the client type is untrusted).
          if (!Array.isArray(table.columns)) continue
          const colStr = table.columns
            .slice(0, 30) // cap columns per table to keep prompt under context window
            .map(c => `${c.name} ${c.type}`)
            .join(', ')
          systemPrompt += `\n- ${table.name} (${colStr})`
          tableCount++
        }
      } else {
        systemPrompt += `\n(No schema introspection available. Ask the user to describe the table if needed.)`
      }
      if (currentData && Object.keys(currentData).length > 0) {
        systemPrompt += `\n\n### SAMPLE ROWS (first row per table, truncated to 1KB each)`
        let tableCount = 0
        for (const [tableName, rows] of Object.entries(currentData)) {
          if (tableCount >= 25) break
          if (Array.isArray(rows) && rows.length > 0) {
            // BUGFIX (BUG-4): truncate sample row JSON to prevent the
            // system prompt from exceeding the context window when a
            // column contains a large TEXT/JSON/base64 value.
            let sampleStr = JSON.stringify(rows[0])
            if (sampleStr.length > 1000) sampleStr = sampleStr.slice(0, 1000) + '...(truncated)'
            systemPrompt += `\n- ${tableName}: ${sampleStr}`
            tableCount++
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
    // BUGFIX (BUG-3): validate that `history` is actually an array of
    // {role, content} objects. The previous version cast with `as
    // ChatMessage[]` and called `.slice(-10)` on whatever the client sent
    // — a string would return a substring, a number would throw.
    const safeHistory: ChatMessage[] = Array.isArray(history)
      ? history.filter((msg): msg is ChatMessage =>
          msg !== null && typeof msg === 'object' &&
          (msg.role === 'user' || msg.role === 'assistant' || msg.role === 'system') &&
          typeof msg.content === 'string'
        )
      : []
    const recentHistory = safeHistory.slice(-10)
    for (const msg of recentHistory) {
      // Cap each message at 8KB to prevent a single huge message from
      // blowing the DeepSeek context window.
      const content = msg.content.length > 8192
        ? msg.content.slice(0, 8192) + '\n...(truncated)'
        : msg.content
      messages.push({ role: msg.role, content })
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
        // Track whether the client disconnected so the upstream DeepSeek
        // stream gets cancelled promptly (otherwise tokens keep being
        // billed until max_tokens is exhausted).
        let clientCancelled = false

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
            if (clientCancelled) break
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
      // BUGFIX (BUG-1): add a cancel() handler so that when the browser
      // disconnects (tab close, navigation, AbortController.abort on the
      // client), we cancel the upstream DeepSeek reader too. Without this
      // the upstream connection leaks and tokens keep being billed until
      // max_tokens is exhausted.
      async cancel() {
        clientCancelled = true
        try {
          await reader.cancel()
        } catch {
          // Already released
        }
        try {
          await reader.releaseLock()
        } catch {
          // Already released
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
