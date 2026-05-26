import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/admin'

// Default user ID for fallback when auth is not available
const DEFAULT_USER_ID = '5a784d48-945a-47d3-ae95-d2aa5d9abe8c'

// Lightweight user extraction from cookies - decodes Supabase JWT
function getUserIdFromCookies(request: NextRequest): string | null {
  try {
    const supabaseCookies = request.cookies.getAll().filter(c =>
      c.name.includes('-auth-token')
    )
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
        if (payload?.sub) return payload.sub
      } catch {
        continue
      }
    }
    return null
  } catch {
    return null
  }
}

// Infer column type from a data value
function inferColumnType(value: unknown): string {
  if (value === null || value === undefined) return 'varchar(255)'

  if (typeof value === 'number') {
    return Number.isInteger(value) ? 'integer' : 'decimal'
  }

  if (typeof value === 'boolean') {
    return 'boolean'
  }

  if (typeof value === 'string') {
    // Check for UUID format
    const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (uuidRe.test(value)) return 'uuid'

    // Check for ISO timestamp/date format
    if (/^\d{4}-\d{2}-\d{2}/.test(value)) return 'timestamp'

    // Check for email format
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return 'varchar(255)'
  }

  // ✅ Objects and arrays are JSON — return jsonb instead of falling through to varchar(255)
  if (typeof value === 'object') {
    return 'jsonb'
  }

  return 'varchar(255)'
}

// ✅ Infer the best column type across multiple sample rows using majority vote.
// For each column, tallies the inferred type from every non-null sample value,
// then picks the most-voted type. This replaces the broken colTypeMap logic that
// computed types but never stored or used them.
function inferColumnsFromRows(
  colNames: string[],
  sampleRows: Record<string, unknown>[]
): Array<{ name: string; type: string }> {
  // colTypeMap: colName → { typeName → voteCount }
  const colTypeMap: Record<string, Record<string, number>> = {}

  for (const row of sampleRows) {
    for (const colName of colNames) {
      const val = row[colName]
      if (val === null || val === undefined) continue // skip nulls; don't let them skew voting

      const type = inferColumnType(val) // ✅ type is now actually stored

      if (!colTypeMap[colName]) colTypeMap[colName] = {}
      colTypeMap[colName][type] = (colTypeMap[colName][type] || 0) + 1
    }
  }

  return colNames.map(k => {
    const typeCounts = colTypeMap[k] || {}
    // ✅ Pick the type with the highest vote count; fall back to varchar(255)
    const bestType =
      Object.entries(typeCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'varchar(255)'
    return { name: k, type: bestType }
  })
}

type SchemaTable = { name: string; columns: Array<{ name: string; type: string }> }

export async function POST(request: NextRequest) {
  try {
    const admin = getSupabaseAdmin()
    if (!admin) return NextResponse.json({ error: 'DB not configured' }, { status: 503 })

    const body = await request.json()
    const { fileName, fileType, content } = body
    if (!fileName || !content) {
      return NextResponse.json({ error: 'fileName and content required' }, { status: 400 })
    }

    const userId = getUserIdFromCookies(request) || DEFAULT_USER_ID

    // Only support JSON imports for now
    if (fileType === 'json' || fileName.toLowerCase().endsWith('.json')) {
      let parsed: unknown
      try {
        parsed = typeof content === 'string' ? JSON.parse(content) : content
      } catch {
        return NextResponse.json({ error: 'Invalid JSON file' }, { status: 400 })
      }

      // Accept structure { tables: { name: rows } } or { tables: [...] }
      let dataJson: Record<string, unknown[]> = {}
      const schemaJson: SchemaTable[] = [] // ✅ typed instead of any[]

      if (
        parsed !== null &&
        typeof parsed === 'object' &&
        !Array.isArray(parsed) &&
        'tables' in parsed &&
        typeof (parsed as Record<string, unknown>).tables === 'object'
      ) {
        dataJson = (parsed as { tables: Record<string, unknown[]> }).tables

        for (const [tName, rows] of Object.entries(dataJson)) {
          if (Array.isArray(rows) && rows.length > 0) {
            const sampleRows = rows.slice(0, 5) as Record<string, unknown>[]
            const colNames = Object.keys(rows[0] as Record<string, unknown>)

            // ✅ Use majority-vote inference across all sample rows
            const cols = inferColumnsFromRows(colNames, sampleRows)
            schemaJson.push({ name: tName, columns: cols })
          }
        }
      } else if (Array.isArray(parsed)) {
        // Single table array → name from fileName
        const tName = fileName.replace(/\.[^.]+$/, '')
        dataJson[tName] = parsed as unknown[]

        if (parsed.length > 0) {
          const sampleRows = (parsed as unknown[]).slice(0, 5) as Record<string, unknown>[]
          const colNames = Object.keys(parsed[0] as Record<string, unknown>)

          // ✅ Use majority-vote inference across all sample rows
          const cols = inferColumnsFromRows(colNames, sampleRows)
          schemaJson.push({ name: tName, columns: cols })
        }
      } else {
        return NextResponse.json({ error: 'Unsupported JSON structure' }, { status: 400 })
      }

      const { data, error } = await admin
        .from('synthetic_databases')
        .insert({
          name: fileName,
          db_type: 'postgresql',
          schema_json: schemaJson,
          data_json: dataJson,
          row_count: Object.values(dataJson).reduce(
            (s, arr) => s + (Array.isArray(arr) ? arr.length : 0),
            0
          ),
          quality_score: 0.8,
          status: 'ready',
          user_id: userId,
        })
        .select()
        .single()

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 })
      }

      return NextResponse.json({ database: data })
    }

    return NextResponse.json({ error: 'Unsupported file type' }, { status: 400 })
  } catch (err) {
    console.error('[Import API] Error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}