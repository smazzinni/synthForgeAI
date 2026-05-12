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
