// ─── Skills Registry for TDM Agents ─────────────────────────────────
// Inspired by patterns from LangChain (Tool/Agent registry), AutoGen (Agent capabilities),
// and CrewAI (Agent role/skill definitions). Each agent declares specific "skills" that
// map to executable functions, enabling the Main Orchestrator to route tasks to the
// right sub-agent based on capability matching.

export type AgentStatus = 'available' | 'busy' | 'offline' | 'error'
export type SkillCategory = 'discovery' | 'schema' | 'generation' | 'validation' | 'quality' | 'orchestration' | 'pii' | 'transform' | 'optimization' | 'prompt_engineering'

export interface AgentSkill {
  /** Unique skill identifier, e.g. "domain_detection" */
  id: string
  /** Human-readable name */
  name: string
  /** Category this skill belongs to */
  category: SkillCategory
  /** What this skill does — used for LLM routing decisions */
  description: string
  /** Input schema this skill expects (field names + types) */
  inputSchema: Record<string, string>
  /** Output schema this skill produces */
  outputSchema: Record<string, string>
  /** Tags for flexible matching (e.g. "ITSM", "healthcare") */
  tags?: string[]
  /** Estimated execution time in ms (for scheduling) */
  estimatedDurationMs: number
  /** Priority within same-category skills (lower = preferred) */
  priority: number
}

export interface AgentDescriptor {
  /** Unique agent identifier, e.g. "discovery-agent" */
  id: string
  /** Human-readable agent name */
  name: string
  /** Agent role description */
  role: string
  /** Phase this agent operates in (1=Discovery, 2=Schema, 3=Generation) */
  phase: 1 | 2 | 3
  /** System prompt key for the AI backend */
  systemPromptKey: string
  /** Skills this agent possesses */
  skills: AgentSkill[]
  /** Maximum concurrent tasks this agent can handle */
  maxConcurrency: number
  /** Current status */
  status: AgentStatus
  /** Last heartbeat timestamp (ISO string) */
  lastHeartbeat: string
  /** How many tasks this agent has completed */
  tasksCompleted: number
  /** How many tasks this agent has failed */
  tasksFailed: number
  /** Average execution time in ms */
  avgExecutionTimeMs: number
  /** Current active task IDs */
  activeTaskIds: string[]
}

// ─── Predefined Skills for TDM Agents ────────────────────────────────

export const SKILLS: Record<string, AgentSkill> = {
  // Discovery Agent Skills
  domain_detection: {
    id: 'domain_detection',
    name: 'Domain Detection',
    category: 'discovery',
    description: 'Identifies the business domain from user input (e.g., ITSM, Healthcare, E-commerce) and suggests relevant modules.',
    inputSchema: { userMessage: 'string', context: 'string?' },
    outputSchema: { domain: 'string', modules: 'string[]', confidence: 'number' },
    tags: ['discovery', 'classification'],
    estimatedDurationMs: 3000,
    priority: 1
  },
  interactive_interview: {
    id: 'interactive_interview',
    name: 'Interactive Interview',
    category: 'discovery',
    description: 'Conducts interactive interviews with users to gather volume, module, and constraint requirements with multi-choice options.',
    inputSchema: { userMessage: 'string', domain: 'string', previousAnswers: 'object?' },
    outputSchema: { options: 'ClarificationOption[]', followUpQuestions: 'string[]', reasoningSteps: 'ReasoningStep[]' },
    tags: ['discovery', 'interaction'],
    estimatedDurationMs: 4000,
    priority: 1
  },
  requirement_synthesis: {
    id: 'requirement_synthesis',
    name: 'Requirement Synthesis',
    category: 'discovery',
    description: 'Synthesizes gathered requirements into a structured plan ready for schema mapping.',
    inputSchema: { domain: 'string', volume: 'string', modules: 'string[]', constraints: 'string[]' },
    outputSchema: { schemaPlan: 'object', reasoningSteps: 'ReasoningStep[]' },
    tags: ['discovery', 'synthesis'],
    estimatedDurationMs: 2000,
    priority: 2
  },

  // Schema Agent Skills
  entity_extraction: {
    id: 'entity_extraction',
    name: 'Entity Extraction',
    category: 'schema',
    description: 'Extracts database entities and their attributes from domain requirements.',
    inputSchema: { domain: 'string', modules: 'string[]', requirements: 'object' },
    outputSchema: { entities: 'string[]', attributes: 'object', reasoningSteps: 'ReasoningStep[]' },
    tags: ['schema', 'extraction'],
    estimatedDurationMs: 5000,
    priority: 1
  },
  relationship_mapping: {
    id: 'relationship_mapping',
    name: 'Relationship Mapping',
    category: 'schema',
    description: 'Maps foreign key relationships between entities with proper naming conventions and cardinality.',
    inputSchema: { entities: 'string[]', attributes: 'object' },
    outputSchema: { relationships: 'object[]', sqlCode: 'string', reasoningSteps: 'ReasoningStep[]' },
    tags: ['schema', 'relationships'],
    estimatedDurationMs: 4000,
    priority: 2
  },
  constraint_planning: {
    id: 'constraint_planning',
    name: 'Constraint Planning',
    category: 'schema',
    description: 'Plans NOT NULL, UNIQUE, CHECK, and DEFAULT constraints based on business rules and domain patterns.',
    inputSchema: { entities: 'object', relationships: 'object[]', businessRules: 'string[]?' },
    outputSchema: { constraints: 'object', schemaPlan: 'object', reasoningSteps: 'ReasoningStep[]' },
    tags: ['schema', 'constraints'],
    estimatedDurationMs: 3000,
    priority: 3
  },

  // Data Generation Agent Skills
  preview_generation: {
    id: 'preview_generation',
    name: 'Preview Generation',
    category: 'generation',
    description: 'Generates 3-5 sample rows per table with realistic synthetic data for user review before full generation.',
    inputSchema: { schemaPlan: 'object', domain: 'string', volume: 'number' },
    outputSchema: { previewTables: 'object', options: 'ClarificationOption[]', reasoningSteps: 'ReasoningStep[]' },
    tags: ['generation', 'preview'],
    estimatedDurationMs: 8000,
    priority: 1
  },
  full_generation: {
    id: 'full_generation',
    name: 'Full Dataset Generation',
    category: 'generation',
    description: 'Generates the complete synthetic dataset with realistic distributions after user approves the preview.',
    inputSchema: { schemaPlan: 'object', domain: 'string', volume: 'number', approvedPreview: 'object' },
    outputSchema: { tables: 'object', sqlCode: 'string', reasoningSteps: 'ReasoningStep[]' },
    tags: ['generation', 'full'],
    estimatedDurationMs: 15000,
    priority: 2
  },
  realistic_value_generation: {
    id: 'realistic_value_generation',
    name: 'Realistic Value Generation',
    category: 'generation',
    description: 'Generates domain-specific realistic values: proper names, valid IPs, realistic timestamps, diverse emails.',
    inputSchema: { fieldType: 'string', fieldName: 'string', domain: 'string', count: 'number' },
    outputSchema: { values: 'any[]' },
    tags: ['generation', 'values'],
    estimatedDurationMs: 2000,
    priority: 3
  },

  // Validation Agent Skills
  referential_integrity_check: {
    id: 'referential_integrity_check',
    name: 'Referential Integrity Check',
    category: 'validation',
    description: 'Verifies that every foreign key references an existing primary key. Detects orphaned references.',
    inputSchema: { tables: 'object', schema: 'object' },
    outputSchema: { valid: 'boolean', orphanedReferences: 'object[]', reasoningSteps: 'ReasoningStep[]' },
    tags: ['validation', 'integrity'],
    estimatedDurationMs: 3000,
    priority: 1
  },
  business_logic_validation: {
    id: 'business_logic_validation',
    name: 'Business Logic Validation',
    category: 'validation',
    description: 'Validates temporal consistency, status transitions, money field precision, and email format.',
    inputSchema: { tables: 'object', domain: 'string' },
    outputSchema: { valid: 'boolean', violations: 'object[]', reasoningSteps: 'ReasoningStep[]' },
    tags: ['validation', 'business-logic'],
    estimatedDurationMs: 4000,
    priority: 2
  },
  data_realism_check: {
    id: 'data_realism_check',
    name: 'Data Realism Check',
    category: 'validation',
    description: 'Detects placeholder values like "Test1", "Value-123", verifies distribution patterns and diversity.',
    inputSchema: { tables: 'object', domain: 'string' },
    outputSchema: { realismScore: 'number', placeholders: 'string[]', reasoningSteps: 'ReasoningStep[]' },
    tags: ['validation', 'realism'],
    estimatedDurationMs: 3000,
    priority: 3
  },

  // Quality Agent Skills
  quality_scoring: {
    id: 'quality_scoring',
    name: 'Quality Scoring',
    category: 'quality',
    description: 'Scores data quality across completeness, uniqueness, distribution, and referential integrity dimensions.',
    inputSchema: { tables: 'object', schema: 'object' },
    outputSchema: { overall: 'number', breakdown: 'object', issues: 'string[]', reasoningSteps: 'ReasoningStep[]' },
    tags: ['quality', 'scoring'],
    estimatedDurationMs: 5000,
    priority: 1
  },
  quality_autofix: {
    id: 'quality_autofix',
    name: 'Quality Auto-Fix',
    category: 'quality',
    description: 'Automatically fixes detected quality issues: orphaned FKs, temporal violations, placeholder values.',
    inputSchema: { tables: 'object', issues: 'object[]', schema: 'object' },
    outputSchema: { fixedTables: 'object', fixesApplied: 'number', reasoningSteps: 'ReasoningStep[]' },
    tags: ['quality', 'autofix'],
    estimatedDurationMs: 6000,
    priority: 2
  },

  // PII Shield Skills
  pii_detection: {
    id: 'pii_detection',
    name: 'PII Detection',
    category: 'pii',
    description: 'Detects personally identifiable information patterns in generated data (emails, phones, SSNs).',
    inputSchema: { tables: 'object' },
    outputSchema: { hasPII: 'boolean', findings: 'object[]' },
    tags: ['pii', 'detection'],
    estimatedDurationMs: 2000,
    priority: 1
  },

  // Orchestration Skills
  task_routing: {
    id: 'task_routing',
    name: 'Task Routing',
    category: 'orchestration',
    description: 'Routes tasks to the best available agent based on skill matching, agent availability, and workload.',
    inputSchema: { task: 'string', requiredSkills: 'string[]', priority: 'number?' },
    outputSchema: { assignedAgent: 'string', estimatedTime: 'number' },
    tags: ['orchestration', 'routing'],
    estimatedDurationMs: 500,
    priority: 1
  },
  pipeline_orchestration: {
    id: 'pipeline_orchestration',
    name: 'Pipeline Orchestration',
    category: 'orchestration',
    description: 'Orchestrates the full TDM pipeline across agents with dependency management and parallel execution where possible.',
    inputSchema: { userRequest: 'string', agentMode: 'string', schemaContext: 'string?' },
    outputSchema: { steps: 'AgentStep[]', estimatedTotalTime: 'number' },
    tags: ['orchestration', 'pipeline'],
    estimatedDurationMs: 1000,
    priority: 1
  },

  // Optimization Agent Skills
  cost_analysis: {
    id: 'cost_analysis',
    name: 'Cost Analysis',
    category: 'optimization',
    description: 'Analyzes token usage and estimates costs for data generation. Recommends cost-effective strategies.',
    inputSchema: { tokenUsage: 'object', rowCount: 'number', columnCount: 'number' },
    outputSchema: { estimatedCost: 'number', recommendations: 'string[]', reasoningSteps: 'ReasoningStep[]' },
    tags: ['optimization', 'cost'],
    estimatedDurationMs: 3000,
    priority: 1
  },
  performance_optimization: {
    id: 'performance_optimization',
    name: 'Performance Optimization',
    category: 'optimization',
    description: 'Analyzes generation speed bottlenecks and recommends batch sizes and schema simplifications.',
    inputSchema: { tables: 'object', generationTime: 'number?' },
    outputSchema: { recommendations: 'string[]', optimalBatchSize: 'number', reasoningSteps: 'ReasoningStep[]' },
    tags: ['optimization', 'performance'],
    estimatedDurationMs: 4000,
    priority: 2
  },

  // Prompt Engineering Agent Skills
  prompt_analysis: {
    id: 'prompt_analysis',
    name: 'Prompt Analysis',
    category: 'prompt_engineering',
    description: 'Analyzes user prompts for clarity and specificity. Identifies ambiguous requirements and missing constraints.',
    inputSchema: { userPrompt: 'string', domain: 'string?' },
    outputSchema: { clarityScore: 'number', issues: 'string[]', reasoningSteps: 'ReasoningStep[]' },
    tags: ['prompt_engineering', 'analysis'],
    estimatedDurationMs: 3000,
    priority: 1
  },
  prompt_refinement: {
    id: 'prompt_refinement',
    name: 'Prompt Refinement',
    category: 'prompt_engineering',
    description: 'Reformulates vague requests into specific data generation instructions with domain context and constraints.',
    inputSchema: { userPrompt: 'string', analysis: 'object' },
    outputSchema: { refinedPrompt: 'string', improvements: 'string[]', reasoningSteps: 'ReasoningStep[]' },
    tags: ['prompt_engineering', 'refinement'],
    estimatedDurationMs: 5000,
    priority: 2
  },

  // Transform Agent Skills
  data_transformation: {
    id: 'data_transformation',
    name: 'Data Transformation',
    category: 'transform',
    description: 'Transforms data between schema formats, converts data types, and applies field mappings.',
    inputSchema: { sourceData: 'object', targetSchema: 'object', mapping: 'object?' },
    outputSchema: { transformedData: 'object', sqlCode: 'string?', reasoningSteps: 'ReasoningStep[]' },
    tags: ['transform', 'data'],
    estimatedDurationMs: 8000,
    priority: 1
  },
  schema_migration: {
    id: 'schema_migration',
    name: 'Schema Migration',
    category: 'transform',
    description: 'Migrates data from one schema version to another, handling schema evolution and preserving integrity.',
    inputSchema: { sourceData: 'object', sourceSchema: 'object', targetSchema: 'object' },
    outputSchema: { migratedData: 'object', migrationSQL: 'string', reasoningSteps: 'ReasoningStep[]' },
    tags: ['transform', 'migration'],
    estimatedDurationMs: 6000,
    priority: 2
  }
}

// ─── Agent Registry (singleton) ──────────────────────────────────────

class AgentRegistry {
  private agents: Map<string, AgentDescriptor> = new Map()
  private static instance: AgentRegistry | null = null

  private constructor() {
    this.registerDefaultAgents()
  }

  static getInstance(): AgentRegistry {
    if (!AgentRegistry.instance) {
      AgentRegistry.instance = new AgentRegistry()
    }
    return AgentRegistry.instance
  }

  private registerDefaultAgents() {
    const now = new Date().toISOString()

    this.agents.set('discovery-agent', {
      id: 'discovery-agent',
      name: 'Discovery Agent',
      role: 'Phase 1: Gathers requirements through interactive interviews',
      phase: 1,
      systemPromptKey: 'discovery',
      skills: [SKILLS.domain_detection, SKILLS.interactive_interview, SKILLS.requirement_synthesis],
      maxConcurrency: 2,
      status: 'available',
      lastHeartbeat: now,
      tasksCompleted: 0,
      tasksFailed: 0,
      avgExecutionTimeMs: 0,
      activeTaskIds: []
    })

    this.agents.set('schema-agent', {
      id: 'schema-agent',
      name: 'Schema Agent',
      role: 'Phase 2: Designs database schemas with proper relationships and constraints',
      phase: 2,
      systemPromptKey: 'schema',
      skills: [SKILLS.entity_extraction, SKILLS.relationship_mapping, SKILLS.constraint_planning],
      maxConcurrency: 2,
      status: 'available',
      lastHeartbeat: now,
      tasksCompleted: 0,
      tasksFailed: 0,
      avgExecutionTimeMs: 0,
      activeTaskIds: []
    })

    this.agents.set('data-agent', {
      id: 'data-agent',
      name: 'Data Generation Agent',
      role: 'Phase 3: Generates realistic synthetic data with preview-first approach',
      phase: 3,
      systemPromptKey: 'data',
      skills: [SKILLS.preview_generation, SKILLS.full_generation, SKILLS.realistic_value_generation],
      maxConcurrency: 1,
      status: 'available',
      lastHeartbeat: now,
      tasksCompleted: 0,
      tasksFailed: 0,
      avgExecutionTimeMs: 0,
      activeTaskIds: []
    })

    this.agents.set('validation-agent', {
      id: 'validation-agent',
      name: 'Validation Agent',
      role: 'Phase 2-3: Validates referential integrity, business logic, and data realism',
      phase: 2,
      systemPromptKey: 'validation',
      skills: [SKILLS.referential_integrity_check, SKILLS.business_logic_validation, SKILLS.data_realism_check],
      maxConcurrency: 2,
      status: 'available',
      lastHeartbeat: now,
      tasksCompleted: 0,
      tasksFailed: 0,
      avgExecutionTimeMs: 0,
      activeTaskIds: []
    })

    this.agents.set('quality-agent', {
      id: 'quality-agent',
      name: 'Quality Agent',
      role: 'Phase 3: Scores data quality and auto-fixes issues',
      phase: 3,
      systemPromptKey: 'quality',
      skills: [SKILLS.quality_scoring, SKILLS.quality_autofix, SKILLS.pii_detection],
      maxConcurrency: 2,
      status: 'available',
      lastHeartbeat: now,
      tasksCompleted: 0,
      tasksFailed: 0,
      avgExecutionTimeMs: 0,
      activeTaskIds: []
    })

    this.agents.set('orchestrator', {
      id: 'orchestrator',
      name: 'Orchestrator',
      role: 'Routes tasks across agents and manages the TDM pipeline',
      phase: 1,
      systemPromptKey: 'auto',
      skills: [SKILLS.task_routing, SKILLS.pipeline_orchestration],
      maxConcurrency: 3,
      status: 'available',
      lastHeartbeat: now,
      tasksCompleted: 0,
      tasksFailed: 0,
      avgExecutionTimeMs: 0,
      activeTaskIds: []
    })

    this.agents.set('optimization-agent', {
      id: 'optimization-agent',
      name: 'Optimization Agent',
      role: 'Analyzes and optimizes cost and performance of synthetic data generation',
      phase: 2,
      systemPromptKey: 'optimization',
      skills: [SKILLS.cost_analysis, SKILLS.performance_optimization],
      maxConcurrency: 2,
      status: 'available',
      lastHeartbeat: now,
      tasksCompleted: 0,
      tasksFailed: 0,
      avgExecutionTimeMs: 0,
      activeTaskIds: []
    })

    this.agents.set('prompt-engineering-agent', {
      id: 'prompt-engineering-agent',
      name: 'Prompt Engineering Agent',
      role: 'Refines and optimizes prompts for better data generation results',
      phase: 1,
      systemPromptKey: 'prompt_engineering',
      skills: [SKILLS.prompt_analysis, SKILLS.prompt_refinement],
      maxConcurrency: 2,
      status: 'available',
      lastHeartbeat: now,
      tasksCompleted: 0,
      tasksFailed: 0,
      avgExecutionTimeMs: 0,
      activeTaskIds: []
    })

    this.agents.set('transform-agent', {
      id: 'transform-agent',
      name: 'Transform Agent',
      role: 'Handles data transformation and migration between schemas',
      phase: 3,
      systemPromptKey: 'transform',
      skills: [SKILLS.data_transformation, SKILLS.schema_migration],
      maxConcurrency: 1,
      status: 'available',
      lastHeartbeat: now,
      tasksCompleted: 0,
      tasksFailed: 0,
      avgExecutionTimeMs: 0,
      activeTaskIds: []
    })
  }

  // ─── Query Methods ─────────────────────────────────────────────

  /** Get all registered agents */
  getAll(): AgentDescriptor[] {
    return Array.from(this.agents.values())
  }

  /** Get agent by ID */
  get(agentId: string): AgentDescriptor | undefined {
    return this.agents.get(agentId)
  }

  /** Find agents that have a specific skill */
  findBySkill(skillId: string): AgentDescriptor[] {
    return this.getAll().filter(a => a.skills.some(s => s.id === skillId))
  }

  /** Find agents by category */
  findByCategory(category: SkillCategory): AgentDescriptor[] {
    return this.getAll().filter(a => a.skills.some(s => s.category === category))
  }

  /** Find best available agent for a given skill, considering workload and priority */
  findBestForSkill(skillId: string): AgentDescriptor | null {
    const candidates = this.findBySkill(skillId)
      .filter(a => a.status === 'available' && a.activeTaskIds.length < a.maxConcurrency)
      .sort((a, b) => {
        // Prefer agents with fewer active tasks
        const loadDiff = a.activeTaskIds.length - b.activeTaskIds.length
        if (loadDiff !== 0) return loadDiff
        // Then prefer agents with better success rate
        const aSuccess = a.tasksCompleted / Math.max(a.tasksCompleted + a.tasksFailed, 1)
        const bSuccess = b.tasksCompleted / Math.max(b.tasksCompleted + b.tasksFailed, 1)
        return bSuccess - aSuccess
      })
    return candidates[0] || null
  }

  /** Get available agents for a given phase */
  getAvailableByPhase(phase: 1 | 2 | 3): AgentDescriptor[] {
    return this.getAll().filter(a => a.phase === phase && a.status === 'available')
  }

  // ─── Mutation Methods ──────────────────────────────────────────

  /** Update agent status */
  updateStatus(agentId: string, status: AgentStatus): void {
    const agent = this.agents.get(agentId)
    if (agent) {
      agent.status = status
      agent.lastHeartbeat = new Date().toISOString()
    }
  }

  /** Assign a task to an agent */
  assignTask(agentId: string, taskId: string): boolean {
    const agent = this.agents.get(agentId)
    if (!agent || agent.status !== 'available') return false
    if (agent.activeTaskIds.length >= agent.maxConcurrency) return false
    agent.activeTaskIds.push(taskId)
    if (agent.activeTaskIds.length >= agent.maxConcurrency) {
      agent.status = 'busy'
    }
    agent.lastHeartbeat = new Date().toISOString()
    return true
  }

  /** Complete a task for an agent */
  completeTask(agentId: string, taskId: string, executionTimeMs: number, success: boolean): void {
    const agent = this.agents.get(agentId)
    if (!agent) return
    agent.activeTaskIds = agent.activeTaskIds.filter(id => id !== taskId)
    if (success) {
      agent.tasksCompleted++
    } else {
      agent.tasksFailed++
    }
    // Update rolling average execution time
    const totalTasks = agent.tasksCompleted + agent.tasksFailed
    agent.avgExecutionTimeMs = Math.round(
      (agent.avgExecutionTimeMs * (totalTasks - 1) + executionTimeMs) / totalTasks
    )
    if (agent.activeTaskIds.length < agent.maxConcurrency) {
      agent.status = 'available'
    }
    agent.lastHeartbeat = new Date().toISOString()
  }

  /** Process heartbeat for an agent */
  heartbeat(agentId: string): void {
    const agent = this.agents.get(agentId)
    if (agent) {
      agent.lastHeartbeat = new Date().toISOString()
      if (agent.status === 'offline') {
        agent.status = 'available'
      }
    }
  }

  /** Check for stale heartbeats and mark agents offline */
  checkStaleAgents(timeoutMs: number = 60000): string[] {
    const now = Date.now()
    const staleAgents: string[] = []
    for (const agent of this.agents.values()) {
      if (agent.status === 'offline') continue
      const lastBeat = new Date(agent.lastHeartbeat).getTime()
      if (now - lastBeat > timeoutMs) {
        agent.status = 'offline'
        staleAgents.push(agent.id)
      }
    }
    return staleAgents
  }

  /** Get registry summary for status display */
  getSummary(): {
    totalAgents: number
    available: number
    busy: number
    offline: number
    error: number
    totalSkills: number
    totalTasksCompleted: number
    totalTasksFailed: number
  } {
    const all = this.getAll()
    return {
      totalAgents: all.length,
      available: all.filter(a => a.status === 'available').length,
      busy: all.filter(a => a.status === 'busy').length,
      offline: all.filter(a => a.status === 'offline').length,
      error: all.filter(a => a.status === 'error').length,
      totalSkills: new Set(all.flatMap(a => a.skills.map(s => s.id))).size,
      totalTasksCompleted: all.reduce((sum, a) => sum + a.tasksCompleted, 0),
      totalTasksFailed: all.reduce((sum, a) => sum + a.tasksFailed, 0)
    }
  }
}

export const agentRegistry = AgentRegistry.getInstance()
