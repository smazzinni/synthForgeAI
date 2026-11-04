import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/server/auth'
import { enforceRateLimit } from '@/lib/server/rate-limit'
import {
  countRows,
  createDatabase,
  deleteDatabase,
  getDatabase,
  listDatabases,
  updateDatabase,
  type SyntheticDatabasePatch,
} from '@/lib/server/synthetic-store'

// ─── Synthetic databases CRUD ───
// GET    /api/databases            → { databases }   (list, without row data)
// GET    /api/databases?id=…       → { database }    (full record incl. data_json)
// POST   /api/databases            → { database }
// PATCH  /api/databases            → { database }    (body: { id, ...fields })
// DELETE /api/databases?id=…       → { success: true }
// All operations are scoped to the authenticated user.

export const dynamic = 'force-dynamic'

const MAX_BODY_CHARS = 5_000_000
const VALID_STATUS = new Set(['draft', 'generating', 'ready', 'error', 'archived'])

async function readJson(request: NextRequest): Promise<{ ok: true; body: Record<string, unknown> } | { ok: false; res: Response }> {
  const text = await request.text()
  if (text.length > MAX_BODY_CHARS) {
    return { ok: false, res: NextResponse.json({ error: 'Payload too large (max 5MB)' }, { status: 413 }) }
  }
  try {
    const body = JSON.parse(text)
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('not an object')
    return { ok: true, body }
  } catch {
    return { ok: false, res: NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 }) }
  }
}

function pickPatch(body: Record<string, unknown>): SyntheticDatabasePatch | string {
  const patch: SyntheticDatabasePatch = {}
  if (body.name !== undefined) {
    if (typeof body.name !== 'string' || !body.name.trim()) return 'name must be a non-empty string'
    patch.name = body.name.trim().slice(0, 200)
  }
  if (body.db_type !== undefined) patch.db_type = String(body.db_type)
  if (body.schema_json !== undefined) {
    if (!Array.isArray(body.schema_json)) return 'schema_json must be an array'
    patch.schema_json = body.schema_json
  }
  if (body.data_json !== undefined) {
    if (!body.data_json || typeof body.data_json !== 'object' || Array.isArray(body.data_json)) return 'data_json must be an object of table → rows'
    patch.data_json = body.data_json as Record<string, unknown[]>
    if (body.row_count === undefined) patch.row_count = countRows(patch.data_json)
  }
  if (body.row_count !== undefined) patch.row_count = Math.max(0, Math.floor(Number(body.row_count)) || 0)
  if (body.quality_score !== undefined) patch.quality_score = body.quality_score === null ? null : Number(body.quality_score)
  if (body.status !== undefined) {
    if (!VALID_STATUS.has(String(body.status))) return `status must be one of ${[...VALID_STATUS].join(', ')}`
    patch.status = String(body.status)
  }
  return patch
}

const serverError = (where: string, err: unknown) => {
  console.error(`[api/databases] ${where} failed:`, err)
  return NextResponse.json({ error: 'Database storage is temporarily unavailable. Please retry.' }, { status: 500 })
}

export async function GET(request: NextRequest) {
  const auth = await requireUser(request)
  if (auth instanceof Response) return auth
  const limited = enforceRateLimit(auth.userId, 'databases:get', 240)
  if (limited) return limited

  const id = request.nextUrl.searchParams.get('id')
  try {
    if (id) {
      const database = await getDatabase(auth.userId, id)
      if (!database) return NextResponse.json({ error: 'Database not found' }, { status: 404 })
      return NextResponse.json({ database }, { headers: { 'Cache-Control': 'no-store' } })
    }
    const databases = await listDatabases(auth.userId)
    return NextResponse.json({ databases }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (err) {
    return serverError('GET', err)
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireUser(request)
  if (auth instanceof Response) return auth
  const limited = enforceRateLimit(auth.userId, 'databases:write', 60)
  if (limited) return limited

  const parsed = await readJson(request)
  if (!parsed.ok) return parsed.res
  const body = parsed.body
  if (typeof body.name !== 'string' || !body.name.trim()) {
    return NextResponse.json({ error: 'name is required' }, { status: 400 })
  }
  const patch = pickPatch(body)
  if (typeof patch === 'string') return NextResponse.json({ error: patch }, { status: 400 })

  try {
    const data = patch.data_json || {}
    const database = await createDatabase(auth.userId, {
      name: patch.name!,
      db_type: patch.db_type || 'postgresql',
      schema_json: patch.schema_json ?? [],
      data_json: data,
      row_count: patch.row_count ?? countRows(data),
      quality_score: patch.quality_score ?? null,
      status: patch.status || 'draft',
    })
    return NextResponse.json({ database }, { status: 201 })
  } catch (err) {
    return serverError('POST', err)
  }
}

export async function PATCH(request: NextRequest) {
  const auth = await requireUser(request)
  if (auth instanceof Response) return auth
  const limited = enforceRateLimit(auth.userId, 'databases:write', 60)
  if (limited) return limited

  const parsed = await readJson(request)
  if (!parsed.ok) return parsed.res
  const id = parsed.body.id
  if (typeof id !== 'string' || !id) return NextResponse.json({ error: 'id is required' }, { status: 400 })
  const patch = pickPatch(parsed.body)
  if (typeof patch === 'string') return NextResponse.json({ error: patch }, { status: 400 })
  if (Object.keys(patch).length === 0) return NextResponse.json({ error: 'No fields to update' }, { status: 400 })

  try {
    const database = await updateDatabase(auth.userId, id, patch)
    if (!database) return NextResponse.json({ error: 'Database not found' }, { status: 404 })
    return NextResponse.json({ database })
  } catch (err) {
    return serverError('PATCH', err)
  }
}

export async function DELETE(request: NextRequest) {
  const auth = await requireUser(request)
  if (auth instanceof Response) return auth
  const limited = enforceRateLimit(auth.userId, 'databases:write', 60)
  if (limited) return limited

  const id = request.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })
  try {
    const deleted = await deleteDatabase(auth.userId, id)
    if (!deleted) return NextResponse.json({ error: 'Database not found' }, { status: 404 })
    return NextResponse.json({ success: true })
  } catch (err) {
    return serverError('DELETE', err)
  }
}
