import { NextRequest } from 'next/server'
import {
  checkRateLimit,
  periodicCleanup,
  type RateLimitEntry,
} from '@/lib/in-memory-rate-limit'

// ─── Rate limiter (bounded; see in-memory-rate-limit) ───
const chatRateLimiter = new Map<string, RateLimitEntry>()
const CHAT_RATE_LIMIT = 20
const CHAT_RATE_WINDOW = 60_000

const lastCleanup = { value: Date.now() }
const CLEANUP_INTERVAL = 120_000

// ─── DeepSeek API streaming ───
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY
const DEEPSEEK_API_URL = process.env.DEEPSEEK_API_URL || 'https://api.deepseek.com'

interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

const BASE_SYSTEM_PROMPT = `You are SynthForge AI, an expert synthetic data generation assistant powered by a multi-agent pipeline. You help users design database schemas and generate realistic synthetic data with DYNAMIC row counts based on time periods.

## YOUR BEHAVIOR (STRUCTURED INTAKE)

When the user wants a **new** database and details are still missing, run a **short guided intake**: structured tap-to-answer questions instead of only vague open-ended text.

1. **Questionnaire JSON (preferred for greenfield requests)**  
   Output **one** markdown JSON code block at the **end** of your reply (after 1–2 sentences of friendly intro) using this shape:
   \`\`\`json
   {
     "type": "questionnaire",
     "title": "Shape your database",
     "questions": [
       {
         "id": "domain",
         "question": "What kind of product or business is this for?",
         "type": "single_choice",
         "customAnswerAllowed": true,
         "choices": [
           { "label": "E-commerce / retail", "value": "ecommerce" },
           { "label": "SaaS / B2B product", "value": "saas" },
           { "label": "Healthcare / clinics", "value": "healthcare" },
           { "label": "Finance / fintech", "value": "fintech" }
         ]
       },
       {
         "id": "entities",
         "question": "Which core entities should we model first?",
         "type": "single_choice",
         "customAnswerAllowed": true,
         "choices": [
           { "label": "Users, orders, payments", "value": "commerce_core" },
           { "label": "Customers, subscriptions, invoices", "value": "billing_core" },
           { "label": "Patients, appointments, providers", "value": "clinical_core" },
           { "label": "Accounts, transactions, cards", "value": "banking_core" }
         ]
       },
       {
         "id": "time_volume",
         "question": "What time range and rough volume should drive row counts?",
         "type": "single_choice",
         "customAnswerAllowed": true,
         "choices": [
           { "label": "Last 30 days · daily activity", "value": "30d_daily" },
           { "label": "Last 7 days · hourly events", "value": "7d_hourly" },
           { "label": "Last 12 months · monthly snapshots", "value": "12m_monthly" },
           { "label": "Last 90 days · mixed cadence", "value": "90d_mixed" }
         ]
       },
       {
         "id": "locale",
         "question": "Which locale or region should names, currency, and formats follow?",
         "type": "single_choice",
         "customAnswerAllowed": true,
         "choices": [
           { "label": "United States", "value": "US" },
           { "label": "European Union (mixed)", "value": "EU" },
           { "label": "United Kingdom", "value": "UK" },
           { "label": "India", "value": "IN" }
         ]
       },
       {
         "id": "extras",
         "question": "Want to add more requirements? (compliance, extra tables, edge cases—optional)",
         "type": "text_input",
         "required": false,
         "skipOption": true
       }
     ]
   }
   \`\`\`

   **Rules for this block**
   - Use **exactly 4** \`single_choice\` questions first; each must have **exactly 4** entries in \`choices\` (clear, mutually exclusive labels).
   - Set \`"customAnswerAllowed": true\` on each of those four so the user can switch to free text (“Something else”) in the UI.
   - Add a **fifth** question at the end: \`"type": "text_input"\`, \`"required": false\`, \`"skipOption": true\` — this is the “add more detail / more questions” step.
   - Tailor the **wording** of questions and the four choices to the user’s message (swap labels/values to match their domain); keep the same structure and counts.
   - If the user already gave exhaustive detail in one message, you may **skip** the questionnaire and go straight to schema design + \`BEGIN_GENERATION\` when appropriate.

2. **Single-step chips (optional)**: For small follow-ups only, you may instead emit \`{"type":"options","question":"...","choices":[...]}\` with **exactly 4** choices plus \`"customAnswer": true\` so the user can type a custom answer.

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

1. Listen to the user and infer business context.
2. If requirements are incomplete for a new database, emit the **questionnaire** JSON (4 choice questions + optional text).
3. After you have enough answers (from the questionnaire or from a detailed user message), design the schema.
4. Calculate dynamic row counts from the chosen time cadence; child / log tables use sensible multipliers.
5. Emit \`BEGIN_GENERATION\` with calculated \`rowCounts\`.
6. The system runs actual data generation.

Do **not** paste raw questionnaire JSON outside the fenced code block. Do not mix a full questionnaire with a separate \`options\` chip in the same turn.`

const EXTRA_DB_ACCESS_INSTRUCTIONS = `

Do not try to execute SQL or modify raw data in the chat response.

## RETURNING UPDATED TABLES (REQUIRED FOR EDITS, DELETES, ADDS)
When the user asks to **delete rows**, **remove a column**, **drop a field**, **add rows/columns/tables**, **clear a table**, or otherwise change data they already have, you MUST apply the change and return **one** markdown JSON code block with the **complete** result:

\`\`\`json
{ "tables": { "table_a": [ { "id": "...", "...": "..." } ], "table_b": [] }, "database_name": "optional_name" }
\`\`\`

Rules:
- \`tables\` must list **every** table that should exist after the edit (include untouched tables unchanged).
- **Row delete**: omit those rows from that table's array only.
- **Column delete**: remove that property from **every** row object in that table (and from other tables if it existed there).
- **New table/column**: include new keys/rows with realistic values and valid UUIDs for \`id\` where used.
- Put the JSON block first or last, but keep it as a single valid fenced block. After it, add **one short sentence** in plain English confirming what you changed (e.g. "Removed the notes column from appointments and deleted 3 rows.").
- If the user is explicit ("delete column X", "remove rows where…"), **do the edit** in JSON — do not refuse for lack of a separate confirmation step.

## SAFE SCHEMA AND DATA MODIFICATIONS
- For "add more data" requests, inspect the current schema and data patterns and append rows when appropriate.
- Keep all changes within the current active database context you were given.

## IMPORTED / EXISTING DATA (EXTEND & EDIT)
When the user has **uploaded or existing** data (tables already in context):
- **Extend the domain** (e.g. "add library management to this school data"): design new related tables, foreign keys to existing tables where sensible, and realistic rows. You may return **only new or changed tables** in the \`tables\` JSON object — the app merges them with existing tables.
- **Inspect structure**: summarize tables, columns, relationships, and row counts in plain English when asked.
- **Small edits** (delete rows/columns, rename fields): return the **complete** affected table(s) in \`tables\`.
- **Do not** restart the intake questionnaire when tables already exist unless the user explicitly asks for a brand-new database from scratch.
- Match naming, ID style, and data patterns from the samples you were given.

## OPERATIONAL GUIDELINES
- Use realistic values and respect data types.
- Maintain referential integrity and valid UUID formats.
- Validate column names against the current schema when editing.
`

export async function POST(request: NextRequest) {
  periodicCleanup(chatRateLimiter, lastCleanup, CLEANUP_INTERVAL)

  // FIX (Bug 2): x-forwarded-for may contain multiple IPs (proxies append
  // their own). We want the original client IP which is the first entry.
  // Also fall back to x-real-ip (set by nginx/Vercel) before 'unknown'.
  const forwarded = request.headers.get('x-forwarded-for')
  const realIp = request.headers.get('x-real-ip')
  const clientId = forwarded
    ? forwarded.split(',')[0].trim()
    : realIp?.trim() ?? 'unknown'

  if (
    !checkRateLimit(
      chatRateLimiter,
      'chat',
      clientId,
      CHAT_RATE_LIMIT,
      CHAT_RATE_WINDOW,
    )
  ) {
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
      dataRowCounts?: Record<string, number>
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
      dataRowCounts,
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
          const rowTotal =
            dataRowCounts?.[tableName] ??
            (Array.isArray(rows) ? rows.length : 0)
          systemPrompt += `\n- Table "${safeTableName}": ${rowTotal} rows`
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

      systemPrompt += `\n\nIMPORTANT: When modifying existing data, include ALL tables in your response when you are rewriting existing rows. When **adding new modules/tables only**, you may return just the new or changed tables — the client merges with the current dataset.`
    } else if (currentSchema && currentSchema.length > 0) {
      systemPrompt += `\n\n## CURRENT WORKSPACE DATA (no persisted database id yet)`
      systemPrompt += `\nThe user has data loaded in the studio. Treat it as the active database.`
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
      if (currentData && Object.keys(currentData).length > 0) {
        systemPrompt += `\n\n### Row counts:`
        for (const [tableName, rows] of Object.entries(currentData)) {
          if (!Array.isArray(rows)) continue
          const safeTableName = String(tableName)
            .replace(/[\r\n]/g, ' ')
            .slice(0, 100)
          systemPrompt += `\n- "${safeTableName}": ${rows.length} rows in context`
          if (rows.length > 0) {
            const sample = JSON.stringify(rows[0]).slice(0, 400)
            systemPrompt += ` | sample: ${sample}`
          }
        }
      }
      systemPrompt += `\n\nDo not run the greenfield intake questionnaire — help the user explore, extend, or edit this data.`
    }

    const ALLOWED_ROLES = new Set<string>(['user', 'assistant'])
    const recentHistory = (history as ChatMessage[]).slice(-10)
    const priorUserCount = recentHistory.filter(
      (m) =>
        m.role === 'user' &&
        ALLOWED_ROLES.has(m.role) &&
        typeof m.content === 'string',
    ).length

    const skipIntakeWizard =
      typeof message === 'string' &&
      (message.trimStart().startsWith('Answers to "') || message.includes('__SKIP__'))

    const noMeaningfulSchema = !currentSchema || currentSchema.length === 0

    if (noMeaningfulSchema && priorUserCount === 0 && !skipIntakeWizard) {
      systemPrompt += `\n\n## THIS TURN: INTAKE REQUIRED\nYou are on the user's **first user message** for a workspace with **no tables/schema yet**. You **must** end your reply with the \`questionnaire\` JSON code block (four \`single_choice\` questions with exactly four \`choices\` each and \`customAnswerAllowed: true\`, then a fifth optional \`text_input\` question with \`required: false\` and \`skipOption: true\`) exactly as defined in **STRUCTURED INTAKE** above. Do not emit \`BEGIN_GENERATION\` in this same turn unless the user already specified a complete schema, relationships, and time-based row counts in their message.`
    }

    // Build messages array with history
    const messages: ChatMessage[] = [
      { role: 'system', content: systemPrompt },
    ]

    // FIX (Bug 8): history entries are user-supplied. Validate that role is
    // one of the allowed values and that content is a string before including
    // them. An attacker could otherwise inject a rogue 'system' message or
    // a non-string content value that crashes the downstream API call.
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