import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/server/auth'
import { enforceRateLimit } from '@/lib/server/rate-limit'
import { getDatabase } from '@/lib/server/synthetic-store'

// GET /api/databases/:id/rows?table=…&offset=0&limit=100&sort=col&dir=asc|desc&q=text
// → { rows, columns, total, offset, limit }   (server-side paging for large datasets)
export const dynamic = 'force-dynamic'

type Row = Record<string, unknown>

// Parsing a big data_json on every page request is wasteful; keep the last
// few datasets parsed, keyed by id + updated_at so edits invalidate them.
const cache = new Map<string, { key: string; data: Record<string, Row[]> }>()
const CACHE_MAX = 8

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireUser(request)
  if (auth instanceof Response) return auth
  const limited = enforceRateLimit(auth.userId, 'databases:rows', 300)
  if (limited) return limited

  const { id } = await params
  const sp = request.nextUrl.searchParams
  const table = sp.get('table')
  if (!table) return NextResponse.json({ error: 'table is required' }, { status: 400 })

  const db = await getDatabase(auth.userId, id)
  if (!db) return NextResponse.json({ error: 'Database not found' }, { status: 404 })

  const cacheKey = `${auth.userId}:${id}`
  const versionKey = `${db.updated_at}:${db.row_count}`
  let data = cache.get(cacheKey)?.key === versionKey ? cache.get(cacheKey)!.data : null
  if (!data) {
    data = (db.data_json || {}) as Record<string, Row[]>
    cache.delete(cacheKey)
    cache.set(cacheKey, { key: versionKey, data })
    if (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value!)
  }

  let rows = data[table]
  if (!rows) return NextResponse.json({ error: `Table "${table}" not found` }, { status: 404 })

  const q = (sp.get('q') || '').trim().toLowerCase()
  if (q) rows = rows.filter(r => Object.values(r).some(v => v != null && String(v).toLowerCase().includes(q)))

  const sort = sp.get('sort')
  if (sort) {
    const dir = sp.get('dir') === 'desc' ? -1 : 1
    rows = [...rows].sort((a, b) => {
      const x = a[sort], y = b[sort]
      if (x == null) return 1
      if (y == null) return -1
      return (typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y))) * dir
    })
  }

  const offset = Math.max(0, Math.floor(Number(sp.get('offset') ?? 0)))
  const limit = Math.min(1000, Math.max(1, Math.floor(Number(sp.get('limit') ?? 100))))
  const page = rows.slice(offset, offset + limit)
  const schemaCols = (Array.isArray(db.schema_json) ? db.schema_json : [])
    .find((t: { name?: string }) => t?.name === table)?.columns?.map((c: { name: string }) => c.name)
  return NextResponse.json({
    rows: page,
    columns: schemaCols?.length ? schemaCols : (page[0] ? Object.keys(page[0]) : []),
    total: rows.length,
    offset,
    limit,
  })
}
