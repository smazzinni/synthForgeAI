import { NextRequest, NextResponse } from 'next/server'

// ─── Rate limiter with automatic cleanup ───
const chatRateLimiter = new Map<string, { count: number; resetAt: number }>()
const CHAT_RATE_LIMIT = 10
const CHAT_RATE_WINDOW = 60000

// Periodic cleanup
let lastCleanup = Date.now()
const CLEANUP_INTERVAL = 120000

function cleanup() {
  const now = Date.now()
  if (now - lastCleanup < CLEANUP_INTERVAL) return
  lastCleanup = now

  for (const [key, entry] of chatRateLimiter.entries()) {
    if (now > entry.resetAt) {
      chatRateLimiter.delete(key)
    }
  }
}

function getClientId(request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-for')
  const ip = forwarded ? forwarded.split(',')[0] : 'unknown'
  return ip
}

function checkChatRateLimit(clientId: string): boolean {
  const key = `chat:${clientId}`
  const now = Date.now()
  const entry = chatRateLimiter.get(key)

  if (!entry || now > entry.resetAt) {
    chatRateLimiter.set(key, { count: 1, resetAt: now + CHAT_RATE_WINDOW })
    return true
  }

  if (entry.count >= CHAT_RATE_LIMIT) {
    return false
  }

  entry.count++
  return true
}

export async function POST(request: NextRequest) {
  cleanup() // Periodic memory cleanup

  // Rate limit check
  const clientId = getClientId(request)
  if (!checkChatRateLimit(clientId)) {
    return NextResponse.json(
      { error: 'Too many requests. Please wait a moment before sending another message.' },
      { status: 429 }
    )
  }

  try {
    // Limit request body size
    const text = await request.text()
    if (text.length > 10000) { // 10KB limit for chat messages
      return NextResponse.json(
        { error: 'Message too long. Please keep messages under 10,000 characters.' },
        { status: 413 }
      )
    }

    const body = JSON.parse(text)
    const { message, databaseId, databaseName } = body

    if (!message || typeof message !== 'string') {
      return NextResponse.json({ error: 'Message is required' }, { status: 400 })
    }

    // Use z-ai-web-dev-sdk for AI chat
    const ZAI = (await import('z-ai-web-dev-sdk')).default
    const zai = await ZAI.create()

    const contextInfo = databaseId
      ? `\n\nThe user is currently editing database "${databaseName || databaseId}" (ID: ${databaseId}). Help them modify or extend the existing data.`
      : ''

    const systemPrompt = `You are SynthForge AI, an expert synthetic data generation assistant. You help users design database schemas and generate realistic synthetic data.${contextInfo}

When users describe their data needs:
1. Understand their requirements (tables, relationships, constraints, volume)
2. Design an appropriate database schema
3. Generate realistic sample data (5-10 rows per table)
4. Ensure privacy compliance and data quality

IMPORTANT: When generating data, you MUST respond with a JSON code block in this exact format:
\`\`\`json
{
  "tables": {
    "table_name": [
      {"column1": "value1", "column2": "value2"},
      {"column2": "value1", "column2": "value2"}
    ]
  }
}
\`\`\`

Rules for data generation:
- Use realistic values (real-looking names, emails, addresses, phone numbers)
- Use proper data types (numbers for quantities, ISO dates for timestamps, UUIDs for IDs)
- Include foreign key relationships between tables where appropriate
- Generate 5-10 rows per table
- Always include an "id" column as UUID for each table
- Include timestamps (created_at) as ISO 8601 strings

You can explain your design decisions before the JSON block, but always include the JSON code block with the actual data.
Do NOT include "thinking" tags or internal reasoning in your response.

Current agent: Orchestrator`

    const completion = await zai.chat.completions.create({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: message },
      ],
      temperature: 0.7,
      max_tokens: 3000,
      stream: false,
    })

    let content = completion.choices?.[0]?.message?.content || 'I apologize, I could not generate a response.'

    // Clean up any <think|thinking> tags from the AI response
    content = content.replace(/<think[\s\S]*?<\/think>/gi, '')
    content = content.replace(/<thinking[\s\S]*?<\/thinking>/gi, '')
    content = content.trim()

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
