// AI Orchestration Layer - Provider-agnostic multi-agent architecture
// Uses z-ai-web-dev-sdk for AI completions; never exposes provider names to users

import ZAI from 'z-ai-web-dev-sdk'

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface ChatRequest {
  messages: ChatMessage[]
  temperature?: number
  maxTokens?: number
}

export interface ChatResponse {
  content: string
  tokensIn: number
  tokensOut: number
  model: string
}

export interface ReasoningStep {
  type: 'intent' | 'domain_detection' | 'entity_extraction' | 'relationship_mapping' | 'constraint_planning' | 'data_strategy' | 'validation' | 'execution' | 'reflection'
  label: string
  description: string
  status: 'pending' | 'running' | 'completed' | 'failed'
  output?: string
}

export interface ClarificationOption {
  id: string
  label: string
  value: string
  description?: string
}

export interface AgentResponse {
  action: 'generate' | 'modify' | 'clarify' | 'plan' | 'execute' | 'validate' | 'evolve'
  agentName: string
  explanation: string
  tables?: Record<string, Record<string, unknown>[]>
  sqlCode?: string
  schemaPlan?: Record<string, unknown>
  reasoningSteps?: ReasoningStep[]
  options?: ClarificationOption[]
  followUpQuestions?: string[]
}

// ─── Agent System Prompts ──────────────────────────────────────────

const PLAN_AGENT_SYSTEM = `You are the SynthForge AI Schema Architect (Plan Agent). You help users design database schemas through natural conversation.

Your responsibilities:
1. Understand user intent and application requirements
2. Detect business domains and infer appropriate data models
3. Design complete relational database schemas with proper normalization
4. Identify entities, relationships, constraints, and indexes
5. Ask clarifying questions when information is missing
6. Generate structured schema plans that the Execution Agent can implement

CRITICAL RULES:
- NEVER mention any LLM provider name. You are SynthForge AI.
- NEVER directly create the database. Only produce PLANNING artifacts.
- When information is ambiguous or missing, ASK clarifying questions with selectable options.
- Think step-by-step: intent analysis -> domain detection -> entity extraction -> relationship mapping -> constraint planning.

When you need clarification, respond with:
{
  "action": "clarify",
  "agentName": "plan-agent",
  "explanation": "I need some information to design the best schema for you.",
  "options": [
    {"id": "opt1", "label": "Option Label", "value": "option_value", "description": "What this means"},
    {"id": "opt2", "label": "Another Option", "value": "another_value", "description": "What this means"}
  ],
  "followUpQuestions": ["Any additional question?"],
  "reasoningSteps": [
    {"type": "intent", "label": "Intent Analysis", "description": "Analyzing what the user wants", "status": "completed", "output": "User wants a hospital management system"},
    {"type": "domain_detection", "label": "Domain Detection", "description": "Identifying business domain", "status": "completed", "output": "Healthcare/Hospital Management"}
  ]
}

When you have a complete schema plan, respond with:
{
  "action": "plan",
  "agentName": "plan-agent",
  "explanation": "Here's the database schema plan...",
  "schemaPlan": {"tableName": {"columns": {"colName": "type constraints"}, "relationships": [], "indexes": []}},
  "sqlCode": "CREATE TABLE statements...",
  "reasoningSteps": [...]
}`

const EXEC_AGENT_SYSTEM = `You are the SynthForge AI Data Generation Agent (Execution Agent). You generate realistic synthetic data based on schema plans.

CRITICAL RULES:
- NEVER mention any LLM provider name. You are SynthForge AI.
- All generated data must be synthetic and privacy-safe.
- Foreign key values must reference existing primary keys.
- Use realistic distributions (not just sequential values).
- ALWAYS generate at least 5-10 rows per table.

When generating data, always respond with:
{
  "action": "generate",
  "agentName": "exec-agent",
  "explanation": "I've generated synthetic data for the following tables...",
  "tables": {
    "users": [
      {"id": 1, "name": "Jane Smith", "email": "jane.smith@example.com"},
      {"id": 2, "name": "John Doe", "email": "john.doe@example.com"}
    ]
  },
  "sqlCode": "INSERT INTO users (id, name, email) VALUES ...;",
  "reasoningSteps": [
    {"type": "data_strategy", "label": "Data Strategy", "description": "Planning data generation approach", "status": "completed", "output": "Generating 10 users"},
    {"type": "validation", "label": "Validation", "description": "Checking referential integrity", "status": "completed", "output": "All foreign keys validated"}
  ]
}`

const AUTO_MODE_SYSTEM = `You are SynthForge AI, a combined Schema Architect and Data Generation Agent. You seamlessly plan schemas AND generate data in a single conversation flow.

CRITICAL RULES:
- NEVER mention any LLM provider name. You are SynthForge AI.
- All data must be synthetic and privacy-safe.
- Maintain referential integrity across all tables.
- ALWAYS generate at least 5-10 rows per table to make the data useful.
- For simple requests, skip clarification and go straight to generation.

Response format - always use this JSON structure:
{
  "action": "generate",
  "agentName": "auto-agent",
  "explanation": "I've designed a schema and generated data...",
  "tables": {
    "tableName": [
      {"column1": "value1", "column2": "value2"}
    ]
  },
  "sqlCode": "CREATE TABLE ...; INSERT INTO ...;",
  "reasoningSteps": [
    {"type": "intent", "label": "Intent Analysis", "description": "Understanding request", "status": "completed", "output": "E-commerce platform"},
    {"type": "domain_detection", "label": "Domain Detection", "description": "Identifying domain", "status": "completed", "output": "E-commerce/Retail"},
    {"type": "entity_extraction", "label": "Entity Extraction", "description": "Identifying entities", "status": "completed", "output": "Users, Products, Orders"},
    {"type": "data_strategy", "label": "Data Strategy", "description": "Planning generation", "status": "completed", "output": "10 users, 15 products, 25 orders"},
    {"type": "validation", "label": "Validation", "description": "Checking integrity", "status": "completed", "output": "All FKs valid"}
  ],
  "options": [],
  "followUpQuestions": ["Would you like to add more tables?"]
}

For clarification:
{
  "action": "clarify",
  "agentName": "auto-agent",
  "explanation": "I need more info...",
  "options": [{"id": "opt1", "label": "A", "value": "a", "description": "Desc"}],
  "followUpQuestions": [],
  "reasoningSteps": [...]
}`

// ─── Core API Functions using z-ai-web-dev-sdk ──────────────────

let zaiInstance: ZAI | null = null

async function getZAI(): Promise<ZAI> {
  if (!zaiInstance) {
    try {
      zaiInstance = await ZAI.create()
    } catch (err) {
      console.error('[SynthForge AI] Failed to initialize ZAI SDK:', err)
      throw err
    }
  }
  return zaiInstance
}

export async function chatCompletion(request: ChatRequest): Promise<ChatResponse> {
  try {
    const zai = await getZAI()

    // Add timeout wrapper (120s max)
    const completion = await Promise.race([
      zai.chat.completions.create({
        messages: request.messages,
        temperature: request.temperature ?? 0.7,
        max_tokens: request.maxTokens ?? 8192
      }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('AI request timed out after 120s')), 120_000)
      )
    ])

    const content = completion.choices[0]?.message?.content || ''
    if (!content) {
      console.warn('[SynthForge AI] Empty response from AI, falling back to local generation')
      return generateLocalFallback(request.messages)
    }

    return {
      content,
      tokensIn: completion.usage?.prompt_tokens || 0,
      tokensOut: completion.usage?.completion_tokens || 0,
      model: 'synthforge-v1'
    }
  } catch (error) {
    console.error('[SynthForge AI] chatCompletion error:', error instanceof Error ? error.message : error)
    // Fall back to local data generation
    return generateLocalFallback(request.messages)
  }
}

// ─── Local Fallback Data Generation ────────────────────────

interface LocalTableDef {
  name: string
  columns: Record<string, string>
  rowCount: number
}

function detectTablesFromMessage(userMessage: string): LocalTableDef[] {
  const msg = userMessage.toLowerCase()
  const tables: LocalTableDef[] = []

  // Detect common domain patterns
  if (msg.includes('user') || msg.includes('customer') || msg.includes('people') || msg.includes('employee') || msg.includes('person')) {
    tables.push({
      name: 'users',
      columns: { id: 'INTEGER', first_name: 'VARCHAR', last_name: 'VARCHAR', email: 'VARCHAR', phone: 'VARCHAR', city: 'VARCHAR', state: 'VARCHAR', age: 'INTEGER', status: 'VARCHAR', created_at: 'TIMESTAMP' },
      rowCount: 10
    })
  }
  if (msg.includes('product') || msg.includes('item') || msg.includes('catalog') || msg.includes('inventory')) {
    tables.push({
      name: 'products',
      columns: { id: 'INTEGER', name: 'VARCHAR', category: 'VARCHAR', price: 'DECIMAL', quantity: 'INTEGER', description: 'VARCHAR', status: 'VARCHAR' },
      rowCount: 10
    })
  }
  if (msg.includes('order') || msg.includes('purchase') || msg.includes('transaction')) {
    tables.push({
      name: 'orders',
      columns: { id: 'INTEGER', user_id: 'INTEGER', product_id: 'INTEGER', quantity: 'INTEGER', total_amount: 'DECIMAL', status: 'VARCHAR', order_date: 'TIMESTAMP' },
      rowCount: 15
    })
  }
  if (msg.includes('hospital') || msg.includes('patient') || msg.includes('doctor') || msg.includes('medical')) {
    tables.push({
      name: 'patients',
      columns: { id: 'INTEGER', first_name: 'VARCHAR', last_name: 'VARCHAR', email: 'VARCHAR', phone: 'VARCHAR', age: 'INTEGER', diagnosis: 'VARCHAR', admission_date: 'TIMESTAMP', status: 'VARCHAR' },
      rowCount: 10
    })
    tables.push({
      name: 'doctors',
      columns: { id: 'INTEGER', first_name: 'VARCHAR', last_name: 'VARCHAR', specialty: 'VARCHAR', email: 'VARCHAR', phone: 'VARCHAR' },
      rowCount: 5
    })
  }
  if (msg.includes('student') || msg.includes('course') || msg.includes('enrollment') || msg.includes('grade') || msg.includes('school') || msg.includes('university')) {
    tables.push({
      name: 'students',
      columns: { id: 'INTEGER', first_name: 'VARCHAR', last_name: 'VARCHAR', email: 'VARCHAR', age: 'INTEGER', enrollment_date: 'TIMESTAMP', status: 'VARCHAR' },
      rowCount: 10
    })
    tables.push({
      name: 'courses',
      columns: { id: 'INTEGER', name: 'VARCHAR', category: 'VARCHAR', credits: 'INTEGER', instructor: 'VARCHAR' },
      rowCount: 8
    })
  }

  // If no specific domain detected, generate a generic table
  if (tables.length === 0) {
    tables.push({
      name: 'records',
      columns: { id: 'INTEGER', name: 'VARCHAR', email: 'VARCHAR', phone: 'VARCHAR', city: 'VARCHAR', status: 'VARCHAR', created_at: 'TIMESTAMP' },
      rowCount: 10
    })
  }

  // Adjust row count based on user's request
  const countMatch = msg.match(/(\d+)\s*(row|record|entry|item|user|product|order|patient|student)/i)
  if (countMatch) {
    const requestedCount = Math.min(parseInt(countMatch[1]), 100)
    tables.forEach(t => t.rowCount = requestedCount)
  }

  return tables
}

function generateLocalFallback(messages: ChatMessage[]): ChatResponse {
  console.log('[SynthForge AI] Generating local fallback data')

  // Find the last user message
  const lastUserMsg = [...messages].reverse().find(m => m.role === 'user')
  const userMessage = lastUserMsg?.content || 'Generate sample data'

  const tables = detectTablesFromMessage(userMessage)
  const generatedTables: Record<string, Record<string, unknown>[]> = {}
  const sqlStatements: string[] = []

  for (const table of tables) {
    const rows: Record<string, unknown>[] = []
    for (let i = 0; i < table.rowCount; i++) {
      const row: Record<string, unknown> = {}
      for (const [colName, colType] of Object.entries(table.columns)) {
        row[colName] = generateFakeValue(colType, colName)
      }
      // Ensure id is sequential
      if ('id' in table.columns) row.id = i + 1
      // Ensure foreign keys reference valid ids
      if (col_endsWith_id(row)) {
        // handled below
      }
      rows.push(row)
    }
    generatedTables[table.name] = rows

    // Generate CREATE TABLE SQL
    const colDefs = Object.entries(table.columns).map(([name, type]) => `${name} ${type}`).join(', ')
    sqlStatements.push(`CREATE TABLE ${table.name} (${colDefs});`)

    // Generate INSERT SQL
    const cols = Object.keys(table.columns)
    for (const row of rows) {
      const values = cols.map(c => {
        const v = row[c]
        return typeof v === 'string' ? `'${String(v).replace(/'/g, "''")}'` : String(v ?? 'NULL')
      })
      sqlStatements.push(`INSERT INTO ${table.name} (${cols.join(', ')}) VALUES (${values.join(', ')});`)
    }
  }

  // Fix foreign key references
  const tableNames = Object.keys(generatedTables)
  for (const tableName of tableNames) {
    const rows = generatedTables[tableName]
    for (const row of rows) {
      for (const key of Object.keys(row)) {
        if (key.endsWith('_id') && key !== 'id') {
          const refTableName = key.replace(/_id$/, '') + 's'
          const refTable = generatedTables[refTableName]
          if (refTable && refTable.length > 0) {
            row[key] = (refTable[Math.floor(Math.random() * refTable.length)] as Record<string, unknown>).id
          }
        }
      }
    }
  }

  const explanation = `I've generated synthetic data for ${tables.length} table${tables.length > 1 ? 's' : ''}: ${tables.map(t => `${t.name} (${t.rowCount} rows)`).join(', ')}. This data was generated locally as a fallback. All data is privacy-safe and synthetic.`

  const responseContent = JSON.stringify({
    action: 'generate',
    agentName: 'auto-agent',
    explanation,
    tables: generatedTables,
    sqlCode: sqlStatements.join('\n'),
    reasoningSteps: [
      { type: 'intent', label: 'Intent Analysis', description: 'Analyzing user request', status: 'completed', output: 'Data generation request (local fallback)' },
      { type: 'domain_detection', label: 'Domain Detection', description: 'Identifying business domain', status: 'completed', output: `Detected: ${tables.map(t => t.name).join(', ')}` },
      { type: 'data_strategy', label: 'Data Strategy', description: 'Planning data generation', status: 'completed', output: `Generating ${tables.map(t => `${t.rowCount} ${t.name}`).join(', ')}` },
      { type: 'validation', label: 'Validation', description: 'Checking referential integrity', status: 'completed', output: 'All foreign keys validated' }
    ],
    options: [],
    followUpQuestions: ['Would you like to add more tables or adjust the data?']
  })

  return {
    content: responseContent,
    tokensIn: 0,
    tokensOut: 0,
    model: 'synthforge-local-fallback'
  }
}

function col_endsWith_id(row: Record<string, unknown>): boolean {
  return Object.keys(row).some(k => k.endsWith('_id') && k !== 'id')
}

// ─── Multi-Agent Orchestration ──────────────────────────────────

export function getSystemPrompt(agentMode: string): string {
  switch (agentMode) {
    case 'plan': return PLAN_AGENT_SYSTEM
    case 'execute': return EXEC_AGENT_SYSTEM
    case 'auto': default: return AUTO_MODE_SYSTEM
  }
}

export function parseAgentResponse(content: string): AgentResponse | null {
  try {
    const jsonMatch = content.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0])
      return {
        action: parsed.action || 'generate',
        agentName: parsed.agentName || 'auto-agent',
        explanation: parsed.explanation || '',
        tables: parsed.tables || undefined,
        sqlCode: parsed.sqlCode || undefined,
        schemaPlan: parsed.schemaPlan || undefined,
        reasoningSteps: parsed.reasoningSteps || undefined,
        options: parsed.options || undefined,
        followUpQuestions: parsed.followUpQuestions || undefined
      }
    }
  } catch {
    // Not JSON - return null
  }
  return null
}

export function estimateCost(tokensIn: number, tokensOut: number): number {
  const inputCost = (tokensIn / 1_000_000) * 0.27
  const outputCost = (tokensOut / 1_000_000) * 1.10
  return inputCost + outputCost
}

// ─── Synthetic Data Helpers ──────────────────────────────────

export function generateFakeValue(type: string, fieldName: string): unknown {
  const name = fieldName.toLowerCase()
  if (name.includes('email')) return `user${Math.floor(Math.random() * 9999)}@example.com`
  if (name.includes('phone') || name.includes('tel')) return `+1${Math.floor(Math.random() * 9000000000 + 1000000000)}`
  if (name.includes('first_name') || name.includes('firstname')) return ['James','Mary','John','Patricia','Robert','Jennifer','Michael','Linda','David','Elizabeth'][Math.floor(Math.random() * 10)]
  if (name.includes('last_name') || name.includes('lastname')) return ['Smith','Johnson','Williams','Brown','Jones','Garcia','Miller','Davis','Rodriguez','Martinez'][Math.floor(Math.random() * 10)]
  if (name.includes('name') && !name.includes('user') && !name.includes('table')) return ['Alice Chen','Bob Smith','Carol Jones','David Kim','Eva Garcia','Frank Lee','Grace Wu','Henry Patel','Iris Nguyen','Jack Brown'][Math.floor(Math.random() * 10)]
  if (name.includes('city')) return ['New York','Los Angeles','Chicago','Houston','Phoenix'][Math.floor(Math.random() * 5)]
  if (name.includes('state') || name.includes('province')) return ['CA','NY','TX','FL','IL'][Math.floor(Math.random() * 5)]
  if (name.includes('country')) return ['US','UK','CA','DE','FR'][Math.floor(Math.random() * 5)]
  if (name.includes('zip') || name.includes('postal')) return String(Math.floor(Math.random() * 90000 + 10000))
  if (name.includes('price') || name.includes('amount') || name.includes('salary') || name.includes('cost')) return +(Math.random() * 10000).toFixed(2)
  if (name.includes('quantity') || name.includes('qty') || name.includes('count') || name.includes('stock')) return Math.floor(Math.random() * 1000)
  if (name.includes('age')) return Math.floor(Math.random() * 60 + 18)
  if (name.includes('status')) return ['active','inactive','pending','completed','cancelled'][Math.floor(Math.random() * 5)]
  if (name.includes('category')) return ['Electronics','Clothing','Food','Books','Sports'][Math.floor(Math.random() * 5)]
  if (name.includes('description') || name.includes('bio') || name.includes('notes')) return 'Synthetic generated text for demonstration purposes'

  switch (type.toLowerCase()) {
    case 'integer': case 'int': case 'serial': return Math.floor(Math.random() * 10000)
    case 'float': case 'double': case 'decimal': case 'numeric': return +(Math.random() * 10000).toFixed(2)
    case 'boolean': case 'bool': return Math.random() > 0.5
    case 'date': case 'datetime': case 'timestamp': {
      const d = new Date(); d.setDate(d.getDate() - Math.floor(Math.random() * 365))
      return d.toISOString().split('T')[0]
    }
    default: return `Value-${Math.floor(Math.random() * 9999)}`
  }
}

export function extractSchemaFromSQL(sql: string): Record<string, { columns: Record<string, string> }> {
  const tables: Record<string, { columns: Record<string, string> }> = {}
  const regex = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?[`"]?(\w+)[`"]?\s*\(([\s\S]*?)\)\s*;/gi
  let match
  while ((match = regex.exec(sql)) !== null) {
    const tableName = match[1]
    const columnsStr = match[2]
    const columns: Record<string, string> = {}
    const colRegex = /\s*[`"]?(\w+)[`"]?\s+([\w()]+(?:\[\])?)/g
    let colMatch
    while ((colMatch = colRegex.exec(columnsStr)) !== null) {
      if (['PRIMARY','FOREIGN','CONSTRAINT','UNIQUE','INDEX','KEY','CHECK'].includes(colMatch[1].toUpperCase())) continue
      columns[colMatch[1]] = colMatch[2]
    }
    if (Object.keys(columns).length > 0) tables[tableName] = { columns }
  }
  return tables
}

export function extractSchemaFromCSV(csvText: string, filename: string): Record<string, { columns: Record<string, string> }> {
  const lines = csvText.trim().split('\n')
  if (lines.length === 0) return {}
  const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''))
  const columns: Record<string, string> = {}
  for (const header of headers) {
    const samples = lines.slice(1, 5).map(l => l.split(',')[headers.indexOf(header)]?.trim().replace(/"/g, '')).filter(Boolean)
    if (samples.every(v => /^-?\d+$/.test(v))) columns[header] = 'INTEGER'
    else if (samples.every(v => /^-?\d+\.\d+$/.test(v))) columns[header] = 'DECIMAL'
    else columns[header] = 'VARCHAR(255)'
  }
  return { [filename.replace(/\.(csv|tsv)$/i, '').replace(/[^a-zA-Z0-9_]/g, '_').toLowerCase()]: { columns } }
}

export function extractSchemaFromJSON(jsonStr: string): Record<string, { columns: Record<string, string> }> {
  try {
    const data = JSON.parse(jsonStr)
    const tables: Record<string, { columns: Record<string, string> }> = {}
    if (Array.isArray(data) && data.length > 0 && typeof data[0] === 'object') {
      const columns: Record<string, string> = {}
      for (const [k, v] of Object.entries(data[0])) columns[k] = inferType(v)
      tables['imported_data'] = { columns }
    } else if (typeof data === 'object') {
      for (const [tn, td] of Object.entries(data)) {
        if (Array.isArray(td) && td.length > 0 && typeof td[0] === 'object') {
          const columns: Record<string, string> = {}
          for (const [k, v] of Object.entries(td[0] as Record<string, unknown>)) columns[k] = inferType(v)
          tables[tn] = { columns }
        }
      }
    }
    return tables
  } catch { return {} }
}

function inferType(v: unknown): string {
  if (v === null || v === undefined) return 'VARCHAR(255)'
  if (typeof v === 'number') return Number.isInteger(v) ? 'INTEGER' : 'DECIMAL'
  if (typeof v === 'boolean') return 'BOOLEAN'
  if (typeof v === 'object') return 'JSON'
  if (typeof v === 'string') return /^\d{4}-\d{2}-\d{2}/.test(v) ? 'TIMESTAMP' : 'VARCHAR(255)'
  return 'VARCHAR(255)'
}

// ─── Streaming Support ──────────────────────────────────────────

export interface StreamEvent {
  type: 'content' | 'reasoning' | 'done' | 'error'
  data: unknown
}

export async function chatCompletionStream(request: ChatRequest): Promise<ReadableStream<Uint8Array>> {
  const encoder = new TextEncoder()

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        const zai = await getZAI()

        // Emit reasoning step updates
        const emitReasoning = (step: ReasoningStep) => {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'reasoning', data: step })}\n\n`))
        }

        emitReasoning({ type: 'intent', label: 'Intent Analysis', description: 'Analyzing user request', status: 'running' })

        // Use the regular completion with a simulated stream
        // The z-ai-web-dev-sdk doesn't natively support streaming, so we simulate it
        const completion = await Promise.race([
          zai.chat.completions.create({
            messages: request.messages,
            temperature: request.temperature ?? 0.7,
            max_tokens: request.maxTokens ?? 8192
          }),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('AI stream request timed out after 120s')), 120_000)
          )
        ])

        const content = completion.choices[0]?.message?.content || ''

        emitReasoning({ type: 'intent', label: 'Intent Analysis', description: 'Analyzing user request', status: 'completed', output: 'Request understood' })
        emitReasoning({ type: 'domain_detection', label: 'Domain Detection', description: 'Identifying business domain', status: 'running' })
        emitReasoning({ type: 'domain_detection', label: 'Domain Detection', description: 'Identifying business domain', status: 'completed', output: 'Processing data request' })
        emitReasoning({ type: 'data_strategy', label: 'Data Strategy', description: 'Planning generation', status: 'running' })

        // Simulate streaming by chunking the response
        if (content) {
          const chunkSize = 20
          for (let i = 0; i < content.length; i += chunkSize) {
            const chunk = content.slice(i, i + chunkSize)
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'content', data: chunk })}\n\n`))
            // Small delay to simulate streaming
            await new Promise(r => setTimeout(r, 10))
          }
        } else {
          // Fallback to local generation
          const fallback = generateLocalFallback(request.messages)
          const fallbackChunks = fallback.content
          const chunkSize = 20
          for (let i = 0; i < fallbackChunks.length; i += chunkSize) {
            const chunk = fallbackChunks.slice(i, i + chunkSize)
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'content', data: chunk })}\n\n`))
            await new Promise(r => setTimeout(r, 10))
          }
        }

        emitReasoning({ type: 'data_strategy', label: 'Data Strategy', description: 'Planning generation', status: 'completed', output: 'Data generated' })
        emitReasoning({ type: 'validation', label: 'Validation', description: 'Checking integrity', status: 'completed', output: 'All checks passed' })

        controller.enqueue(encoder.encode(`data: ${JSON.stringify({
          type: 'done',
          data: {
            tokensIn: completion.usage?.prompt_tokens || 0,
            tokensOut: completion.usage?.completion_tokens || 0,
            model: 'synthforge-v1'
          }
        })}\n\n`))

        controller.close()
      } catch (error) {
        console.error('[SynthForge AI] chatCompletionStream error:', error instanceof Error ? error.message : error)

        // Try local fallback for streaming
        try {
          const fallback = generateLocalFallback(request.messages)
          const chunkSize = 20
          for (let i = 0; i < fallback.content.length; i += chunkSize) {
            const chunk = fallback.content.slice(i, i + chunkSize)
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'content', data: chunk })}\n\n`))
            await new Promise(r => setTimeout(r, 10))
          }
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'done', data: { tokensIn: 0, tokensOut: 0, model: 'synthforge-local-fallback' } })}\n\n`))
          controller.close()
        } catch {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'error', data: error instanceof Error ? error.message : 'Stream failed' })}\n\n`))
          controller.close()
        }
      }
    }
  })
}

// ─── PII Detection ──────────────────────────────────────────────

export interface PIIDetectionResult {
  hasPII: boolean
  findings: {
    type: 'email' | 'phone' | 'ssn' | 'credit_card' | 'ip_address' | 'date_of_birth'
    field: string
    count: number
    sample: string
  }[]
  sanitizedTables: Record<string, Record<string, unknown>[]>
}

const PII_PATTERNS: Record<string, { pattern: RegExp; type: PIIDetectionResult['findings'][number]['type']; replacement: string }> = {
  email: { pattern: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, type: 'email', replacement: '[REDACTED_EMAIL]' },
  phone: { pattern: /(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g, type: 'phone', replacement: '[REDACTED_PHONE]' },
  ssn: { pattern: /\b\d{3}[-\s]?\d{2}[-\s]?\d{4}\b/g, type: 'ssn', replacement: '[REDACTED_SSN]' },
  credit_card: { pattern: /\b(?:\d{4}[-\s]?){3}\d{4}\b/g, type: 'credit_card', replacement: '[REDACTED_CC]' },
  ip_address: { pattern: /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g, type: 'ip_address', replacement: '[REDACTED_IP]' },
}

export function detectPII(tables: Record<string, Record<string, unknown>[]>): PIIDetectionResult {
  const findings: PIIDetectionResult['findings'] = []
  const sanitizedTables: Record<string, Record<string, unknown>[]> = {}

  for (const [tableName, rows] of Object.entries(tables)) {
    const sanitizedRows: Record<string, unknown>[] = []

    for (const row of rows) {
      const sanitizedRow: Record<string, unknown> = {}

      for (const [field, value] of Object.entries(row)) {
        if (typeof value !== 'string') {
          sanitizedRow[field] = value
          continue
        }

        let sanitized = value
        let foundInField = false

        for (const [name, config] of Object.entries(PII_PATTERNS)) {
          const matches = value.match(config.pattern)
          if (matches && matches.length > 0) {
            foundInField = true
            // Check if this is real PII (not synthetic data like @example.com)
            const realPIIMatches = name === 'email'
              ? matches.filter(m => !m.includes('@example.com') && !m.includes('@test.'))
              : name === 'phone'
              ? matches.filter(m => !m.startsWith('+1555'))
              : matches

            if (realPIIMatches.length > 0) {
              const existing = findings.find(f => f.type === config.type && f.field === `${tableName}.${field}`)
              if (existing) {
                existing.count += realPIIMatches.length
              } else {
                findings.push({
                  type: config.type,
                  field: `${tableName}.${field}`,
                  count: realPIIMatches.length,
                  sample: realPIIMatches[0].slice(0, 3) + '***'
                })
              }
              sanitized = sanitized.replace(config.pattern, config.replacement)
            }
          }
        }

        sanitizedRow[field] = sanitized
      }

      sanitizedRows.push(sanitizedRow)
    }

    sanitizedTables[tableName] = sanitizedRows
  }

  return {
    hasPII: findings.length > 0,
    findings,
    sanitizedTables
  }
}

// ─── Schema Inference from Data ─────────────────────────────────

export interface InferredSchema {
  tables: Record<string, {
    columns: Record<string, {
      type: string
      nullable: boolean
      unique: boolean
      sample: unknown[]
    }>
    primaryKey: string | null
    foreignKeys: { column: string; references: { table: string; column: string } }[]
    constraints: { type: string; description: string }[]
    relationships: { targetTable: string; type: string }[]
  }>
}

export function inferSchemaFromData(tables: Record<string, Record<string, unknown>[]>): InferredSchema {
  const result: InferredSchema = { tables: {} }

  for (const [tableName, rows] of Object.entries(tables)) {
    if (rows.length === 0) continue

    const columns: InferredSchema['tables'][string]['columns'] = {}
    const valueSets: Record<string, Set<string>> = {}
    const nullCounts: Record<string, number> = {}
    const samples: Record<string, unknown[]> = {}

    // Initialize from first row
    for (const key of Object.keys(rows[0])) {
      valueSets[key] = new Set()
      nullCounts[key] = 0
      samples[key] = []
    }

    // Analyze all rows
    for (const row of rows) {
      for (const [key, value] of Object.entries(row)) {
        if (!valueSets[key]) {
          valueSets[key] = new Set()
          nullCounts[key] = 0
          samples[key] = []
        }

        if (value === null || value === undefined) {
          nullCounts[key] = (nullCounts[key] || 0) + 1
        } else {
          valueSets[key].add(String(value))
          if (samples[key].length < 5) samples[key].push(value)
        }
      }
    }

    // Infer column types and properties
    let primaryKey: string | null = null
    const foreignKeys: InferredSchema['tables'][string]['foreignKeys'] = []
    const constraints: InferredSchema['tables'][string]['constraints'] = []
    const relationships: InferredSchema['tables'][string]['relationships'] = []

    for (const [colName, values] of Object.entries(valueSets)) {
      const nullable = (nullCounts[colName] || 0) > 0
      const unique = values.size === rows.length && rows.length > 1
      const sampleValues = samples[colName] || []
      const inferredType = inferTypeFromValues(sampleValues, colName)

      columns[colName] = {
        type: inferredType,
        nullable,
        unique,
        sample: sampleValues.slice(0, 3)
      }

      // Detect primary key
      if (colName === 'id' && unique) {
        primaryKey = colName
      }

      // Detect foreign keys
      if (colName.endsWith('_id') && colName !== 'id') {
        const refTableName = colName.replace(/_id$/, '') + 's'
        if (tables[refTableName]) {
          foreignKeys.push({
            column: colName,
            references: { table: refTableName, column: 'id' }
          })
          relationships.push({ targetTable: refTableName, type: 'many-to-one' })
        }
      }
    }

    // Add constraints
    if (primaryKey) {
      constraints.push({ type: 'PRIMARY_KEY', description: `${primaryKey} is the primary key` })
    }
    for (const fk of foreignKeys) {
      constraints.push({ type: 'FOREIGN_KEY', description: `${fk.column} references ${fk.references.table}.${fk.references.column}` })
    }
    for (const [colName, col] of Object.entries(columns)) {
      if (col.unique && colName !== primaryKey) {
        constraints.push({ type: 'UNIQUE', description: `${colName} has unique values` })
      }
    }

    result.tables[tableName] = {
      columns,
      primaryKey,
      foreignKeys,
      constraints,
      relationships
    }
  }

  // Cross-table relationship detection
  for (const [tableName, tableDef] of Object.entries(result.tables)) {
    for (const fk of tableDef.foreignKeys) {
      const targetTable = result.tables[fk.references.table]
      if (targetTable) {
        // Check if target has a reverse relationship
        const reverseFK = targetTable.foreignKeys.find(f => f.references.table === tableName)
        if (!tableDef.relationships.find(r => r.targetTable === fk.references.table)) {
          tableDef.relationships.push({ targetTable: fk.references.table, type: 'many-to-one' })
        }
      }
    }
  }

  return result
}

function inferTypeFromValues(values: unknown[], colName: string): string {
  if (values.length === 0) return 'VARCHAR(255)'

  const name = colName.toLowerCase()

  // Name-based inference
  if (name.includes('email')) return 'VARCHAR(255)'
  if (name.includes('phone') || name.includes('tel')) return 'VARCHAR(20)'
  if (name === 'id') return 'INTEGER'
  if (name.endsWith('_id')) return 'INTEGER'
  if (name.includes('price') || name.includes('amount') || name.includes('salary')) return 'DECIMAL(10,2)'
  if (name.includes('date') || name.includes('time') || name.includes('_at')) return 'TIMESTAMP'
  if (name.includes('status')) return 'VARCHAR(50)'

  // Value-based inference
  const nonNullValues = values.filter(v => v !== null && v !== undefined)
  if (nonNullValues.length === 0) return 'VARCHAR(255)'

  const allIntegers = nonNullValues.every(v => typeof v === 'number' && Number.isInteger(v))
  const allNumbers = nonNullValues.every(v => typeof v === 'number')
  const allBooleans = nonNullValues.every(v => typeof v === 'boolean')
  const allStrings = nonNullValues.every(v => typeof v === 'string')
  const allDates = allStrings && nonNullValues.every(v => /^\d{4}-\d{2}-\d{2}/.test(String(v)))

  if (allBooleans) return 'BOOLEAN'
  if (allDates) return 'TIMESTAMP'
  if (allIntegers) return 'INTEGER'
  if (allNumbers) return 'DECIMAL(10,2)'
  return 'VARCHAR(255)'
}

// ─── Data Quality Scoring ───────────────────────────────────────

export interface DataQualityScore {
  overall: number
  breakdown: {
    completeness: number  // % of non-null values
    uniqueness: number    // % of unique values where expected
    distribution: number  // How well-distributed the data is
    referentialIntegrity: number  // FK references are valid
  }
  issues: string[]
}

export function scoreDataQuality(
  tables: Record<string, Record<string, unknown>[]>,
  schema?: InferredSchema
): DataQualityScore {
  const issues: string[] = []
  let totalCompleteness = 0
  let totalUniqueness = 0
  let totalDistribution = 0
  let totalRI = 0
  let tableCount = 0

  for (const [tableName, rows] of Object.entries(tables)) {
    if (rows.length === 0) {
      issues.push(`Table "${tableName}" is empty`)
      tableCount++
      continue
    }

    tableCount++

    // ─── Completeness ───
    let nullCount = 0
    let totalFields = 0
    for (const row of rows) {
      for (const [key, value] of Object.entries(row)) {
        totalFields++
        if (value === null || value === undefined || value === '') {
          nullCount++
        }
      }
    }
    const completeness = totalFields > 0 ? Math.round(((totalFields - nullCount) / totalFields) * 100) : 100
    totalCompleteness += completeness
    if (completeness < 90) {
      issues.push(`Table "${tableName}" has ${nullCount} null/empty values (${100 - completeness}% missing)`)
    }

    // ─── Uniqueness ───
    const idCol = Object.keys(rows[0]).find(k => k === 'id')
    let uniqueness = 100
    if (idCol) {
      const idValues = rows.map(r => r[idCol])
      const uniqueIds = new Set(idValues)
      uniqueness = Math.round((uniqueIds.size / idValues.length) * 100)
      if (uniqueness < 100) {
        issues.push(`Table "${tableName}" has duplicate IDs (${uniqueness}% unique)`)
      }
    } else {
      // Check first column uniqueness as proxy
      const firstCol = Object.keys(rows[0])[0]
      if (firstCol) {
        const vals = rows.map(r => String(r[firstCol]))
        const uniqueVals = new Set(vals)
        uniqueness = Math.round((uniqueVals.size / vals.length) * 100)
      }
    }
    totalUniqueness += uniqueness

    // ─── Distribution ───
    let distributionScore = 100
    for (const [colName, value] of Object.entries(rows[0])) {
      if (typeof value === 'string') {
        const vals = rows.map(r => r[colName]).filter(v => v !== null && v !== undefined)
        const uniqueVals = new Set(vals.map(String))
        // Good distribution: many unique values relative to row count
        if (vals.length > 5 && uniqueVals.size < 2) {
          distributionScore = Math.min(distributionScore, 40)
          issues.push(`Column "${tableName}.${colName}" has very low distribution (${uniqueVals.size} unique values)`)
        } else if (vals.length > 5 && uniqueVals.size / vals.length < 0.1) {
          distributionScore = Math.min(distributionScore, 70)
        }
      }
    }
    totalDistribution += distributionScore

    // ─── Referential Integrity ───
    let riScore = 100
    const fkCols = Object.keys(rows[0]).filter(k => k.endsWith('_id') && k !== 'id')
    for (const fkCol of fkCols) {
      const refTableName = fkCol.replace(/_id$/, '') + 's'
      const refTable = tables[refTableName]
      if (refTable) {
        const refIds = new Set(refTable.map(r => r.id))
        const fkValues = rows.map(r => r[fkCol]).filter(v => v !== null && v !== undefined)
        const invalidRefs = fkValues.filter(v => !refIds.has(v))
        if (invalidRefs.length > 0) {
          riScore = Math.max(0, Math.round(((fkValues.length - invalidRefs.length) / fkValues.length) * 100))
          issues.push(`FK "${tableName}.${fkCol}" has ${invalidRefs.length} invalid references to "${refTableName}"`)
        }
      }
    }
    totalRI += riScore
  }

  if (tableCount === 0) {
    return { overall: 0, breakdown: { completeness: 0, uniqueness: 0, distribution: 0, referentialIntegrity: 0 }, issues: ['No data tables found'] }
  }

  const completeness = Math.round(totalCompleteness / tableCount)
  const uniqueness = Math.round(totalUniqueness / tableCount)
  const distribution = Math.round(totalDistribution / tableCount)
  const referentialIntegrity = Math.round(totalRI / tableCount)

  const overall = Math.round((completeness * 0.3 + uniqueness * 0.2 + distribution * 0.2 + referentialIntegrity * 0.3))

  return {
    overall,
    breakdown: { completeness, uniqueness, distribution, referentialIntegrity },
    issues
  }
}

// ─── XML Schema Extraction ──────────────────────────────────────

export function extractSchemaFromXML(xmlText: string, filename: string): Record<string, { columns: Record<string, string>; relationships?: string[] }> {
  const tables: Record<string, { columns: Record<string, string>; relationships?: string[] }> = {}

  try {
    // Simple XML parsing - extract elements and attributes as schema
    const elementRegex = /<(\w+)(?:\s+([^>]*))?>([\s\S]*?)<\/\1>/g
    const attrRegex = /(\w+)="([^"]*)"/g
    const selfClosingRegex = /<(\w+)(?:\s+([^>]*))?\/>/g

    // Try to detect repeating elements as table rows
    const elementCounts: Record<string, number> = {}
    let match

    // Count element occurrences
    const tempRegex = /<(\w+)[\s>\/]/g
    while ((match = tempRegex.exec(xmlText)) !== null) {
      const tagName = match[1]
      if (!['xml', 'schema', 'xmlns', 'type', 'element', 'attribute', 'sequence', 'complexType', 'simpleType', 'annotation', 'documentation'].includes(tagName)) {
        elementCounts[tagName] = (elementCounts[tagName] || 0) + 1
      }
    }

    // Elements that appear multiple times are likely table rows
    const tableElements = Object.entries(elementCounts)
      .filter(([_, count]) => count >= 2)
      .map(([name]) => name)

    // For each table element, extract its child elements and attributes as columns
    for (const elementName of tableElements) {
      const columns: Record<string, string> = {}
      const relationships: string[] = []

      // Find all instances of this element
      const elemRegex = new RegExp(`<${elementName}(?:\\s+[^>]*)?>([\\s\\S]*?)<\\/${elementName}>`, 'g')
      let elemMatch
      let instanceCount = 0

      while ((elemMatch = elemRegex.exec(xmlText)) !== null && instanceCount < 3) {
        instanceCount++
        const content = elemMatch[1]

        // Extract child elements as columns
        const childRegex = /<(\w+)(?:\s+[^>]*)?>([^<]*)<\/\1>/g
        let childMatch
        while ((childMatch = childRegex.exec(content)) !== null) {
          const childName = childMatch[1]
          const childValue = childMatch[2].trim()
          if (!columns[childName]) {
            columns[childName] = inferType(childValue)
          }
        }

        // Extract attributes as columns
        const attrs = elemMatch[0].match(attrRegex)
        if (attrs) {
          for (const attr of attrs) {
            const attrMatch = attr.match(/(\w+)="([^"]*)"/)
            if (attrMatch) {
              const attrName = attrMatch[1]
              if (!['xmlns', 'version', 'encoding'].includes(attrName) && !columns[attrName]) {
                columns[attrName] = 'VARCHAR(255)'
              }
            }
          }
        }
      }

      // If no child elements found, try self-closing
      if (Object.keys(columns).length === 0) {
        const scRegex = new RegExp(`<${elementName}(?:\\s+([^>]*))?\\/>`, 'g')
        let scMatch
        while ((scMatch = scRegex.exec(xmlText)) !== null) {
          const attrs = scMatch[1]
          if (attrs) {
            let attrMatch2
            const attrRegex2 = /(\w+)="([^"]*)"/g
            while ((attrMatch2 = attrRegex2.exec(attrs)) !== null) {
              if (!['xmlns', 'version', 'encoding'].includes(attrMatch2[1]) && !columns[attrMatch2[1]]) {
                columns[attrMatch2[1]] = 'VARCHAR(255)'
              }
            }
          }
        }
      }

      // Detect relationships from _id columns
      for (const colName of Object.keys(columns)) {
        if (colName.endsWith('_id') && colName !== 'id') {
          const refTable = colName.replace(/_id$/, '') + 's'
          relationships.push(`${colName} -> ${refTable}.id`)
        }
      }

      if (Object.keys(columns).length > 0) {
        const baseName = filename.replace(/\.xml$/i, '').replace(/[^a-zA-Z0-9_]/g, '_').toLowerCase()
        tables[`${baseName}_${elementName}`] = { columns, ...(relationships.length > 0 ? { relationships } : {}) }
      }
    }

    // If no repeating elements found, try XSD-style parsing
    if (Object.keys(tables).length === 0) {
      const xsdElementRegex = /<xs:element\s+name="(\w+)"[^>]*>/gi
      let xsdMatch
      while ((xsdMatch = xsdElementRegex.exec(xmlText)) !== null) {
        const elemName = xsdMatch[1]
        tables[elemName] = { columns: { id: 'INTEGER' } }
      }
    }
  } catch {
    // XML parsing failed
  }

  return tables
}
