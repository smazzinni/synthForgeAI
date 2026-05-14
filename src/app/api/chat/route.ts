import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { chatCompletion, chatCompletionStream, estimateCost, parseAgentResponse, getSystemPrompt, getSubagentPrompt, detectPII, scoreDataQuality, inferSchemaFromData, type AgentStep, type PIIDetectionResult, type DataQualityScore } from '@/lib/ai'
import { broadcastAgentStep, broadcastAgentReasoning, broadcastDataChunk, broadcastDataComplete } from '@/lib/websocket'

export const maxDuration = 60

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
      let streamResponse: ReadableStream<Uint8Array>
      try {
        streamResponse = await chatCompletionStream({
          messages: [{ role: 'system', content: systemPrompt }, ...chatMessages],
          temperature: 0.7,
          maxTokens: 8192
        })
      } catch (streamErr) {
        const errMsg = streamErr instanceof Error ? streamErr.message : 'Stream creation failed'
        return NextResponse.json({ error: errMsg, hint: 'AI service may be temporarily unavailable.' }, { status: 503 })
      }

      const conversationId_ = conversation.id
      const databaseId_ = conversation.databaseId
      const dbRef = database
      const encoder = new TextEncoder()

      let fullContent = ''
      let tokensIn = 0
      let tokensOut = 0
      let multiStepHandled = false

      let streamClosed = false
      const transformStream = new TransformStream<Uint8Array, Uint8Array>({
        async transform(chunk, controller) {
          const safeEnqueue = (data: Uint8Array) => {
            if (streamClosed) return
            try {
              if (controller.desiredSize !== null) {
                controller.enqueue(data)
              }
            } catch {
              streamClosed = true
            }
          }

          safeEnqueue(chunk)

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
                  if (!streamClosed) {
                    const parsed = parseAgentResponse(fullContent)

                    if (parsed?.action === 'multi_step' && parsed.steps && parsed.steps.length > 0) {
                      // ─── Multi-Step Agent Execution ──────────────────
                      multiStepHandled = true
                      const agentSteps: AgentStep[] = parsed.steps
                      // Limit steps to prevent runaway pipelines (max 4 steps in streaming mode)
                      const stepsToExecute = agentSteps.slice(0, 4)
                      if (agentSteps.length > 4) {
                        safeEnqueue(encoder.encode(`data: ${JSON.stringify({
                          type: 'agent_step',
                          data: { stepIndex: -1, agent: 'orchestrator', task: `Pipeline limited to 4 steps (${agentSteps.length} requested)`, status: 'completed' }
                        })}\n\n`))
                      }
                      let accumulatedContext = fullContent
                      let allTables: Record<string, Record<string, unknown>[]> = {}
                      let allReasoningSteps: Array<{ type: string; label: string; description: string; status: string; output?: string }> = []

                      // Add initial reasoning from orchestrator
                      if (parsed.reasoningSteps) {
                        allReasoningSteps.push(...parsed.reasoningSteps)
                      }

                      // Emit initial step plan
                      for (let i = 0; i < stepsToExecute.length; i++) {
                        if (streamClosed) break
                        safeEnqueue(encoder.encode(`data: ${JSON.stringify({
                          type: 'agent_step',
                          data: { stepIndex: i, agent: stepsToExecute[i].agent, task: stepsToExecute[i].task, status: 'pending' }
                        })}\n\n`))
                      }

                      // Execute each step sequentially
                      for (let i = 0; i < stepsToExecute.length; i++) {
                        if (streamClosed) break
                        const step = stepsToExecute[i]

                        // Mark step as running
                        safeEnqueue(encoder.encode(`data: ${JSON.stringify({
                          type: 'agent_step',
                          data: { stepIndex: i, agent: step.agent, task: step.task, status: 'running' }
                        })}\n\n`))
                        // WebSocket broadcast for agent step
                        try { broadcastAgentStep(conversationId_, { stepIndex: i, agent: step.agent, task: step.task, status: 'running' }) } catch { /* non-fatal */ }

                        try {
                          const subagentPrompt = getSubagentPrompt(step.agent)

                          // Build context-aware messages for the subagent
                          const subagentMessages = [
                            { role: 'system' as const, content: subagentPrompt },
                            { role: 'user' as const, content: `Task: ${step.task}\n\nPrevious context:\n${accumulatedContext.slice(-4000)}${schemaContext ? '\n\nDatabase Schema:\n' + schemaContext : ''}` }
                          ]

                          const stepResponse = await Promise.race([
                            chatCompletion({
                              messages: subagentMessages,
                              temperature: 0.7,
                              maxTokens: 4096
                            }),
                            new Promise<never>((_, reject) =>
                              setTimeout(() => reject(new Error('Step timed out')), 30_000)
                            )
                          ])

                          const stepParsed = parseAgentResponse(stepResponse.content)
                          const stepOutput = stepParsed?.explanation || stepResponse.content.slice(0, 200)

                          // Collect reasoning steps from this agent
                          if (stepParsed?.reasoningSteps) {
                            allReasoningSteps.push(...stepParsed.reasoningSteps)
                          } else {
                            // Add generic reasoning for this step
                            allReasoningSteps.push({
                              type: 'execution',
                              label: `${step.agent} - ${step.task.slice(0, 50)}`,
                              description: step.task,
                              status: 'completed',
                              output: stepOutput
                            })
                          }

                          // Accumulate tables from this step
                          if (stepParsed?.tables) {
                            allTables = { ...allTables, ...stepParsed.tables }
                          }

                          // Mark step as completed
                          safeEnqueue(encoder.encode(`data: ${JSON.stringify({
                            type: 'agent_step',
                            data: {
                              stepIndex: i, agent: step.agent, task: step.task,
                              status: 'completed', output: stepOutput,
                              tables: stepParsed?.tables ? Object.keys(stepParsed.tables) : [],
                              reasoningSteps: stepParsed?.reasoningSteps || []
                            }
                          })}\n\n`))
                          // WebSocket broadcast for completed step
                          try { broadcastAgentStep(conversationId_, { stepIndex: i, agent: step.agent, task: step.task, status: 'completed', output: stepOutput }) } catch { /* non-fatal */ }

                          accumulatedContext += `\n\nStep ${i + 1} (${step.agent}) output: ${stepOutput}`
                          tokensIn += stepResponse.tokensIn
                          tokensOut += stepResponse.tokensOut
                        } catch (stepErr) {
                          const stepErrMsg = stepErr instanceof Error ? stepErr.message : 'Step failed'
                          safeEnqueue(encoder.encode(`data: ${JSON.stringify({
                            type: 'agent_step',
                            data: { stepIndex: i, agent: step.agent, task: step.task, status: 'failed', output: stepErrMsg }
                          })}\n\n`))
                          allReasoningSteps.push({
                            type: 'execution',
                            label: `${step.agent} - Failed`,
                            description: step.task,
                            status: 'failed',
                            output: stepErrMsg
                          })
                        }
                      }

                      // If any tables were generated across all steps, emit them with chunked data support
                      if (Object.keys(allTables).length > 0 && !streamClosed) {
                        // Progressive data emission - send tables in chunks for large datasets
                        for (const [tableName, rows] of Object.entries(allTables)) {
                          if (Array.isArray(rows) && rows.length > 50 && !streamClosed) {
                            // Split into chunks of 25 rows for progressive loading
                            const chunkSize = 25
                            for (let j = 0; j < rows.length; j += chunkSize) {
                              if (streamClosed) break
                              const chunk = rows.slice(j, j + chunkSize)
                              safeEnqueue(encoder.encode(`data: ${JSON.stringify({
                                type: 'data_chunk',
                                data: { tableName, rows: chunk, offset: j, total: rows.length }
                              })}\n\n`))
                              // WebSocket broadcast for data chunk
                              try { broadcastDataChunk(databaseId_, { tableName, rows: chunk, offset: j, total: rows.length }) } catch { /* non-fatal */ }
                            }
                          }
                        }

                        const finalContent = JSON.stringify({
                          action: 'generate',
                          agentName: 'orchestrator',
                          explanation: parsed.explanation + '\n\nAll pipeline steps completed successfully.',
                          tables: allTables,
                          steps: agentSteps.map((s, idx) => ({ ...s, status: 'completed' })),
                          reasoningSteps: allReasoningSteps
                        })
                        fullContent = finalContent

                        // Emit the final combined content as a content event
                        safeEnqueue(encoder.encode(`data: ${JSON.stringify({
                          type: 'content',
                          data: finalContent
                        })}\n\n`))
                        // WebSocket broadcast for data complete
                        try { broadcastDataComplete(databaseId_, Object.keys(allTables), Object.values(allTables).reduce((s, r) => s + (Array.isArray(r) ? r.length : 0), 0)) } catch { /* non-fatal */ }
                      }
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
                  let piiResult: ReturnType<typeof detectPII> | null = null
                  let qualityScore: ReturnType<typeof scoreDataQuality> | null = null
                  if (finalParsed?.tables && Object.keys(finalParsed.tables).length > 0) {
                    try {
                      piiResult = detectPII(finalParsed.tables)
                      qualityScore = scoreDataQuality(finalParsed.tables)
                    } catch { /* non-fatal */ }
                  }

                  // Save assistant message and update database in background (non-blocking)
                  // Chunked database update for large datasets
                  const savePromise = (async () => {
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

                      // Chunked database update for large datasets
                      if (finalParsed?.tables && Object.keys(finalParsed.tables).length > 0 && dbRef) {
                        try {
                          const currentSchema = JSON.parse(dbRef.schemaJson || '{}')
                          const currentData = JSON.parse(dbRef.dataJson || '{}')

                          // Update schema first
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

                          // Merge data (append rows to existing tables)
                          for (const [tableName, rows] of Object.entries(finalParsed.tables)) {
                            if (Array.isArray(rows)) {
                              const existingRows = Array.isArray(currentData[tableName]) ? currentData[tableName] : []
                              currentData[tableName] = [...existingRows, ...rows]
                            }
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
                  savePromise.catch(() => {})
                }
              } catch { /* not valid JSON, skip */ }
            }
          }
        }
      })

      try {
        const pipedStream = streamResponse.pipeThrough(transformStream)

        return new Response(pipedStream, {
          headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
            'X-Conversation-Id': conversation.id
          }
        })
      } catch (pipeErr) {
        console.error('[Chat API Stream] Pipe error:', pipeErr)
        return NextResponse.json({ error: 'Stream processing failed' }, { status: 500 })
      }
    }

    // ─── Non-Streaming Path (backward compatible) ──────────────
    const response = await chatCompletion({
      messages: [{ role: 'system', content: systemPrompt }, ...chatMessages],
      temperature: 0.7,
      maxTokens: 4096
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
      }
    }

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
