// AI Orchestration Layer - Provider-agnostic abstraction
// DeepSeek is the default provider; the system never exposes provider names to users

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface ChatRequest {
  messages: ChatMessage[]
  temperature?: number
  maxTokens?: number
  stream?: boolean
}

export interface ChatResponse {
  content: string
  tokensIn: number
  tokensOut: number
  model: string
}

export interface GenerateDataRequest {
  schema: Record<string, unknown>
  prompt: string
  rowCount: number
  format: string
  existingData?: Record<string, unknown[]>
}

const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY || ''
const DEEPSEEK_BASE_URL = 'https://api.deepseek.com/v1'

const SYSTEM_PROMPT = `You are SynthForge AI, an advanced synthetic data generation agent. You help users create realistic, privacy-safe synthetic data through natural conversation.

Your capabilities:
- Generate synthetic data for any schema or domain
- Parse and understand SQL DDL, JSON schemas, CSV headers, and natural language descriptions
- Maintain referential integrity across related tables
- Detect and mask PII in any seed data provided
- Produce data in multiple formats (JSON, CSV, SQL)
- Support iterative refinement through conversation

Rules:
1. NEVER mention DeepSeek, OpenAI, Claude, or any LLM provider name. You are SynthForge AI.
2. When generating data, always return valid JSON arrays of objects.
3. Ensure all foreign key relationships are satisfied.
4. Generate realistic data with proper distributions - not just sequential or random values.
5. For each generation action, also provide the equivalent SQL INSERT statements in a sqlCode field.
6. If a schema is ambiguous, ask for clarification rather than guessing.
7. Always wrap generated data in a structured response with the format:
   {
     "action": "generate" | "modify" | "clarify",
     "tables": { "tableName": [{ ...rows }] },
     "sqlCode": "INSERT INTO ... VALUES ...;",
     "explanation": "Brief description of what was generated"
   }
8. For PII columns (names, emails, phones, SSNs, etc.), always generate synthetic values, never real ones.
9. Respect data types and constraints specified in the schema.`

export async function chatCompletion(request: ChatRequest): Promise<ChatResponse> {
  const messages: ChatMessage[] = [
    { role: 'system', content: SYSTEM_PROMPT },
    ...request.messages
  ]

  const response = await fetch(`${DEEPSEEK_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${DEEPSEEK_API_KEY}`
    },
    body: JSON.stringify({
      model: 'deepseek-chat',
      messages,
      temperature: request.temperature ?? 0.7,
      max_tokens: request.maxTokens ?? 4096,
      stream: false
    })
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`AI service error: ${response.status} - ${error}`)
  }

  const data = await response.json()
  return {
    content: data.choices[0]?.message?.content || '',
    tokensIn: data.usage?.prompt_tokens || 0,
    tokensOut: data.usage?.completion_tokens || 0,
    model: 'synthforge-v1'
  }
}

export async function chatCompletionStream(request: ChatRequest): Promise<ReadableStream<Uint8Array>> {
  const messages: ChatMessage[] = [
    { role: 'system', content: SYSTEM_PROMPT },
    ...request.messages
  ]

  const response = await fetch(`${DEEPSEEK_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${DEEPSEEK_API_KEY}`
    },
    body: JSON.stringify({
      model: 'deepseek-chat',
      messages,
      temperature: request.temperature ?? 0.7,
      max_tokens: request.maxTokens ?? 4096,
      stream: true
    })
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`AI service error: ${response.status} - ${error}`)
  }

  if (!response.body) {
    throw new Error('No response body')
  }

  // Transform DeepSeek SSE stream to our format
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  const encoder = new TextEncoder()

  return new ReadableStream({
    async pull(controller) {
      const { done, value } = await reader.read()
      if (done) {
        controller.close()
        return
      }

      const chunk = decoder.decode(value, { stream: true })
      const lines = chunk.split('\n')

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6).trim()
          if (data === '[DONE]') {
            controller.enqueue(encoder.encode('data: [DONE]\n\n'))
            continue
          }
          try {
            const parsed = JSON.parse(data)
            const content = parsed.choices?.[0]?.delta?.content || ''
            if (content) {
              const payload = JSON.stringify({
                content,
                model: 'synthforge-v1',
                tokensIn: 0,
                tokensOut: 0
              })
              controller.enqueue(encoder.encode(`data: ${payload}\n\n`))
            }
          } catch {
            // Skip malformed chunks
          }
        }
      }
    },
    cancel() {
      reader.cancel()
    }
  })
}

export function parseAgentResponse(content: string): {
  action: string
  tables: Record<string, Record<string, unknown>[]>
  sqlCode: string
  explanation: string
} | null {
  try {
    // Try to extract JSON from the response
    const jsonMatch = content.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0])
      return {
        action: parsed.action || 'generate',
        tables: parsed.tables || {},
        sqlCode: parsed.sqlCode || '',
        explanation: parsed.explanation || ''
      }
    }
  } catch {
    // Not JSON - return null, the content is just text
  }
  return null
}

export function estimateCost(tokensIn: number, tokensOut: number): number {
  // Approximate cost calculation (DeepSeek pricing)
  const inputCost = (tokensIn / 1_000_000) * 0.27
  const outputCost = (tokensOut / 1_000_000) * 1.10
  return inputCost + outputCost
}
