// ─── Agent Orchestrator ──────────────────────────────────────────────
// Central coordinator that uses the Skills Registry, Message Bus, and
// Heartbeat Monitor to orchestrate the TDM multi-agent pipeline.
//
// Design inspired by:
// - LangGraph's StateGraph: nodes (agents) + edges (transitions) + shared state
// - AutoGen's GroupChatManager: rounds, speaker selection, topic routing
// - CrewAI's Process: sequential task delegation with context passing
// - Temporal/Step Functions: durable workflow with retry + compensation
//
// The Orchestrator:
// 1. Receives user requests from the chat API
// 2. Routes to the best available agent based on skills + availability
// 3. Manages the pipeline lifecycle (Discovery → Schema → Generation)
// 4. Coordinates inter-agent data passing via the Message Bus
// 5. Monitors agent health via Heartbeat and handles failures gracefully

import { agentRegistry, type AgentDescriptor, type SkillCategory } from './agent-registry'
import { agentBus, type BusMessage } from './agent-bus'
import { heartbeatMonitor, ensureHeartbeatStarted } from './agent-heartbeat'
import { chatCompletion, getSystemPrompt, getSubagentPrompt, parseAgentResponse, type AgentResponse, type ReasoningStep, type AgentStep } from './ai'

export interface PipelineConfig {
  /** Maximum concurrent agents (default: 3) */
  maxConcurrency: number
  /** Timeout for each agent step in ms (default: 90000) */
  stepTimeoutMs: number
  /** Whether to retry failed steps (default: true) */
  retryOnFailure: boolean
  /** Maximum retries per step (default: 1) */
  maxRetries: number
  /** Whether to use heartbeat monitoring (default: true) */
  useHeartbeat: boolean
  /** Whether to emit events to the message bus (default: true) */
  useMessageBus: boolean
}

export interface PipelineStep {
  agentId: string
  skillId: string
  task: string
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped'
  output?: string
  tables?: Record<string, Record<string, unknown>[]>
  reasoningSteps?: ReasoningStep[]
  executionTimeMs?: number
  retryCount: number
}

export interface PipelineResult {
  sessionId: string
  status: 'completed' | 'failed' | 'partial'
  steps: PipelineStep[]
  tables: Record<string, Record<string, unknown>[]>
  reasoningSteps: ReasoningStep[]
  totalExecutionTimeMs: number
  agentMetrics: Record<string, { tasksCompleted: number; tasksFailed: number; avgTimeMs: number }>
}

class AgentOrchestrator {
  private config: PipelineConfig
  private activePipelines: Map<string, { steps: PipelineStep[]; abortController: AbortController }> = new Map()
  private static instance: AgentOrchestrator | null = null

  private constructor(config?: Partial<PipelineConfig>) {
    this.config = {
      maxConcurrency: 3,
      stepTimeoutMs: 90000,
      retryOnFailure: true,
      maxRetries: 1,
      useHeartbeat: true,
      useMessageBus: true,
      ...config
    }

    // Ensure heartbeat monitoring is started
    if (this.config.useHeartbeat) {
      ensureHeartbeatStarted()
    }

    // Subscribe to bus events for logging/monitoring
    if (this.config.useMessageBus) {
      agentBus.subscribe('orchestrator', (msg: BusMessage) => {
        if (msg.type === 'error') {
          console.error(`[Orchestrator] Agent ${msg.from} reported error:`, msg.payload)
        }
      })
    }
  }

  static getInstance(config?: Partial<PipelineConfig>): AgentOrchestrator {
    if (!AgentOrchestrator.instance) {
      AgentOrchestrator.instance = new AgentOrchestrator(config)
    }
    return AgentOrchestrator.instance
  }

  // ─── Pipeline Planning ─────────────────────────────────────────

  /**
   * Plan the pipeline steps based on the user request and agent mode.
   * This determines which agents need to be invoked and in what order.
   */
  planPipeline(agentMode: string, isComplexRequest: boolean): PipelineStep[] {
    const steps: PipelineStep[] = []

    if (agentMode === 'plan') {
      // Plan mode: Only discovery agent
      steps.push({
        agentId: 'discovery-agent',
        skillId: 'interactive_interview',
        task: 'Gather requirements through interactive interview',
        status: 'pending',
        retryCount: 0
      })
    } else if (agentMode === 'execute') {
      // Execute mode: Schema + Generation + Validation
      steps.push(
        {
          agentId: 'schema-agent',
          skillId: 'entity_extraction',
          task: 'Design database schema based on requirements',
          status: 'pending',
          retryCount: 0
        },
        {
          agentId: 'data-agent',
          skillId: 'preview_generation',
          task: 'Generate preview data for user review',
          status: 'pending',
          retryCount: 0
        },
        {
          agentId: 'validation-agent',
          skillId: 'referential_integrity_check',
          task: 'Validate referential integrity and business logic',
          status: 'pending',
          retryCount: 0
        }
      )
    } else {
      // Auto mode: Full pipeline
      if (isComplexRequest) {
        steps.push(
          {
            agentId: 'discovery-agent',
            skillId: 'interactive_interview',
            task: 'Gather requirements and confirm scope',
            status: 'pending',
            retryCount: 0
          },
          {
            agentId: 'schema-agent',
            skillId: 'entity_extraction',
            task: 'Design schema based on confirmed requirements',
            status: 'pending',
            retryCount: 0
          },
          {
            agentId: 'data-agent',
            skillId: 'preview_generation',
            task: 'Generate realistic data with preview',
            status: 'pending',
            retryCount: 0
          },
          {
            agentId: 'validation-agent',
            skillId: 'referential_integrity_check',
            task: 'Validate constraints, integrity, and business logic',
            status: 'pending',
            retryCount: 0
          },
          {
            agentId: 'quality-agent',
            skillId: 'quality_scoring',
            task: 'Final quality review and fix issues',
            status: 'pending',
            retryCount: 0
          }
        )
      } else {
        // Simple request in auto mode: schema + data + validation
        steps.push(
          {
            agentId: 'schema-agent',
            skillId: 'entity_extraction',
            task: 'Design schema based on request',
            status: 'pending',
            retryCount: 0
          },
          {
            agentId: 'data-agent',
            skillId: 'full_generation',
            task: 'Generate complete synthetic dataset',
            status: 'pending',
            retryCount: 0
          },
          {
            agentId: 'quality-agent',
            skillId: 'quality_scoring',
            task: 'Quality review and auto-fix',
            status: 'pending',
            retryCount: 0
          }
        )
      }
    }

    return steps
  }

  // ─── Pipeline Execution ────────────────────────────────────────

  /**
   * Execute the multi-agent pipeline with a user message.
   * This is the main entry point called from the chat API.
   */
  async executePipeline(params: {
    sessionId: string
    userMessage: string
    agentMode: string
    schemaContext?: string
    previousContext?: string
    isComplexRequest?: boolean
    onStepUpdate?: (step: PipelineStep, stepIndex: number) => void
  }): Promise<PipelineResult> {
    const { sessionId, userMessage, agentMode, schemaContext = '', previousContext = '', isComplexRequest = true, onStepUpdate } = params

    const startTime = Date.now()
    const steps = this.planPipeline(agentMode, isComplexRequest)
    const abortController = new AbortController()
    this.activePipelines.set(sessionId, { steps, abortController })

    // Initialize pipeline state in the bus
    if (this.config.useMessageBus) {
      agentBus.initPipelineState(sessionId, 'orchestrator')
    }

    let accumulatedContext = previousContext
    let allTables: Record<string, Record<string, unknown>[]> = {}
    let allReasoningSteps: ReasoningStep[] = []

    // Execute steps sequentially (agents depend on prior outputs)
    for (let i = 0; i < steps.length; i++) {
      if (abortController.signal.aborted) break

      const step = steps[i]
      step.status = 'running'
      onStepUpdate?.(step, i)

      // Check agent availability via heartbeat
      if (this.config.useHeartbeat && !heartbeatMonitor.isAvailable(step.agentId)) {
        // Try to find an alternative agent with the same skill
        const alternative = agentRegistry.findBestForSkill(step.skillId)
        if (alternative && alternative.id !== step.agentId) {
          console.log(`[Orchestrator] Agent ${step.agentId} unavailable, routing to ${alternative.id}`)
          step.agentId = alternative.id
        } else if (!alternative) {
          step.status = 'failed'
          step.output = `Agent ${step.agentId} is offline and no alternative available`
          onStepUpdate?.(step, i)
          continue
        }
      }

      // Assign task to agent in registry
      const taskId = `${sessionId}-step-${i}`
      agentRegistry.assignTask(step.agentId, taskId)

      // Send task assignment via bus
      if (this.config.useMessageBus) {
        agentBus.sendDirectMessage('orchestrator', step.agentId, 'task_assignment', {
          sessionId,
          stepIndex: i,
          task: step.task,
          skillId: step.skillId,
          context: accumulatedContext.slice(-4000),
          schema: schemaContext
        })
      }

      // Execute the agent step
      const stepStartTime = Date.now()
      try {
        const result = await this.executeAgentStep(step.agentId, step.task, accumulatedContext, schemaContext)
        const executionTime = Date.now() - stepStartTime
        step.executionTimeMs = executionTime

        const parsed = parseAgentResponse(result.content)

        if (parsed) {
          step.output = parsed.explanation || result.content.slice(0, 200)
          step.tables = parsed.tables
          step.reasoningSteps = parsed.reasoningSteps

          // Accumulate results
          if (parsed.tables) {
            allTables = { ...allTables, ...parsed.tables }
          }
          if (parsed.reasoningSteps) {
            allReasoningSteps = [...allReasoningSteps, ...parsed.reasoningSteps]
          }

          // Update shared state via bus
          if (this.config.useMessageBus) {
            agentBus.addPipelineTables(sessionId, parsed.tables || {}, step.agentId)
            agentBus.addPipelineReasoning(sessionId, parsed.reasoningSteps || [], step.agentId)
          }

          accumulatedContext += `\n\nStep ${i + 1} (${step.agentId}) output: ${step.output}`
        } else {
          step.output = result.content.slice(0, 200)
          accumulatedContext += `\n\nStep ${i + 1} (${step.agentId}) output: ${step.output}`
        }

        step.status = 'completed'

        // Send result via bus
        if (this.config.useMessageBus) {
          agentBus.sendDirectMessage(step.agentId, 'orchestrator', 'task_result', {
            sessionId,
            stepIndex: i,
            status: 'completed',
            output: step.output,
            tables: Object.keys(parsed?.tables || {})
          })
        }

        // Complete task in registry
        agentRegistry.completeTask(step.agentId, taskId, executionTime, true)

      } catch (error) {
        const executionTime = Date.now() - stepStartTime
        step.executionTimeMs = executionTime
        const errMsg = error instanceof Error ? error.message : 'Unknown error'
        step.output = errMsg
        step.status = 'failed'

        // Retry logic
        if (this.config.retryOnFailure && step.retryCount < this.config.maxRetries) {
          step.retryCount++
          step.status = 'pending'
          i-- // Re-try this step
          console.warn(`[Orchestrator] Retrying step ${i} (${step.agentId}), attempt ${step.retryCount}`)
          continue
        }

        // Report failure via bus
        if (this.config.useMessageBus) {
          agentBus.sendDirectMessage(step.agentId, 'orchestrator', 'error', {
            sessionId,
            stepIndex: i,
            error: errMsg
          })
        }

        // Complete task in registry (as failed)
        agentRegistry.completeTask(step.agentId, taskId, executionTime, false)
      }

      // Heartbeat ping after task completion
      if (this.config.useHeartbeat) {
        heartbeatMonitor.ping(step.agentId)
      }

      onStepUpdate?.(step, i)
    }

    // Finalize pipeline
    const totalExecutionTime = Date.now() - startTime
    const completedSteps = steps.filter(s => s.status === 'completed').length
    const failedSteps = steps.filter(s => s.status === 'failed').length
    const status: PipelineResult['status'] = failedSteps === 0 ? 'completed' : completedSteps === 0 ? 'failed' : 'partial'

    if (this.config.useMessageBus) {
      if (status === 'completed') {
        agentBus.completePipeline(sessionId, 'orchestrator')
      } else {
        agentBus.failPipeline(sessionId, `Pipeline ${status}: ${failedSteps} steps failed`, 'orchestrator')
      }
    }

    // Collect agent metrics
    const agentMetrics: Record<string, { tasksCompleted: number; tasksFailed: number; avgTimeMs: number }> = {}
    for (const step of steps) {
      const agent = agentRegistry.get(step.agentId)
      if (agent) {
        agentMetrics[step.agentId] = {
          tasksCompleted: agent.tasksCompleted,
          tasksFailed: agent.tasksFailed,
          avgTimeMs: agent.avgExecutionTimeMs
        }
      }
    }

    // Cleanup
    this.activePipelines.delete(sessionId)

    return {
      sessionId,
      status,
      steps,
      tables: allTables,
      reasoningSteps: allReasoningSteps,
      totalExecutionTimeMs: totalExecutionTime,
      agentMetrics
    }
  }

  // ─── Single Agent Step Execution ───────────────────────────────

  /**
   * Execute a single agent step by calling the AI with the appropriate system prompt.
   */
  private async executeAgentStep(
    agentId: string,
    task: string,
    context: string,
    schemaContext: string
  ): Promise<{ content: string; tokensIn: number; tokensOut: number }> {
    const agent = agentRegistry.get(agentId)
    if (!agent) throw new Error(`Agent ${agentId} not found in registry`)

    const systemPrompt = getSubagentPrompt(agentId) || getSystemPrompt('auto')
    const userContent = `Task: ${task}\n\nPrevious context:\n${context.slice(-4000)}${schemaContext ? '\n\nDatabase Schema:\n' + schemaContext : ''}`

    const response = await chatCompletion({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userContent }
      ],
      temperature: 0.7,
      maxTokens: 4096
    })

    return response
  }

  // ─── Pipeline Control ──────────────────────────────────────────

  /** Abort a running pipeline */
  abortPipeline(sessionId: string): boolean {
    const pipeline = this.activePipelines.get(sessionId)
    if (!pipeline) return false
    pipeline.abortController.abort()
    this.activePipelines.delete(sessionId)
    return true
  }

  /** Get active pipeline status */
  getPipelineStatus(sessionId: string): PipelineStep[] | null {
    return this.activePipelines.get(sessionId)?.steps || null
  }

  // ─── Status & Diagnostics ──────────────────────────────────────

  /** Get full system status for diagnostics */
  getSystemStatus(): {
    agents: Array<{
      id: string
      name: string
      status: string
      phase: number
      activeTasks: number
      skillsCount: number
      tasksCompleted: number
      tasksFailed: number
      avgTimeMs: number
      lastHeartbeat: string
      isHealthy: boolean
    }>
    activePipelines: number
    messageBusStats: {
      totalMessages: number
      sharedStateEntries: number
    }
    heartbeatConfig: {
      intervalMs: number
      offlineTimeoutMs: number
    }
  } {
    const heartbeatStatus = heartbeatMonitor.getStatus()
    const healthyAgentIds = new Set(heartbeatStatus.filter(h => h.isHealthy).map(h => h.agentId))

    return {
      agents: agentRegistry.getAll().map(a => ({
        id: a.id,
        name: a.name,
        status: a.status,
        phase: a.phase,
        activeTasks: a.activeTaskIds.length,
        skillsCount: a.skills.length,
        tasksCompleted: a.tasksCompleted,
        tasksFailed: a.tasksFailed,
        avgTimeMs: a.avgExecutionTimeMs,
        lastHeartbeat: a.lastHeartbeat,
        isHealthy: healthyAgentIds.has(a.id)
      })),
      activePipelines: this.activePipelines.size,
      messageBusStats: {
        totalMessages: agentBus.getHistory().length,
        sharedStateEntries: 0 // Internal state count
      },
      heartbeatConfig: {
        intervalMs: heartbeatMonitor.getConfig().intervalMs,
        offlineTimeoutMs: heartbeatMonitor.getConfig().offlineTimeoutMs
      }
    }
  }

  /** Get the skills registry for display */
  getSkillsRegistry(): Array<{
    id: string
    name: string
    category: SkillCategory
    description: string
    assignedAgent: string
    estimatedDurationMs: number
  }> {
    const skills: Array<{
      id: string
      name: string
      category: SkillCategory
      description: string
      assignedAgent: string
      estimatedDurationMs: number
    }> = []

    for (const agent of agentRegistry.getAll()) {
      for (const skill of agent.skills) {
        skills.push({
          id: skill.id,
          name: skill.name,
          category: skill.category,
          description: skill.description,
          assignedAgent: agent.id,
          estimatedDurationMs: skill.estimatedDurationMs
        })
      }
    }

    return skills
  }

  /** Route a task to the best available agent based on skill matching */
  routeTask(requiredSkillId: string, priority: number = 0): AgentDescriptor | null {
    // Check heartbeat first
    const best = agentRegistry.findBestForSkill(requiredSkillId)
    if (best && this.config.useHeartbeat && !heartbeatMonitor.isAvailable(best.id)) {
      // Fallback: find any agent with this skill that's available
      const alternatives = agentRegistry.findBySkill(requiredSkillId)
        .filter(a => heartbeatMonitor.isAvailable(a.id))
      return alternatives[0] || best // Return best even if unhealthy as last resort
    }
    return best
  }
}

export const agentOrchestrator = AgentOrchestrator.getInstance()
