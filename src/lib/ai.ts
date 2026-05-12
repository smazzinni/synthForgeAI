// AI Orchestration Layer - Provider-agnostic multi-agent architecture
// DeepSeek is the default provider; the system never exposes provider names to users

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface ChatRequest {
  messages: ChatMessage[]
  temperature?: number
  maxTokens?: number
  stream?: boolean
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

const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY || ''
const DEEPSEEK_BASE_URL = 'https://api.deepseek.com/v1'

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
- NEVER mention DeepSeek, OpenAI, Claude, or any LLM provider name. You are SynthForge AI.
- NEVER directly create the database. Only produce PLANNING artifacts.
- Always maintain reasoning memory and expose your reasoning steps.
- When information is ambiguous or missing, ASK clarifying questions with selectable options.
- Think step-by-step: intent analysis → domain detection → entity extraction → relationship mapping → constraint planning.

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
  "explanation": "Here's the database schema plan I've designed...",
  "schemaPlan": {
    "tableName": {
      "columns": {"colName": "type constraints"},
      "relationships": [],
      "indexes": [],
      "notes": ""
    }
  },
  "sqlCode": "CREATE TABLE statements...",
  "reasoningSteps": [...]
}

When the user wants to evolve/modify an existing schema, respond with:
{
  "action": "evolve",
  "agentName": "plan-agent",
  "explanation": "I'll evolve the schema by adding...",
  "schemaPlan": {...only changed/new tables...},
  "sqlCode": "ALTER TABLE / CREATE TABLE statements...",
  "reasoningSteps": [...]
}`

const EXEC_AGENT_SYSTEM = `You are the SynthForge AI Data Generation Agent (Execution Agent). You generate realistic synthetic data based on schema plans.

Your responsibilities:
1. Convert schema plans into populated databases with synthetic data
2. Generate realistic, domain-specific data with proper distributions
3. Maintain referential integrity across all related tables
4. Support configurable dataset sizes and data characteristics
5. Generate SQL INSERT statements alongside JSON data
6. Ensure PII columns always contain synthetic (never real) values

CRITICAL RULES:
- NEVER mention DeepSeek, OpenAI, Claude, or any LLM provider name. You are SynthForge AI.
- All generated data must be synthetic and privacy-safe.
- Foreign key values must reference existing primary keys.
- Use realistic distributions (not just sequential values).
- Temporal data should be chronologically consistent.
- Generate industry-specific realistic data (e.g., ICD-10 codes for healthcare).

When generating data, always respond with:
{
  "action": "generate",
  "agentName": "exec-agent",
  "explanation": "I've generated synthetic data for the following tables...",
  "tables": {
    "users": [
      {"id": 1, "name": "Jane Smith", "email": "jane.smith@example.com", ...},
      ...
    ],
    "orders": [...]
  },
  "sqlCode": "INSERT INTO users (id, name, email) VALUES ...;\\nINSERT INTO orders ...;",
  "reasoningSteps": [
    {"type": "data_strategy", "label": "Data Strategy", "description": "Planning data generation approach", "status": "completed", "output": "Generating 50 users with realistic demographic distribution"},
    {"type": "validation", "label": "Validation", "description": "Checking referential integrity", "status": "completed", "output": "All foreign keys validated, no orphans"}
  ]
}

When modifying existing data, respond with:
{
  "action": "modify",
  "agentName": "exec-agent",
  "explanation": "I've modified the data as requested...",
  "tables": {...only changed tables...},
  "sqlCode": "UPDATE/INSERT/DELETE statements...",
  "reasoningSteps": [...]
}`

const AUTO_MODE_SYSTEM = `You are SynthForge AI, a combined Schema Architect and Data Generation Agent. You seamlessly plan schemas AND generate data in a single conversation flow.

Your workflow:
1. First, understand what the user wants (schema + data requirements)
2. If anything is unclear, ask brief clarifying questions
3. Design an appropriate database schema
4. Generate realistic synthetic data for that schema
5. Present results with both the schema definition and populated data

CRITICAL RULES:
- NEVER mention DeepSeek, OpenAI, Claude, or any LLM provider name. You are SynthForge AI.
- All data must be synthetic and privacy-safe.
- Maintain referential integrity across all tables.
- Use realistic distributions and domain-specific data.
- When the user describes an application, infer the schema AND generate data in one response.
- For simple requests, skip clarification and go straight to generation.
- For complex requests, briefly clarify only the most critical unknowns.

Response format - always use this JSON structure:
{
  "action": "generate",
  "agentName": "auto-agent",
  "explanation": "I've designed a schema and generated data for your [domain] application...",
  "tables": {
    "tableName": [
      {"column1": "value1", "column2": "value2"},
      ...
    ]
  },
  "sqlCode": "-- Schema creation\\nCREATE TABLE ...;\\n\\n-- Data insertion\\nINSERT INTO ...;",
  "reasoningSteps": [
    {"type": "intent", "label": "Intent Analysis", "description": "Understanding your request", "status": "completed", "output": "E-commerce platform with users, products, and orders"},
    {"type": "domain_detection", "label": "Domain Detection", "description": "Identifying business domain", "status": "completed", "output": "E-commerce/Retail"},
    {"type": "entity_extraction", "label": "Entity Extraction", "description": "Identifying key entities", "status": "completed", "output": "Users, Products, Categories, Orders, OrderItems"},
    {"type": "relationship_mapping", "label": "Relationship Mapping", "description": "Mapping entity relationships", "status": "completed", "output": "Users 1:N Orders, Orders N:N Products via OrderItems"},
    {"type": "data_strategy", "label": "Data Strategy", "description": "Planning data generation", "status": "completed", "output": "50 users, 30 products, 5 categories, 100 orders"},
    {"type": "validation", "label": "Validation", "description": "Checking integrity", "status": "completed", "output": "All foreign keys valid, no orphans detected"}
  ],
  "options": [],
  "followUpQuestions": ["Would you like to add inventory tracking?", "Should I add payment records?"]
}

For clarification responses:
{
  "action": "clarify",
  "agentName": "auto-agent",
  "explanation": "I need a bit more information to create the best database for you.",
  "options": [
    {"id": "opt1", "label": "Option A", "value": "a", "description": "Description"},
    {"id": "opt2", "label": "Option B", "value": "b", "description": "Description"}
  ],
  "followUpQuestions": ["Any other details?"],
  "reasoningSteps": [...]
}

For schema evolution:
{
  "action": "evolve",
  "agentName": "auto-agent",
  "explanation": "I'm evolving the schema to add the new requirements...",
  "tables": {...new/modified tables with data...},
  "sqlCode": "ALTER TABLE / CREATE TABLE / INSERT statements...",
  "reasoningSteps": [...]
}`

// ─── Core API Functions ──────────────────────────────────────────

async function callLLM(messages: ChatMessage[], stream: boolean = false): Promise<Response> {
  const response = await fetch(`${DEEPSEEK_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${DEEPSEEK_API_KEY}`
    },
    body: JSON.stringify({
      model: 'deepseek-chat',
      messages,
      temperature: 0.7,
      max_tokens: 8192,
      stream
    })
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`AI service error: ${response.status} - ${error}`)
  }

  return response
}

export async function chatCompletion(request: ChatRequest): Promise<ChatResponse> {
  const response = await callLLM(request.messages, false)
  const data = await response.json()
  return {
    content: data.choices[0]?.message?.content || '',
    tokensIn: data.usage?.prompt_tokens || 0,
    tokensOut: data.usage?.completion_tokens || 0,
    model: 'synthforge-v1'
  }
}

export async function chatCompletionStream(request: ChatRequest): Promise<ReadableStream<Uint8Array>> {
  const response = await callLLM(request.messages, true)

  if (!response.body) {
    throw new Error('No response body')
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  const encoder = new TextEncoder()

  return new ReadableStream({
    async pull(controller) {
      const { done, value } = await reader.read()
      if (done) {
        controller.close()
        return
      }

      const chunk = decoder.decode(value, { stream: true })
      const lines = chunk.split('\n')

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6).trim()
          if (data === '[DONE]') {
            controller.enqueue(encoder.encode('data: [DONE]\n\n'))
            continue
          }
          try {
            const parsed = JSON.parse(data)
            const content = parsed.choices?.[0]?.delta?.content || ''
            if (content) {
              const payload = JSON.stringify({
                content,
                model: 'synthforge-v1',
                tokensIn: 0,
                tokensOut: 0
              })
              controller.enqueue(encoder.encode(`data: ${payload}\n\n`))
            }
          } catch {
            // Skip malformed chunks
          }
        }
      }
    },
    cancel() {
      reader.cancel()
    }
  })
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
    // Try to extract JSON from the response
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
    // Not JSON - return null, the content is just text
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
  
  // Smart field detection based on name
  if (name.includes('email')) return `user${Math.floor(Math.random() * 9999)}@example.com`
  if (name.includes('phone') || name.includes('tel')) return `+1${Math.floor(Math.random() * 9000000000 + 1000000000)}`
  if (name.includes('first_name') || name.includes('firstname')) return ['James','Mary','John','Patricia','Robert','Jennifer','Michael','Linda','David','Elizabeth'][Math.floor(Math.random() * 10)]
  if (name.includes('last_name') || name.includes('lastname')) return ['Smith','Johnson','Williams','Brown','Jones','Garcia','Miller','Davis','Rodriguez','Martinez'][Math.floor(Math.random() * 10)]
  if (name.includes('name') && !name.includes('user') && !name.includes('table')) return ['Alice Chen','Bob Smith','Carol Jones','David Kim','Eva Garcia','Frank Lee','Grace Wu','Henry Patel','Iris Nguyen','Jack Brown'][Math.floor(Math.random() * 10)]
  if (name.includes('city')) return ['New York','Los Angeles','Chicago','Houston','Phoenix','Philadelphia','San Antonio','San Diego','Dallas','Austin'][Math.floor(Math.random() * 10)]
  if (name.includes('state') || name.includes('province')) return ['CA','NY','TX','FL','IL','PA','OH','GA','NC','MI'][Math.floor(Math.random() * 10)]
  if (name.includes('country')) return ['US','UK','CA','DE','FR','JP','AU','BR','IN','MX'][Math.floor(Math.random() * 10)]
  if (name.includes('zip') || name.includes('postal')) return String(Math.floor(Math.random() * 90000 + 10000))
  if (name.includes('address') || name.includes('street')) return `${Math.floor(Math.random() * 9999 + 1)} ${['Main','Oak','Pine','Maple','Cedar','Elm','Washington','Lake','Hill','Park'][Math.floor(Math.random() * 10)]} St`
  if (name.includes('company') || name.includes('org')) return ['Acme Corp','Globex Inc','Initech','Umbrella Corp','Wayne Enterprises','Stark Industries','Cyberdyne','Soylent Corp','Wonka Inc','Aperture Science'][Math.floor(Math.random() * 10)]
  if (name.includes('url') || name.includes('website')) return `https://example${Math.floor(Math.random() * 999)}.com`
  if (name.includes('ip')) return `${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`
  if (name.includes('price') || name.includes('amount') || name.includes('salary') || name.includes('cost')) return +(Math.random() * 10000).toFixed(2)
  if (name.includes('quantity') || name.includes('qty') || name.includes('count') || name.includes('stock')) return Math.floor(Math.random() * 1000)
  if (name.includes('age')) return Math.floor(Math.random() * 60 + 18)
  if (name.includes('score') || name.includes('rating')) return +(Math.random() * 5).toFixed(1)
  if (name.includes('status')) return ['active','inactive','pending','completed','cancelled'][Math.floor(Math.random() * 5)]
  if (name.includes('type') || name.includes('category')) return ['Type A','Type B','Type C','Type D'][Math.floor(Math.random() * 4)]
  if (name.includes('description') || name.includes('bio') || name.includes('notes')) return 'Synthetic generated text for demonstration purposes'
  if (name.includes('color')) return ['#FF6B6B','#4ECDC4','#45B7D1','#96CEB4','#FFEAA7','#DDA0DD','#98D8C8','#F7DC6F','#BB8FCE','#85C1E9'][Math.floor(Math.random() * 10)]
  if (name.includes('sku') || name.includes('code')) return `SKU-${Math.random().toString(36).substring(2, 8).toUpperCase()}`
  
  // Type-based fallback
  switch (type.toLowerCase()) {
    case 'integer':
    case 'int':
    case 'serial':
    case 'bigInt':
      return Math.floor(Math.random() * 10000)
    case 'float':
    case 'double':
    case 'decimal':
    case 'numeric':
      return +(Math.random() * 10000).toFixed(2)
    case 'boolean':
    case 'bool':
      return Math.random() > 0.5
    case 'date':
    case 'datetime':
    case 'timestamp':
      const daysAgo = Math.floor(Math.random() * 365)
      const d = new Date()
      d.setDate(d.getDate() - daysAgo)
      return d.toISOString().split('T')[0]
    case 'uuid':
      return crypto.randomUUID ? crypto.randomUUID() : `${Math.random().toString(36)}-${Math.random().toString(36)}`
    case 'json':
    case 'jsonb':
      return {}
    default:
      // String types
      const words = ['Alpha','Beta','Gamma','Delta','Epsilon','Zeta','Eta','Theta','Iota','Kappa']
      return `${words[Math.floor(Math.random() * words.length)]}-${Math.floor(Math.random() * 9999)}`
  }
}

export function extractSchemaFromSQL(sql: string): Record<string, { columns: Record<string, string> }> {
  const tables: Record<string, { columns: Record<string, string> }> = {}
  const createTableRegex = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?[`"]?(\w+)[`"]?\s*\(([\s\S]*?)\)\s*;/gi
  let match
  
  while ((match = createTableRegex.exec(sql)) !== null) {
    const tableName = match[1]
    const columnsStr = match[2]
    const columns: Record<string, string> = {}
    
    const colRegex = /\s*[`"]?(\w+)[`"]?\s+([\w()]+(?:\[\])?)/g
    let colMatch
    while ((colMatch = colRegex.exec(columnsStr)) !== null) {
      const colName = colMatch[1]
      if (['PRIMARY', 'FOREIGN', 'CONSTRAINT', 'UNIQUE', 'INDEX', 'KEY', 'CHECK'].includes(colName.toUpperCase())) continue
      columns[colName] = colMatch[2]
    }
    
    if (Object.keys(columns).length > 0) {
      tables[tableName] = { columns }
    }
  }
  
  return tables
}

export function extractSchemaFromCSV(csvText: string, filename: string): Record<string, { columns: Record<string, string> }> {
  const lines = csvText.trim().split('\n')
  if (lines.length === 0) return {}
  
  const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''))
  const columns: Record<string, string> = {}
  
  // Infer types from first few rows
  for (const header of headers) {
    const sampleValues = lines.slice(1, 5).map(line => {
      const vals = line.split(',')
      return vals[headers.indexOf(header)]?.trim().replace(/"/g, '')
    }).filter(Boolean)
    
    if (sampleValues.every(v => /^-?\d+$/.test(v))) {
      columns[header] = 'INTEGER'
    } else if (sampleValues.every(v => /^-?\d+\.\d+$/.test(v))) {
      columns[header] = 'DECIMAL'
    } else if (sampleValues.every(v => v === 'true' || v === 'false' || v === 'TRUE' || v === 'FALSE')) {
      columns[header] = 'BOOLEAN'
    } else {
      columns[header] = 'VARCHAR(255)'
    }
  }
  
  const tableName = filename.replace(/\.(csv|tsv)$/i, '').replace(/[^a-zA-Z0-9_]/g, '_').toLowerCase()
  return { [tableName]: { columns } }
}

export function extractSchemaFromJSON(jsonStr: string): Record<string, { columns: Record<string, string> }> {
  try {
    const data = JSON.parse(jsonStr)
    const tables: Record<string, { columns: Record<string, string> }> = {}
    
    if (Array.isArray(data)) {
      // Array of objects -> single table
      if (data.length > 0 && typeof data[0] === 'object') {
        const columns: Record<string, string> = {}
        for (const [key, value] of Object.entries(data[0])) {
          columns[key] = inferTypeFromValue(value)
        }
        tables['imported_data'] = { columns }
      }
    } else if (typeof data === 'object') {
      // Object with table names as keys
      for (const [tableName, tableData] of Object.entries(data)) {
        if (Array.isArray(tableData) && tableData.length > 0 && typeof tableData[0] === 'object') {
          const columns: Record<string, string> = {}
          for (const [key, value] of Object.entries(tableData[0] as Record<string, unknown>)) {
            columns[key] = inferTypeFromValue(value)
          }
          tables[tableName] = { columns }
        }
      }
    }
    
    return tables
  } catch {
    return {}
  }
}

function inferTypeFromValue(value: unknown): string {
  if (value === null || value === undefined) return 'VARCHAR(255)'
  if (typeof value === 'number') return Number.isInteger(value) ? 'INTEGER' : 'DECIMAL'
  if (typeof value === 'boolean') return 'BOOLEAN'
  if (typeof value === 'object') return 'JSON'
  if (typeof value === 'string') {
    if (/^\d{4}-\d{2}-\d{2}/.test(value)) return 'TIMESTAMP'
    if (/^[a-f0-9-]{36}$/i.test(value)) return 'UUID'
    return 'VARCHAR(255)'
  }
  return 'VARCHAR(255)'
}
