import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/server/auth'
import { executeSqlOnExternalConnection } from '@/lib/db-connections/executor'
import { getConnection } from '@/lib/db-connections/store'
import { isDestructiveSQL, stripSqlComments } from '@/lib/ai-agents'

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
  const auth = await requireUser(request)
  if (auth instanceof Response) return auth

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

    // SECURITY: verify the authenticated user owns this connection BEFORE
    // executing any SQL. Without this check, any user who learned another
    // user's connectionId could execute arbitrary SQL on their database.
    const userId = auth.userId
    const conn = await getConnection(userId, connectionId)
    if (!conn) {
      return NextResponse.json({ error: 'Connection not found or you do not have access to it' }, { status: 403 })
    }

    // Strip leading SQL line comments (`-- foo\n`, `/* ... */`) so the
    // firstWord check works on SQL that the AI prefixes with explanatory
    // comments (which is exactly the format the chat route's system prompt
    // instructs the AI to produce).
    const strippedForCheck = stripSqlComments(trimmed).trim()

    // For multi-statement SQL, split by semicolons and check the first word
    // of EACH statement. All statements must use allowed statement types.
    // IMPORTANT: Each individual statement may ALSO have leading comments
    // (e.g. "-- Step 1: Get max IDs\nSELECT ..."), so we must stripSqlComments
    // AGAIN on each split statement before checking its first word.
    const statementsToCheck = strippedForCheck
      .split(';')
      .map(s => stripSqlComments(s).trim())
      .filter(Boolean)

    for (const stmt of statementsToCheck) {
      const firstWord = stmt.split(/\s+/)[0]?.toUpperCase() || ''
      // Skip empty statements (can happen with trailing semicolons or
      // statements that were entirely comments)
      if (!firstWord) continue
      if (!ALLOWED_STATEMENTS.includes(firstWord)) {
        return NextResponse.json({
          error: `Statement type "${firstWord}" is not allowed`,
        }, { status: 400 })
      }
    }

    // Block obviously catastrophic patterns unless the caller explicitly
    // opted out (the AI chat does so AFTER the user confirmed).
    // Strip single-quoted string literals first so the regex doesn't
    // match keywords that happen to appear inside string values.
    const literalStripped = strippedForCheck.replace(/'[^']*'/g, "''")
    if (!skipDangerousCheck) {
      if (/\bDROP\s+DATABASE\b/i.test(literalStripped) || /\bDROP\s+SCHEMA\b/i.test(literalStripped)) {
        return NextResponse.json({
          error: 'This query would drop a database or schema. Confirm in the chat before executing.',
          requiresConfirmation: true,
          sql: trimmed,
        }, { status: 200 })
      }
      if (isDestructiveSQL(strippedForCheck)) {
        return NextResponse.json({
          error: 'This is a destructive operation. Confirm in the chat before executing.',
          requiresConfirmation: true,
          sql: trimmed,
          destructive: true,
        }, { status: 200 })
      }
    }

    const result = await executeSqlOnExternalConnection(auth.userId, connectionId, trimmed)
    return NextResponse.json(result, { status: result.error ? 400 : 200 })
  } catch (err) {
    console.error('[Connections Execute API] error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
