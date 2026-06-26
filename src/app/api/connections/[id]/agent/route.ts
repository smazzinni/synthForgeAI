import { NextRequest, NextResponse } from 'next/server'
import { getConnection } from '@/lib/db-connections/store'
import { fetchExternalSchema, executeSql } from '@/lib/db-connections/executor'
import { getUserIdFromCookies } from '@/lib/db-connections/api-helpers'

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
  try {
    const { id } = await params
    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 })
    }

    const userId = getUserIdFromCookies(request)
    const conn = await getConnection(userId, id)
    if (!conn) {
      return NextResponse.json({ error: 'Connection not found or you do not have access to it' }, { status: 403 })
    }

    const body = await request.json().catch(() => null)
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
    }
    const { action, sql } = body as { action?: string; sql?: string }

    if (action === 'introspect') {
      // Return the full schema + row counts so the agent can reason about
      // the current state of the database before acting.
      try {
        const schema = await fetchExternalSchema(conn)
        // For each table, fetch the row count (cheap aggregate)
        const tableStats: Array<{ name: string; rowCount: number }> = []
        for (const table of schema.slice(0, 50)) {
          try {
            const result = await executeSql(conn, `SELECT COUNT(*) AS cnt FROM "${table.name}"`)
            const cnt = result.rows[0]?.cnt ?? result.rows[0]?.count ?? 0
            tableStats.push({ name: table.name, rowCount: Number(cnt) || 0 })
          } catch {
            tableStats.push({ name: table.name, rowCount: -1 }) // -1 = inaccessible
          }
        }
        return NextResponse.json({ schema, tableStats })
      } catch (err) {
        return NextResponse.json({
          error: err instanceof Error ? err.message : 'Introspection failed',
          schema: [],
          tableStats: [],
        }, { status: 200 })
      }
    }

    if (action === 'execute' || action === 'verify') {
      if (!sql || typeof sql !== 'string') {
        return NextResponse.json({ error: 'sql is required for execute/verify actions' }, { status: 400 })
      }
      // Execute the SQL. For 'verify' we expect a SELECT; for 'execute'
      // we allow any statement. Either way, the result includes rows +
      // affectedRows + error so the agent can decide what to do next.
      const result = await executeSql(conn, sql)
      return NextResponse.json(result, { status: result.error ? 400 : 200 })
    }

    return NextResponse.json({ error: `Unknown action: ${action}. Use 'introspect', 'execute', or 'verify'.` }, { status: 400 })
  } catch (err) {
    console.error('[Agent API] error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
