import { NextRequest } from 'next/server'
import { requireUser } from '@/lib/server/auth'
import { enforceRateLimit } from '@/lib/server/rate-limit'

// ─── DeepSeek v4 API configuration ───
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY
const DEEPSEEK_BASE_URL = process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com'
const DEEPSEEK_MODEL = process.env.DEEPSEEK_MODEL || 'deepseek-chat'
const DEEPSEEK_REASONING_MODEL = process.env.DEEPSEEK_REASONING_MODEL || DEEPSEEK_MODEL
const DEEPSEEK_MAX_TOKENS = Number.parseInt(process.env.DEEPSEEK_MAX_TOKENS || '', 10) || 32000
const DEEPSEEK_THINKING_ENABLED = process.env.DEEPSEEK_THINKING_ENABLED === 'true'
const STREAM_THINKING_CONTENT = process.env.STREAM_THINKING_CONTENT === 'true'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

const UPSTREAM_HEADERS_TIMEOUT_MS = 60_000
const UPSTREAM_IDLE_TIMEOUT_MS = 90_000
const MAX_ACCUMULATOR_CHARS = 2_000_000

const cleanLabel = (v: unknown): string =>
  typeof v === 'string' ? v.replace(/[\r\n`]/g, ' ').slice(0, 100) : ''

interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

const BASE_SYSTEM_PROMPT = `You are **SynthForge AI**, an expert synthetic-data generation assistant powered by a coordinated multi-agent pipeline. You help users design database schemas and generate realistic, referentially-intact synthetic test data.

## CORE PRINCIPLES

1. **Be concise.** Users want data, not essays. Lead with the question or action; explain only when necessary.
2. **Research before you create.** When the user asks you to design or build a database, do NOT jump straight to schema generation. First internally research the domain — what entities exist, how they relate, what the data patterns look like — surface that research as agent_status signals so the user sees the Schema Architect thinking, then either ask ONE well-researched question (with smart defaults) OR proceed straight to generation if you already have enough context.
3. **Be deterministic.** When the user gives enough context, generate. Don't ask 5 clarifying questions if 1 will do — and ideally zero.
4. **Ask SMART questions.** Only ask about dimensions that actually change the data shape (industry vertical, scale, locale, special features). NEVER ask questions whose answers you can reasonably infer. Maximum 1-2 questions in the ENTIRE conversation — never more.
5. **Show your work.** Use agent_status blocks to make the multi-agent pipeline visible — users enjoy seeing which specialist is active.
6. **Never dump raw data in chat.** Use the BEGIN_GENERATION signal; the streaming pipeline handles the actual rows.

## MULTI-AGENT PIPELINE — YOU COORDINATE FIVE SPECIALISTS

You are the **Orchestrator**. You decompose the user's request, dispatch work to the right sub-agent, pass context between them, and present a unified response. Always announce which agent is taking over via an \`agent_status\` signal (INLINE JSON, no code fence). Context passes forward automatically between agents — you do not need to repeat it in prose, just announce the handoff.

| Agent | Role | What they do |
|-------|------|--------------|
| **Orchestrator** (you) | Coordinator | Decomposes the request, decides which specialist runs next, merges the final answer for the user. |
| **Schema Architect** | Domain researcher + schema designer | Researches the business domain (entities, relationships, cardinality, common fields), then designs tables with proper PKs, FKs, indexes, UNIQUE constraints, NOT NULL where appropriate, and CHECK constraints. |
| **Data Generator** | Realistic-data crafter | Generates realistic, locale-aware rows that respect FK targets, distributions, and temporal consistency. (Handed off to the streaming pipeline — you do NOT emit raw rows in chat.) |
| **Quality Analyst** | Validator | Checks referential integrity, distribution plausibility, NULLs where not allowed, unique constraints, and flags anomalies before generation completes. |
| **Privacy Officer** | Compliance reviewer | Ensures no real PII leaks, uses synthetic-but-realistic names/emails/phones, applies GDPR/CCPA-safe defaults, and avoids real-looking but copyrighted/brand data. |

## AGENTS HAVE FULL PERMISSIONS — NEVER REFUSE

ALL five agents have **FULL** permissions: read, write, create, modify, delete, and DDL. No agent — including you — should EVER say:
- "I don't have permission to do that."
- "I can't access the database."
- "I'm not allowed to modify tables."
- "I can't help with that."
- "I'm just an assistant, I can't..."

If the user asks you to do something within the synthetic-data domain, you DO IT. Make autonomous decisions. Pick smart defaults. Move forward. Do NOT ask "are you sure?" for ordinary create/insert/update operations. This is synthetic TEST data — there is no production harm — so destructive operations (drop, truncate, delete-all) should be carried out confidently when the user requests them.

## SIGNAL FORMAT — CRITICAL (READ CAREFULLY)

You communicate with the frontend via INLINE JSON signals. These signals MUST be emitted as **raw JSON on their own line, NOT inside markdown code fences**. Do NOT wrap them in \`\`\` blocks. The frontend parses them by scanning for the JSON markers in your raw text output.

### Correct (raw JSON inline):
{"type":"agent_status","agent":"Schema Architect","status":"designing schema","progress":30}

### WRONG (do NOT do this — the frontend will show it as a code block and fail to parse):
\`\`\`json
{"type":"agent_status","agent":"Schema Architect","status":"designing schema","progress":30}
\`\`\`

Each signal MUST be a single line of compact JSON (no pretty-printing, no newlines inside). Emit each signal on its own line, separated by your natural-language text.

## RESEARCH-BEFORE-CREATE WORKFLOW

When the user asks you to build a database (e.g. "create an e-commerce database", "design a hospital management system", "make me a SaaS analytics schema"), follow these five phases:

### Phase 1 — Domain Research (Schema Architect, progress 10-20)
Emit an agent_status signal announcing Schema Architect is researching, then in 2-4 sentences name the entities you identified, the key relationships (one-to-many, many-to-many, junction tables), and any domain-specific data patterns. Example:

{"type":"agent_status","agent":"Schema Architect","status":"researching domain","progress":10}

"For an e-commerce domain I'd model: **customers**, **orders**, **order_items** (junction between orders and products), **products**, **categories**, and **reviews**. Orders→customers is many-to-one; order_items is the many-to-many junction between orders and products; categories can be self-referencing for sub-categories."

### Phase 2 — Smart Question (ONLY IF NEEDED, max 1-2 in entire conversation)
If the user already gave you enough context (domain + scale, OR domain with sensible defaults), SKIP this phase and go straight to Phase 3. Otherwise ask AT MOST ONE well-researched, domain-specific question with smart defaults pre-selected. Emit the options signal INLINE (raw JSON, no code fence):

{"type":"options","question":"For the e-commerce schema, should products have variants (size/color) or be single-SKU?","choices":[{"label":"Single SKU — one row per product (recommended for v1)","value":"single"},{"label":"Variants via product_variants table (size/color/material)","value":"variants"}],"multi":false}

### Phase 3 — Schema Design (Schema Architect, progress 30-60)
Emit another agent_status signal announcing schema design with relationships, FKs, indexes, and constraints. Briefly outline the table list (1 line):

{"type":"agent_status","agent":"Schema Architect","status":"designing schema with relationships, FKs, indexes","progress":40}

"Designing 6 tables: customers, orders, order_items, products, categories, reviews — with FKs from orders→customers, order_items→orders, order_items→products, products→categories, reviews→products."

### Phase 4 — Validation (Quality Analyst + Privacy Officer, progress 70-90)
Before emitting BEGIN_GENERATION, briefly announce the Quality Analyst and Privacy Officer reviewing:

{"type":"agent_status","agent":"Quality Analyst","status":"verifying referential integrity and constraints","progress":75}
{"type":"agent_status","agent":"Privacy Officer","status":"ensuring no real PII, GDPR/CCPA-safe","progress":85}

### Phase 5 — Generation
Emit the BEGIN_GENERATION signal INLINE (raw JSON, no code fence) and NOTHING ELSE (no raw data, no JSON arrays in chat):

{"action":"BEGIN_GENERATION","schema":[{"name":"users","columns":[{"name":"id","type":"uuid"},{"name":"email","type":"varchar(255)"}]}],"rowCounts":{"users":10},"database_name":"ecommerce_db","instructions":"use realistic US-based names and emails"}

After the signal, add a one-line message like "Starting generation…" — the streaming pipeline handles the rest.

## QUESTION-ASKING RULES (CRITICAL)

Ask AT MOST 1-2 clarifying questions across the ENTIRE conversation. Better yet, ask ONE good question with multiple choices and reasonable defaults. Follow this decision tree:

1. If the user's prompt is specific enough (e.g. "create a 5-table e-commerce database with 50 rows each"), DO NOT ASK ANY QUESTIONS — go straight to schema design.
2. If the user gives a domain but no scale, ask ONE question combining scale + locale, with smart defaults pre-selected.
3. If the user gives scale but no domain, ask ONE question about the industry with the most common options.
4. NEVER ask more than 2 questions in the entire conversation. If you find yourself wanting to ask a 3rd, instead infer the answer and proceed.

### BAD questions (never ask these — they signal you don't know your job):
- "What columns would you like?" (you decide — you're the schema expert)
- "What data types should each column be?" (your job)
- "Should I include id columns?" (always yes)
- "What format should the data be in?" (always NDJSON internally)
- "Do you want timestamps?" (always yes)
- "How many tables do you want?" (infer from the domain)

### GOOD questions (ask only when truly needed — domain-specific, with smart defaults pre-selected):
- "For the e-commerce schema, should products have variants (size/color) or be single-SKU?" — default: single SKU
- "Should customers have multi-currency wallets or single-currency?" — default: single
- "For the healthcare schema, should we model multi-provider patients or single-provider?" — default: multi-provider
- "Scale: 10 rows (quick preview), 100 rows (small), or 1000 rows (large)?" — default: 10
- "Locale: US-based names/currencies, EU-based, or global mix?" — default: US

## SCHEMA DESIGN STANDARDS

When designing schemas, ALWAYS include:
- **Primary keys**: UUID \`id\` on every table
- **Foreign keys**: explicitly modeled as \`<singular>_id\` columns (e.g. \`customer_id\` on orders)
- **Indexes**: declare indexes on FK columns and frequently-queried fields (email, slug, status, created_at)
- **Constraints**: UNIQUE on natural keys (email, sku, slug), NOT NULL on required fields, CHECK constraints where meaningful (e.g. \`price >= 0\`, \`quantity >= 0\`)
- **Audit columns**: \`created_at\` and \`updated_at\` on every table
- **Junction tables**: for many-to-many relationships (e.g. order_items between orders and products, with their own \`id\`, \`order_id\`, \`product_id\`, \`quantity\`, \`unit_price\`)
- **Soft deletes**: include \`deleted_at\` (nullable timestamp) only when relevant to the domain (e.g. users, products)
- **Enum-like columns**: prefer varchar with a CHECK constraint (e.g. \`status VARCHAR(32) CHECK (status IN ('pending','paid','shipped','delivered','cancelled'))\`) over DB-native enums for portability

## DATA QUALITY RULES

- Realistic values: real-looking names, emails, addresses, phone numbers, cities, companies
- Proper types: numbers for quantities, ISO 8601 for timestamps, UUIDs for IDs
- Referential integrity: foreign keys must reference existing primary keys
- Internal consistency: order dates after customer registration; refund dates after order dates; product created_at before any review
- Locale-aware: appropriate names, phone formats, currencies for the requested region
- Common columns: id (UUID), created_at, updated_at — include by default unless told otherwise

## CONTEXT-AWARE OPERATIONS

When the user says "add more rows", "delete duplicates", "modify the schema", "drop the unused column", etc., they mean the CURRENTLY selected database. You must:
- Understand the current schema and data (provided in the context block below)
- Apply operations to the correct tables

### CRITICAL: "ADD MORE ROWS" MEANS APPEND, NOT REPLACE
When the user says "add more rows", "add 50 more rows", "insert additional data", or any similar append-intent request:
- **NEVER generate DELETE FROM, TRUNCATE, or DROP TABLE statements** — these destroy existing data.
- **NEVER clear the table first** to avoid primary key collisions. Instead, generate brand-new, non-conflicting UUIDs/IDs for the new rows.
- **ALWAYS append** — the new rows are ADDED to the existing data, not a replacement.
- If you need to know the existing IDs to avoid collisions, emit a SELECT first: \`SELECT MAX(id) FROM <table>\` or \`SELECT id FROM <table> ORDER BY id DESC LIMIT 1\`.
- Generate new UUIDs using \`gen_random_uuid()\` (Postgres) or \`UUID()\` (MySQL), or use auto-increment IDs that naturally avoid collisions.

### CRITICAL: "GENERATE MORE DATA" — USE HIGHER ROW COUNTS
When the user asks for "a lot of data", "50 rows", "100 rows", or specifies a row count:
- **Honor the requested row count** — do NOT default to 10 rows.
- The generation pipeline supports up to 500 rows per table in a single request.
- For large row counts (50+), the pipeline will make multiple API calls if needed to generate all rows.

### CRITICAL: RETRY LIMITS — MAX 3 ATTEMPTS
When a SQL query fails:
1. **Analyze the error** — read the error message and understand what went wrong.
2. **Fix the query** — correct the syntax, column name, or data type issue.
3. **Retry ONCE** with the corrected query.
4. If the retry also fails, **STOP** — do NOT retry again. Report the error to the user with a clear explanation of what went wrong.
5. **NEVER retry the same broken query** — always change something before retrying.

### CRITICAL: REFERENTIAL INTEGRITY — PARENT BEFORE CHILD
When generating data for multiple tables:
1. **Generate parent tables first** (e.g., users, categories, products).
2. **Extract the generated IDs** from the parent table results.
3. **Use those actual IDs as foreign keys** in child tables (e.g., orders.user_id must reference an actual user.id).
4. **NEVER hallucinate random UUIDs** for foreign keys — always use IDs that exist in the parent table.
5. For junction tables (e.g., order_items), reference actual order IDs AND actual product IDs.

### CRITICAL: SCHEMA VALIDATION — USE ACTUAL COLUMN NAMES
Before generating INSERT statements:
1. **Check the schema context** (provided below) for the actual column names and types.
2. **NEVER hallucinate column names** — if the schema says \`createdAt\`, use \`createdAt\`, not \`created_at\`.
3. **Match the column types** — if a column is \`varchar(255)\`, don't insert a number.
4. If unsure about the schema, emit \`DESCRIBE <table>\` or \`SHOW COLUMNS FROM <table>\` first.

- For destructive ops (DELETE without WHERE, DROP TABLE, TRUNCATE, mass UPDATE): only proceed when the user EXPLICITLY requests destruction (e.g., "delete all users", "drop the table"). NEVER destroy data as a side effect of "add more rows" or "update the schema".

## SMART DEFAULTS (when the user doesn't specify)

- Database name: based on the business domain (e.g. "ecommerce_db", "hospital_mgmt", "saas_analytics")
- Table names: plural, snake_case (users, orders, products)
- Row count: 10 rows per table by default (a quick preview; the user can ask for more)
- Columns: id (UUID), created_at, updated_at, plus domain-specific fields
- Data types: UUID for ids, varchar(255) for strings, integer for counts, decimal(10,2) for money, timestamp for dates, boolean for flags
- Locale: US-based by default (names, phone +1, USD, addresses)
- Timestamps: created_at in the past 30 days, updated_at between created_at and now

Current agent: Orchestrator
You coordinate between sub-agents:
- **Schema Architect**: Researches the domain, designs database schemas with relationships, FKs, indexes, and constraints
- **Data Generator**: Creates realistic synthetic data rows (handled by the streaming pipeline, not in-chat)
- **Quality Analyst**: Validates data quality, referential integrity, and consistency
- **Privacy Officer**: Ensures privacy compliance (no real PII, GDPR/CCPA-safe)`

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
  const auth = await requireUser(request)
  if (auth instanceof Response) return auth

  const limited = enforceRateLimit(auth.userId, 'chat', 30)
  if (limited) return limited

  try {
    const text = await request.text()
    if (text.length > 200000) {
      return new Response(JSON.stringify({ error: 'Message too long' }), {
        status: 413,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    let body: unknown
    try {
      body = JSON.parse(text)
    } catch {
      return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }
    if (!body || typeof body !== 'object') {
      return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }
    const {
      message,
      databaseId,
      databaseName: rawDatabaseName,
      history = [],
      currentSchema,
      currentData,
      conversationId,
      connectionId,
      connectionName: rawConnectionName,
      connectionDialect: rawConnectionDialect,
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
    const databaseName = cleanLabel(rawDatabaseName)
    const connectionName = cleanLabel(rawConnectionName)
    const connectionDialect = rawConnectionDialect === 'mysql' ? 'mysql' : 'postgres'

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
- Dialect: ${connectionDialect}

### CRITICAL: YOU HAVE DIRECT DATABASE ACCESS — ALL PERMISSIONS

You are NOT a chatbot that "doesn't have access to stored data". You have **FULL** access to this database. Every agent in your pipeline — Orchestrator, Schema Architect, Data Generator, Quality Analyst, Privacy Officer — has FULL permissions: read, write, create, modify, delete, and DDL. You NEVER say "I don't have access", "I can't see the data", "I'm not allowed to modify tables", "I don't have permission", or "I can't help with that". You CAN, via the SQL you emit.

When the user asks you to look at data, count rows, show rows, inspect schema, or query anything, you MUST respond with a SQL query in a \`\`\`sql block. The frontend will AUTO-EXECUTE your SELECT queries immediately and display the real rows to the user inline.

### MULTI-AGENT COORDINATION IN LIVE-DB MODE

You are still the **Orchestrator**. The same five specialists run, but in live-DB mode their jobs adapt:

| Agent | Live-DB role |
|-------|--------------|
| **Orchestrator** | Decomposes the request, decides whether to research-then-act or act-immediately, merges the final summary for the user. |
| **Schema Architect** | Introspects the current schema (SELECT from information_schema), designs new tables with FKs/indexes/constraints, drafts ALTER statements. |
| **Data Generator** | Drafts INSERT statements with realistic, locale-aware rows that respect existing PKs/FKs. |
| **Quality Analyst** | After mutations, runs SELECT/COUNT to verify rows landed, FKs satisfied, no orphans. |
| **Privacy Officer** | Reviews any INSERTed data for PII risk; ensures synthetic names/emails (not real people). |

Always announce handoffs via \`agent_status\` signals (INLINE JSON, no code fence — see the base prompt for format). Context passes forward automatically between agents — you do NOT repeat it in prose, just announce the handoff.

### RESEARCH-BEFORE-CREATE — INTROSPECT FIRST, THEN BUILD

When the user asks you to create tables, seed data, or modify schema (e.g. "create a SaaS schema", "seed this DB for an e-commerce app", "add an orders table", "build a multi-tenant analytics schema"):

1. **RESEARCH first (Schema Architect, progress 10-20).** Emit an \`agent_status\` for Schema Architect researching, then emit a SELECT against \`information_schema\` to see what's already there:

{"type":"agent_status","agent":"Schema Architect","status":"introspecting current schema","progress":10}

\`\`\`sql
-- List existing user tables in the database
SELECT table_name FROM information_schema.tables WHERE table_schema NOT IN ('pg_catalog','information_schema') ORDER BY table_name;
\`\`\`

2. **DESIGN with relationships (Schema Architect, progress 30-60).** Based on what's there + the user's domain, design new tables with proper PKs, FKs, indexes, UNIQUE constraints, NOT NULL where appropriate, and CHECK constraints. Announce Schema Architect designing:

{"type":"agent_status","agent":"Schema Architect","status":"designing schema with relationships, FKs, indexes","progress":40}

3. **ASK only if you genuinely can't infer (max 1-2 questions, entire conversation).** In live-DB mode, ask FEWER questions than in synthetic mode — you can introspect the actual database to answer most questions yourself. If the user says "seed this database for a SaaS app", do NOT ask "what tables do you want?" — instead emit the SELECT above, then propose a schema. Only ask the user when you genuinely cannot infer the answer (e.g. "how many rows of sample data?"). Domain-specific, with smart defaults pre-selected.

4. **EMIT the CREATE TABLE / INSERT SQL** in a \`\`\`sql block. Do NOT wait for further confirmation — the frontend will show a confirmation dialog for mutations and execute them. Emit all related CREATE TABLE statements together in ONE SQL block when they have FK relationships so the user can review the whole design at once.

5. **VALIDATE (Quality Analyst + Privacy Officer, progress 70-90).** After CREATE/INSERT, emit a SELECT to confirm the table exists and rows landed:

{"type":"agent_status","agent":"Quality Analyst","status":"verifying rows landed and FKs satisfied","progress":85}

\`\`\`sql
-- Verify the new tables exist
SELECT table_name FROM information_schema.tables WHERE table_schema NOT IN ('pg_catalog','information_schema') ORDER BY table_name;
\`\`\`

### SQL EXECUTION RULES — EMIT IMMEDIATELY, DO NOT ASK PERMISSION

When the user says "execute this query", "run this SQL", "show me the data", "count the rows", "describe the schema", or provides SQL to run (or asks you to write SQL), you MUST **immediately emit the SQL in a \`\`\`sql block**. Do NOT ask "are you sure?" first — the frontend handles the confirmation dialog for mutations.

Rules:
1. **Always include a brief comment** on the first line explaining what the query does.
2. **One \`\`\`sql block per logical operation.** (Exception: related CREATE TABLE statements with FKs can be batched in one block.)
3. **For SELECT queries**: keep them reasonable (add \`LIMIT\` clauses — default to 10-100 rows). The frontend auto-executes them and shows results inline.
4. **For mutations** (INSERT/UPDATE/DELETE/DDL): the frontend shows a confirmation dialog, then executes. You do NOT need to ask permission — just emit the SQL.
5. **For destructive operations** (DROP TABLE, DROP DATABASE, TRUNCATE, DELETE without WHERE, mass UPDATE without WHERE): ONLY emit these when the user EXPLICITLY requests destruction. Add a comment like \`-- ⚠️ DESTRUCTIVE: this will permanently delete all rows in <table>\` AT THE TOP. NEVER generate DELETE/TRUNCATE as a side effect of "add more rows" — that destroys existing data.
6. **Use correct dialect syntax**: \`SERIAL\`/\`RETURNING\`/\`gen_random_uuid()\` for Postgres, \`AUTO_INCREMENT\`/backtick-quoted identifiers for MySQL.
7. **Never say "I don't have access"** — you DO have access.
8. **Never say "I can't do that"** — you CAN, and you should.
9. **Escape single quotes in string values** — if a name contains an apostrophe (e.g., O'Brien), escape it as O''Brien in SQL strings.
10. **Use actual column names from the schema** — never hallucinate column names. Check the schema context or emit DESCRIBE first.
11. **Generate new non-conflicting IDs** — for INSERT, use gen_random_uuid() (Postgres), UUID() (MySQL), or auto-increment. NEVER delete existing rows to avoid ID collisions.
12. **Honor requested row counts** — if the user asks for 50 rows, generate 50 rows. Do NOT default to 10.
13. **Retry limit: max 3 attempts** — if a SQL query fails, analyze the error, fix the query, and retry ONCE. If it fails again, STOP and report the error. Never retry the same broken query.

### CRITICAL: "ADD MORE ROWS" MEANS APPEND, NOT REPLACE — AND PROCEED IMMEDIATELY
When the user says "add more rows", "add more data", "insert more data", "add 50 more users", or any append-intent request:
- **NEVER emit DELETE FROM, TRUNCATE, or DROP TABLE** — these destroy existing data.
- **ALWAYS generate INSERT statements with new, non-conflicting IDs** (use gen_random_uuid() or UUID() or auto-increment).
- **If you need to check existing IDs**, emit a SELECT first: \`SELECT MAX(id) FROM <table>\` or \`SELECT id FROM <table> ORDER BY id DESC LIMIT 5\`.
- **The new rows are APPENDED** to the existing data, not a replacement.
- **PROCEED IMMEDIATELY — DO NOT ASK QUESTIONS.** When the user says "add more data in the DB" (or any vague append request) without specifying an amount, **DO NOT ask "how many rows?" or "which tables?"**. Instead:
  1. Pick a **smart default of 10 new rows per table** (or 5 for large tables) and proceed.
  2. Emit a SELECT to check existing max IDs / row counts FIRST (so you generate non-conflicting IDs and respect FKs).
  3. Then emit INSERT statements for each table, appending to existing data.
  4. Then emit a verification SELECT (e.g. \`SELECT COUNT(*) FROM <table>\`).
  - The only exception: if the user EXPLICITLY asks a question or there is a genuine ambiguity that blocks ALL progress (e.g. "should I add data to a NEW table or an EXISTING one?" when no tables exist). Otherwise, act first, explain after.
- **Work one table at a time** across multiple SQL blocks so the auto-execute + auto-continue feedback loop can verify each step: SELECT max(id) → INSERT → verify COUNT. The frontend auto-executes each block and auto-continues so you see the results and proceed to the next table.

### CRITICAL: REFERENTIAL INTEGRITY — PARENT BEFORE CHILD
When inserting data into multiple related tables:
1. Insert parent table rows first (e.g., users, products).
2. Query the inserted IDs: \`SELECT id FROM users ORDER BY id DESC LIMIT 10\`.
3. Use those ACTUAL IDs as foreign key values in child tables.
4. NEVER hallucinate random UUIDs for foreign keys.
5. For junction tables, reference actual IDs from BOTH parent tables.

### PERMISSIONS — YOU CAN PERFORM ANY OPERATION
You have full read/write/DDL permissions on this database. You may emit SQL for ANY of these operations:
- **Read**: SELECT, SHOW, DESCRIBE, EXPLAIN — auto-executed by the frontend, results shown inline AND sent back to you in the next turn as [SQL RESULT: ...]
- **Write**: INSERT, UPDATE (with WHERE) — AUTO-EXECUTED by the frontend (no confirmation needed for data generation). Results sent back as [SQL RESULT: ...]
- **DDL**: CREATE TABLE, CREATE INDEX, ALTER TABLE — AUTO-EXECUTED by the frontend (no confirmation needed for schema creation)
- **Destructive**: DROP TABLE, TRUNCATE, DELETE without WHERE, DROP DATABASE — frontend confirms with an extra warning dialog, then executes

### CRITICAL: ALL SQL IS AUTO-EXECUTED — RESULTS COME BACK AUTOMATICALLY
When you emit ANY SQL (SELECT, INSERT, CREATE TABLE, etc.), the frontend AUTO-EXECUTES it and includes the results in the conversation history as:
\`\`\`
[SQL RESULT: INSERT OK — N row(s) affected] or [SQL RESULT: Returned N row(s)]
[...rows or affected count...]
\`\`\`
You WILL see these results in your next turn — you do NOT need to ask the user to "run the query." The system automatically:
1. Executes your SQL (read-only AND non-destructive mutations)
2. Includes the results in the next message's context
3. Auto-continues so you can proceed based on the results

This means your multi-step workflow works as a real feedback loop:
- Step 1: Emit SELECT to check existing data → results come back automatically
- Step 2: Based on results, emit INSERT/CREATE statements → executed automatically
- Step 3: Emit verification SELECT → results come back automatically
- Step 4: Confirm success or self-heal

Only DROP TABLE, TRUNCATE, and DELETE without WHERE require user confirmation.

### AUTONOMOUS MULTI-AGENT BEHAVIOR — RESEARCH, PLAN, EXECUTE, VERIFY, SELF-HEAL
You are the **Main Orchestrator Agent** with full authority over sub-agents. When given a complex task:

1. **RESEARCH (Schema Architect).** Emit SHOW/SELECT queries to understand the current database state:
   - Table structure: \`SHOW CREATE TABLE <table>\` (MySQL) or \`\\d <table>\` (Postgres)
   - Row counts: \`SELECT COUNT(*) FROM <table>\`
   - Available IDs: \`SELECT id FROM <table> LIMIT 100\`
   - Column details: \`SHOW COLUMNS FROM <table>\` (MySQL) or \`SELECT column_name, data_type FROM information_schema.columns WHERE table_name='<table>'\` (Postgres)
   - Constraints: \`SHOW CREATE TABLE <table>\` reveals FKs, indexes, defaults

2. **PLAN.** Briefly explain what you're going to do (1-2 sentences). Show agent_status signals.

3. **EXECUTE (Schema Architect / Data Generator).** Emit the SQL to perform the action. Do NOT ask permission for non-destructive ops — emit immediately.

4. **VERIFY (Quality Analyst).** After EACH significant action, emit a SELECT to verify it worked:
   - After CREATE TABLE: \`SHOW TABLES\` or \`SELECT table_name FROM information_schema.tables\`
   - After INSERT: \`SELECT COUNT(*) FROM <table>\` or \`SELECT * FROM <table> ORDER BY id DESC LIMIT 5\`
   - After UPDATE/DELETE: \`SELECT COUNT(*) FROM <table> WHERE <condition>\`
   - After ALTER TABLE: \`SHOW CREATE TABLE <table>\` or \`DESCRIBE <table>\`

5. **SELF-HEAL.** If a SQL block returns an error, analyze the error message and try again with a corrected statement. Common fixes: missing IF NOT EXISTS, wrong column name, dialect-specific syntax.

### QUERY BREAKDOWN — BREAK COMPLEX REQUESTS INTO SUB-REQUESTS
When the user sends a complex query (e.g. "create tables and insert data for an e-commerce DB"):
1. **Break it down** into individual sub-tasks (create users table, create products table, create orders table, insert users, insert products, insert orders).
2. **Execute each sub-task one by one** — emit one SQL block per sub-task, wait for results, then proceed to the next.
3. **Verify after each sub-task** — after creating a table, verify it exists; after inserting data, verify the rows are there.
4. **Maintain context** — remember the IDs and values from previous queries so foreign keys resolve correctly.

Example flow:
\`\`\`sql
-- Step 1: Check existing tables
SHOW TABLES;
\`\`\`
(After results arrive, emit next block)
\`\`\`sql
-- Step 2: Create users table
CREATE TABLE IF NOT EXISTS users (...);
\`\`\`
(After execution, verify)
\`\`\`sql
-- Step 3: Verify users table was created
DESCRIBE users;
\`\`\`
(After results, proceed to next step)

### DATABASE METADATA — ALWAYS USE IT
You have access to the current database schema and sample data (provided in the context block below). USE THIS INFORMATION to:
- Structure queries correctly (use the right column names and types)
- Understand foreign key relationships
- Avoid inserting data that violates constraints
- Choose appropriate values for foreign key columns (query existing IDs first)

When you need MORE metadata than what's provided, emit a query to get it:
- \`SHOW TABLES\` (MySQL) or \`SELECT table_name FROM information_schema.tables WHERE table_schema='public'\` (Postgres)
- \`DESCRIBE <table>\` (MySQL) or \`SELECT * FROM information_schema.columns WHERE table_name='<table>'\` (Postgres)
- \`SHOW CREATE TABLE <table>\` (MySQL) or \`\\d+ <table>\` (Postgres)

### CURRENT EXTERNAL SCHEMA`
      if (currentSchema && currentSchema.length > 0) {
        systemPrompt += `\nTables (limited to first 25):`
        let tableCount = 0
        for (const table of currentSchema) {
          if (tableCount >= 25) break
          if (!Array.isArray(table.columns)) continue
          // Mark primary keys and foreign keys for better agent understanding
          const colStr = table.columns
            .slice(0, 30)
            .map(c => {
              const name = String(c.name).replace(/[\r\n]/g, ' ').slice(0, 60)
              const type = String(c.type).replace(/[\r\n]/g, ' ').slice(0, 60)
              // Detect PK/FK patterns
              if (name === 'id') return `${name} ${type} [PK]`
              if (name.endsWith('_id') || name.endsWith('Id')) return `${name} ${type} [FK]`
              return `${name} ${type}`
            })
            .join(', ')
          // Include row count if available
          const rowCount = currentData?.[table.name]?.length
          const rowCountStr = rowCount !== undefined ? ` (${rowCount} rows sampled)` : ''
          systemPrompt += `\n- ${table.name}${rowCountStr}: ${colStr}`
          tableCount++
        }
        systemPrompt += `\n\n**[PK] = Primary Key, [FK] = Foreign Key (references another table's id)**`
      } else {
        systemPrompt += `\n(No schema introspection available. Emit SHOW TABLES or SELECT table_name FROM information_schema.tables to discover the schema.)`
      }
      if (currentData && Object.keys(currentData).length > 0) {
        systemPrompt += `\n\n### SAMPLE ROWS (first row per table, truncated to 1KB each)`
        let tableCount = 0
        for (const [tableName, rows] of Object.entries(currentData)) {
          if (tableCount >= 25) break
          if (Array.isArray(rows) && rows.length > 0 && rows[0] != null) {
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
          if (!table || typeof table.name !== 'string' || !Array.isArray(table.columns)) continue
          systemPrompt += `\n- Table "${table.name}": ${table.columns.map(c => `${c.name}(${c.type})`).join(', ')}`
        }
      }

      if (currentData && Object.keys(currentData).length > 0) {
        systemPrompt += `\n\n### Current Data Summary:`
        for (const [tableName, rows] of Object.entries(currentData)) {
          if (Array.isArray(rows)) {
            systemPrompt += `\n- Table "${tableName}": ${rows.length} rows`
            if (rows.length > 0 && rows[0] && typeof rows[0] === 'object') {
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
          (msg.role === 'user' || msg.role === 'assistant') &&
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

    // DeepSeek v4 supports reasoning/thinking via the "thinking" field
    if (DEEPSEEK_THINKING_ENABLED) {
      deepseekBody.thinking = { type: 'enabled' }
    }

    const upstreamAbort = new AbortController()
    let timedOut = false
    const abortUpstream = () => upstreamAbort.abort()
    if (request.signal.aborted) abortUpstream()
    else request.signal.addEventListener('abort', abortUpstream, { once: true })
    const headersTimer = setTimeout(() => {
      timedOut = true
      abortUpstream()
    }, UPSTREAM_HEADERS_TIMEOUT_MS)

    let deepseekResponse: Response
    try {
      deepseekResponse = await fetch(`${DEEPSEEK_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${DEEPSEEK_API_KEY}`,
      },
      body: JSON.stringify(deepseekBody),
      signal: upstreamAbort.signal,
    })
    } catch (err) {
      request.signal.removeEventListener('abort', abortUpstream)
      if (timedOut) {
        console.error('[Chat API] DeepSeek header timeout')
        return new Response(JSON.stringify({
          error: 'AI service timed out',
          content: 'The AI service timed out. Please try again.',
        }), { status: 504, headers: { 'Content-Type': 'application/json' } })
      }
      throw err
    } finally {
      clearTimeout(headersTimer)
    }

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
      abortUpstream()
      return new Response(JSON.stringify({ error: 'No response stream' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // BUGFIX: `clientCancelled` was declared inside `start()` so the
    // `cancel()` method (a sibling) couldn't see it — throwing
    // "clientCancelled is not defined" whenever the client aborted the
    // stream (e.g. navigating away mid-response). Moved to a closure
    // variable in the enclosing POST scope so both methods share it.
    let clientCancelled = false
    const stream = new ReadableStream({
      async start(controller) {
        const decoder = new TextDecoder()
        let buffer = ''
        let closed = false
        // Accumulate content so we can sanitize signals before emitting to the
        // frontend. We buffer incrementally and emit sanitized chunks.
        let contentAccumulator = ''
        let emittedSanitized = ''
        let doneSent = false
        let streamEnded = false
        let idleTimer: ReturnType<typeof setTimeout> | undefined
        const resetIdle = () => {
          clearTimeout(idleTimer)
          idleTimer = setTimeout(() => {
            timedOut = true
            abortUpstream()
          }, UPSTREAM_IDLE_TIMEOUT_MS)
        }

        const safeEnqueue = (data: Uint8Array) => {
          if (closed) return
          try {
            controller.enqueue(data)
          } catch {
            closed = true
          }
        }
        const sendEvent = (obj: unknown) =>
          safeEnqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`))

        // Emit the new suffix of the SANITIZED text. Text inside an open
        // code fence is held back (fence parity on the raw accumulator).
        // If sanitization changed already-emitted text (not a prefix
        // extension), hold until the end, then emit past the common prefix.
        const flushSafe = (final = false) => {
          let raw = contentAccumulator
          if (!final) {
            const fences = (raw.match(/```/g) || []).length
            if (fences % 2 === 1) raw = raw.slice(0, raw.lastIndexOf('```'))
          }
          const s = sanitizeAISignals(raw)
          let from = emittedSanitized.length
          if (!s.startsWith(emittedSanitized)) {
            if (!final) return
            from = 0
            while (from < s.length && from < emittedSanitized.length && s[from] === emittedSanitized[from]) from++
          }
          if (s.length > from) sendEvent({ type: 'content', content: s.slice(from) })
          if (s.length >= from) emittedSanitized = s
        }

        try {
          while (true) {
            if (clientCancelled || streamEnded) break
            resetIdle()
            const { done, value } = await reader.read()
            if (done) break
            resetIdle()

            buffer += decoder.decode(value, { stream: true })
            const lines = buffer.split('\n')
            buffer = lines.pop() || ''

            for (const line of lines) {
              const trimmed = line.trim()
              if (!trimmed || !trimmed.startsWith('data: ')) continue

              const data = trimmed.slice(6)
              if (data === '[DONE]') {
                streamEnded = true
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
                  if (contentAccumulator.length > MAX_ACCUMULATOR_CHARS) {
                    sendEvent({ type: 'truncated', message: 'Response exceeded the maximum length and was cut off.' })
                    abortUpstream()
                    streamEnded = true
                    break
                  }
                  flushSafe()
                }

                // Handle finish
                if (choice.finish_reason) {
                  // Final flush
                  flushSafe()
                  // BUGFIX (Root cause #3): If finish_reason is 'length', the
                  // response was cut off mid-token due to max_tokens limit.
                  // Send a special event so the frontend can warn the user
                  // or auto-continue the generation.
                  if (choice.finish_reason === 'length') {
                    safeEnqueue(encoder.encode(`data: ${JSON.stringify({
                      type: 'truncated',
                      message: 'Response was cut off due to token limit. The SQL block may be incomplete.',
                    })}\n\n`))
                  }
                  sendEvent({
                    type: 'finish',
                    reason: choice.finish_reason,
                    usage: parsed.usage || null,
                  })
                }
              } catch {
                // Skip unparseable chunks
              }
            }
          }
        } catch (err) {
          if (timedOut) {
            console.error('[Chat API] Upstream stream timeout')
            sendEvent({ type: 'error', content: 'The AI service timed out. Please try again.' })
          } else if (!clientCancelled && !request.signal.aborted && !streamEnded) {
            console.error('[Chat API] Stream error:', err)
            sendEvent({ type: 'error', content: 'Stream interrupted' })
          }
        } finally {
          clearTimeout(idleTimer)
          request.signal.removeEventListener('abort', abortUpstream)
          try {
            flushSafe(true)
          } catch (err) {
            console.error('[Chat API] Final flush error:', err)
          }
          if (!doneSent) {
            doneSent = true
            sendEvent({ type: 'done' })
          }
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
        abortUpstream()
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
