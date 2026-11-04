import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/server/auth'
import { getConnection } from '@/lib/db-connections/store'
import { fetchExternalSchema, executeSql } from '@/lib/db-connections/executor'
import { needsConfirmation } from '@/lib/db-connections/confirm'
import { stripSqlComments } from '@/lib/ai-agents'

// ─── Agent introspection + self-healing endpoint ───
//
// POST /api/connections/[id]/agent
//   body: { action: 'introspect' | 'execute' | 'verify', sql?: string }
//
// This endpoint powers the autonomous agent loop:
//   1. introspect — return the current schema (tables + columns + row counts)
//   2. execute — run a SQL statement and return the result (for the agent
//      to verify its actions succeeded)
//   3. verify — run a SELECT to verify a previous mutation had the intended
//      effect (e.g. after CREATE TABLE, verify the table exists; after
//      INSERT, verify the row count increased)
//
// The agent uses this to:
//   - Research the schema before acting (don't guess column names)
//   - Verify each step succeeded before proceeding to the next
//   - Self-heal: if a CREATE TABLE fails because the table exists, drop
//     it and retry; if an INSERT fails due to a constraint, adjust the
//     data and retry

type Params = { params: Promise<{ id: string }> }

export async function POST(request: NextRequest, { params }: Params) {
  const auth = await requireUser(request)
  if (auth instanceof Response) return auth

  try {
    const { id } = await params
    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 })
    }

    const userId = auth.userId
    const conn = await getConnection(userId, id)
    if (!conn) {
      return NextResponse.json({ error: 'Connection not found' }, { status: 404 })
    }

    const body = await request.json().catch(() => null)
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
    }
    const { action, sql, skipDangerousCheck } = body as { action?: string; sql?: string; skipDangerousCheck?: boolean }

    if (action === 'introspect') {
      // Return the full schema + row counts so the agent can reason about
      // the current state of the database before acting.
      try {
        const schema = await fetchExternalSchema(conn)
        // For each table, fetch the row count (cheap aggregate)
        const quote = (n: string) => conn.dialect === 'mysql'
          ? `\`${n.replace(/`/g, '``')}\``
          : `"${n.replace(/"/g, '""')}"`
        const tableStats = await Promise.all(schema.slice(0, 50).map(async (table) => {
          try {
            const qualified = conn.dialect === 'mysql'
              ? quote(table.name)
              : `${quote(conn.schema || 'public')}.${quote(table.name)}`
            const result = await executeSql(conn, `SELECT COUNT(*) AS cnt FROM ${qualified}`)
            const cnt = result.rows[0]?.cnt ?? result.rows[0]?.count ?? 0
            return { name: table.name, rowCount: Number(cnt) || 0 }
          } catch {
            return { name: table.name, rowCount: -1 } // -1 = inaccessible
          }
        }))
        return NextResponse.json({ schema, tableStats })
      } catch (err) {
        return NextResponse.json({
          error: err instanceof Error ? err.message : 'Introspection failed',
          schema: [],
          tableStats: [],
        }, { status: 502 })
      }
    }

    if (action === 'execute' || action === 'verify') {
      if (!sql || typeof sql !== 'string') {
        return NextResponse.json({ error: 'sql is required for execute/verify actions' }, { status: 400 })
      }
      const trimmed = sql.trim()
      if (action === 'verify') {
        const readOnly = stripSqlComments(trimmed)
          .replace(/'(?:[^']|'')*'/g, "''")
          .split(';')
          .map(x => x.trim())
          .filter(Boolean)
          .every(x => /^(SELECT|WITH|SHOW|DESCRIBE|EXPLAIN)\b/i.test(x))
        if (!readOnly) {
          return NextResponse.json({ error: 'verify only accepts read-only SQL (SELECT/WITH/SHOW/DESCRIBE/EXPLAIN)' }, { status: 400 })
        }
      }
      if (skipDangerousCheck !== true && needsConfirmation(trimmed)) {
        return NextResponse.json({
          error: 'This statement can modify or delete data. Please confirm to run it.',
          requiresConfirmation: true,
          destructive: true,
          sql: trimmed,
        }, { status: 200 })
      }

      const result = await executeSql(conn, sql)
      return NextResponse.json(result, { status: result.error ? 400 : 200 })
    }

    return NextResponse.json({ error: `Unknown action: ${action}. Use 'introspect', 'execute', or 'verify'.` }, { status: 400 })
  } catch (err) {
    console.error('[Agent API] error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
