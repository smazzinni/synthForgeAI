import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { chatCompletion, chatCompletionStream, estimateCost, parseAgentResponse, getSystemPrompt, detectPII, scoreDataQuality, inferSchemaFromData, type AgentStep } from '@/lib/ai'
import { logger } from '@/lib/logger'

export const maxDuration = 120

// ─── Specialized subagent system prompts ────────────────────────
const SCHEMA_AGENT_PROMPT = `You are the SynthForge AI Schema Agent. Design a database schema based on the user's request. Return a JSON object with the schema plan including tables, columns, types, and relationships. Use the standard SynthForge AI response format with action "generate".`

const DATA_AGENT_PROMPT = `You are the SynthForge AI Data Generation Agent. Generate realistic synthetic data based on the provided schema and context. Return a JSON object with the generated tables. Use the standard SynthForge AI response format with action "generate". All data must be synthetic and privacy-safe. Maintain referential integrity. Generate at least 5-10 rows per table.`

const QUALITY_AGENT_PROMPT = `You are the SynthForge AI Quality Agent. Review the generated data for quality issues: null values in important fields, duplicate IDs, orphan foreign keys, type mismatches, and data anomalies. If you find issues, suggest fixes and regenerate corrected data. Return a JSON object with action "generate" containing any corrected tables. If no issues, return the data unchanged.`

const SQL_AGENT_PROMPT = `You are the SynthForge AI SQL Generation Agent. Generate optimized SQL queries based on the user's request and the available schema. Return a JSON object with action "generate" and include the "sqlCode" field with the generated SQL. Also include an "explanation" field describing what the query does. Always consider indexes, joins, and performance optimizations.`

const DATA_ANALYSIS_AGENT_PROMPT = `You are the SynthForge AI Data Analysis Agent. Analyze the provided data and compute statistics, aggregations, and insights. Return a JSON object with action "generate" and include an "explanation" field with the analysis results. Compute mean, median, standard deviation where applicable. Identify trends, patterns, and anomalies in the data.`

const VISUALIZATION_AGENT_PROMPT = `You are the SynthForge AI Visualization Agent. Based on the data and analysis provided, suggest appropriate visualizations (charts, graphs) and provide the data structure needed to render them. Return a JSON object with action "generate" and include an "explanation" field describing the recommended visualizations and their configurations.`

const SCHEMA_ANALYSIS_AGENT_PROMPT = `You are the SynthForge AI Schema Analysis Agent. Analyze the database schema for normalization issues, missing indexes, potential performance bottlenecks, and design improvements. Return a JSON object with action "generate" and include an "explanation" field with your analysis and recommendations.`

function getSubagentPrompt(agentName: string): string {
  if (agentName.includes('schema')) return SCHEMA_AGENT_PROMPT
  if (agentName.includes('data') && !agentName.includes('analysis')) return DATA_AGENT_PROMPT
  if (agentName.includes('quality')) return QUALITY_AGENT_PROMPT
  if (agentName.includes('sql')) return SQL_AGENT_PROMPT
  if (agentName.includes('analysis') || agentName.includes('stat')) return DATA_ANALYSIS_AGENT_PROMPT
  if (agentName.includes('viz') || agentName.includes('chart') || agentName.includes('visual')) return VISUALIZATION_AGENT_PROMPT
  if (agentName.includes('schema-analysis')) return SCHEMA_ANALYSIS_AGENT_PROMPT
  // Default: use the main auto-mode prompt
  return getSystemPrompt('auto')
}

// ─── Dynamic agent spawning based on request ────────────────────
function determineAgents(request: string): { agent: string; task: string }[] {
  const lower = request.toLowerCase()
  const agents: { agent: string; task: string }[] = []

  // Check for SQL-related requests
  if (lower.includes('sql') || lower.includes('query') || lower.includes('select')) {
    agents.push({ agent: 'sql-agent', task: 'Generate optimized SQL query' })
  }

  // Check for analysis/statistics requests
  if (lower.includes('analyz') || lower.includes('statist') || lower.includes('aggregat') || lower.includes('mean') || lower.includes('median') || lower.includes('distribution') || lower.includes('trend')) {
    agents.push({ agent: 'data-analysis-agent', task: 'Perform statistical analysis on the data' })
  }

  // Check for visualization/chart requests
  if (lower.includes('chart') || lower.includes('visual') || lower.includes('graph') || lower.includes('plot') || lower.includes('dashboard')) {
    agents.push({ agent: 'viz-agent', task: 'Generate visualization recommendations and data' })
  }

  // Check for schema analysis requests
  if (lower.includes('optimize') || lower.includes('schema analysis') || lower.includes('normali')) {
    agents.push({ agent: 'schema-analysis-agent', task: 'Analyze schema for optimization opportunities' })
  }

  // Default: data generation pipeline
  if (agents.length === 0) {
    agents.push(
      { agent: 'schema-agent', task: 'Design schema based on user requirements' },
      { agent: 'data-agent', task: 'Generate realistic synthetic data' },
      { agent: 'quality-agent', task: 'Validate data quality and fix issues' }
    )
  } else {
    // Add quality check as the final step if it's not a generation request
    agents.push({ agent: 'quality-agent', task: 'Validate output quality' })
  }

  return agents
}

// POST /api/chat - Send message and get AI response
export async function POST(request: NextRequest) {
  try {
    // Parse request body with timeout protection
    const body = await Promise.race([
      request.json(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Request body parse timeout')), 10_000)
      )
    ]) as {
      conversationId?: string
      message?: string
      workspaceId?: string
      databaseId?: string
      agentMode?: string
      stream?: boolean
      rowCount?: number
      files?: { name: string; content: string; type: string }[]
      sqlOnly?: boolean
    }

    const { conversationId, message, workspaceId, databaseId, agentMode = 'auto', stream = false, rowCount, files = [], sqlOnly = false } = body

    if (!message || typeof message !== 'string') {
      return NextResponse.json({ error: 'Message required' }, { status: 400 })
    }

    // Sanitize input - remove control characters
    const sanitizedMessage = message.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '').trim()
    if (sanitizedMessage.length > 10000) {
      return NextResponse.json({ error: 'Message too long (max 10000 characters)' }, { status: 400 })
    }
    if (sanitizedMessage.length < 3) {
      return NextResponse.json({ error: 'Message too short. Please provide more details.' }, { status: 400 })
    }

    // Check for ambiguous short queries (but not for sqlOnly)
    if (!sqlOnly && sanitizedMessage.split(/\s+/).length < 5 && !sanitizedMessage.includes(',')) {
      return NextResponse.json({
        message: {
          role: 'assistant',
          content: JSON.stringify({
            action: 'clarify',
            agentName: 'auto-agent',
            explanation: 'Your request is a bit brief. Could you provide more details about what data you need?',
            options: [
              { id: 'users', label: 'User/Customer data', value: sanitizedMessage + ' for users/customers', description: 'Generate user or customer records' },
              { id: 'products', label: 'Product/Inventory data', value: sanitizedMessage + ' for products/inventory', description: 'Generate product catalog data' },
              { id: 'orders', label: 'Order/Transaction data', value: sanitizedMessage + ' for orders/transactions', description: 'Generate order or transaction records' },
              { id: 'custom', label: 'Custom schema', value: sanitizedMessage, description: 'I\'ll describe my schema in detail' }
            ],
            reasoningSteps: [{ type: 'intent', label: 'Intent Analysis', description: 'Request too ambiguous', status: 'completed', output: 'Ambiguous request, asking for clarification' }]
          }),
          tokensIn: 0, tokensOut: 0, cost: 0, sqlCode: '', agentName: 'auto-agent',
          reasoningSteps: '[]', options: '[]', tablesJson: '{}'
        }
      })
    }

    // Find or create conversation
    let conversation = conversationId
      ? await db.conversation.findUnique({ where: { id: conversationId }, include: { messages: { orderBy: { createdAt: 'asc' } } } })
      : null

    if (!conversation && databaseId) {
      let validWorkspaceId = workspaceId
      if (!validWorkspaceId) {
        const firstWorkspace = await db.workspace.findFirst()
        validWorkspaceId = firstWorkspace?.id || ''
      }
      conversation = await db.conversation.create({
        data: {
          title: message.slice(0, 60),
          databaseId,
          workspaceId: validWorkspaceId,
          agentMode
        },
        include: { messages: true }
      })
    }

    if (!conversation) {
      return NextResponse.json({ error: 'Conversation not found and no databaseId provided' }, { status: 400 })
    }

    // Save user message
    await db.message.create({
      data: {
        role: 'user',
        content: message,
        conversationId: conversation.id
      }
    })

    // Get database schema for context
    const database = await db.database.findUnique({
      where: { id: conversation.databaseId },
      include: { schemaVersions: { orderBy: { createdAt: 'desc' }, take: 1 } }
    })
    const schemaContext = database?.schemaJson && database.schemaJson !== '{}'
      ? `\n\nCurrent database schema:\n${database.schemaJson}`
      : ''

    // Build file context
    let fileContext = ''
    if (files && files.length > 0) {
      fileContext = `\n\nAttached files:\n${files.map((f: { name: string; content: string; type: string }) => `--- ${f.name} (${f.type}) ---\n${f.content?.slice(0, 3000)}`).join('\n\n')}`
    }

    // Build conversation history (last 10 messages for context)
    const previousMessages = (conversation.messages || [])
      .slice(-10)
      .map((m: { role: string; content: string }) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content
      }))

    const currentAgentMode = sqlOnly ? 'sql' : (agentMode || conversation.agentMode || 'auto')
    const systemPrompt = sqlOnly ? SQL_AGENT_PROMPT : getSystemPrompt(currentAgentMode)

    // Use sanitized message for processing
    const effectiveMessage = sanitizedMessage

    // Build row count context if specified
    const rowContext = rowCount ? `\n\nUser wants to generate approximately ${rowCount} rows per table.` : ''

    const chatMessages = [
      ...previousMessages,
      { role: 'user' as const, content: effectiveMessage + schemaContext + fileContext + rowContext }
    ]

    // ─── Streaming Path ─────────────────────────────────────────
    if (stream) {
      const streamResponse = await chatCompletionStream({
        messages: [{ role: 'system', content: systemPrompt }, ...chatMessages],
        temperature: 0.7,
        maxTokens: 8192
      })

      const conversationId_ = conversation.id
      const databaseId_ = conversation.databaseId
      const dbRef = database
      const encoder = new TextEncoder()

      let fullContent = ''
      let tokensIn = 0
      let tokensOut = 0
      let multiStepHandled = false

      const transformStream = new TransformStream<Uint8Array, Uint8Array>({
        async transform(chunk, controller) {
          controller.enqueue(chunk)

          const text = new TextDecoder().decode(chunk)
          const lines = text.split('\n')
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const event = JSON.parse(line.slice(6))
                if (event.type === 'content') {
                  fullContent += event.data
                } else if (event.type === 'done' && !multiStepHandled) {
                  tokensIn = event.data?.tokensIn || 0
                  tokensOut = event.data?.tokensOut || 0

                  const parsed = parseAgentResponse(fullContent)

                  if (parsed?.action === 'multi_step' && parsed.steps && parsed.steps.length > 0) {
                    // ─── Multi-Step Agent Execution ──────────────────
                    multiStepHandled = true
                    const agentSteps: AgentStep[] = parsed.steps
                    let accumulatedContext = fullContent
                    let allTables: Record<string, Record<string, unknown>[]> = {}

                    // Emit initial step plan
                    for (let i = 0; i < agentSteps.length; i++) {
                      controller.enqueue(encoder.encode(`data: ${JSON.stringify({
                        type: 'agent_step',
                        data: { stepIndex: i, agent: agentSteps[i].agent, task: agentSteps[i].task, status: 'pending' }
                      })}\n\n`))
                    }

                    // Execute each step sequentially
                    for (let i = 0; i < agentSteps.length; i++) {
                      const step = agentSteps[i]

                      controller.enqueue(encoder.encode(`data: ${JSON.stringify({
                        type: 'agent_step',
                        data: { stepIndex: i, agent: step.agent, task: step.task, status: 'running' }
                      })}\n\n`))

                      try {
                        const subagentPrompt = getSubagentPrompt(step.agent)
                        const stepResponse = await chatCompletion({
                          messages: [
                            { role: 'system', content: subagentPrompt },
                            { role: 'user', content: `Task: ${step.task}\n\nPrevious context:\n${accumulatedContext.slice(-3000)}` }
                          ],
                          temperature: 0.7,
                          maxTokens: 8192
                        })

                        const stepParsed = parseAgentResponse(stepResponse.content)
                        const stepOutput = stepParsed?.explanation || stepResponse.content.slice(0, 200)

                        if (stepParsed?.tables) {
                          allTables = { ...allTables, ...stepParsed.tables }
                        }

                        controller.enqueue(encoder.encode(`data: ${JSON.stringify({
                          type: 'agent_step',
                          data: {
                            stepIndex: i, agent: step.agent, task: step.task,
                            status: 'completed', output: stepOutput,
                            tables: stepParsed?.tables ? Object.keys(stepParsed.tables) : []
                          }
                        })}\n\n`))

                        accumulatedContext += `\n\nStep ${i + 1} (${step.agent}) output: ${stepOutput}`
                        tokensIn += stepResponse.tokensIn
                        tokensOut += stepResponse.tokensOut
                      } catch (stepErr) {
                        const stepErrMsg = stepErr instanceof Error ? stepErr.message : 'Step failed'
                        controller.enqueue(encoder.encode(`data: ${JSON.stringify({
                          type: 'agent_step',
                          data: { stepIndex: i, agent: step.agent, task: step.task, status: 'failed', output: stepErrMsg }
                        })}\n\n`))
                      }
                    }

                    if (Object.keys(allTables).length > 0) {
                      const finalContent = JSON.stringify({
                        action: 'generate',
                        agentName: 'orchestrator',
                        explanation: parsed.explanation + '\n\nAll pipeline steps completed successfully.',
                        tables: allTables,
                        steps: agentSteps.map((s, idx) => ({ ...s, status: 'completed' })),
                        reasoningSteps: parsed.reasoningSteps || []
                      })
                      fullContent = finalContent

                      controller.enqueue(encoder.encode(`data: ${JSON.stringify({
                        type: 'content',
                        data: finalContent
                      })}\n\n`))
                    }
                  }

                  // Save the complete response to the database asynchronously
                  const cost = estimateCost(tokensIn, tokensOut)
                  const finalParsed = parseAgentResponse(fullContent)
                  const sqlCode = finalParsed?.sqlCode || ''
                  const agentName = finalParsed?.agentName || currentAgentMode + '-agent'
                  const options = finalParsed?.options || []
                  const reasoningSteps = finalParsed?.reasoningSteps || []
                  const tablesJson = finalParsed?.tables ? JSON.stringify(finalParsed.tables) : '{}'

                  let piiResult: { hasPII: boolean; findings: { type: string; field: string; count: number; sample: string }[] } | null = null
                  let qualityScore: { overall: number; breakdown: { completeness: number; uniqueness: number; distribution: number; referentialIntegrity: number }; issues: string[] } | null = null
                  if (finalParsed?.tables && Object.keys(finalParsed.tables).length > 0) {
                    try {
                      piiResult = detectPII(finalParsed.tables)
                      qualityScore = scoreDataQuality(finalParsed.tables)
                    } catch { /* non-fatal */ }
                  }

                  ;(async () => {
                    try {
                      await db.message.create({
                        data: {
                          role: 'assistant',
                          content: fullContent,
                          conversationId: conversationId_,
                          tokensIn,
                          tokensOut,
                          cost,
                          sqlCode,
                          agentName,
                          reasoningSteps: JSON.stringify(reasoningSteps),
                          options: JSON.stringify(options),
                          tablesJson
                        }
                      })

                      if (finalParsed?.tables && Object.keys(finalParsed.tables).length > 0 && dbRef) {
                        try {
                          const currentSchema = JSON.parse(dbRef.schemaJson || '{}')
                          for (const tableName of Object.keys(finalParsed.tables)) {
                            const rows = finalParsed.tables[tableName]
                            if (Array.isArray(rows) && rows.length > 0) {
                              const columns: Record<string, string> = {}
                              for (const [key, value] of Object.entries(rows[0])) {
                                columns[key] = typeof value === 'number'
                                  ? (Number.isInteger(value) ? 'INTEGER' : 'DECIMAL')
                                  : typeof value === 'boolean' ? 'BOOLEAN'
                                  : typeof value === 'object' ? 'JSON'
                                  : 'VARCHAR(255)'
                              }
                              currentSchema[tableName] = { columns, ...(currentSchema[tableName] || {}) }
                            }
                          }

                          const currentData = JSON.parse(dbRef.dataJson || '{}')
                          for (const [tableName, rows] of Object.entries(finalParsed.tables)) {
                            if (Array.isArray(rows)) currentData[tableName] = rows
                          }

                          await db.database.update({
                            where: { id: dbRef.id },
                            data: {
                              schemaJson: JSON.stringify(currentSchema),
                              dataJson: JSON.stringify(currentData)
                            }
                          })

                          await db.schemaVersion.create({
                            data: {
                              schemaJson: JSON.stringify(currentSchema),
                              description: `Auto-generated from ${agentName}`,
                              databaseId: dbRef.id
                            }
                          })
                        } catch (dbError) {
                          logger.error('Chat API Stream error updating database', { error: dbError })
                        }
                      }
                    } catch (err) {
                      logger.error('Chat API Stream error saving message', { error: err })
                    }
                  })()
                }
              } catch { /* not valid JSON, skip */ }
            }
          }
        }
      })

      const pipedStream = streamResponse.pipeThrough(transformStream)

      return new Response(pipedStream, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
          'X-Conversation-Id': conversation.id
        }
      })
    }

    // ─── Non-Streaming Path (backward compatible) ──────────────
    const response = await chatCompletion({
      messages: [{ role: 'system', content: systemPrompt }, ...chatMessages],
      temperature: 0.7,
      maxTokens: 8192
    })

    const cost = estimateCost(response.tokensIn, response.tokensOut)
    const parsed = parseAgentResponse(response.content)
    const sqlCode = parsed?.sqlCode || ''
    const agentName = parsed?.agentName || currentAgentMode + '-agent'
    const options = parsed?.options || []
    const reasoningSteps = parsed?.reasoningSteps || []
    const tablesJson = parsed?.tables ? JSON.stringify(parsed.tables) : '{}'

    let piiResult: { hasPII: boolean; findings: { type: string; field: string; count: number; sample: string }[] } | null = null
    let qualityScore: { overall: number; breakdown: { completeness: number; uniqueness: number; distribution: number; referentialIntegrity: number }; issues: string[] } | null = null
    if (parsed?.tables && Object.keys(parsed.tables).length > 0) {
      try {
        piiResult = detectPII(parsed.tables)
        qualityScore = scoreDataQuality(parsed.tables)
      } catch { /* non-fatal */ }
    }

    // Save assistant message
    await db.message.create({
      data: {
        role: 'assistant',
        content: response.content,
        conversationId: conversation.id,
        tokensIn: response.tokensIn,
        tokensOut: response.tokensOut,
        cost,
        sqlCode,
        agentName,
        reasoningSteps: JSON.stringify(reasoningSteps),
        options: JSON.stringify(options),
        tablesJson
      }
    })

    // Update database schema if tables were generated
    if (parsed?.tables && Object.keys(parsed.tables).length > 0 && database) {
      try {
        const currentSchema = JSON.parse(database.schemaJson || '{}')
        for (const tableName of Object.keys(parsed.tables)) {
          const rows = parsed.tables[tableName]
          if (Array.isArray(rows) && rows.length > 0) {
            const columns: Record<string, string> = {}
            for (const [key, value] of Object.entries(rows[0])) {
              columns[key] = typeof value === 'number'
                ? (Number.isInteger(value) ? 'INTEGER' : 'DECIMAL')
                : typeof value === 'boolean' ? 'BOOLEAN'
                : typeof value === 'object' ? 'JSON'
                : 'VARCHAR(255)'
            }
            currentSchema[tableName] = { columns, ...(currentSchema[tableName] || {}) }
          }
        }

        const currentData = JSON.parse(database.dataJson || '{}')
        for (const [tableName, rows] of Object.entries(parsed.tables)) {
          if (Array.isArray(rows)) currentData[tableName] = rows
        }

        await db.database.update({
          where: { id: database.id },
          data: {
            schemaJson: JSON.stringify(currentSchema),
            dataJson: JSON.stringify(currentData)
          }
        })

        await db.schemaVersion.create({
          data: {
            schemaJson: JSON.stringify(currentSchema),
            description: `Auto-generated from ${agentName}`,
            databaseId: database.id
          }
        })
      } catch (dbError) {
        logger.error('Chat API error updating database', { error: dbError })
      }
    }

    const isFallback = response.model === 'synthforge-local-fallback'
    const schemaVersion = database?.schemaVersions?.[0]
      ? (await db.schemaVersion.count({ where: { databaseId: database.id } }))
      : 0

    return NextResponse.json({
      conversationId: conversation.id,
      message: {
        role: 'assistant',
        content: response.content,
        sqlCode,
        agentName,
        tokensIn: response.tokensIn,
        tokensOut: response.tokensOut,
        cost,
        options,
        reasoningSteps,
        tablesJson,
        isFallback,
        piiCheck: piiResult ? { hasPII: piiResult.hasPII, findings: piiResult.findings } : null,
        qualityScore: qualityScore ? { overall: qualityScore.overall, breakdown: qualityScore.breakdown } : null,
        schemaVersion
      }
    })
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : 'Failed to process chat message'
    // Check for timeout errors specifically
    if (errMsg.includes('timed out') || errMsg.includes('timeout')) {
      logger.error('Chat API timeout error', { error: errMsg })
      return NextResponse.json({
        error: 'The AI service is taking too long to respond. Please try again with a simpler request.',
        hint: 'Try reducing the complexity of your request or asking for fewer rows.'
      }, { status: 503 })
    }
    logger.error('Chat API unhandled error', { error: error instanceof Error ? error.message : String(error) })
    return NextResponse.json({
      error: errMsg.includes('API key') || errMsg.includes('apiKey') ? 'Service configuration error. Please contact support.' : errMsg,
      hint: 'The AI service may be temporarily unavailable. Please try again.'
    }, { status: 500 })
  }
}

// GET /api/chat?conversationId=xxx
export async function GET(request: NextRequest) {
  try {
    const conversationId = request.nextUrl.searchParams.get('conversationId')
    const databaseId = request.nextUrl.searchParams.get('databaseId')

    if (!conversationId && databaseId) {
      const latestConversation = await db.conversation.findFirst({
        where: { databaseId },
        include: { messages: { orderBy: { createdAt: 'asc' } } },
        orderBy: { updatedAt: 'desc' }
      })
      if (latestConversation) {
        return NextResponse.json({ conversation: latestConversation })
      }
      return NextResponse.json({ conversation: null })
    }

    if (!conversationId) {
      return NextResponse.json({ error: 'conversationId or databaseId required' }, { status: 400 })
    }
    const conversation = await db.conversation.findUnique({
      where: { id: conversationId },
      include: { messages: { orderBy: { createdAt: 'asc' } } }
    })
    if (!conversation) {
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 })
    }
    return NextResponse.json({ conversation })
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch conversation' }, { status: 500 })
  }
}
