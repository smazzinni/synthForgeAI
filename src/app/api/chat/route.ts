import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { chatCompletionStream, chatCompletion, estimateCost, parseAgentResponse, getSystemPrompt } from '@/lib/ai'

// POST /api/chat - Send message and get AI response
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { conversationId, message, workspaceId, databaseId, stream = true, agentMode = 'auto', files = [] } = body

    if (!message || typeof message !== 'string') {
      return NextResponse.json({ error: 'Message required' }, { status: 400 })
    }

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

    // Update agent mode if changed
    if (agentMode && agentMode !== conversation.agentMode) {
      await db.conversation.update({
        where: { id: conversation.id },
        data: { agentMode }
      })
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
    const database = await db.database.findUnique({ where: { id: conversation.databaseId } })
    const schemaContext = database?.schemaJson && database.schemaJson !== '{}' ? `\n\nCurrent database schema:\n${database.schemaJson}` : ''
    const dataContext = database?.dataJson && database.dataJson !== '{}' ? `\nCurrent data summary:\n${Object.keys(JSON.parse(database.dataJson || '{}')).map(t => `${t} (${Array.isArray((JSON.parse(database.dataJson || '{}')[t])) ? (JSON.parse(database.dataJson || '{}')[t]).length : 0} rows)`).join(', ')}` : ''

    // Build file context
    let fileContext = ''
    if (files && files.length > 0) {
      fileContext = `\n\nAttached files:\n${files.map((f: { name: string; content: string; type: string }) => `--- ${f.name} (${f.type}) ---\n${f.content?.slice(0, 3000)}`).join('\n\n')}`
    }

    // Build conversation history (last 20 messages for context window)
    const previousMessages = (conversation.messages || [])
      .slice(-20)
      .map((m: { role: string; content: string }) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content
      }))

    const currentAgentMode = agentMode || conversation.agentMode || 'auto'
    const systemPrompt = getSystemPrompt(currentAgentMode)

    const chatMessages = [
      ...previousMessages,
      { role: 'user' as const, content: message + schemaContext + dataContext + fileContext }
    ]

    if (stream) {
      // Streaming response
      const aiStream = await chatCompletionStream({
        messages: [{ role: 'system', content: systemPrompt }, ...chatMessages],
        temperature: 0.7,
        maxTokens: 8192
      })

      // We need to collect the full response to save it
      let fullContent = ''
      const transformStream = new TransformStream({
        async transform(chunk, controller) {
          controller.enqueue(chunk)
          const text = new TextDecoder().decode(chunk)
          const lines = text.split('\n')
          for (const line of lines) {
            if (line.startsWith('data: ') && line !== 'data: [DONE]') {
              try {
                const data = JSON.parse(line.slice(6))
                fullContent += data.content || ''
              } catch { /* skip */ }
            }
          }
        },
        async flush() {
          try {
            const parsed = parseAgentResponse(fullContent)
            const sqlCode = parsed?.sqlCode || ''
            const agentName = parsed?.agentName || currentAgentMode + '-agent'
            const options = parsed?.options || []
            const reasoningSteps = parsed?.reasoningSteps || []
            const tablesJson = parsed?.tables ? JSON.stringify(parsed.tables) : '{}'

            await db.message.create({
              data: {
                role: 'assistant',
                content: fullContent,
                conversationId: conversation!.id,
                tokensIn: 0,
                tokensOut: 0,
                cost: 0,
                sqlCode,
                agentName,
                reasoningSteps: JSON.stringify(reasoningSteps),
                options: JSON.stringify(options),
                tablesJson
              }
            })

            // Update database schema if tables were generated
            if (parsed?.tables && Object.keys(parsed.tables).length > 0 && database) {
              const currentSchema = JSON.parse(database.schemaJson || '{}')
              // Merge schema info from generated data
              for (const tableName of Object.keys(parsed.tables)) {
                const rows = parsed.tables[tableName]
                if (Array.isArray(rows) && rows.length > 0) {
                  const columns: Record<string, string> = {}
                  for (const [key, value] of Object.entries(rows[0])) {
                    columns[key] = typeof value === 'number' ? (Number.isInteger(value) ? 'INTEGER' : 'DECIMAL') : typeof value === 'boolean' ? 'BOOLEAN' : typeof value === 'object' ? 'JSON' : 'VARCHAR(255)'
                  }
                  if (!currentSchema[tableName]) {
                    currentSchema[tableName] = { columns }
                  }
                }
              }

              // Update data
              const currentData = JSON.parse(database.dataJson || '{}')
              for (const [tableName, rows] of Object.entries(parsed.tables)) {
                if (Array.isArray(rows)) {
                  currentData[tableName] = rows
                }
              }

              await db.database.update({
                where: { id: database.id },
                data: {
                  schemaJson: JSON.stringify(currentSchema),
                  dataJson: JSON.stringify(currentData)
                }
              })

              // Create schema version
              await db.schemaVersion.create({
                data: {
                  schemaJson: JSON.stringify(currentSchema),
                  description: `Auto-generated from ${agentName}`,
                  databaseId: database.id
                }
              })
            }
          } catch (e) {
            console.error('Error saving streamed message:', e)
          }
        }
      })

      const transformedStream = aiStream.pipeThrough(transformStream)

      return new Response(transformedStream, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
          'X-Conversation-Id': conversation.id
        }
      })
    } else {
      // Non-streaming response
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
        const currentSchema = JSON.parse(database.schemaJson || '{}')
        for (const tableName of Object.keys(parsed.tables)) {
          const rows = parsed.tables[tableName]
          if (Array.isArray(rows) && rows.length > 0) {
            const columns: Record<string, string> = {}
            for (const [key, value] of Object.entries(rows[0])) {
              columns[key] = typeof value === 'number' ? (Number.isInteger(value) ? 'INTEGER' : 'DECIMAL') : typeof value === 'boolean' ? 'BOOLEAN' : typeof value === 'object' ? 'JSON' : 'VARCHAR(255)'
            }
            if (!currentSchema[tableName]) {
              currentSchema[tableName] = { columns }
            }
          }
        }

        const currentData = JSON.parse(database.dataJson || '{}')
        for (const [tableName, rows] of Object.entries(parsed.tables)) {
          if (Array.isArray(rows)) {
            currentData[tableName] = rows
          }
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
      }

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
          tablesJson
        }
      })
    }
  } catch (error) {
    console.error('Chat error:', error)
    return NextResponse.json({ error: 'Failed to process chat message' }, { status: 500 })
  }
}

// GET /api/chat?conversationId=xxx - Get conversation history
export async function GET(request: NextRequest) {
  try {
    const conversationId = request.nextUrl.searchParams.get('conversationId')
    if (!conversationId) {
      return NextResponse.json({ error: 'conversationId required' }, { status: 400 })
    }

    const conversation = await db.conversation.findUnique({
      where: { id: conversationId },
      include: {
        messages: {
          orderBy: { createdAt: 'asc' }
        }
      }
    })

    if (!conversation) {
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 })
    }

    return NextResponse.json({ conversation })
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch conversation' }, { status: 500 })
  }
}
