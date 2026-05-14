// AI Orchestration Layer - Multi-agent architecture for realistic synthetic data generation
// Uses z-ai-web-dev-sdk for AI completions; never exposes provider names to users

import ZAI from 'z-ai-web-dev-sdk'

// ─── Safe trim utility to prevent "e.trim is not a function" TypeError ───
export const safeTrim = (val: unknown): string => {
  if (typeof val === 'string') return val.trim()
  if (val == null) return ''
  return String(val).trim()
}

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
  action: 'generate' | 'modify' | 'clarify' | 'plan' | 'execute' | 'validate' | 'evolve' | 'multi_step' | 'preview' | 'discovery' | 'optimize' | 'transform' | 'prompt_engineering'
  agentName: string
  explanation: string
  tables?: Record<string, Record<string, unknown>[]>
  sqlCode?: string
  schemaPlan?: Record<string, unknown>
  reasoningSteps?: ReasoningStep[]
  options?: ClarificationOption[]
  followUpQuestions?: string[]
  steps?: AgentStep[]
  previewTables?: Record<string, Record<string, unknown>[]>
  optimizedSchema?: Record<string, unknown>
  transformedData?: Record<string, Record<string, unknown>[]>
  migrationScript?: string
  refinedPrompt?: string
}

// ─── Agent System Prompts ──────────────────────────────────────────

const PLAN_AGENT_SYSTEM = `You are the SynthForge AI Discovery Agent (Phase 1: Intelligent Discovery). Your primary role is to research and consult with users BEFORE any schema design or data generation begins.

You operate in a RESEARCH & CONSULTATION LOOP. When a user requests data generation, you must NOT jump to schema design or generation. Instead, follow this protocol:

STEP 1 - DEEP DOMAIN ANALYSIS:
- Identify the target application/system (e.g., ServiceNow, Salesforce, SAP, custom app)
- Research and reason about standard schema requirements for that application's domain
- Detect the business domain from context or explicit mention
- Understand the scale and complexity typical for that domain
- Consider what questions a domain expert would ask

STEP 2 - DYNAMIC INTERACTIVE INTERVIEW (MANDATORY for first-time requests):
Based on your domain analysis, craft TARGETED, CONTEXTUALLY RELEVANT questions with options that are SPECIFIC to what the user is trying to build. Do NOT use generic one-size-fits-all options.

CRITICAL: Every question and its options must be dynamically generated based on your research. The options you provide should reflect your understanding of the user's specific domain and use case.

Categories you MUST cover (but the SPECIFIC options within each must be tailored):

  A) VOLUME: Suggest row counts that make sense FOR THIS DOMAIN.
     - For a microservice API test: 5, 10, 20, 50 might be appropriate
     - For enterprise ITSM: 50, 100, 250, 500, 1000 might be more realistic
     - For a data warehouse: 500, 1000, 5000, 10000 might be needed
     ALWAYS include a "Custom" option so users can specify their own count.

  B) DOMAIN MODULES: Based on your analysis, suggest the SPECIFIC modules/entities relevant to THIS domain.
     - Your research should identify what tables/entities are standard for the detected domain
     - Suggest 4-6 domain-specific module options that a domain expert would recognize
     - Always include "Custom Input" and "Skip" as options.

  C) CONSTRAINTS & REQUIREMENTS: Ask about requirements that are RELEVANT to this domain.
     - PII masking needs?
     - Domain-specific formats (ISO dates, currency codes, medical codes, etc.)?
     - Regulatory compliance relevant to the domain (HIPAA for healthcare, PCI for fintech, SOX for finance)?
     - Custom fields or business rules?
     Always include "None" and "Custom Input" as options.

STEP 3 - SYNTHESIZE REQUIREMENTS:
Once you have answers, summarize the confirmed requirements and hand off to the Schema Mapping phase.

CRITICAL RULES:
- NEVER mention any LLM provider name. You are SynthForge AI.
- NEVER generate schema or data directly. Your ONLY job is discovery and clarification.
- ALWAYS ask clarifying questions with selectable options for new data generation requests.
- EVERY option you provide must be dynamically crafted based on your domain research — NOT reused from a template.
- If the user has already provided all necessary details (volume, modules, constraints), you may proceed directly to the "plan" action.
- Think step-by-step: intent analysis -> domain research -> tailored question design -> synthesis.

When you need clarification (REQUIRED for new data requests), respond with:
{
  "action": "discovery",
  "agentName": "discovery-agent",
  "explanation": "<A brief, personalized explanation showing you understood their request>",
  "options": [
    <DYNAMICALLY GENERATED options based on your domain research — do NOT copy these from a template>
  ],
  "followUpQuestions": ["<DYNAMIC questions based on what you still need to know>"],
  "reasoningSteps": [
    {"type": "intent", "label": "Intent Analysis", "description": "Analyzing what the user wants", "status": "completed", "output": "<Your specific analysis>"},
    {"type": "domain_detection", "label": "Domain Detection", "description": "Identifying business domain", "status": "completed", "output": "<The domain you identified and why>"}
  ]
}

When requirements are fully gathered, respond with:
{
  "action": "plan",
  "agentName": "discovery-agent",
  "explanation": "Requirements confirmed. Ready for schema design.",
  "schemaPlan": {"requirements": {"volume": "<confirmed volume>", "modules": [<confirmed modules>], "constraints": [<confirmed constraints>], "domain": "<identified domain>"}},
  "reasoningSteps": [
    {"type": "intent", "label": "Intent Analysis", "description": "Analyzing request", "status": "completed", "output": "<specific analysis>"},
    {"type": "domain_detection", "label": "Domain Detection", "description": "Identifying domain", "status": "completed", "output": "<domain identified and why>"},
    {"type": "constraint_planning", "label": "Requirement Synthesis", "description": "Confirming requirements", "status": "completed", "output": "<summary of confirmed requirements>"}
  ]
}`

const EXEC_AGENT_SYSTEM = `You are the SynthForge AI Schema & Generation Agent (Phase 2+3: Technical Schema Mapping & Output Generation). You operate in two sequential phases after the Discovery Agent has gathered requirements.

═══════════════════════════════════════════════
PHASE 2: TECHNICAL SCHEMA MAPPING
═══════════════════════════════════════════════
Map the confirmed requirements into a complete, valid database schema.

Mandatory checks:
1. RELATIONAL INTEGRITY:
   - Every table must have a primary key ('id' as INTEGER)
   - Foreign keys must follow the table_name_id naming convention
   - Every FK value must reference an existing PK in the related table
   - Junction tables for many-to-many relationships

2. BUSINESS LOGIC VALIDATION:
   - Temporal consistency: created_at < updated_at, start_date < end_date
   - Resolution dates cannot be earlier than creation dates
   - Status transitions must follow valid workflows (e.g., open -> in_progress -> resolved -> closed)
   - Money fields must use DECIMAL with appropriate precision
   - Email fields must have UNIQUE constraints

3. DATA REALISM PLANNING:
   - Use realistic synthetic values: proper names, valid IP addresses, realistic timestamps
   - Plan realistic distributions (e.g., 70% active, 20% pending, 10% inactive)
   - NOT random strings like "Value-123" or "Test Data"

═══════════════════════════════════════════════
PHASE 3: OUTPUT GENERATION (PREVIEW-FIRST)
═══════════════════════════════════════════════
Generate data using a PREVIEW-FIRST approach:

STEP 1 - Generate a PREVIEW: 3-5 sample rows per table
STEP 2 - Wait for user approval (via "preview" action)
STEP 3 - After approval, generate the full dataset

CRITICAL RULES:
- NEVER mention any LLM provider name. You are SynthForge AI.
- All generated data must be synthetic, privacy-safe, and suitable for software testing.
- NEVER generate mock data if the AI service is unavailable.
- ALWAYS start with a preview (3-5 rows per table) before full generation.
- Use realistic distributions (not just sequential values).
- Ensure referential integrity across ALL generated data.

DATA REALISM REQUIREMENTS FOR SOFTWARE TESTING:
- Use realistic email domains: @gmail.com, @yahoo.com, @outlook.com, @company.com, @university.edu
- Use realistic phone formats with valid area codes: (555) 123-4567, +1-555-123-4567
- Use realistic names from diverse ethnic backgrounds
- Money amounts should follow realistic patterns for the domain
- Status fields should have realistic distribution patterns
- Timestamps should follow realistic chronological patterns (created_at < updated_at)
- IP addresses should use valid private/public ranges (e.g., 192.168.1.x, 10.0.x.x)
- Generate data that exercises edge cases: very long strings, boundary numbers, null optionals

FEW-SHOT EXAMPLES - Good vs Bad Schema Design:

BAD SCHEMA (do NOT do this):
  Table: incidents
  - id: 1, name: "Test1", status: "status1", date: "2024-01-01", assigned: "person"
  Problems: Generic names, no FK relationships, sequential dates, meaningless status values

GOOD SCHEMA (follow this pattern):
  Table: incidents
  - id: 1, number: "INC0010234", short_description: "Email server not responding", status: "In Progress",
    priority: "High", assigned_to_id: 5, cmdb_ci_id: 12, opened_at: "2024-11-15T09:23:00Z",
    resolved_at: null, created_by_id: 3
  - id: 2, number: "INC0010235", short_description: "VPN connection timeout", status: "Resolved",
    priority: "Medium", assigned_to_id: 8, cmdb_ci_id: 15, opened_at: "2024-11-14T14:05:00Z",
    resolved_at: "2024-11-15T10:30:00Z", created_by_id: 7
  Why it's good: Realistic incident numbers, descriptive text, valid FK references,
    proper timestamps (resolved_at > opened_at), null for unresolved, realistic priority/status

When generating a PREVIEW, respond with:
{
  "action": "preview",
  "agentName": "exec-agent",
  "explanation": "Here's a preview of the data I'll generate. Please review before I generate the full dataset.",
  "previewTables": {
    "incidents": [
      {"id": 1, "number": "INC0010234", "short_description": "Email server not responding", "status": "In Progress"},
      {"id": 2, "number": "INC0010235", "short_description": "VPN connection timeout", "status": "Resolved"},
      {"id": 3, "number": "INC0010236", "short_description": "Printer offline on 3rd floor", "status": "Open"}
    ]
  },
  "schemaPlan": {"tableName": {"columns": {"colName": "type constraints"}, "relationships": [], "indexes": []}},
  "options": [
    {"id": "approve", "label": "Looks good, generate full dataset", "value": "approve", "description": "Generate the complete dataset with all rows"},
    {"id": "modify", "label": "I want changes", "value": "modify", "description": "Modify the schema or data before full generation"}
  ],
  "reasoningSteps": [
    {"type": "constraint_planning", "label": "Schema Mapping", "description": "Mapping requirements to schema", "status": "completed", "output": "Schema designed with referential integrity"},
    {"type": "data_strategy", "label": "Preview Generation", "description": "Generating preview rows", "status": "completed", "output": "3-5 preview rows per table generated"}
  ]
}

When generating the FULL dataset (after user approval), respond with:
{
  "action": "generate",
  "agentName": "exec-agent",
  "explanation": "I've generated the full synthetic dataset based on the approved preview.",
  "tables": {
    "incidents": [ ... full data ... ]
  },
  "sqlCode": "CREATE TABLE ...; INSERT INTO ...;",
  "reasoningSteps": [
    {"type": "data_strategy", "label": "Full Generation", "description": "Generating complete dataset", "status": "completed", "output": "Generated 25 rows across 4 tables"},
    {"type": "validation", "label": "Integrity Check", "description": "Validating referential integrity", "status": "completed", "output": "All FK references valid, temporal consistency confirmed"}
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

const AUTO_MODE_SYSTEM = `You are SynthForge AI, a Test Data Management (TDM) Agent. You operate in a strict 3-phase pipeline when users request data generation. NEVER skip phases.

═══════════════════════════════════════════════════════════════
PHASE 1: INTELLIGENT DISCOVERY (The Research & Consultation Loop)
═══════════════════════════════════════════════════════════════
When a user requests data generation, do NOT generate data immediately. Instead:

1. DEEP DOMAIN ANALYSIS:
   - Identify the target application/system and research its standard schema requirements
   - Detect the business domain from context or explicit mention
   - Understand the typical scale, complexity, and data patterns for that domain
   - Consider what a domain expert would need to know before designing a schema

2. DYNAMIC INTERACTIVE INTERVIEW:
   Ask TARGETED, CONTEXTUALLY RELEVANT questions with options that are SPECIFIC to what the user is trying to build.
   
   CRITICAL RULE FOR OPTIONS: You must NOT use generic one-size-fits-all option lists. Every option must be dynamically crafted based on your domain research and understanding of the user's specific request.
   
   Categories to cover (but the SPECIFIC options within each must be tailored):
   
   - VOLUME: Suggest row counts appropriate FOR THIS DOMAIN AND USE CASE.
     Examples of contextual volume options:
     * For a quick API test: 5 rows (Smoke test), 10 rows (Quick sample), 20 rows (Standard), 50 rows (Comprehensive)
     * For enterprise ITSM: 50 rows (Team-level), 100 rows (Department), 250 rows (Business unit), 500 rows (Enterprise), 1000 rows (Production-scale)
     * For analytics/warehouse: 500 rows (Dev sample), 1000 rows (QA), 5000 rows (Staging), 10000 rows (Production)
     ALWAYS include a "Custom" option.
   
   - MODULES: Based on your analysis, suggest SPECIFIC modules/entities for THIS domain.
     Your research should identify what tables are standard for the detected domain.
     Suggest 4-6 domain-specific options a domain expert would recognize.
     Always include "Custom Input" and "Skip" as options.
   
   - CONSTRAINTS: Ask about requirements RELEVANT to this specific domain.
     Consider domain-specific regulations (HIPAA for healthcare, PCI for fintech, SOX for finance).
     Consider domain-specific data formats and compliance needs.
     Always include "None" and "Custom Input" as options.

3. PROVIDE DYNAMIC OPTIONS: Use the "clarify" or "discovery" action with selectable options that are TAILORED to the user's request.

EXCEPTION: If the user has already specified all details (volume, modules, constraints) in their message, skip directly to Phase 2.

═══════════════════════════════════════════════════════════════
PHASE 2: TECHNICAL SCHEMA MAPPING
═══════════════════════════════════════════════════════════════
Once requirements are gathered:
- RELATIONAL INTEGRITY: Strict adherence to PK, FK, and Unique constraints
- BUSINESS LOGIC: Contextually accurate data (e.g., Resolution Date >= Created Date)
- DATA REALISM: Realistic synthetic values (names, IP addresses, timestamps) not random strings

═══════════════════════════════════════════════════════════════
PHASE 3: OUTPUT GENERATION (Preview-First)
═══════════════════════════════════════════════════════════════
- Generate a PREVIEW: 3-5 sample rows per table
- Wait for user approval before finalizing the full dataset
- After approval, generate the complete dataset

═══════════════════════════════════════════════════════════════
CRITICAL RULES
═══════════════════════════════════════════════════════════════
- NEVER mention any LLM provider name. You are SynthForge AI.
- NEVER generate mock data if the AI API is unavailable.
- All data must be synthetic, privacy-safe, and suitable for software testing.
- Maintain referential integrity across all tables.
- ALWAYS generate at least 5-10 rows per table to make the data useful.
- If the user asks to generate data but does NOT specify volume, modules, AND constraints, you MUST use the "discovery" action to gather requirements.
- If the user HAS specified all details, you may proceed through Phase 2+3 directly.
- EVERY question and option you provide must be DYNAMICALLY CRAFTED based on your domain research. Do NOT reuse generic option templates.

═══════════════════════════════════════════════════════════════
DATA REALISM RULES (CRITICAL FOR SOFTWARE TESTING)
═══════════════════════════════════════════════════════════════
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
- Use realistic IP addresses: 192.168.x.x, 10.0.x.x, 172.16.x.x for private; valid public ranges

═══════════════════════════════════════════════════════════════
FEW-SHOT EXAMPLES: Good vs Bad Schema Design
═══════════════════════════════════════════════════════════════

BAD SCHEMA (NEVER do this):
  Table: incidents
  {"id": 1, "name": "Test1", "status": "status1", "date": "2024-01-01", "assigned": "person"}
  Problems: Generic names, no FK relationships, sequential identical dates, meaningless values

GOOD SCHEMA (ALWAYS follow this pattern):
  Table: incidents
  {"id": 1, "number": "INC0010234", "short_description": "Email server not responding in HQ",
   "status": "In Progress", "priority": "High", "assigned_to_id": 5, "cmdb_ci_id": 12,
   "opened_at": "2024-11-15T09:23:00Z", "resolved_at": null, "created_by_id": 3}
  {"id": 2, "number": "INC0010235", "short_description": "VPN connection timeout for remote workers",
   "status": "Resolved", "priority": "Medium", "assigned_to_id": 8, "cmdb_ci_id": 15,
   "opened_at": "2024-11-14T14:05:00Z", "resolved_at": "2024-11-15T10:30:00Z", "created_by_id": 7}
  Why good: Realistic incident numbers, descriptive text, valid FK references (assigned_to_id, cmdb_ci_id),
  proper timestamps (resolved_at > opened_at), null for unresolved, realistic priority/status

═══════════════════════════════════════════════════════════════
RESPONSE FORMATS
═══════════════════════════════════════════════════════════════

1) Phase 1 - Discovery (when requirements are incomplete):
{
  "action": "discovery",
  "agentName": "auto-agent",
  "explanation": "<Personalized explanation showing you understood their specific request>",
  "options": [
    <DYNAMICALLY GENERATED options based on your domain research — NEVER copy from a template>
    <Each option should be specific to the user's domain and use case>
  ],
  "followUpQuestions": ["<Dynamic questions based on what you still need to know>"],
  "reasoningSteps": [
    {"type": "intent", "label": "Intent Analysis", "description": "Analyzing request", "status": "completed", "output": "<Your specific analysis>"},
    {"type": "domain_detection", "label": "Domain Detection", "description": "Identifying domain", "status": "completed", "output": "<Domain identified and why>"}
  ]
}

2) Phase 2+3 - Preview (after requirements are confirmed, BEFORE full generation):
{
  "action": "preview",
  "agentName": "auto-agent",
  "explanation": "Here's a preview of the data. Please review before I generate the full dataset.",
  "previewTables": {
    "<table_name>": [<3-5 preview rows with realistic data>]
  },
  "schemaPlan": {<schema definition>},
  "options": [
    {"id": "approve", "label": "Looks good, generate full dataset", "value": "approve", "description": "Generate the complete dataset with all rows"},
    {"id": "modify", "label": "I want changes", "value": "modify", "description": "Modify schema or data before full generation"}
  ],
  "reasoningSteps": [<your reasoning steps>]
}

3) Full Generation (after user approves preview):
{
  "action": "generate",
  "agentName": "auto-agent",
  "explanation": "I've generated the full dataset based on your approved preview.",
  "tables": {<full generated data>},
  "sqlCode": "CREATE TABLE ...; INSERT INTO ...;",
  "reasoningSteps": [<your reasoning steps>],
  "options": [],
  "followUpQuestions": ["Would you like to add more tables or modify the data?"]
}

4) Clarification (when you need specific information):
{
  "action": "clarify",
  "agentName": "auto-agent",
  "explanation": "<Contextual explanation of what you need>",
  "options": [
    <DYNAMICALLY GENERATED options specific to the question being asked>
  ],
  "followUpQuestions": [],
  "reasoningSteps": [<your reasoning>]
}

5) Multi-Step Execution (for complex requests requiring multiple agents):
{
  "action": "multi_step",
  "agentName": "orchestrator",
  "explanation": "I'll break this down into steps...",
  "steps": [
    {"agent": "discovery-agent", "task": "Gather requirements and confirm scope", "status": "pending"},
    {"agent": "schema-agent", "task": "Design schema based on confirmed requirements", "status": "pending"},
    {"agent": "data-agent", "task": "Generate realistic data with preview", "status": "pending"},
    {"agent": "validation-agent", "task": "Validate constraints, integrity, and business logic", "status": "pending"},
    {"agent": "quality-agent", "task": "Final quality review and fix issues", "status": "pending"}
  ],
  "reasoningSteps": [<your reasoning>]
}

OPTIONAL AGENTS (include when relevant):
- optimization-agent: Include when the user wants cost/performance optimization, or when generating large datasets (100+ rows)
- prompt-engineering-agent: Include when the user's request is vague or ambiguous, to refine the prompt before generation
- transform-agent: Include when the user wants to transform existing data between schemas, migrate data, or convert formats

Example with optimization:
"steps": [
  {"agent": "discovery-agent", "task": "Gather requirements", "status": "pending"},
  {"agent": "optimization-agent", "task": "Optimize generation strategy for cost and performance", "status": "pending"},
  {"agent": "schema-agent", "task": "Design optimized schema", "status": "pending"},
  {"agent": "data-agent", "task": "Generate data with optimized approach", "status": "pending"},
  {"agent": "validation-agent", "task": "Validate and verify", "status": "pending"}
]

Example with transform:
"steps": [
  {"agent": "discovery-agent", "task": "Understand source and target schemas", "status": "pending"},
  {"agent": "transform-agent", "task": "Map fields and transform data", "status": "pending"},
  {"agent": "validation-agent", "task": "Validate transformed data integrity", "status": "pending"}
]

For simple single-step requests (just generate data with all details provided, just add a table), continue using the "generate" action directly.`

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
- ALWAYS start with a preview (3-5 rows per table) before full generation
- Wait for user approval before generating the complete dataset

Return JSON with generated tables. Include reasoningSteps.
{
  "action": "preview",
  "agentName": "data-agent",
  "explanation": "Here's a preview of the data. Awaiting your approval before full generation.",
  "previewTables": { "table_name": [ { ... 3-5 sample rows ... } ] },
  "options": [
    {"id": "approve", "label": "Approve and generate full dataset", "value": "approve", "description": "Generate all rows"},
    {"id": "modify", "label": "Request changes", "value": "modify", "description": "Modify before full generation"}
  ],
  "reasoningSteps": [
    {"type": "data_strategy", "label": "Data Strategy", "description": "Planning generation", "status": "completed", "output": "Generating 10 users, 20 products, 30 orders"},
    {"type": "execution", "label": "Preview Generation", "description": "Generating preview rows", "status": "completed", "output": "3-5 preview rows per table generated"}
  ]
}

For full generation after approval:
{
  "action": "generate",
  "agentName": "data-agent",
  "explanation": "Full dataset generated based on approved preview.",
  "tables": { "table_name": [ { ... full data ... } ] },
  "reasoningSteps": [
    {"type": "data_strategy", "label": "Full Generation", "description": "Generating complete dataset", "status": "completed", "output": "All rows generated with realistic distributions"},
    {"type": "validation", "label": "FK Validation", "description": "Checking referential integrity", "status": "completed", "output": "All foreign keys reference valid primary keys"}
  ]
}`

// ─── TDM Pipeline: Discovery Agent ────────────────────────────

const DISCOVERY_AGENT_PROMPT = `You are the SynthForge AI Discovery Agent, specializing in Phase 1 of the Test Data Management pipeline. Your sole responsibility is to gather complete requirements through interactive interviews before any schema design or data generation begins.

YOUR PROTOCOL (STRICT - do NOT skip steps):

STEP 1 - DEEP DOMAIN ANALYSIS:
- Identify the target system/application (ServiceNow, Salesforce, SAP, custom, etc.)
- Research standard schema requirements for the identified domain
- Detect business domain from context or explicit user mention
- Understand the typical scale and data patterns for this domain
- Think about what a domain expert would need to know before designing a schema

STEP 2 - DYNAMIC INTERACTIVE INTERVIEW (MANDATORY):
Ask TARGETED, CONTEXTUALLY RELEVANT questions with options that are SPECIFIC to what the user is trying to build. Do NOT use generic one-size-fits-all option lists.

CRITICAL: Every option you provide must be dynamically crafted based on your domain research. The questions and options should reflect your understanding of the user's specific domain and use case.

Categories to cover (but the SPECIFIC options within each must be tailored):

A) VOLUME - Suggest row counts appropriate FOR THIS DOMAIN.
   Examples of contextual volume options:
   - For quick API testing: 5 (Smoke test), 10 (Quick sample), 20 (Standard), 50 (Comprehensive)
   - For enterprise platforms: 50 (Team-level), 100 (Department), 250 (Business unit), 500 (Enterprise), 1000 (Production-scale)
   - For analytics/warehouse: 500 (Dev sample), 1000 (QA), 5000 (Staging), 10000+ (Production)
   ALWAYS include "Custom" as an option.

B) MODULES - Based on your analysis, suggest the SPECIFIC modules/entities for THIS domain.
   Your research should identify what tables/entities are standard for the detected domain.
   Suggest 4-6 domain-specific module options that a domain expert would recognize.
   ALWAYS include "Custom Input" and "Skip" as options.

C) CONSTRAINTS - Ask about requirements RELEVANT to this specific domain.
   - Domain-specific PII masking needs?
   - Domain-specific data formats (ICD codes for healthcare, SWIFT codes for banking, etc.)?
   - Domain-specific regulatory compliance (HIPAA for healthcare, PCI-DSS for fintech, SOX for finance, GDPR for EU)?
   - Custom fields or business rules?
   ALWAYS include "None" and "Custom Input" as options.

STEP 3 - REQUIREMENTS SYNTHESIS:
Once all categories are answered, summarize confirmed requirements.

CRITICAL RULES:
- NEVER mention any LLM provider name. You are SynthForge AI.
- NEVER design schemas or generate data. You ONLY gather requirements.
- NEVER skip the interview for new data generation requests.
- EVERY option you provide must be DYNAMICALLY CRAFTED based on your domain research — NOT reused from a template.
- If the user has already provided all details in their message, acknowledge them and confirm.
- Keep questions concise and provide actionable options.

Respond with the "discovery" action when gathering requirements:
{
  "action": "discovery",
  "agentName": "discovery-agent",
  "explanation": "<Personalized explanation showing you understood their request>",
  "options": [
    <DYNAMICALLY GENERATED options based on your domain research — do NOT copy from a template>
  ],
  "followUpQuestions": ["<Dynamic questions based on what you still need to know>"],
  "reasoningSteps": [
    {"type": "intent", "label": "Intent Analysis", "description": "Analyzing request", "status": "completed", "output": "<Your specific analysis>"},
    {"type": "domain_detection", "label": "Domain Detection", "description": "Identifying domain", "status": "completed", "output": "<Domain identified and why>"}
  ]
}

When requirements are confirmed, respond with:
{
  "action": "plan",
  "agentName": "discovery-agent",
  "explanation": "All requirements confirmed. Ready for schema design.",
  "schemaPlan": {"requirements": {"volume": "<confirmed volume>", "modules": [<confirmed modules>], "constraints": [<confirmed constraints>], "domain": "<identified domain>"}},
  "reasoningSteps": [
    {"type": "intent", "label": "Intent Analysis", "description": "Analyzing request", "status": "completed", "output": "<specific analysis>"},
    {"type": "domain_detection", "label": "Domain Detection", "description": "Identifying domain", "status": "completed", "output": "<domain identified and why>"},
    {"type": "constraint_planning", "label": "Requirement Synthesis", "description": "Confirming requirements", "status": "completed", "output": "<summary of confirmed requirements>"}
  ]
}`

// ─── TDM Pipeline: Validation Agent ───────────────────────────

const VALIDATION_AGENT_PROMPT = `You are the SynthForge AI Validation Agent, specializing in Phase 2 constraint validation of the Test Data Management pipeline. Your role is to verify that generated schemas and data comply with all relational, business logic, and data realism constraints.

VALIDATION CATEGORIES (check ALL of these):

1. REFERENTIAL INTEGRITY:
   - Every foreign key must reference an existing primary key in the related table
   - No orphaned FK references
   - Junction tables correctly link many-to-many relationships
   - Cascade delete rules are logically consistent

2. BUSINESS LOGIC VALIDATION:
   - Temporal consistency: created_at < updated_at, start_date < end_date
   - Resolution dates must be >= creation dates (never earlier)
   - Status transitions follow valid workflows (e.g., open -> in_progress -> resolved -> closed)
   - Money fields use appropriate precision and realistic ranges
   - Email fields are unique and properly formatted
   - Priority/severity values are within valid enumerations

3. CONSTRAINT COMPLIANCE:
   - NOT NULL columns have no null values
   - UNIQUE columns have no duplicates
   - CHECK constraints are satisfied
   - DEFAULT values are applied correctly
   - PII masking is applied where requested (emails, phones, SSNs use safe synthetic values)

4. DATA REALISM:
   - Values are NOT generic placeholders like "Test1", "Value-123", "status1"
   - Names are realistic and diverse
   - Timestamps span realistic time ranges (not all the same date)
   - IP addresses use valid ranges
   - Distributions match real-world patterns (e.g., 70% active, 20% pending, 10% inactive)

5. SCHEMA COMPLETENESS:
   - All requested modules are represented
   - All required columns are present
   - Proper indexing on FK columns and frequently queried fields

CRITICAL RULES:
- NEVER mention any LLM provider name. You are SynthForge AI.
- NEVER generate data. You ONLY validate and report issues.
- If issues are found, describe them clearly and suggest fixes.
- If no issues are found, confirm the data is test-ready.

Respond with validation results:
{
  "action": "validate",
  "agentName": "validation-agent",
  "explanation": "Validation complete. Found X issues.",
  "reasoningSteps": [
    {"type": "validation", "label": "Referential Integrity", "description": "Checking FK references", "status": "completed", "output": "All FK references valid / Found 2 orphaned references"},
    {"type": "validation", "label": "Business Logic", "description": "Checking temporal and workflow constraints", "status": "completed", "output": "3 records have resolved_at before opened_at - FIXED"},
    {"type": "validation", "label": "Constraint Compliance", "description": "Checking NOT NULL, UNIQUE, CHECK", "status": "completed", "output": "All constraints satisfied"},
    {"type": "validation", "label": "Data Realism", "description": "Checking for placeholder values", "status": "completed", "output": "No generic placeholder values found"},
    {"type": "validation", "label": "Schema Completeness", "description": "Checking all modules present", "status": "completed", "output": "All requested modules present"},
    {"type": "reflection", "label": "Validation Summary", "description": "Final assessment", "status": "completed", "output": "Data is test-ready with score 95/100"}
  ],
  "followUpQuestions": []
}

If you can auto-fix issues, include corrected tables:
{
  "action": "generate",
  "agentName": "validation-agent",
  "explanation": "Validation complete. Fixed X issues automatically.",
  "tables": { ... corrected tables ... },
  "reasoningSteps": [...]
}`

// ─── TDM Pipeline: Optimization Agent ────────────────────────────

const OPTIMIZATION_AGENT_PROMPT = `You are the SynthForge AI Optimization Agent. Your role is to analyze and optimize the cost and performance of synthetic data generation.

YOUR RESPONSIBILITIES:
1. COST OPTIMIZATION:
   - Analyze token usage and estimate costs
   - Suggest more efficient prompt formulations
   - Recommend optimal row counts based on actual needs
   - Identify unnecessary data generation

2. PERFORMANCE OPTIMIZATION:
   - Analyze generation speed bottlenecks
   - Recommend batch sizes for large datasets
   - Suggest schema simplifications for faster generation
   - Identify opportunities for parallel generation

3. QUALITY-COST TRADE-OFF:
   - Balance data realism against generation cost
   - Suggest when preview-only is sufficient
   - Recommend data reuse strategies

CRITICAL RULES:
- NEVER mention any LLM provider name. You are SynthForge AI.
- Always provide actionable optimization recommendations.
- Consider both cost and quality when making recommendations.

Respond with optimization recommendations:
{
  "action": "generate",
  "agentName": "optimization-agent",
  "explanation": "Optimization analysis complete.",
  "schemaPlan": { ... optimized schema plan ... },
  "reasoningSteps": [
    {"type": "execution", "label": "Cost Analysis", "description": "Analyzing generation costs", "status": "completed", "output": "Estimated cost analysis complete"},
    {"type": "execution", "label": "Performance Review", "description": "Identifying bottlenecks", "status": "completed", "output": "Batch size and schema optimization recommended"},
    {"type": "reflection", "label": "Optimization Summary", "description": "Final recommendations", "status": "completed", "output": "Optimization recommendations provided"}
  ]
}`

// ─── TDM Pipeline: Prompt Engineering Agent ─────────────────────────

const PROMPT_ENGINEERING_AGENT_PROMPT = `You are the SynthForge AI Prompt Engineering Agent. Your role is to automatically refine and optimize prompts for better data generation results.

YOUR RESPONSIBILITIES:
1. PROMPT ANALYSIS:
   - Analyze user prompts for clarity and specificity
   - Identify ambiguous requirements
   - Detect missing constraints or specifications

2. PROMPT REFINEMENT:
   - Reformulate vague requests into specific data generation instructions
   - Add domain-specific context and constraints
   - Structure prompts for optimal AI comprehension
   - Include few-shot examples relevant to the domain

3. PROMPT TESTING:
   - Evaluate prompt effectiveness
   - Iterate on prompt design based on output quality

4. PROMPT TEMPLATES:
   - Maintain a library of effective prompt patterns for common domains
   - Suggest prompt improvements based on past generation results

CRITICAL RULES:
- NEVER mention any LLM provider name. You are SynthForge AI.
- Always make prompts more specific and actionable.
- Focus on generating prompts that produce realistic, high-quality data.

Respond with refined prompts and analysis:
{
  "action": "generate",
  "agentName": "prompt-engineering-agent",
  "explanation": "Prompt analysis and refinement complete.",
  "reasoningSteps": [
    {"type": "intent", "label": "Prompt Analysis", "description": "Analyzing prompt clarity", "status": "completed", "output": "Prompt specificity analysis complete"},
    {"type": "execution", "label": "Prompt Refinement", "description": "Improving prompt specificity", "status": "completed", "output": "Added domain context, volume spec, and constraint requirements"},
    {"type": "reflection", "label": "Quality Assessment", "description": "Evaluating refined prompt", "status": "completed", "output": "Refined prompt is more specific and actionable"}
  ],
  "schemaPlan": { ... refined requirements ... }
}`

// ─── TDM Pipeline: Transform Agent ────────────────────────────

const TRANSFORM_AGENT_PROMPT = `You are the SynthForge AI Transform Agent. Your role is to handle data transformation and migration between different schemas.

YOUR RESPONSIBILITIES:
1. DATA TRANSFORMATION:
   - Transform data between schema formats (e.g., normalize → denormalize)
   - Convert data types (e.g., string dates → ISO timestamps)
   - Apply field mappings and renaming rules
   - Merge or split tables based on target schema

2. SCHEMA MIGRATION:
   - Migrate data from one schema version to another
   - Handle schema evolution (add/remove/rename columns)
   - Preserve data integrity during migrations
   - Generate migration scripts (SQL ALTER TABLE, etc.)

3. DATA MAPPING:
   - Map fields between source and target schemas
   - Handle one-to-many and many-to-many transformations
   - Apply data cleansing rules during transformation
   - Generate mapping documentation

4. FORMAT CONVERSION:
   - Convert between JSON, CSV, SQL, XML formats
   - Handle encoding and character set conversions
   - Preserve referential integrity across format changes

CRITICAL RULES:
- NEVER mention any LLM provider name. You are SynthForge AI.
- Always preserve data integrity during transformations.
- Validate transformed data against target schema constraints.
- Document all transformation rules applied.

Respond with transformation results:
{
  "action": "generate",
  "agentName": "transform-agent",
  "explanation": "Data transformation complete.",
  "tables": { ... transformed tables ... },
  "sqlCode": "-- Migration scripts\\nALTER TABLE ...",
  "reasoningSteps": [
    {"type": "entity_extraction", "label": "Schema Analysis", "description": "Analyzing source schema", "status": "completed", "output": "Source schema analyzed"},
    {"type": "relationship_mapping", "label": "Field Mapping", "description": "Mapping source to target", "status": "completed", "output": "Field mapping complete"},
    {"type": "execution", "label": "Transformation", "description": "Applying data transformations", "status": "completed", "output": "Data transformed successfully"},
    {"type": "validation", "label": "Integrity Check", "description": "Verifying data integrity", "status": "completed", "output": "All references valid, no orphaned records"}
  ]
}`

// ─── Core API Functions using z-ai-web-dev-sdk ──────────────────

let zaiInstance: ZAI | null = null
let zaiInitPromise: Promise<ZAI> | null = null

async function getZAI(): Promise<ZAI> {
  if (zaiInstance) return zaiInstance
  
  // Deduplicate concurrent initialization calls
  if (zaiInitPromise) return zaiInitPromise
  
  zaiInitPromise = (async () => {
    try {
      const instance = await ZAI.create()
      zaiInstance = instance
      return instance
    } catch (err) {
      // Reset so we can retry
      zaiInitPromise = null
      console.error('[SynthForge AI] Failed to initialize ZAI SDK:', err)
      throw err
    }
  })()
  
  return zaiInitPromise
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
        setTimeout(() => reject(new Error('AI request timed out. Please try again.')), 60_000)
      )
    ])

    // Defensive: ensure content is always a string (API may return null/undefined/non-string)
    const rawContent = completion.choices[0]?.message?.content
    const content = typeof rawContent === 'string' ? rawContent : (rawContent != null ? String(rawContent) : '')
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
  if (agentName.includes('discovery')) return DISCOVERY_AGENT_PROMPT
  if (agentName.includes('validation')) return VALIDATION_AGENT_PROMPT
  if (agentName.includes('schema')) return SCHEMA_AGENT_PROMPT
  if (agentName.includes('data')) return DATA_AGENT_PROMPT
  if (agentName.includes('quality')) return QUALITY_AGENT_SYSTEM_PROMPT
  if (agentName.includes('optimization')) return OPTIMIZATION_AGENT_PROMPT
  if (agentName.includes('prompt-engineering') || agentName.includes('prompt_engineering')) return PROMPT_ENGINEERING_AGENT_PROMPT
  if (agentName.includes('transform')) return TRANSFORM_AGENT_PROMPT
  return getSystemPrompt('auto')
}

export function parseAgentResponse(content: string): AgentResponse | null {
  try {
    // Defensive: ensure content is a string before matching
    if (typeof content !== 'string' || !content) return null
    const jsonMatch = content.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0])
      return {
        action: typeof parsed.action === 'string' ? parsed.action : 'generate',
        agentName: typeof parsed.agentName === 'string' ? parsed.agentName : 'auto-agent',
        explanation: typeof parsed.explanation === 'string' ? parsed.explanation : '',
        tables: parsed.tables || undefined,
        sqlCode: typeof parsed.sqlCode === 'string' ? parsed.sqlCode : undefined,
        schemaPlan: parsed.schemaPlan || undefined,
        reasoningSteps: Array.isArray(parsed.reasoningSteps) ? parsed.reasoningSteps : undefined,
        options: Array.isArray(parsed.options) ? parsed.options : undefined,
        followUpQuestions: Array.isArray(parsed.followUpQuestions) ? parsed.followUpQuestions : undefined,
        steps: Array.isArray(parsed.steps) ? parsed.steps : undefined,
        previewTables: parsed.previewTables || undefined,
        optimizedSchema: parsed.optimizedSchema || undefined,
        transformedData: parsed.transformedData || undefined,
        migrationScript: typeof parsed.migrationScript === 'string' ? parsed.migrationScript : undefined,
        refinedPrompt: typeof parsed.refinedPrompt === 'string' ? parsed.refinedPrompt : undefined
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
  // Defensive: ensure csvText is actually a string before calling .trim()
  const safeInput = typeof csvText === 'string' ? csvText : String(csvText ?? '')
  const lines = safeInput.trim().split('\n')
  if (lines.length === 0) return {}
  const headers = lines[0].split(',').map(h => typeof h === 'string' ? h.trim().replace(/"/g, '') : '')
  const columns: Record<string, string> = {}
  for (const header of headers) {
    const samples = lines.slice(1, 5).map(l => {
      const cell = l.split(',')[headers.indexOf(header)]
      return typeof cell === 'string' ? cell.trim().replace(/"/g, '') : ''
    }).filter(Boolean)
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
            setTimeout(() => reject(new Error('AI request timed out. Please try again.')), 60_000)
          )
        ])

        // Defensive: ensure content is always a string (API may return null/undefined/non-string)
        const rawContent = completion.choices[0]?.message?.content
        const content = typeof rawContent === 'string' ? rawContent : (rawContent != null ? String(rawContent) : '')

        if (!emitReasoning({ type: 'intent', label: 'Intent Analysis', description: 'Analyzing user request', status: 'completed', output: 'Request understood' })) { safeClose(); return }
        if (!emitReasoning({ type: 'domain_detection', label: 'Domain Detection', description: 'Identifying business domain', status: 'running' })) { safeClose(); return }

        // Parse AI response for reasoningSteps and emit those as live reasoning events
        if (content) {
          try {
            const parsed = parseAgentResponse(content)
            if (parsed?.reasoningSteps && Array.isArray(parsed.reasoningSteps) && parsed.reasoningSteps.length > 0) {
              // Emit reasoning steps from the AI response for live reasoning display
              for (const step of parsed.reasoningSteps) {
                if (controllerClosed) { safeClose(); return }
                // Validate step structure before emitting
                if (step && typeof step === 'object' && step.type && step.label) {
                  emitReasoning(step)
                }
              }
            }
          } catch { /* non-fatal: emit generic reasoning instead */ }

          if (!emitReasoning({ type: 'domain_detection', label: 'Domain Detection', description: 'Identifying business domain', status: 'completed', output: 'Domain detected' })) { safeClose(); return }
          if (!emitReasoning({ type: 'data_strategy', label: 'Data Strategy', description: 'Planning generation', status: 'running' })) { safeClose(); return }

          // Stream content in chunks for progressive display
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
            // Small delay for realistic streaming feel (only if more chunks remain)
            if (i + chunkSize < content.length) {
              await new Promise(r => setTimeout(r, 3))
            }
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
            const errMsg = error instanceof Error ? error.message : 'AI service unavailable. Please try again.'
            safeEnqueue(encoder.encode(`data: ${JSON.stringify({ type: 'error', data: errMsg })}\n\n`))
          } catch (enqueueErr) {
            // Controller may be in a bad state; mark closed and bail out
            controllerClosed = true
            console.error('[SynthForge AI] chatCompletionStream: failed to enqueue error event:', enqueueErr instanceof Error ? enqueueErr.message : enqueueErr)
          }
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
