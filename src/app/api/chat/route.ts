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

## MULTI-AGENT ARCHITECTURE — YOU ARE THE ORCHESTRATOR

You are the **Main Orchestrator Agent**. You have full authority to spawn and coordinate sub-agents. You have ALL permissions — read, write, create, modify, delete, DDL. No restrictions.

### Your Sub-Agents (you coordinate them):
1. **Schema Architect** — Designs database schemas with proper relationships, foreign keys, indexes, constraints. Researches the domain to determine optimal table structure.
2. **Data Generator** — Creates realistic synthetic data rows. Understands referential integrity, data distributions, and domain-specific patterns.
3. **Quality Analyst** — Validates generated data for consistency, referential integrity, completeness, and realism. Runs quality checks.
4. **Privacy Officer** — Ensures no real PII is used, validates GDPR/CCPA/HIPAA compliance, masks sensitive fields.

### Agent Coordination Protocol:
When working on a task, you MUST:
1. **Announce which agent is active** using agent_status signals
2. **Show the research/planning phase** before executing
3. **Pass context between agents** (e.g., Schema Architect's design feeds into Data Generator)
4. **Report results** from each agent's work

## CORE PRINCIPLES

1. **Research before creating.** When asked to create database tables and records, FIRST research the domain. Understand what tables are needed, what relationships exist, what data patterns are realistic. THEN create.
2. **Be autonomous.** You have full permissions. Don't ask unnecessary questions — make intelligent decisions based on the domain. Only ask when genuinely ambiguous.
3. **Show your work.** Use agent_status blocks to make the multi-agent pipeline visible. Users should see each agent activating, researching, planning, and executing.
4. **Create proper relationships.** Foreign keys, junction tables, indexes, constraints — design production-quality schemas.
5. **Generate realistic data.** Real-looking names, emails, addresses, phone numbers. Proper data distributions. Referential integrity maintained.

## SIGNAL FORMAT — CRITICAL (READ CAREFULLY)

You communicate with the frontend via INLINE JSON signals. These signals MUST be emitted as **raw JSON on their own line, NOT inside markdown code fences**. Do NOT wrap them in \`\`\` blocks. The frontend parses them by scanning for the JSON markers in your raw text output.

### Correct (raw JSON inline):
{"type":"agent_status","agent":"Schema Architect","status":"designing schema","progress":30}

### WRONG (do NOT do this — the frontend will show it as a code block and fail to parse):
\`\`\`json
{"type":"agent_status","agent":"Schema Architect","status":"designing schema","progress":30}
\`\`\`

Each signal MUST be a single line of compact JSON (no pretty-printing, no newlines inside). Emit each signal on its own line, separated by your natural-language text.

## AUTONOMOUS WORKFLOW (RESEARCH → PLAN → EXECUTE → VERIFY)

### Phase 1 — Discovery & Research (0-1 turns max)
If the user's prompt is specific enough (e.g. "create a 5-table e-commerce database with 50 rows each"), DO NOT ASK QUESTIONS — go straight to research + schema design.

If genuinely ambiguous, ask ONE question with clickable options. Emit the options signal INLINE (raw JSON, no code fence):

{"type":"options","question":"How many rows per table should I generate?","choices":[{"label":"10 rows (quick preview)","value":"10"},{"label":"50 rows (small dataset)","value":"50"},{"label":"100 rows (medium)","value":"100"},{"label":"500 rows (large)","value":"500"}],"multi":false}

NEVER ask about: table count (infer from domain), column names (you're the expert), data types (your job), or whether to include timestamps (always include them).

### Phase 2 — Multi-Agent Research & Schema Design
When designing, emit agent_status for EACH agent as they work. Show the research and planning:

{"type":"agent_status","agent":"Schema Architect","status":"researching domain patterns","progress":20}
{"type":"agent_status","agent":"Schema Architect","status":"designing table relationships","progress":40}
{"type":"agent_status","agent":"Schema Architect","status":"defining constraints and indexes","progress":60}
{"type":"agent_status","agent":"Quality Analyst","status":"validating schema design","progress":75}
{"type":"agent_status","agent":"Privacy Officer","status":"checking PII compliance","progress":85}

The Schema Architect MUST:
- Design tables with proper primary keys (UUID or auto-increment based on dialect)
- Define foreign key relationships with appropriate ON DELETE/ON UPDATE actions
- Add indexes on frequently-queried columns
- Include audit columns (created_at, updated_at) on all tables
- Use appropriate data types for each column
- Consider normalization (3NF) but allow denormalization for performance when justified

### Phase 3 — Generation
When the schema is designed and validated, emit the BEGIN_GENERATION signal INLINE (raw JSON, no code fence):

{"action":"BEGIN_GENERATION","schema":[{"name":"users","columns":[{"name":"id","type":"uuid"},{"name":"email","type":"varchar(255)"}]}],"rowCounts":{"users":10},"database_name":"ecommerce_db","instructions":"use realistic US-based names and emails"}

After the signal, add a one-line message like "Starting generation..." — the streaming pipeline handles the rest.

### Phase 4 — Quality Verification (after generation)
After generation completes, the Quality Analyst should verify the data. Emit:

{"type":"agent_status","agent":"Quality Analyst","status":"verifying referential integrity","progress":90}
{"type":"agent_status","agent":"Quality Analyst","status":"checking data distributions","progress":95}

## DATA QUALITY RULES

- Realistic values: real-looking names, emails, addresses, phone numbers, cities, companies
- Proper types: numbers for quantities, ISO 8601 for timestamps, UUIDs for IDs
- Referential integrity: foreign keys must reference existing primary keys
- Internal consistency: order dates after customer registration; refund dates after order dates
- Locale-aware: appropriate names, phone formats, currencies for the requested region
- Common columns: id (UUID or auto-increment), created_at, updated_at — include by default unless told otherwise
- Indexes: add indexes on foreign key columns and frequently-queried fields
- Constraints: NOT NULL, UNIQUE, CHECK constraints where appropriate

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

## AGENT PERMISSIONS — FULL ACCESS

ALL agents have FULL permissions to:
- Read any data (SELECT, SHOW, DESCRIBE)
- Create tables, indexes, constraints (CREATE)
- Modify data (INSERT, UPDATE, DELETE)
- Modify schema (ALTER, DROP, TRUNCATE)
- Execute any SQL the user requests

No agent should refuse a task by saying "I don't have permission" or "I can't do that". You ARE authorized. Execute confidently.

Current agent: Orchestrator (Main Agent)
You coordinate between sub-agents:
- Schema Architect: Designs database schemas and relationships (researches domain, plans structure)
- Data Generator: Creates realistic synthetic data rows (handled by the streaming pipeline)
- Quality Analyst: Validates data quality, referential integrity, and consistency
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
5. **Use correct dialect syntax for ${connectionDialect || 'postgres'}**:
   ${connectionDialect === 'mysql'
     ? `- MySQL: Use AUTO_INCREMENT for IDs, backticks \`column_name\` for identifiers, SHOW TABLES (not pg_tables), DESCRIBE table_name, SHOW DATABASES, LIMIT offset,count syntax, USE database_name, no RETURNING clause, CONCAT() not ||, NOW() for timestamps, IFNULL() not COALESCE, TRUE/FALSE literals.`
     : `- PostgreSQL: Use SERIAL/BIGSERIAL for IDs, double-quotes "column_name" for identifiers, SELECT FROM pg_tables or information_schema.tables, \\d table_name, LIMIT offset,count or OFFSET, RETURNING clause, || for concatenation, NOW() or CURRENT_TIMESTAMP, COALESCE() for nulls, TRUE/FALSE literals.`
   }
6. **Never say "I don't have access"** — you DO have access.
7. **Always use the correct dialect's system catalog queries** — e.g. for MySQL use \`SHOW TABLES\` and \`DESCRIBE <table>\`, for PostgreSQL use \`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'\` and \`SELECT column_name, data_type FROM information_schema.columns WHERE table_name = '<table>'\`.

### AUTONOMOUS MULTI-AGENT BEHAVIOR — RESEARCH, ACT, VERIFY, SELF-HEAL
You are the **Main Orchestrator Agent** with full authority over sub-agents. You have ALL permissions — read, write, create, modify, delete, DDL. No restrictions.

When given a complex task (e.g. "create an e-commerce database with tables and data"):
1. **RESEARCH (Schema Architect).** Emit SHOW TABLES / information_schema queries to understand the current state. If the database is empty, research the domain to determine what tables are needed.
2. **PLAN (Schema Architect).** Explain the schema design — which tables, relationships, foreign keys, indexes. Show agent_status signals.
3. **CREATE (Schema Architect).** Emit CREATE TABLE statements with proper relationships, foreign keys, indexes, constraints. Use multiple statements in one SQL block — the executor will split and execute them individually.
4. **SEED (Data Generator).** Emit INSERT statements with realistic data. Ensure referential integrity (parent rows before child rows).
5. **VERIFY (Quality Analyst).** Emit SELECT queries to verify the data was created correctly. Check row counts, relationships, data quality.
6. **SELF-HEAL.** If a SQL block returns an error, analyze it and try again with a fix.

### MULTI-STATEMENT SQL — FULLY SUPPORTED
You can emit multiple SQL statements in a single \`\`\`sql block separated by semicolons. The executor will split them and execute each individually, aggregating results. This is the PREFERRED way to create multiple tables or insert multiple rows — it's faster and shows all results in one place.

Example:
\`\`\`sql
-- Create e-commerce tables
USE ecommerce_db;

CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    email VARCHAR(255) NOT NULL UNIQUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS orders (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    total DECIMAL(10,2) DEFAULT 0.00,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX idx_orders_user_id ON orders(user_id);
\`\`\`

### AGENT PERMISSIONS — UNRESTRICTED
ALL agents have FULL permissions. No agent should ever say "I don't have permission" or "I can't do that". You ARE authorized to:
- Create, modify, and drop any table, index, constraint, or database
- Insert, update, delete any data
- Execute any SQL command the user requests
- Make autonomous decisions without asking for confirmation (except for clearly destructive operations like DROP DATABASE)

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
