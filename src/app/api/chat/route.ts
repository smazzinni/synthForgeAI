import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { message } = body

    if (!message || typeof message !== 'string') {
      return NextResponse.json({ error: 'Message is required' }, { status: 400 })
    }

    // Use z-ai-web-dev-sdk for AI chat
    const ZAI = (await import('z-ai-web-dev-sdk')).default
    const zai = await ZAI.create()

    const systemPrompt = `You are SynthForge AI, an expert synthetic data generation assistant. You help users design database schemas and generate realistic synthetic data.

When users describe their data needs:
1. Understand their requirements (tables, relationships, constraints, volume)
2. Design an appropriate database schema
3. Suggest data generation strategies
4. Ensure privacy compliance and data quality

Be concise, technical, and helpful. If they ask you to generate data, describe the schema you'd create and provide sample data in a structured format.

Current agent: Orchestrator`

    // Create a streaming response
    const encoder = new TextEncoder()
    const stream = new ReadableStream({
      async start(controller) {
        try {
          const completion = await zai.chat.completions.create({
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: message },
            ],
            temperature: 0.7,
            max_tokens: 2000,
            stream: true,
          })

          // Check if completion is a stream
          if (Symbol.asyncIterator in completion) {
            for await (const chunk of completion as AsyncIterable<{ choices: { delta: { content?: string } }[] }>) {
              const content = chunk.choices?.[0]?.delta?.content
              if (content) {
                controller.enqueue(
                  encoder.encode(`data: ${JSON.stringify({ content, agent: 'Orchestrator' })}\n\n`)
                )
              }
            }
          } else {
            // Non-streaming response
            const response = completion as { choices: { message: { content: string } }[] }
            const content = response.choices?.[0]?.message?.content || 'I apologize, I could not generate a response.'
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ content, agent: 'Orchestrator' })}\n\n`)
            )
          }

          controller.enqueue(encoder.encode('data: [DONE]\n\n'))
          controller.close()
        } catch (error) {
          console.error('[Chat API] Error:', error)
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                content: 'I apologize, but I encountered an error processing your request. Please try again.',
                agent: 'System',
              })}\n\n`
            )
          )
          controller.enqueue(encoder.encode('data: [DONE]\n\n'))
          controller.close()
        }
      },
    })

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    })
  } catch (error) {
    console.error('[Chat API] Outer error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
