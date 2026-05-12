import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { chatCompletion, chatCompletionStream, estimateCost, parseAgentResponse, getSystemPrompt, detectPII, scoreDataQuality, inferSchemaFromData } from '@/lib/ai'

export const maxDuration = 120

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
      files?: { name: string; content: string; type: string }[]
    }

    const { conversationId, message, workspaceId, databaseId, agentMode = 'auto', stream = false, files = [] } = body

    if (!message || typeof message !== 'string') {
      return NextResponse.json({ error: 'Message required' }, { status: 400 })
    }

    // Find or create conversation
    let conversation = conversationId
      ? await db.conversation.findUnique({ where: { id: conversationId }, include: { messages: { orderBy: { createdAt: 'asc' } } } })
      : null

    if (!conversation && databaseId) {
      conversation = await db.conversation.create({
        data: {
          title: message.slice(0, 60),
          databaseId,
          workspaceId: workspaceId || '',
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

    const chatMessages = [
      ...previousMessages,
      { role: 'user' as const, content: message + schemaContext + fileContext }
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

      let fullContent = ''
      let tokensIn = 0
      let tokensOut = 0

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
                } else if (event.type === 'done') {
                  tokensIn = event.data?.tokensIn || 0
                  tokensOut = event.data?.tokensOut || 0

                  // Save the complete response to the database asynchronously
                  const cost = estimateCost(tokensIn, tokensOut)
                  const parsed = parseAgentResponse(fullContent)
                  const sqlCode = parsed?.sqlCode || ''
                  const agentName = parsed?.agentName || currentAgentMode + '-agent'
                  const options = parsed?.options || []
                  const reasoningSteps = parsed?.reasoningSteps || []
                  const tablesJson = parsed?.tables ? JSON.stringify(parsed.tables) : '{}'

                  // Run PII detection and quality scoring on generated data
                  let piiResult = null
                  let qualityScore = null
                  if (parsed?.tables && Object.keys(parsed.tables).length > 0) {
                    try {
                      piiResult = detectPII(parsed.tables)
                      qualityScore = scoreDataQuality(parsed.tables)
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
                      if (parsed?.tables && Object.keys(parsed.tables).length > 0 && dbRef) {
                        try {
                          const currentSchema = JSON.parse(dbRef.schemaJson || '{}')
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

                          const currentData = JSON.parse(dbRef.dataJson || '{}')
                          for (const [tableName, rows] of Object.entries(parsed.tables)) {
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
