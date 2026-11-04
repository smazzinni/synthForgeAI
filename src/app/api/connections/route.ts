import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/server/auth'
import {
  listConnections,
  createConnection,
  updateConnection,
} from '@/lib/db-connections/store'
import { testConnection } from '@/lib/db-connections/executor'
import { toSafeRecord } from '@/lib/db-connections/types'
import { validateInput } from '@/lib/db-connections/api-helpers'

// ─── Collection routes: /api/connections ───
//
// NOTE: per-item operations (get/update/delete) live in /api/connections/[id]
// using the standard REST pattern. This file only handles collection-level
// operations.
//
// Why nested routes instead of query params:
//   - RESTful convention (easier to reason about)
//   - Some hosting providers (Vercel) have historically had quirks with
//     PATCH/DELETE on collection endpoints; the [id] dynamic segment is
//     reliably routed.

// GET /api/connections — list current user's connections
export async function GET(request: NextRequest) {
  const auth = await requireUser(request)
  if (auth instanceof Response) return auth

  try {
    const userId = auth.userId
    const list = await listConnections(userId)
    return NextResponse.json({ connections: list })
  } catch (err) {
    console.error('[Connections API] GET error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// POST /api/connections
//   body: DbConnectionInput & { test?: boolean }
//   - If test=true (the default), attempts a live test before saving.
//   - On test failure the connection is still saved with status='failed'
//     so the user can edit-and-retry.
export async function POST(request: NextRequest) {
  const auth = await requireUser(request)
  if (auth instanceof Response) return auth

  try {
    const userId = auth.userId
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
      // BUGFIX (BUG-7): if the test throws an unhandled error, still update the
      // record's status before returning so we don't leave orphaned 'untested'
      // records that the user can't see.
      const saved = await createConnection(userId, input, 'untested', null)
      let testResult: { ok: boolean; error?: string; hint?: string; latencyMs?: number }
      try {
        testResult = await testConnection(saved)
      } catch (err) {
        testResult = {
          ok: false,
          error: err instanceof Error ? err.message : String(err),
          hint: 'The connection test itself crashed. This is usually a transient issue — try again.',
        }
      }
      if (testResult.ok) {
        status = 'connected'
      } else {
        status = 'failed'
        errorMessage = testResult.error || 'Unknown error'
      }
      const updated = await updateConnection(userId, saved.id, { status, error_message: errorMessage })
      return NextResponse.json({
        connection: updated ? toSafeRecord(updated) : toSafeRecord(saved),
        test: { ok: testResult.ok, error: testResult.error, hint: testResult.hint, latencyMs: testResult.latencyMs },
      })
    }

    const saved = await createConnection(userId, input, 'untested', null)
    return NextResponse.json({ connection: toSafeRecord(saved) })
  } catch (err) {
    console.error('[Connections API] POST error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
