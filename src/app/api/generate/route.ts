import { NextRequest, NextResponse } from 'next/server'
import { safeTrim } from '@/lib/ai'
import { getAuthenticatedUser, AuthError } from '@/lib/auth'
import { getSupabaseAdmin } from '@/lib/supabase/admin'
import { db } from '@/lib/db'

// POST /api/generate - Generate synthetic data directly
export async function POST(request: NextRequest) {
  try {
    const _user = await getAuthenticatedUser(request)

    let body: Record<string, unknown>
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    const { prompt, rowCount = 10, format = 'json' } = body as {
      databaseId?: string; prompt?: string; rowCount?: number; format?: string
    }

    if (!prompt || typeof prompt !== 'string' || !safeTrim(prompt)) {
      return NextResponse.json({ error: 'prompt required' }, { status: 400 })
    }

    const safeRowCount = Math.max(1, Math.min(typeof rowCount === 'number' ? rowCount : 10, 1000))

    // Use z-ai-web-dev-sdk for AI generation
    const ZAI = (await import('z-ai-web-dev-sdk')).default
    const zai = await ZAI.create()

    const generatePrompt = `Generate ${safeRowCount} rows of realistic synthetic data for the following request: ${prompt}

Return ONLY a JSON object with this exact format:
{
  "action": "generate",
  "tables": {
    "table_name": [array of ${safeRowCount} row objects with realistic data]
  },
  "sqlCode": "INSERT INTO table_name (columns) VALUES (values);",
  "explanation": "Brief explanation"
}

Important:
- Generate realistic, diverse data - not sequential or placeholder values
- Use proper data types for each column
- Include realistic names, addresses, emails etc. where appropriate
- All PII should be synthetic, never real
- Make the data varied and natural-looking`

    const completion = await zai.chat.completions.create({
      messages: [{ role: 'user', content: generatePrompt }],
      temperature: 0.8,
      max_tokens: 4096,
    })

    const content = completion.choices?.[0]?.message?.content || ''

    // Parse the response
    let parsed: { tables?: Record<string, unknown[]>; action?: string; explanation?: string } | null = null
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/)
      if (jsonMatch) parsed = JSON.parse(jsonMatch[0])
    } catch { /* not json */ }

    if (parsed?.tables) {
      return NextResponse.json({ generated: parsed })
    }

    return NextResponse.json({ content })
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode })
    }
    console.error('[Generate API] Error:', error)
    const msg = error instanceof Error ? error.message : 'Failed to generate data'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
