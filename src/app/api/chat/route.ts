import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { chatCompletionStream, chatCompletion, estimateCost, parseAgentResponse } from '@/lib/ai'

// POST /api/chat - Send message and get AI response
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { conversationId, message, workspaceId, databaseId, stream = true } = body

    if (!message || typeof message !== 'string') {
      return NextResponse.json({ error: 'Message required' }, { status: 400 })
    }

    let conversation = conversationId
      ? await db.conversation.findUnique({ where: { id: conversationId }, include: { messages: true } })
      : null

    if (!conversation && databaseId) {
      conversation = await db.conversation.create({
        data: {
          title: message.slice(0, 60),
          databaseId,
          workspaceId: workspaceId || ''
        },
        include: { messages: true }
      })
    }

    if (!conversation) {
      return NextResponse.json({ error: 'Conversation not found and no databaseId provided' }, { status: 400 })
    }

    // Save user message
    const userMsg = await db.message.create({
      data: {
        role: 'user',
        content: message,
        conversationId: conversation.id
      }
    })

    // Get database schema for context
    const database = await db.database.findUnique({ where: { id: conversation.databaseId } })
    const schemaContext = database?.schemaJson ? `\n\nCurrent database schema:\n${database.schemaJson}` : ''

    // Build conversation history
    const previousMessages = conversation.messages
      .sort((a: { createdAt: Date }, b: { createdAt: Date }) => a.createdAt.getTime() - b.createdAt.getTime())
      .map((m: { role: string; content: string }) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content
      }))

    const chatMessages = [
      ...previousMessages,
      { role: 'user' as const, content: message + schemaContext }
    ]

    if (stream) {
      // Streaming response
      const aiStream = await chatCompletionStream({
        messages: chatMessages,
        temperature: 0.7,
        maxTokens: 4096
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
          // Save the assistant message after streaming completes
          try {
            const parsed = parseAgentResponse(fullContent)
            const sqlCode = parsed?.sqlCode || ''

            await db.message.create({
              data: {
                role: 'assistant',
                content: fullContent,
                conversationId: conversation!.id,
                tokensIn: 0,
                tokensOut: 0,
                cost: 0,
                sqlCode
              }
            })

            // Update database schema if tables were generated
            if (parsed?.tables && Object.keys(parsed.tables).length > 0 && database) {
              const currentSchema = JSON.parse(database.schemaJson || '{}')
              const updatedSchema = { ...currentSchema, ...parsed.tables }
              await db.database.update({
                where: { id: database.id },
                data: { schemaJson: JSON.stringify(updatedSchema) }
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
        messages: chatMessages,
        temperature: 0.7,
        maxTokens: 4096
      })

      const cost = estimateCost(response.tokensIn, response.tokensOut)
      const parsed = parseAgentResponse(response.content)
      const sqlCode = parsed?.sqlCode || ''

      await db.message.create({
        data: {
          role: 'assistant',
          content: response.content,
          conversationId: conversation.id,
          tokensIn: response.tokensIn,
          tokensOut: response.tokensOut,
          cost,
          sqlCode
        }
      })

      // Update database schema if tables were generated
      if (parsed?.tables && Object.keys(parsed.tables).length > 0 && database) {
        const currentSchema = JSON.parse(database.schemaJson || '{}')
        const updatedSchema = { ...currentSchema, ...parsed.tables }
        await db.database.update({
          where: { id: database.id },
          data: { schemaJson: JSON.stringify(updatedSchema) }
        })
      }

      return NextResponse.json({
        conversationId: conversation.id,
        message: {
          role: 'assistant',
          content: response.content,
          sqlCode,
          tokensIn: response.tokensIn,
          tokensOut: response.tokensOut,
          cost
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
