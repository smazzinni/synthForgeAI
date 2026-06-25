import { NextRequest, NextResponse } from 'next/server'
import { executeSqlOnExternalConnection } from '@/lib/db-connections/executor'
import { isDestructiveSQL } from '@/lib/ai-agents'

// ─── Live SQL execution against an external DB ───
//
// POST /api/connections/execute
//   body: { connectionId: string, sql: string, skipDangerousCheck?: boolean }
//
// This endpoint is called by the AI chat when the user has an external DB
// connection active and asks the AI to perform CRUD ops (INSERT/UPDATE/
// DELETE/DROP/CREATE/ALTER) or SELECT queries.

const ALLOWED_STATEMENTS = ['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'CREATE', 'ALTER', 'DROP', 'WITH', 'TRUNCATE', 'USE', 'SHOW', 'DESCRIBE', 'EXPLAIN']

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null)
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
    }
    const { connectionId, sql, skipDangerousCheck = false } = body as {
      connectionId?: string
      sql?: string
      skipDangerousCheck?: boolean
    }

    if (!connectionId) return NextResponse.json({ error: 'connectionId is required' }, { status: 400 })
    if (!sql || typeof sql !== 'string') return NextResponse.json({ error: 'sql is required' }, { status: 400 })

    const trimmed = sql.trim()
    if (trimmed.length === 0) return NextResponse.json({ error: 'sql cannot be empty' }, { status: 400 })
    if (trimmed.length > 100000) return NextResponse.json({ error: 'sql too long' }, { status: 400 })

    const firstWord = trimmed.split(/\s+/)[0]?.toUpperCase() || ''
    if (!ALLOWED_STATEMENTS.includes(firstWord)) {
      return NextResponse.json({ error: `Statement type "${firstWord}" is not allowed` }, { status: 400 })
    }

    // Block obviously catastrophic patterns unless the caller explicitly
    // opted out (the AI chat does so AFTER the user confirmed).
    if (!skipDangerousCheck) {
      if (/\bDROP\s+DATABASE\b/i.test(trimmed) || /\bDROP\s+SCHEMA\b/i.test(trimmed)) {
        return NextResponse.json({
          error: 'This query would drop a database or schema. Confirm in the chat before executing.',
          requiresConfirmation: true,
          sql: trimmed,
        }, { status: 200 })
      }
      if (isDestructiveSQL(trimmed)) {
        return NextResponse.json({
          error: 'This is a destructive operation. Confirm in the chat before executing.',
          requiresConfirmation: true,
          sql: trimmed,
          destructive: true,
        }, { status: 200 })
      }
    }

    const result = await executeSqlOnExternalConnection(connectionId, trimmed)
    return NextResponse.json(result)
  } catch (err) {
    console.error('[Connections Execute API] error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
