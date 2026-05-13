import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { chatCompletion, estimateCost } from '@/lib/ai'

// POST /api/generate - Generate synthetic data directly
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { databaseId, prompt, rowCount = 10, format = 'json' } = body

    if (!databaseId || !prompt) {
      return NextResponse.json({ error: 'databaseId and prompt required' }, { status: 400 })
    }

    const database = await db.database.findUnique({ where: { id: databaseId } })
    if (!database) {
      return NextResponse.json({ error: 'Database not found' }, { status: 404 })
    }

    const schemaContext = database.schemaJson ? `\n\nSchema: ${database.schemaJson}` : ''

    const generatePrompt = `Generate ${rowCount} rows of realistic synthetic data for the following request: ${prompt}${schemaContext}

Return ONLY a JSON object with this exact format:
{
  "action": "generate",
  "tables": {
    "table_name": [array of ${rowCount} row objects with realistic data]
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
          rowCount,
          dataJson: JSON.stringify(parsed.tables),
          schemaJson: database.schemaJson,
          databaseId
        }
      })
      return NextResponse.json({ dataset, generated: parsed, cost })
    }

    return NextResponse.json({ content: response.content, cost })
  } catch (error) {
    console.error('Generate error:', error)
    return NextResponse.json({ error: 'Failed to generate data' }, { status: 500 })
  }
}
