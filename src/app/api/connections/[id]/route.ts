import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/server/auth'
import {
  getConnection,
  updateConnection,
  deleteConnection,
} from '@/lib/db-connections/store'
import { evictPool, testConnection, fetchExternalSchema, fetchSampleRows } from '@/lib/db-connections/executor'
import { toSafeRecord } from '@/lib/db-connections/types'

// ─── Per-item routes: /api/connections/[id] ───
//
// Standard REST pattern:
//   GET    /api/connections/[id]                 — get one connection (safe record)
//   GET    /api/connections/[id]?include=introspect  — also return live schema + sample rows
//   PATCH  /api/connections/[id]                 — update fields (re-tests if params changed)
//   DELETE /api/connections/[id]                 — delete the connection

type Params = { params: Promise<{ id: string }> }

// GET /api/connections/[id]
export async function GET(request: NextRequest, { params }: Params) {
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
    const safe = toSafeRecord(conn)

    const { searchParams } = new URL(request.url)
    const include = searchParams.get('include')

    if (include === 'introspect') {
      // Live-introspect the external DB
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
  } catch (err) {
    console.error('[Connections API] GET [id] error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// PATCH /api/connections/[id]
//   body: { ...fields, test?: boolean }
export async function PATCH(request: NextRequest, { params }: Params) {
  const auth = await requireUser(request)
  if (auth instanceof Response) return auth

  try {
    const { id } = await params
    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 })
    }

    const userId = auth.userId
    const body = await request.json().catch(() => null)
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
    }
    const b = body as Record<string, unknown>

    // Build the patch from input fields
    const patch: Record<string, unknown> = {}
    for (const key of ['name', 'dialect', 'host', 'port', 'username', 'password', 'database', 'ssl', 'schema'] as const) {
      if (b[key] !== undefined) patch[key] = b[key]
    }

    // Apply the patch first
    const updated = await updateConnection(userId, id, patch)
    if (!updated) {
      return NextResponse.json({ error: 'Connection not found' }, { status: 404 })
    }

    // If any connection parameter changed, evict the cached pool so the
    // next test/query uses the NEW credentials instead of the stale pool.
    const connectionParamsChanged = ['host', 'port', 'username', 'password', 'database', 'ssl', 'dialect', 'schema'].some(k => b[k] !== undefined)
    if (connectionParamsChanged) {
      await evictPool(id)
    }

    // Re-test if requested OR if connection parameters changed.
    const shouldTest = b.test === true || connectionParamsChanged
    if (shouldTest) {
      const result = await testConnection(updated)
      const finalRecord = await updateConnection(userId, id, {
        status: result.ok ? 'connected' : 'failed',
        error_message: result.ok ? null : (result.error || 'Unknown error'),
      })
      return NextResponse.json({
        connection: finalRecord ? toSafeRecord(finalRecord) : toSafeRecord(updated),
        test: { ok: result.ok, error: result.error, hint: result.hint, latencyMs: result.latencyMs },
      })
    }

    return NextResponse.json({ connection: toSafeRecord(updated) })
  } catch (err) {
    console.error('[Connections API] PATCH [id] error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// DELETE /api/connections/[id]
export async function DELETE(request: NextRequest, { params }: Params) {
  const auth = await requireUser(request)
  if (auth instanceof Response) return auth

  try {
    const { id } = await params
    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 })
    }

    const userId = auth.userId
    const ok = await deleteConnection(userId, id)
    if (!ok) {
      return NextResponse.json({ error: 'Connection not found' }, { status: 404 })
    }

    // Evict any cached pool so subsequent requests with the same id fail
    // fast instead of trying to use a connection that no longer exists.
    await evictPool(id)

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[Connections API] DELETE [id] error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
