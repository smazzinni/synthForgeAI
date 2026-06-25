import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/admin'
import { parseImportPayload } from '@/lib/import-from-file'
import type { Json } from '@/lib/supabase/types'

const DEFAULT_USER_ID = '5a784d48-945a-47d3-ae95-d2aa5d9abe8c'

function getUserIdFromCookies(request: NextRequest): string | null {
  try {
    const supabaseCookies = request.cookies
      .getAll()
      .filter((c) => c.name.includes('-auth-token'))
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

export async function POST(request: NextRequest) {
  try {
    const admin = getSupabaseAdmin()
    if (!admin) {
      return NextResponse.json({ error: 'DB not configured' }, { status: 503 })
    }

    const body = await request.json()
    const { fileName, fileType, content, encoding } = body
    if (!fileName || content == null) {
      return NextResponse.json(
        { error: 'fileName and content required' },
        { status: 400 },
      )
    }

    const userId = getUserIdFromCookies(request) || DEFAULT_USER_ID

    let parsed
    try {
      parsed = await parseImportPayload(
        fileName,
        typeof content === 'string' ? content : String(content),
        fileType,
        encoding === 'base64' ? 'base64' : 'utf8',
      )
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Invalid import file'
      return NextResponse.json({ error: message }, { status: 400 })
    }

    const { dataJson, schemaJson, suggestedName } = parsed
    const rowCount = Object.values(dataJson).reduce(
      (s, arr) => s + (Array.isArray(arr) ? arr.length : 0),
      0,
    )

    const { data, error } = await admin
      .from('synthetic_databases')
      .insert({
        name: suggestedName,
        db_type: 'postgresql',
        schema_json: schemaJson as unknown as Json,
        data_json: dataJson as unknown as Json,
        row_count: rowCount,
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
  } catch (err) {
    console.error('[Import API] Error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
