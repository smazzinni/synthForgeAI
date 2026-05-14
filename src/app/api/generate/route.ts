import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { chatCompletion, estimateCost, safeTrim } from '@/lib/ai'
import { getAuthenticatedUser, AuthError, verifyDatabaseAccess } from '@/lib/auth'

// POST /api/generate - Generate synthetic data directly (tenant-scoped)
export async function POST(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request)

    // Body size limit check
    const contentLength = request.headers.get('content-length')
    if (contentLength && parseInt(contentLength, 10) > 1_048_576) {
      return NextResponse.json({ error: 'Request body too large (max 1MB)' }, { status: 413 })
    }

    let body: Record<string, unknown>
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    const { databaseId, prompt, rowCount = 10, format = 'json' } = body as {
      databaseId?: string; prompt?: string; rowCount?: number; format?: string
    }

    if (!databaseId || typeof databaseId !== 'string') {
      return NextResponse.json({ error: 'databaseId required' }, { status: 400 })
    }
    if (!prompt || typeof prompt !== 'string' || !safeTrim(prompt)) {
      return NextResponse.json({ error: 'prompt required' }, { status: 400 })
    }

    // Verify database belongs to user
    const dbAccess = await verifyDatabaseAccess(databaseId, user.userId)
    if (!dbAccess) {
      return NextResponse.json({ error: 'Database not found or access denied' }, { status: 403 })
    }

    // Validate rowCount is a reasonable number
    const safeRowCount = Math.max(1, Math.min(typeof rowCount === 'number' ? rowCount : 10, 1000))

    const database = await db.database.findUnique({ where: { id: databaseId } })
    if (!database) {
      return NextResponse.json({ error: 'Database not found' }, { status: 404 })
    }

    const schemaContext = database.schemaJson ? `\n\nSchema: ${database.schemaJson}` : ''

    const generatePrompt = `Generate ${safeRowCount} rows of realistic synthetic data for the following request: ${prompt}${schemaContext}

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

    const response = await chatCompletion({
      messages: [{ role: 'user', content: generatePrompt }],
      temperature: 0.8,
      maxTokens: 4096
    })

    const cost = estimateCost(response.tokensIn, response.tokensOut)

    // Parse the response
    let parsed: { tables?: Record<string, unknown[]>; action?: string; explanation?: string } | null = null
    try {
      const jsonMatch = response.content.match(/\{[\s\S]*\}/)
      if (jsonMatch) parsed = JSON.parse(jsonMatch[0])
    } catch { /* not json */ }

    // Save as dataset if we got data
    if (parsed?.tables) {
      const dataset = await db.dataset.create({
        data: {
          name: `Generated - ${new Date().toLocaleString()}`,
          format,
          rowCount: safeRowCount,
          dataJson: JSON.stringify(parsed.tables),
          schemaJson: database.schemaJson,
          databaseId
        }
      })
      return NextResponse.json({ dataset, generated: parsed, cost })
    }

    return NextResponse.json({ content: response.content, cost })
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode })
    }
    console.error('[Generate API] Error:', error)
    const msg = error instanceof Error ? error.message : 'Failed to generate data'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
