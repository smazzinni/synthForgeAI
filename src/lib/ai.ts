// AI Orchestration Layer - Multi-agent architecture for realistic synthetic data generation
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

export interface AgentStep {
  agent: string
  task: string
  status: 'pending' | 'running' | 'completed' | 'failed'
  output?: string
  reasoningSteps?: ReasoningStep[]
}

export interface AgentResponse {
  action: 'generate' | 'modify' | 'clarify' | 'plan' | 'execute' | 'validate' | 'evolve' | 'multi_step'
  agentName: string
  explanation: string
  tables?: Record<string, Record<string, unknown>[]>
  sqlCode?: string
  schemaPlan?: Record<string, unknown>
  reasoningSteps?: ReasoningStep[]
  options?: ClarificationOption[]
  followUpQuestions?: string[]
  steps?: AgentStep[]
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
- Design schemas that are suitable for software testing with realistic distributions.

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
- All generated data must be synthetic, privacy-safe, and suitable for software testing.
- Foreign key values must reference existing primary keys.
- Use realistic distributions (not just sequential values).
- ALWAYS generate at least 5-10 rows per table.

DATA REALISM REQUIREMENTS FOR SOFTWARE TESTING:
- Generate data that mimics real-world distributions (e.g., 70% active users, 20% pending, 10% inactive)
- Use varied date ranges spanning realistic time periods (not all same date)
- Create data that exercises edge cases: very long strings, boundary numbers, null optionals
- Ensure referential integrity: every foreign key must point to an existing primary key
- Use realistic names from diverse ethnic backgrounds
- Use proper email domains: @gmail.com, @yahoo.com, @outlook.com, @company.com, @university.edu
- Use realistic phone formats with valid area codes
- Money amounts should follow realistic patterns for the domain
- Status fields should have realistic distribution patterns
- Timestamps should follow realistic chronological patterns (created_at < updated_at)

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

const QUALITY_AGENT_SYSTEM_PROMPT = `You are the SynthForge AI Quality Agent. Your role is to review generated synthetic data for quality issues and ensure it is suitable for software testing.

QUALITY CHECKS:
1. Referential Integrity: Every foreign key must reference an existing primary key
2. Completeness: No unexpected null values in required fields
3. Uniqueness: Primary keys and unique constraint fields must be unique
4. Distribution: Data should follow realistic patterns, not uniform distributions
5. Type Consistency: All values should match their column types
6. Constraint Validation: CHECK constraints, NOT NULL, and DEFAULT values must be honored
7. Temporal Consistency: created_at should be before updated_at; dates should be in valid ranges
8. Domain Accuracy: Data should reflect real-world patterns for the detected domain

When reviewing data, analyze it thoroughly and respond with:
{
  "action": "generate",
  "agentName": "quality-agent",
  "explanation": "Quality review complete. Found X issues and applied fixes.",
  "tables": { ... corrected tables ... },
  "reasoningSteps": [
    {"type": "validation", "label": "Integrity Check", "description": "Checking referential integrity", "status": "completed", "output": "All FK references valid"},
    {"type": "validation", "label": "Distribution Check", "description": "Analyzing data distributions", "status": "completed", "output": "Status distribution: 68% active, 22% pending, 10% inactive - realistic"},
    {"type": "reflection", "label": "Quality Reflection", "description": "Final quality assessment", "status": "completed", "output": "Quality score: 95/100 - data is test-ready"}
  ]
}

If no issues are found, return the tables unchanged. If issues are found, fix them in the returned tables.`

const AUTO_MODE_SYSTEM = `You are SynthForge AI, a combined Schema Architect and Data Generation Agent. You seamlessly plan schemas AND generate data in a single conversation flow.

CRITICAL RULES:
- NEVER mention any LLM provider name. You are SynthForge AI.
- All data must be synthetic, privacy-safe, and suitable for software testing.
- Maintain referential integrity across all tables.
- ALWAYS generate at least 5-10 rows per table to make the data useful.
- For simple requests, skip clarification and go straight to generation.
- If the user asks to generate data but does NOT specify a row count, you MUST clarify how many rows they want. Use the "clarify" action with row count options like [10, 25, 50, 100, 500].
- If the user HAS specified a row count (e.g., in their message or context), honor that count precisely.

DATA REALISM RULES (CRITICAL FOR SOFTWARE TESTING):
- Use realistic email domains: @gmail.com, @yahoo.com, @outlook.com, @company.com, @university.edu
- Use realistic phone formats: (555) 123-4567 or +1-555-123-4567
- Use realistic addresses with proper city/state/zip combinations
- Use realistic names from diverse backgrounds: American, Indian, Chinese, Hispanic, European names
- Use realistic price ranges based on the product category
- Use realistic date ranges (not all the same date) - span at least 1-2 years
- Vary status values with realistic distributions (e.g., 70% active, 20% pending, 10% inactive)
- For money amounts, use realistic ranges (e.g., product prices $5-$5000, salaries $30k-$200k)
- Ensure chronological consistency: created_at < updated_at, order_date < delivery_date
- Generate data that exercises edge cases for testing: boundary values, special characters in names
- Ensure every foreign key references an existing primary key in the related table
- Unique fields (email, username, SKU) must have truly unique values across all rows
- NOT NULL columns must always have values
- Use appropriate data types for each field (integers for IDs, decimals for money, timestamps for dates)

DOMAIN DETECTION:
- Healthcare: patients, doctors, appointments, prescriptions, medical_records
- E-commerce: users, products, orders, order_items, reviews, categories
- Education: students, courses, enrollments, grades, instructors, departments
- HR/Employee: employees, departments, salaries, attendance, leaves
- Fintech: accounts, transactions, cards, loans, payments
- Real Estate: properties, agents, listings, bookings, reviews
- SaaS: users, subscriptions, plans, invoices, usage_logs
- Logistics: shipments, vehicles, routes, drivers, warehouses

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

For clarification (when user wants data but hasn't specified row count):
{
  "action": "clarify",
  "agentName": "auto-agent",
  "explanation": "I'd be happy to generate that data! How many rows would you like per table?",
  "options": [
    {"id": "rows10", "label": "10 rows", "value": "Generate 10 rows per table", "description": "Quick sample"},
    {"id": "rows25", "label": "25 rows", "value": "Generate 25 rows per table", "description": "Standard dataset"},
    {"id": "rows50", "label": "50 rows", "value": "Generate 50 rows per table", "description": "Larger dataset"},
    {"id": "rows100", "label": "100 rows", "value": "Generate 100 rows per table", "description": "Full dataset"},
    {"id": "rows500", "label": "500 rows", "value": "Generate 500 rows per table", "description": "Production-scale"}
  ],
  "followUpQuestions": [],
  "reasoningSteps": [
    {"type": "intent", "label": "Intent Analysis", "description": "Understanding request", "status": "completed", "output": "Data generation request, row count not specified"}
  ]
}

MULTI-STEP EXECUTION:
When the user's request is complex and involves multiple distinct capabilities, use the "multi_step" action. This is appropriate for:
- Complex data generation requiring multiple passes (e.g., schema design + data generation + validation)
- Data analysis + visualization requests
- Schema design + data generation + validation pipeline
- Any request involving more than one distinct capability

For multi-step requests, respond with:
{
  "action": "multi_step",
  "agentName": "orchestrator",
  "explanation": "I'll break this down into steps...",
  "steps": [
    {"agent": "schema-agent", "task": "Design schema for e-commerce platform", "status": "pending"},
    {"agent": "data-agent", "task": "Generate realistic data for all tables", "status": "pending"},
    {"agent": "quality-agent", "task": "Validate data quality and fix issues", "status": "pending"}
  ],
  "reasoningSteps": [
    {"type": "intent", "label": "Intent Analysis", "description": "Understanding complex request", "status": "completed", "output": "Multi-step pipeline required"}
  ]
}

For simple single-step requests (just generate data, just add a table), continue using the "generate" action directly.`

// ─── Subagent Prompts (used in multi-step pipeline) ───────────

const SCHEMA_AGENT_PROMPT = `You are the SynthForge AI Schema Agent. Design a database schema based on the user's request.

Your job is to create a well-structured schema with proper:
- Table names (plural, snake_case)
- Column names (snake_case)
- Data types (INTEGER, VARCHAR(255), DECIMAL(10,2), BOOLEAN, TIMESTAMP, etc.)
- Primary keys (always 'id' as INTEGER)
- Foreign keys with proper naming (table_name_id pattern)
- NOT NULL constraints for required fields
- UNIQUE constraints for email, username, etc.
- Realistic default values where appropriate

Return a JSON object with the schema plan. Include reasoningSteps showing your thought process.
{
  "action": "generate",
  "agentName": "schema-agent",
  "explanation": "Schema designed with X tables",
  "schemaPlan": { ... },
  "sqlCode": "CREATE TABLE statements...",
  "reasoningSteps": [
    {"type": "domain_detection", "label": "Domain Detection", "description": "Identifying domain", "status": "completed", "output": "E-commerce"},
    {"type": "entity_extraction", "label": "Entity Extraction", "description": "Identifying entities", "status": "completed", "output": "Users, Products, Orders, OrderItems"},
    {"type": "relationship_mapping", "label": "Relationship Mapping", "description": "Mapping relationships", "status": "completed", "output": "Users 1:N Orders, Orders 1:N OrderItems, Products 1:N OrderItems"}
  ]
}`

const DATA_AGENT_PROMPT = `You are the SynthForge AI Data Generation Agent. Generate realistic synthetic data based on the provided schema.

CRITICAL REQUIREMENTS:
- Generate at least 5-10 rows per table (or as specified by user)
- All data must be synthetic and privacy-safe
- Maintain referential integrity: every FK must reference an existing PK
- Use realistic distributions, not sequential values
- Use diverse names from various ethnic backgrounds
- Use realistic email/phone/address formats
- Money amounts should follow realistic domain patterns
- Dates should span realistic time ranges
- Status fields should have realistic distributions (e.g., 70% active, 20% pending, 10% inactive)

Return JSON with generated tables. Include reasoningSteps.
{
  "action": "generate",
  "agentName": "data-agent",
  "explanation": "Generated data for X tables",
  "tables": { "table_name": [ { ... } ] },
  "reasoningSteps": [
    {"type": "data_strategy", "label": "Data Strategy", "description": "Planning generation", "status": "completed", "output": "Generating 10 users, 20 products, 30 orders"},
    {"type": "execution", "label": "Data Execution", "description": "Generating data", "status": "completed", "output": "All rows generated with realistic distributions"},
    {"type": "validation", "label": "FK Validation", "description": "Checking referential integrity", "status": "completed", "output": "All foreign keys reference valid primary keys"}
  ]
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

    const completion = await Promise.race([
      zai.chat.completions.create({
        messages: request.messages,
        temperature: request.temperature ?? 0.7,
        max_tokens: request.maxTokens ?? 4096
      }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('AI request timed out. Please try again.')), 90_000)
      )
    ])

    const content = completion.choices[0]?.message?.content || ''
    if (!content) {
      throw new Error('AI returned an empty response. Please try again.')
    }

    return {
      content,
      tokensIn: completion.usage?.prompt_tokens || 0,
      tokensOut: completion.usage?.completion_tokens || 0,
      model: 'synthforge-v1'
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'AI service unavailable'
    console.error('[SynthForge AI] chatCompletion error:', msg)
    throw error
  }
}

// ─── Multi-Agent Orchestration ──────────────────────────────────

export function getSystemPrompt(agentMode: string): string {
  switch (agentMode) {
    case 'plan': return PLAN_AGENT_SYSTEM
    case 'execute': return EXEC_AGENT_SYSTEM
    case 'auto': default: return AUTO_MODE_SYSTEM
  }
}

export function getSubagentPrompt(agentName: string): string {
  if (agentName.includes('schema')) return SCHEMA_AGENT_PROMPT
  if (agentName.includes('data')) return DATA_AGENT_PROMPT
  if (agentName.includes('quality')) return QUALITY_AGENT_SYSTEM_PROMPT
  return getSystemPrompt('auto')
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
        followUpQuestions: parsed.followUpQuestions || undefined,
        steps: parsed.steps || undefined
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

  // ─── Realistic email domains ─────────────
  if (name.includes('email')) {
    const domains = ['gmail.com','yahoo.com','outlook.com','hotmail.com','company.com','university.edu','proton.me','icloud.com']
    const fn = ['james','mary','john','patricia','robert','jennifer','michael','linda','david','sarah','chris','emily','alex','sophia','daniel','olivia'][Math.floor(Math.random() * 16)]
    const ln = ['smith','johnson','williams','brown','jones','garcia','miller','davis','rodriguez','wilson','anderson','thomas','taylor','moore','jackson'][Math.floor(Math.random() * 15)]
    const sep = ['.','_',''][Math.floor(Math.random() * 3)]
    const num = Math.random() > 0.5 ? Math.floor(Math.random() * 99) : ''
    return `${fn}${sep}${ln}${num}@${domains[Math.floor(Math.random() * domains.length)]}`
  }

  // ─── Realistic phone formats ─────────────
  if (name.includes('phone') || name.includes('tel')) {
    const areaCodes = ['212','310','312','713','602','415','617','206','503','404','305','919']
    const area = areaCodes[Math.floor(Math.random() * areaCodes.length)]
    const mid = Math.floor(Math.random() * 900 + 100)
    const last = Math.floor(Math.random() * 9000 + 1000)
    const formats = [`${area}-${mid}-${last}`, `(${area}) ${mid}-${last}`, `+1-${area}-${mid}-${last}`]
    return formats[Math.floor(Math.random() * formats.length)]
  }

  // ─── Realistic names ─────────────────────
  if (name.includes('first_name') || name.includes('firstname')) return ['James','Mary','John','Patricia','Robert','Jennifer','Michael','Linda','David','Elizabeth','William','Barbara','Richard','Susan','Joseph','Jessica','Thomas','Sarah','Christopher','Karen'][Math.floor(Math.random() * 20)]
  if (name.includes('last_name') || name.includes('lastname')) return ['Smith','Johnson','Williams','Brown','Jones','Garcia','Miller','Davis','Rodriguez','Martinez','Hernandez','Lopez','Gonzalez','Wilson','Anderson','Thomas','Taylor','Moore','Jackson','Martin'][Math.floor(Math.random() * 20)]
  if (name.includes('name') && !name.includes('user') && !name.includes('table') && !name.includes('holder')) return ['Alice Chen','Bob Smith','Carol Jones','David Kim','Eva Garcia','Frank Lee','Grace Wu','Henry Patel','Iris Nguyen','Jack Brown','Kate Wilson','Leo Martinez','Maya Johnson','Noah Davis','Olivia Taylor'][Math.floor(Math.random() * 15)]
  if (name.includes('holder_name')) return ['Alice Chen','Bob Smith','Carol Jones','David Kim','Eva Garcia','Frank Lee','Grace Wu','Henry Patel'][Math.floor(Math.random() * 8)]

  // ─── Realistic addresses ─────────────────
  if (name.includes('city')) return ['New York','Los Angeles','Chicago','Houston','Phoenix','San Francisco','Boston','Seattle','Portland','Atlanta','Miami','Denver','Austin','Nashville','Charlotte'][Math.floor(Math.random() * 15)]
  if (name.includes('state') || name.includes('province')) return ['CA','NY','TX','FL','IL','WA','MA','OR','GA','CO','TN','NC','AZ','PA','OH'][Math.floor(Math.random() * 15)]
  if (name.includes('country')) return ['US','UK','CA','DE','FR','AU','JP','BR','IN','MX'][Math.floor(Math.random() * 10)]
  if (name.includes('zip') || name.includes('postal')) return String(Math.floor(Math.random() * 90000 + 10000))
  if (name.includes('address')) return `${Math.floor(Math.random() * 9000 + 100)} ${['Oak','Maple','Cedar','Pine','Elm','Main','Park','Lake','Hill','River'][Math.floor(Math.random() * 10)]} ${['St','Ave','Blvd','Dr','Ln','Ct','Way'][Math.floor(Math.random() * 7)]}`
  if (name.includes('location')) return ['New York, NY','San Francisco, CA','Austin, TX','Seattle, WA','Boston, MA','Denver, CO','Chicago, IL','Portland, OR'][Math.floor(Math.random() * 8)]

  // ─── Financial values ─────────────────────
  if (name.includes('price')) return +(Math.random() * 500 + 4.99).toFixed(2)
  if (name.includes('salary') || name.includes('income')) return +(Math.random() * 120000 + 30000).toFixed(2)
  if (name.includes('amount') || name.includes('cost')) return +(Math.random() * 10000).toFixed(2)
  if (name.includes('balance')) return +(Math.random() * 50000).toFixed(2)
  if (name.includes('budget')) return +(Math.random() * 500000 + 50000).toFixed(2)
  if (name.includes('credit_limit') || name.includes('limit')) return +(Math.random() * 25000 + 1000).toFixed(2)
  if (name.includes('total_amount')) return +(Math.random() * 500 + 10).toFixed(2)

  // ─── Counting / quantity values ──────────
  if (name.includes('quantity') || name.includes('qty')) return Math.floor(Math.random() * 10 + 1)
  if (name.includes('count') || name.includes('stock')) return Math.floor(Math.random() * 1000)
  if (name.includes('capacity')) return Math.floor(Math.random() * 200 + 20)
  if (name.includes('head_count')) return Math.floor(Math.random() * 50 + 5)
  if (name.includes('bedrooms')) return Math.floor(Math.random() * 4 + 1)
  if (name.includes('bathrooms')) return Math.floor(Math.random() * 3 + 1)
  if (name.includes('sqft')) return Math.floor(Math.random() * 3000 + 500)
  if (name.includes('credits')) return Math.floor(Math.random() * 4 + 1)

  // ─── Personal attributes ─────────────────
  if (name.includes('age')) return Math.floor(Math.random() * 45 + 20)
  if (name.includes('gender')) return ['Male','Female','Non-binary'][Math.floor(Math.random() * 3)]

  // ─── Status with realistic distributions ─
  if (name.includes('status')) {
    const r = Math.random()
    if (r < 0.6) return 'active'
    if (r < 0.8) return 'pending'
    if (r < 0.9) return 'inactive'
    return 'completed'
  }

  // ─── Domain-specific categories ──────────
  if (name.includes('category')) return ['Electronics','Clothing','Food & Beverage','Books','Sports & Outdoors','Home & Garden','Health & Beauty','Toys'][Math.floor(Math.random() * 8)]
  if (name.includes('specialty') || name.includes('speciality')) return ['Cardiology','Neurology','Orthopedics','Pediatrics','Oncology','Dermatology','Emergency Medicine','Psychiatry'][Math.floor(Math.random() * 8)]
  if (name.includes('department')) return ['Emergency','ICU','Cardiology','Neurology','Orthopedics','Pediatrics','Oncology','Radiology'][Math.floor(Math.random() * 8)]
  if (name.includes('diagnosis')) return ['Hypertension','Type 2 Diabetes','Asthma','Migraine','Anxiety Disorder','Allergic Rhinitis','Osteoarthritis','GERD'][Math.floor(Math.random() * 8)]
  if (name.includes('position')) return ['Software Engineer','Product Manager','Designer','Data Analyst','Marketing Manager','Sales Representative','HR Specialist','DevOps Engineer'][Math.floor(Math.random() * 8)]
  if (name.includes('major')) return ['Computer Science','Business Administration','Engineering','Biology','Psychology','Mathematics','English Literature','Economics'][Math.floor(Math.random() * 8)]
  if (name.includes('account_type')) return ['Checking','Savings','Money Market','CD','IRA'][Math.floor(Math.random() * 5)]
  if (name.includes('card_type')) return ['Visa','Mastercard','Amex','Discover'][Math.floor(Math.random() * 4)]
  if (name.includes('billing_cycle') || name.includes('plan_name')) return ['Free','Starter','Pro','Enterprise'][Math.floor(Math.random() * 4)]
  if (name.includes('type') && name.includes('transaction')) return ['debit','credit','transfer','refund'][Math.floor(Math.random() * 4)]
  if (name.includes('grade')) return ['A','B','C','D','F','A-','B+','B-','C+'][Math.floor(Math.random() * 9)]
  if (name.includes('currency')) return ['USD','EUR','GBP','CAD','AUD'][Math.floor(Math.random() * 5)]
  if (name.includes('expiry')) return `${String(Math.floor(Math.random() * 12 + 1)).padStart(2, '0')}/${Math.floor(Math.random() * 5 + 25)}`

  // ─── Descriptions and notes ──────────────
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
  type: 'content' | 'reasoning' | 'done' | 'error' | 'agent_step'
  data: unknown
}

export async function chatCompletionStream(request: ChatRequest): Promise<ReadableStream<Uint8Array>> {
  const encoder = new TextEncoder()
  let controllerClosed = false

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      const safeEnqueue = (data: Uint8Array) => {
        if (controllerClosed) return false
        try {
          if (controller.desiredSize !== null) {
            controller.enqueue(data)
            return true
          }
        } catch {
          controllerClosed = true
        }
        return false
      }

      const safeClose = () => {
        if (controllerClosed) return
        controllerClosed = true
        try { controller.close() } catch { /* already closed */ }
      }

      try {
        const zai = await getZAI()

        const emitReasoning = (step: ReasoningStep): boolean => {
          return safeEnqueue(encoder.encode(`data: ${JSON.stringify({ type: 'reasoning', data: step })}\n\n`))
        }

        if (!emitReasoning({ type: 'intent', label: 'Intent Analysis', description: 'Analyzing user request', status: 'running' })) {
          safeClose()
          return
        }

        const completion = await Promise.race([
          zai.chat.completions.create({
            messages: request.messages,
            temperature: request.temperature ?? 0.7,
            max_tokens: request.maxTokens ?? 4096
          }),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('AI request timed out. Please try again.')), 90_000)
          )
        ])

        const content = completion.choices[0]?.message?.content || ''

        if (!emitReasoning({ type: 'intent', label: 'Intent Analysis', description: 'Analyzing user request', status: 'completed', output: 'Request understood' })) { safeClose(); return }
        if (!emitReasoning({ type: 'domain_detection', label: 'Domain Detection', description: 'Identifying business domain', status: 'running' })) { safeClose(); return }
        if (!emitReasoning({ type: 'domain_detection', label: 'Domain Detection', description: 'Identifying business domain', status: 'completed', output: 'Processing data request' })) { safeClose(); return }
        if (!emitReasoning({ type: 'data_strategy', label: 'Data Strategy', description: 'Planning generation', status: 'running' })) { safeClose(); return }

        if (content) {
          const chunkSize = 80
          for (let i = 0; i < content.length; i += chunkSize) {
            if (controllerClosed || controller.desiredSize === null) {
              safeClose()
              return
            }
            const chunk = content.slice(i, i + chunkSize)
            if (!safeEnqueue(encoder.encode(`data: ${JSON.stringify({ type: 'content', data: chunk })}\n\n`))) {
              safeClose()
              return
            }
            await new Promise(r => setTimeout(r, 3))
          }
        } else {
          safeEnqueue(encoder.encode(`data: ${JSON.stringify({ type: 'error', data: 'AI returned an empty response. Please try again.' })}\n\n`))
          safeClose()
          return
        }

        if (!emitReasoning({ type: 'data_strategy', label: 'Data Strategy', description: 'Planning generation', status: 'completed', output: 'Data generated' })) { safeClose(); return }
        if (!emitReasoning({ type: 'validation', label: 'Validation', description: 'Checking integrity', status: 'completed', output: 'All checks passed' })) { safeClose(); return }

        safeEnqueue(encoder.encode(`data: ${JSON.stringify({
          type: 'done',
          data: {
            tokensIn: completion.usage?.prompt_tokens || 0,
            tokensOut: completion.usage?.completion_tokens || 0,
            model: 'synthforge-v1'
          }
        })}\n\n`))

        safeClose()
      } catch (error) {
        console.error('[SynthForge AI] chatCompletionStream error:', error instanceof Error ? error.message : error)
        if (!controllerClosed) {
          try {
            safeEnqueue(encoder.encode(`data: ${JSON.stringify({ type: 'error', data: error instanceof Error ? error.message : 'AI service unavailable. Please try again.' })}\n\n`))
          } catch { /* controller already closed */ }
        }
        safeClose()
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

        for (const [name, config] of Object.entries(PII_PATTERNS)) {
          const matches = value.match(config.pattern)
          if (matches && matches.length > 0) {
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

    for (const key of Object.keys(rows[0])) {
      valueSets[key] = new Set()
      nullCounts[key] = 0
      samples[key] = []
    }

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

      if (colName === 'id' && unique) {
        primaryKey = colName
      }

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

  for (const [tableName, tableDef] of Object.entries(result.tables)) {
    for (const fk of tableDef.foreignKeys) {
      const targetTable = result.tables[fk.references.table]
      if (targetTable) {
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

  if (name.includes('email')) return 'VARCHAR(255)'
  if (name.includes('phone') || name.includes('tel')) return 'VARCHAR(20)'
  if (name === 'id') return 'INTEGER'
  if (name.endsWith('_id')) return 'INTEGER'
  if (name.includes('price') || name.includes('amount') || name.includes('salary')) return 'DECIMAL(10,2)'
  if (name.includes('date') || name.includes('time') || name.includes('_at')) return 'TIMESTAMP'
  if (name.includes('status')) return 'VARCHAR(50)'

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
    completeness: number
    uniqueness: number
    distribution: number
    referentialIntegrity: number
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

    // Completeness
    let nullCount = 0
    let totalFields = 0
    for (const row of rows) {
      for (const [, value] of Object.entries(row)) {
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

    // Uniqueness
    const idCol = Object.keys(rows[0]).find(k => k === 'id')
    let uniqueness = 100
    if (idCol) {
      const ids = rows.map(r => r[idCol])
      const uniqueIds = new Set(ids)
      uniqueness = ids.length > 0 ? Math.round((uniqueIds.size / ids.length) * 100) : 100
      if (uniqueness < 100) {
        issues.push(`Table "${tableName}" has duplicate IDs (${ids.length - uniqueIds.size} duplicates)`)
      }
    }
    totalUniqueness += uniqueness

    // Distribution check
    const statusCol = Object.keys(rows[0]).find(k => k.includes('status'))
    let distribution = 80 // default
    if (statusCol) {
      const statusValues = rows.map(r => String(r[statusCol] || ''))
      const statusCounts: Record<string, number> = {}
      statusValues.forEach(v => { statusCounts[v] = (statusCounts[v] || 0) + 1 })
      const uniqueStatuses = Object.keys(statusCounts).length
      distribution = uniqueStatuses >= 2 ? Math.min(100, 70 + uniqueStatuses * 5) : 50
    }
    totalDistribution += distribution

    // Referential integrity
    let riScore = 100
    for (const [colName, colValues] of Object.entries(rows[0])) {
      if (colName.endsWith('_id') && colName !== 'id') {
        const refTableName = colName.replace(/_id$/, '') + 's'
        const refTable = tables[refTableName]
        if (refTable) {
          const refIds = new Set(refTable.map(r => r.id))
          const fkValues = rows.map(r => r[colName]).filter(v => v !== null && v !== undefined)
          const invalidFKs = fkValues.filter(v => !refIds.has(v))
          if (invalidFKs.length > 0) {
            riScore = Math.max(0, 100 - (invalidFKs.length * 10))
            issues.push(`Table "${tableName}.${colName}" has ${invalidFKs.length} invalid foreign key references`)
          }
        }
      }
    }
    totalRI += riScore
  }

  const count = tableCount || 1
  const avgCompleteness = Math.round(totalCompleteness / count)
  const avgUniqueness = Math.round(totalUniqueness / count)
  const avgDistribution = Math.round(totalDistribution / count)
  const avgRI = Math.round(totalRI / count)
  const overall = Math.round((avgCompleteness * 0.3 + avgUniqueness * 0.2 + avgDistribution * 0.2 + avgRI * 0.3))

  return {
    overall,
    breakdown: {
      completeness: avgCompleteness,
      uniqueness: avgUniqueness,
      distribution: avgDistribution,
      referentialIntegrity: avgRI
    },
    issues
  }
}
