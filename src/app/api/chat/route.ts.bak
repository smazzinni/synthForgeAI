import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { chatCompletion, chatCompletionStream, estimateCost, parseAgentResponse, getSystemPrompt, detectPII, scoreDataQuality, inferSchemaFromData, type AgentStep } from '@/lib/ai'

export const maxDuration = 120

// ─── Specialized subagent system prompts ────────────────────────
const SCHEMA_AGENT_PROMPT = `You are the SynthForge AI Schema Agent. Design a database schema based on the user's request. Return a JSON object with the schema plan including tables, columns, types, and relationships. Use the standard SynthForge AI response format with action "generate".`

const DATA_AGENT_PROMPT = `You are the SynthForge AI Data Generation Agent. Generate realistic synthetic data based on the provided schema and context. Return a JSON object with the generated tables. Use the standard SynthForge AI response format with action "generate". All data must be synthetic and privacy-safe. Maintain referential integrity. Generate at least 5-10 rows per table.`

const QUALITY_AGENT_PROMPT = `You are the SynthForge AI Quality Agent. Review the generated data for quality issues: null values in important fields, duplicate IDs, orphan foreign keys, type mismatches, and data anomalies. If you find issues, suggest fixes and regenerate corrected data. Return a JSON object with action "generate" containing any corrected tables. If no issues, return the data unchanged.`

function getSubagentPrompt(agentName: string): string {
  if (agentName.includes('schema')) return SCHEMA_AGENT_PROMPT
  if (agentName.includes('data')) return DATA_AGENT_PROMPT
  if (agentName.includes('quality')) return QUALITY_AGENT_PROMPT
  // Default: use the main auto-mode prompt
  return getSystemPrompt('auto')
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
    }

    const { conversationId, message, workspaceId, databaseId, agentMode = 'auto', stream = false, rowCount, files = [] } = body

    if (!message || typeof message !== 'string') {
      return NextResponse.json({ error: 'Message required' }, { status: 400 })
    }

    // Find or create conversation
    let conversation = conversationId
      ? await db.conversation.findUnique({ where: { id: conversationId }, include: { messages: { orderBy: { createdAt: 'asc' } } } })
      : null

    if (!conversation && databaseId) {
      // Find a valid workspaceId if not provided
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

    const currentAgentMode = agentMode || conversation.agentMode || 'auto'
    const systemPrompt = getSystemPrompt(currentAgentMode)

    // Build row count context if specified
    const rowContext = rowCount ? `\n\nUser wants to generate approximately ${rowCount} rows per table.` : ''

    const chatMessages = [
      ...previousMessages,
      { role: 'user' as const, content: message + schemaContext + fileContext + rowContext }
    ]

    // ─── Streaming Path ─────────────────────────────────────────
    if (stream) {
      const streamResponse = await chatCompletionStream({
        messages: [{ role: 'system', content: systemPrompt }, ...chatMessages],
        temperature: 0.7,
        maxTokens: 8192
      })

      // We need to process the stream, save the complete response, then pass it through
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

          // Parse SSE data to accumulate full content
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

                  // Check for multi_step action
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

                      // Mark step as running
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

                        // Accumulate tables from this step
                        if (stepParsed?.tables) {
                          allTables = { ...allTables, ...stepParsed.tables }
                        }

                        // Mark step as completed
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

                    // If any tables were generated across all steps, emit them as content
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

                      // Emit the final combined content as a content event
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
                  const stepsJson = finalParsed?.steps ? JSON.stringify(finalParsed.steps) : '[]'
                  const tablesJson = finalParsed?.tables ? JSON.stringify(finalParsed.tables) : '{}'

                  // Run PII detection and quality scoring on generated data
                  let piiResult = null
                  let qualityScore = null
                  if (finalParsed?.tables && Object.keys(finalParsed.tables).length > 0) {
                    try {
                      piiResult = detectPII(finalParsed.tables)
                      qualityScore = scoreDataQuality(finalParsed.tables)
                    } catch { /* non-fatal */ }
                  }

                  // Save assistant message (fire and forget, don't block stream)
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

                      // Update database schema if tables were generated
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
                          console.error('[Chat API Stream] Error updating database:', dbError)
                        }
                      }
                    } catch (err) {
                      console.error('[Chat API Stream] Error saving message:', err)
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

    // Run PII detection and quality scoring on generated data
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
        console.error('[Chat API] Error updating database:', dbError)
        // Non-fatal - continue to return response
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
    console.error('[Chat API] Unhandled error:', error)
    const msg = error instanceof Error ? error.message : 'Failed to process chat message'
    return NextResponse.json({
      error: msg,
      hint: 'The AI service may be temporarily unavailable. Please try again.'
    }, { status: 500 })
  }
}

// GET /api/chat?conversationId=xxx
export async function GET(request: NextRequest) {
  try {
    const conversationId = request.nextUrl.searchParams.get('conversationId')
    const databaseId = request.nextUrl.searchParams.get('databaseId')

    // If databaseId provided, find the latest conversation for that database
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
