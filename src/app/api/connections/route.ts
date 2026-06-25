import { NextRequest, NextResponse } from 'next/server'
import {
  listConnections,
  createConnection,
  getConnection,
} from '@/lib/db-connections/store'
import { testConnection } from '@/lib/db-connections/executor'
import { toSafeRecord, type DbConnectionInput, type DbDialect } from '@/lib/db-connections/types'

// ─── Default user id (matches the convention used by /api/databases) ───
const DEFAULT_USER_ID = '5a784d48-945a-47d3-ae95-d2aa5d9abe8c'

function getUserIdFromCookies(request: NextRequest): string {
  try {
    const supabaseCookies = request.cookies.getAll().filter(c => c.name.includes('-auth-token'))
    for (const cookie of supabaseCookies) {
      try {
        const rawValue = decodeURIComponent(cookie.value)
        let accessToken: string | null = null
        try {
          const parsed = JSON.parse(rawValue)
          accessToken = parsed?.access_token || null
        } catch {
          accessToken = rawValue
        }
        if (!accessToken) continue
        const parts = accessToken.split('.')
        if (parts.length !== 3) continue
        const payload = JSON.parse(atob(parts[1]))
        if (payload?.sub) return payload.sub as string
      } catch {
        continue
      }
    }
  } catch {
    // ignore
  }
  return DEFAULT_USER_ID
}

function validateInput(body: unknown): { ok: true; input: DbConnectionInput } | { ok: false; error: string } {
  if (typeof body !== 'object' || body === null) return { ok: false, error: 'Invalid body' }
  const b = body as Record<string, unknown>
  const name = typeof b.name === 'string' ? b.name.trim() : ''
  const dialect = typeof b.dialect === 'string' ? (b.dialect as DbDialect) : 'postgres'
  const host = typeof b.host === 'string' ? b.host.trim() : ''
  const port = typeof b.port === 'number' ? b.port : parseInt(String(b.port ?? ''), 10)
  const username = typeof b.username === 'string' ? b.username.trim() : ''
  const password = typeof b.password === 'string' ? b.password : ''
  const database = typeof b.database === 'string' ? b.database.trim() : ''
  const ssl = typeof b.ssl === 'boolean' ? b.ssl : false
  const schema = typeof b.schema === 'string' ? b.schema.trim() || undefined : undefined

  if (!name) return { ok: false, error: 'Name is required' }
  if (dialect !== 'postgres' && dialect !== 'mysql') return { ok: false, error: 'dialect must be "postgres" or "mysql"' }
  if (!host) return { ok: false, error: 'Host is required' }
  if (!Number.isFinite(port) || port < 1 || port > 65535) return { ok: false, error: 'Port must be between 1 and 65535' }
  if (!username) return { ok: false, error: 'Username is required' }
  if (!database) return { ok: false, error: 'Database name is required' }

  return {
    ok: true,
    input: { name, dialect, host, port, username, password, database, ssl, schema },
  }
}

// GET /api/connections           — list current user's connections
// GET /api/connections?id=...    — get a single connection by id (safe record)
// GET /api/connections?id=...&include=introspect  — also return the live schema + sample rows
export async function GET(request: NextRequest) {
  try {
    const userId = getUserIdFromCookies(request)
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')
    const include = searchParams.get('include')

    if (id) {
      const conn = await getConnection(userId, id)
      if (!conn) {
        return NextResponse.json({ error: 'Connection not found' }, { status: 404 })
      }
      const safe = toSafeRecord(conn)

      if (include === 'introspect') {
        // Live-introspect the external DB
        const { fetchExternalSchema, fetchSampleRows } = await import('@/lib/db-connections/executor')
        try {
          const schema = await fetchExternalSchema(conn)
          // For each table, fetch up to 50 sample rows so the studio can
          // render the data grid immediately.
          const data: Record<string, unknown[]> = {}
          for (const table of schema.slice(0, 50)) {
            try {
              const { rows } = await fetchSampleRows(conn, table.name, 50)
              data[table.name] = rows
            } catch (err) {
              console.warn(`[Connections API] Failed to sample ${table.name}:`, err)
              data[table.name] = []
            }
          }
          return NextResponse.json({ connection: safe, schema, data })
        } catch (err) {
          return NextResponse.json({
            connection: safe,
            schema: [],
            data: {},
            error: err instanceof Error ? err.message : 'Failed to introspect connection',
          })
        }
      }

      return NextResponse.json({ connection: safe })
    }

    const list = await listConnections(userId)
    return NextResponse.json({ connections: list })
  } catch (err) {
    console.error('[Connections API] GET error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// POST /api/connections
//   body: DbConnectionInput & { test?: boolean }
//   - If test=true, attempts a live test before saving. If the test fails,
//     the connection is still saved with status='failed' so the user can
//     retry editing it.
export async function POST(request: NextRequest) {
  try {
    const userId = getUserIdFromCookies(request)
    const body = await request.json().catch(() => null)
    const validation = validateInput(body)
    if (!validation.ok) {
      return NextResponse.json({ error: validation.error }, { status: 400 })
    }
    const input = validation.input
    const shouldTest = (body as { test?: boolean })?.test !== false

    let status: 'untested' | 'connected' | 'failed' = 'untested'
    let errorMessage: string | null = null

    if (shouldTest) {
      // Save first, then test (so we have a record id to use with the executor).
      const saved = await createConnection(userId, input, 'untested', null)
      const testResult = await testConnection(saved)
      if (testResult.ok) {
        status = 'connected'
      } else {
        status = 'failed'
        errorMessage = testResult.error || 'Unknown error'
      }
      const { updateConnection } = await import('@/lib/db-connections/store')
      const updated = await updateConnection(userId, saved.id, { status, error_message: errorMessage })
      return NextResponse.json({
        connection: updated ? toSafeRecord(updated) : toSafeRecord(saved),
        test: { ok: testResult.ok, error: testResult.error, latencyMs: testResult.latencyMs },
      })
    }

    const saved = await createConnection(userId, input, 'untested', null)
    return NextResponse.json({ connection: toSafeRecord(saved) })
  } catch (err) {
    console.error('[Connections API] POST error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// PATCH /api/connections
//   body: { id, ...fields }   — updates fields and optionally re-tests
export async function PATCH(request: NextRequest) {
  try {
    const userId = getUserIdFromCookies(request)
    const body = await request.json().catch(() => null)
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
    }
    const b = body as Record<string, unknown>
    const id = typeof b.id === 'string' ? b.id : ''
    if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })

    // Build the patch from input fields
    const patch: Record<string, unknown> = {}
    for (const key of ['name', 'dialect', 'host', 'port', 'username', 'password', 'database', 'ssl', 'schema'] as const) {
      if (b[key] !== undefined) patch[key] = b[key]
    }

    const { updateConnection } = await import('@/lib/db-connections/store')

    // Apply the patch first
    const updated = await updateConnection(userId, id, patch)
    if (!updated) {
      return NextResponse.json({ error: 'Connection not found' }, { status: 404 })
    }

    // Re-test if requested OR if connection parameters changed
    const shouldTest = b.test === true || ['host', 'port', 'username', 'password', 'database', 'ssl', 'dialect'].some(k => b[k] !== undefined)
    if (shouldTest) {
      const { testConnection } = await import('@/lib/db-connections/executor')
      const result = await testConnection(updated)
      const finalRecord = await updateConnection(userId, id, {
        status: result.ok ? 'connected' : 'failed',
        error_message: result.ok ? null : (result.error || 'Unknown error'),
      })
      return NextResponse.json({
        connection: finalRecord ? toSafeRecord(finalRecord) : toSafeRecord(updated),
        test: { ok: result.ok, error: result.error, latencyMs: result.latencyMs },
      })
    }

    return NextResponse.json({ connection: toSafeRecord(updated) })
  } catch (err) {
    console.error('[Connections API] PATCH error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// DELETE /api/connections?id=...
export async function DELETE(request: NextRequest) {
  try {
    const userId = getUserIdFromCookies(request)
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })

    const { deleteConnection } = await import('@/lib/db-connections/store')
    const ok = await deleteConnection(userId, id)
    if (!ok) return NextResponse.json({ error: 'Connection not found' }, { status: 404 })
    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[Connections API] DELETE error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
