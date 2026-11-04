import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/server/auth'
import { enforceRateLimit } from '@/lib/server/rate-limit'
import { getConnection } from '@/lib/db-connections/store'
import { fetchTablePage } from '@/lib/db-connections/executor'

// GET /api/connections/:id/rows?table=…&offset=0&limit=100&sort=col&dir=asc|desc
// → { rows, columns, total, offset, limit }   (server-side paging for large tables)
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireUser(request)
  if (auth instanceof Response) return auth
  const limited = enforceRateLimit(auth.userId, 'connections:rows', 300)
  if (limited) return limited

  const { id } = await params
  const sp = request.nextUrl.searchParams
  const table = sp.get('table')
  if (!table) return NextResponse.json({ error: 'table is required' }, { status: 400 })

  const conn = await getConnection(auth.userId, id)
  if (!conn) return NextResponse.json({ error: 'Connection not found' }, { status: 404 })

  try {
    const page = await fetchTablePage(conn, table, {
      offset: Number(sp.get('offset') ?? 0),
      limit: Number(sp.get('limit') ?? 100),
      sort: sp.get('sort') || undefined,
      dir: sp.get('dir') === 'desc' ? 'desc' : 'asc',
    })
    return NextResponse.json(page)
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Query failed' }, { status: 400 })
  }
}
