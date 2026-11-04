import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/server/auth'
import { executeSql } from '@/lib/db-connections/executor'
import { getConnection } from '@/lib/db-connections/store'
import { needsConfirmation } from '@/lib/db-connections/confirm'
import { enforceRateLimit } from '@/lib/server/rate-limit'

// ─── Live SQL execution against an external DB ───
//
// POST /api/connections/execute
//   body: { connectionId: string, sql: string, skipDangerousCheck?: boolean }
//
// This endpoint is called by the AI chat when the user has an external DB
// connection active and asks the AI to perform CRUD ops (INSERT/UPDATE/
// DELETE/DROP/CREATE/ALTER) or SELECT queries.


export async function POST(request: NextRequest) {
  const auth = await requireUser(request)
  if (auth instanceof Response) return auth
  const limited = enforceRateLimit(auth.userId, 'connections:execute', 120)
  if (limited) return limited

  try {
    let body: unknown
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }
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

    const conn = await getConnection(auth.userId, connectionId)
    if (!conn) {
      return NextResponse.json({ error: 'Connection not found' }, { status: 404 })
    }

    // Safety is an explicit confirmation step, not blocking.
    if (skipDangerousCheck !== true && needsConfirmation(trimmed)) {
      return NextResponse.json({
        error: 'This statement can modify or delete data. Please confirm to run it.',
        requiresConfirmation: true,
        destructive: true,
        sql: trimmed,
      }, { status: 200 })
    }

    const result = await executeSql(conn, trimmed)
    return NextResponse.json(result, { status: result.error ? 400 : 200 })
  } catch (err) {
    console.error('[Connections Execute API] error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
