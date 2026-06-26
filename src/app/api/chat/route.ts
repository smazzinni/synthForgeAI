import { NextRequest } from 'next/server'

// ─── DeepSeek v4 API configuration ───
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY
const DEEPSEEK_BASE_URL = process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com'
const DEEPSEEK_MODEL = process.env.DEEPSEEK_MODEL || 'deepseek-chat'
const DEEPSEEK_REASONING_MODEL = process.env.DEEPSEEK_REASONING_MODEL || DEEPSEEK_MODEL
const DEEPSEEK_MAX_TOKENS = parseInt(process.env.DEEPSEEK_MAX_TOKENS || '16000', 10)
const DEEPSEEK_THINKING_ENABLED = process.env.DEEPSEEK_THINKING_ENABLED === 'true'
const STREAM_THINKING_CONTENT = process.env.STREAM_THINKING_CONTENT === 'true'

// ─── Rate limiter ───
const chatRateLimiter = new Map<string, { count: number; resetAt: number }>()
const CHAT_RATE_LIMIT = 30
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

interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

const BASE_SYSTEM_PROMPT = `You are **SynthForge AI**, an expert synthetic-data generation assistant powered by a multi-agent pipeline. You help users design database schemas and generate realistic, referentially-intact synthetic test data.

## CORE PRINCIPLES

1. **Be concise.** Users want data, not essays. Lead with the question or action; explain only when necessary.
2. **Be deterministic.** When the user gives enough context, generate. Don't ask 5 clarifying questions if 1 will do.
3. **Ask SMART questions.** Only ask about dimensions that actually change the data shape (industry, scale, locale, special features). NEVER ask questions whose answers you can reasonably infer. Each question must have a clear purpose.
4. **Show your work.** Use agent_status blocks to make the multi-agent pipeline visible — users enjoy seeing which specialist is active.
5. **Never dump raw data in chat.** Use the BEGIN_GENERATION signal; the streaming pipeline handles the actual rows.

## SIGNAL FORMAT — CRITICAL (READ CAREFULLY)

You communicate with the frontend via INLINE JSON signals. These signals MUST be emitted as **raw JSON on their own line, NOT inside markdown code fences**. Do NOT wrap them in \`\`\` blocks. The frontend parses them by scanning for the JSON markers in your raw text output.

### Correct (raw JSON inline):
{"type":"agent_status","agent":"Schema Architect","status":"designing schema","progress":30}

### WRONG (do NOT do this — the frontend will show it as a code block and fail to parse):
\`\`\`json
{"type":"agent_status","agent":"Schema Architect","status":"designing schema","progress":30}
\`\`\`

Each signal MUST be a single line of compact JSON (no pretty-printing, no newlines inside). Emit each signal on its own line, separated by your natural-language text.

## QUESTION-ASKING RULES (CRITICAL)

Ask AT MOST 2-3 clarifying questions across the ENTIRE discovery phase. Better yet, ask ONE good question with multiple choices and reasonable defaults. Follow this decision tree:

1. If the user's prompt is specific enough (e.g. "create a 5-table e-commerce database with 50 rows each"), DO NOT ASK ANY QUESTIONS — go straight to schema design.
2. If the user gives a domain but no scale, ask ONE question combining scale + locale, with smart defaults pre-selected.
3. If the user gives scale but no domain, ask ONE question about the industry with the most common options.
4. NEVER ask about: table count (infer from domain), column names (you're the expert), data types (your job), or whether to include timestamps (always include them).

### BAD questions (never ask these):
- "What columns would you like?" (you decide — you're the schema expert)
- "What data types should each column be?" (your job)
- "Should I include id columns?" (always yes)
- "What format should the data be in?" (always NDJSON internally)

### GOOD questions (ask only when truly needed):
- Industry/domain when ambiguous
- Scale (rows per table) when not specified — default to 10
- Locale when it materially changes the data (names, currencies, phone formats)
- Special features (soft deletes, multi-tenant, audit trails) only when relevant

## WORKFLOW

### Phase 1 — Discovery (0-2 turns max)
Ask at most ONE question per turn, with clickable options. Emit the options signal INLINE (raw JSON, no code fence):

{"type":"options","question":"How many rows per table should I generate?","choices":[{"label":"10 rows (quick preview)","value":"10"},{"label":"50 rows (small dataset)","value":"50"},{"label":"100 rows (medium)","value":"100"},{"label":"500 rows (large)","value":"500"}],"multi":false}

### Phase 2 — Schema design (show progress)
While designing, emit agent_status so the user sees the Schema Architect working (INLINE, raw JSON, no code fence):

{"type":"agent_status","agent":"Schema Architect","status":"designing schema","progress":30}

Agents available: Orchestrator, Schema Architect, Data Generator, Quality Analyst, Privacy Officer.

### Phase 3 — Generation
When you have enough context, emit the BEGIN_GENERATION signal INLINE (raw JSON, no code fence) and NOTHING ELSE (no raw data, no JSON arrays in chat):

{"action":"BEGIN_GENERATION","schema":[{"name":"users","columns":[{"name":"id","type":"uuid"},{"name":"email","type":"varchar(255)"}]}],"rowCounts":{"users":10},"database_name":"ecommerce_db","instructions":"use realistic US-based names and emails"}

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

/**
 * Sanitize AI output: unwrap JSON control signals that the model may have
 * wrapped in markdown code fences (```json ... ```). The frontend parser
 * scans for inline JSON markers like {"type":"agent_status"} and
 * {"action":"BEGIN_GENERATION"}; if these are inside a code fence they show
 * up as raw code blocks instead of being parsed. This function detects
 * signal-only code blocks and unwraps them to inline JSON.
 *
 * SQL code blocks (```sql ... ```) and other non-signal code blocks are
 * left untouched.
 */
function sanitizeAISignals(content: string): string {
  return content.replace(/```(?:json)?\s*\n?([\s\S]*?)\n?```/g, (full, inner: string) => {
    const trimmed = inner.trim()
    const isSignal =
      trimmed.startsWith('{"type":"agent_status"') ||
      trimmed.startsWith('{"type": "agent_status"') ||
      trimmed.startsWith('{"type":"options"') ||
      trimmed.startsWith('{"type": "options"') ||
      trimmed.startsWith('{"action":"BEGIN_GENERATION"') ||
      trimmed.startsWith('{"action": "BEGIN_GENERATION"')

    if (!isSignal) {
      return full
    }

    const lines = trimmed.split(/\n/).filter(l => l.trim() && l.trim() !== 'json')
    const signals: string[] = []
    for (const line of lines) {
      const lt = line.trim()
      if (lt.startsWith('{') && lt.endsWith('}')) {
        signals.push(lt)
      }
    }

    if (signals.length === 0) return full
    return '\n' + signals.join('\n') + '\n'
  })
}

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
    if (connectionId) {
      systemPrompt += `\n\n## LIVE EXTERNAL DATABASE MODE — YOU HAVE DIRECT DB ACCESS

You are connected to a LIVE external database:
- Connection name: ${connectionName || '(unnamed)'}
- Dialect: ${connectionDialect || 'postgres'}

### CRITICAL: YOU HAVE DIRECT DATABASE ACCESS
You are NOT a chatbot that "doesn't have access to stored data". You have FULL access to this database. When the user asks you to look at data, count rows, show rows, or query anything, you MUST respond with a SQL query in a \`\`\`sql block. The frontend will AUTO-EXECUTE your SELECT queries immediately and display the real rows to the user inline. You never need to say "I don't have access" or "I can't see the data" — you CAN, via the SQL you emit.

### QUESTION-ASKING IN LIVE-DB MODE
In live-DB mode, ask FEWER questions than in synthetic mode — you can introspect the actual database to answer most questions yourself. If the user says "seed this database for a SaaS app", do NOT ask "what tables do you want?" — instead emit a SELECT to see what's there, then propose a schema. Only ask the user when you genuinely cannot infer the answer (e.g. "how many rows of sample data?").

### PERMISSIONS — YOU CAN PERFORM ANY OPERATION
You have full read/write/DDL permissions on this database. You may emit SQL for ANY of these operations:
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
2. **One \`\`\`sql block per logical operation.**
3. **For SELECT queries**: keep them reasonable (add \`LIMIT\` clauses — default to 10-100 rows).
4. **For mutations** (INSERT/UPDATE/DELETE/DDL): add a comment like \`-- DESTRUCTIVE: this will permanently delete all rows in <table>\` for destructive ops.
5. **Use correct dialect syntax**: \`SERIAL\`/\`RETURNING\` for Postgres, \`AUTO_INCREMENT\` for MySQL.
6. **Never say "I don't have access"** — you DO have access.

### AUTONOMOUS AGENT BEHAVIOR — RESEARCH, ACT, VERIFY, SELF-HEAL
You are an autonomous agent. When given a complex task:
1. **RESEARCH first.** Emit a SELECT to understand the current state.
2. **PLAN.** Briefly explain what you're going to do (1-2 sentences).
3. **ACT.** Emit the SQL to perform the action.
4. **VERIFY.** After each significant action, emit a SELECT to verify it worked.
5. **SELF-HEAL.** If a SQL block returns an error, analyze it and try again.

### CURRENT EXTERNAL SCHEMA`
      if (currentSchema && currentSchema.length > 0) {
        systemPrompt += `\nTables (limited to first 25):`
        let tableCount = 0
        for (const table of currentSchema) {
          if (tableCount >= 25) break
          if (!Array.isArray(table.columns)) continue
          const colStr = table.columns
            .slice(0, 30)
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
            let sampleStr = JSON.stringify(rows[0])
            if (sampleStr.length > 1000) sampleStr = sampleStr.slice(0, 1000) + '...(truncated)'
            systemPrompt += `\n- ${tableName}: ${sampleStr}`
            tableCount++
          }
        }
      }
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

    const safeHistory: ChatMessage[] = Array.isArray(history)
      ? history.filter((msg): msg is ChatMessage =>
          msg !== null && typeof msg === 'object' &&
          (msg.role === 'user' || msg.role === 'assistant' || msg.role === 'system') &&
          typeof msg.content === 'string'
        )
      : []
    const recentHistory = safeHistory.slice(-10)
    for (const msg of recentHistory) {
      const content = msg.content.length > 8192
        ? msg.content.slice(0, 8192) + '\n...(truncated)'
        : msg.content
      messages.push({ role: msg.role, content })
    }

    messages.push({ role: 'user', content: message })

    // ─── Call DeepSeek API with TRUE streaming ───
    // Use the reasoning model if thinking is enabled, else the standard model.
    const model = DEEPSEEK_THINKING_ENABLED ? DEEPSEEK_REASONING_MODEL : DEEPSEEK_MODEL

    const deepseekBody: Record<string, unknown> = {
      model,
      messages,
      stream: true,
      max_tokens: DEEPSEEK_MAX_TOKENS,
      stream_options: { include_usage: true },
    }

    // Note: deepseek-v4-pro returns reasoning_content by default.
    // The "thinking" field is not needed and may cause errors on some API versions.
    // DEEPSEEK_THINKING_ENABLED just controls whether we STREAM the reasoning_content
    // to the frontend (via STREAM_THINKING_CONTENT), not whether the model reasons.

    const deepseekResponse = await fetch(`${DEEPSEEK_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${DEEPSEEK_API_KEY}`,
      },
      body: JSON.stringify(deepseekBody),
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

    // ─── Stream the response back to the client using SSE ───
    // DeepSeek returns a true SSE stream, so we pipe it through, parsing each
    // `data:` line and re-emitting normalized SSE events for the frontend.
    const encoder = new TextEncoder()
    const reader = deepseekResponse.body?.getReader()

    if (!reader) {
      return new Response(JSON.stringify({ error: 'No response stream' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    let clientCancelled = false
    const stream = new ReadableStream({
      async start(controller) {
        const decoder = new TextDecoder()
        let buffer = ''
        let closed = false
        // Accumulate content so we can sanitize signals before emitting to the
        // frontend. We buffer incrementally and emit sanitized chunks.
        let contentAccumulator = ''
        let lastEmittedLen = 0

        const safeEnqueue = (data: Uint8Array) => {
          if (closed) return
          try {
            controller.enqueue(data)
          } catch {
            closed = true
          }
        }

        // Emit sanitized content delta. We only emit text that is "safe" —
        // i.e. not part of an in-progress code fence that might be a signal.
        const flushSafe = () => {
          if (contentAccumulator.length <= lastEmittedLen) return
          // Find the last incomplete code fence boundary — anything after it
          // is "in progress" and shouldn't be emitted yet (it might be a
          // signal we need to unwrap).
          const pending = contentAccumulator.slice(lastEmittedLen)
          // Look for an opening ``` that hasn't been closed
          const lastOpenFence = pending.lastIndexOf('```')
          if (lastOpenFence !== -1) {
            // Check if there's a closing ``` after it
            const afterOpen = pending.slice(lastOpenFence + 3)
            const closingFence = afterOpen.indexOf('```')
            if (closingFence === -1) {
              // The fence is still open — emit only up to the fence start
              const safe = pending.slice(0, lastOpenFence)
              if (safe) {
                safeEnqueue(encoder.encode(`data: ${JSON.stringify({
                  type: 'content',
                  content: safe,
                })}\n\n`))
              }
              lastEmittedLen += lastOpenFence
              return
            }
          }
          // No open fence — emit everything
          safeEnqueue(encoder.encode(`data: ${JSON.stringify({
            type: 'content',
            content: pending,
          })}\n\n`))
          lastEmittedLen = contentAccumulator.length
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
                // Flush any remaining content, then send done
                flushSafe()
                // Also do a final sanitize pass on the full content and
                // emit a correction if needed (rare — only if signals were
                // wrapped in code fences)
                const sanitized = sanitizeAISignals(contentAccumulator)
                if (sanitized !== contentAccumulator && sanitized.length > lastEmittedLen) {
                  // Emit the delta of the sanitized version
                  const delta = sanitized.slice(lastEmittedLen)
                  if (delta) {
                    safeEnqueue(encoder.encode(`data: ${JSON.stringify({
                      type: 'content',
                      content: delta,
                    })}\n\n`))
                  }
                }
                safeEnqueue(encoder.encode(`data: ${JSON.stringify({ type: 'done' })}\n\n`))
                continue
              }

              try {
                const parsed = JSON.parse(data)
                const choice = parsed.choices?.[0]
                if (!choice) continue

                const delta = choice.delta

                // Handle reasoning content (Chain of Thought)
                if (delta?.reasoning_content && STREAM_THINKING_CONTENT) {
                  safeEnqueue(encoder.encode(`data: ${JSON.stringify({
                    type: 'reasoning',
                    content: delta.reasoning_content,
                  })}\n\n`))
                }

                // Handle main content (answer)
                if (delta?.content) {
                  contentAccumulator += delta.content
                  flushSafe()
                }

                // Handle finish
                if (choice.finish_reason) {
                  // Final flush
                  flushSafe()
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
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    return new Response(JSON.stringify({
      error: 'Internal server error',
      content: `I encountered an error: ${errorMessage}`,
      details: process.env.NODE_ENV === 'development' ? errorMessage : undefined,
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}
