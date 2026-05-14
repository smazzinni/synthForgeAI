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

Be concise, technical, and helpful. If they ask you to generate data, describe the schema you'd create and provide sample data in a structured JSON format like:
{
  "tables": {
    "table_name": [
      {"column1": "value1", "column2": "value2"},
      ...
    ]
  }
}

Current agent: Orchestrator`

    // Use non-streaming response for stability
    const completion = await zai.chat.completions.create({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: message },
      ],
      temperature: 0.7,
      max_tokens: 2000,
      stream: false,
    })

    const content = completion.choices?.[0]?.message?.content || 'I apologize, I could not generate a response.'

    return NextResponse.json({
      content,
      agent: 'Orchestrator',
    })
  } catch (error) {
    console.error('[Chat API] Error:', error)
    return NextResponse.json(
      { error: 'Internal server error', content: 'I apologize, but I encountered an error processing your request. Please try again.' },
      { status: 500 }
    )
  }
}
