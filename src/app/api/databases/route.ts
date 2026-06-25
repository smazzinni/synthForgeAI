import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/admin'
import {
  listDatabasesInMemory,
  getDatabaseInMemory,
  createDatabaseInMemory,
  updateDatabaseInMemory,
  deleteDatabaseInMemory,
} from '@/lib/in-memory-store'

// ─── Default user ID for fallback when auth is not available ───
const DEFAULT_USER_ID = '5a784d48-945a-47d3-ae95-d2aa5d9abe8c'

// ─── In-memory request cache with automatic cleanup ───
const apiCache = new Map<string, { data: unknown; timestamp: number }>()
const CACHE_TTL = 3000 // 3 seconds cache

// ─── Rate limiter with automatic cleanup ───
const rateLimiter = new Map<string, { count: number; resetAt: number }>()
const RATE_LIMIT = 30
const RATE_WINDOW = 60000 // 1 minute

// ─── Periodic cleanup of stale entries (prevent memory leaks) ───
let lastCleanup = Date.now()
const CLEANUP_INTERVAL = 120000 // 2 minutes

function cleanup() {
  const now = Date.now()
  if (now - lastCleanup < CLEANUP_INTERVAL) return
  lastCleanup = now

  // Clean up expired rate limiter entries
  for (const [key, entry] of rateLimiter.entries()) {
    if (now > entry.resetAt) {
      rateLimiter.delete(key)
    }
  }

  // Clean up expired cache entries
  for (const [key, entry] of apiCache.entries()) {
    if (now - entry.timestamp > 30000) { // Remove entries older than 30s
      apiCache.delete(key)
    }
  }
}

function getClientId(request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-for')
  const ip = forwarded ? forwarded.split(',')[0] : 'unknown'
  return ip
}

function checkRateLimit(clientId: string, endpoint: string): boolean {
  const key = `${clientId}:${endpoint}`
  const now = Date.now()
  const entry = rateLimiter.get(key)

  if (!entry || now > entry.resetAt) {
    rateLimiter.set(key, { count: 1, resetAt: now + RATE_WINDOW })
    return true
  }

  if (entry.count >= RATE_LIMIT) {
    return false
  }

  entry.count++
  return true
}

// Lightweight user extraction from cookies - decodes Supabase JWT
function getUserIdFromCookies(request: NextRequest): string | null {
  try {
    // Try to find Supabase auth cookie - the pattern is sb-{ref}-auth-token
    const supabaseCookies = request.cookies.getAll().filter(c =>
      c.name.includes('-auth-token')
    )

    for (const cookie of supabaseCookies) {
      try {
        const rawValue = decodeURIComponent(cookie.value)

        // Supabase stores the session as JSON: {access_token, refresh_token, ...}
        let accessToken: string | null = null

        try {
          const parsed = JSON.parse(rawValue)
          accessToken = parsed?.access_token || null
        } catch {
          // Might be just the token directly
          accessToken = rawValue
        }

        if (!accessToken) continue

        // Decode JWT without verification (we trust the cookie since it came from our server)
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

export async function GET(request: NextRequest) {
  cleanup() // Periodic memory cleanup

  const clientId = getClientId(request)

  // Rate limit check
  if (!checkRateLimit(clientId, 'databases:get')) {
    return NextResponse.json(
      { error: 'Too many requests. Please wait a moment.' },
      { status: 429 }
    )
  }

  try {
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')
    const userId = getUserIdFromCookies(request) || DEFAULT_USER_ID

    const admin = getSupabaseAdmin()
    if (!admin) {
      // In-memory fallback
      if (id) {
        const db = getDatabaseInMemory(userId, id)
        return NextResponse.json({ database: db })
      }
      return NextResponse.json({ databases: listDatabasesInMemory(userId) })
    }

    // Check cache for list queries (not individual ID queries)
    if (!id) {
      const cacheKey = `databases:list:${userId || 'anon'}`
      const cached = apiCache.get(cacheKey)
      if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
        return NextResponse.json(cached.data)
      }
    }

    // If requesting a specific database by ID
    if (id) {
      const { data, error } = await admin
        .from('synthetic_databases')
        .select('*')
        .eq('id', id)
        .single()

      if (error) {
        console.warn('[Databases API] Query error:', error.message)
        return NextResponse.json({ database: null })
      }

      return NextResponse.json({ database: data })
    }

    // List all databases
    let query = admin
      .from('synthetic_databases')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50)

    query = query.eq('user_id', userId)

    const { data, error } = await query

    if (error) {
      console.warn('[Databases API] Query error:', error.message)
      return NextResponse.json({ databases: [] })
    }

    const responseData = { databases: data || [] }

    // Cache the result
    const cacheKey = `databases:list:${userId || 'anon'}`
    apiCache.set(cacheKey, { data: responseData, timestamp: Date.now() })

    return NextResponse.json(responseData)
  } catch (err) {
    console.error('[Databases API] Error:', err)
    return NextResponse.json({ databases: [] })
  }
}

export async function POST(request: NextRequest) {
  cleanup() // Periodic memory cleanup

  const clientId = getClientId(request)

  if (!checkRateLimit(clientId, 'databases:post')) {
    return NextResponse.json(
      { error: 'Too many requests. Please wait a moment.' },
      { status: 429 }
    )
  }

  try {
    // Limit request body size to prevent OOM
    const text = await request.text()
    if (text.length > 5 * 1024 * 1024) { // 5MB limit
      return NextResponse.json(
        { error: 'Request body too large. Maximum size is 5MB.' },
        { status: 413 }
      )
    }

    const body = JSON.parse(text)
    const { name, db_type = 'postgresql', schema_json = [], data_json = {}, row_count = 0, quality_score = null, status = 'draft' } = body

    if (!name) {
      return NextResponse.json(
        { error: 'Name is required' },
        { status: 400 }
      )
    }

    const admin = getSupabaseAdmin()
    const userId = getUserIdFromCookies(request) || DEFAULT_USER_ID

    if (!admin) {
      // In-memory fallback
      const record = createDatabaseInMemory(userId, {
        name,
        db_type,
        status,
        schema_json,
        data_json,
        row_count: row_count || 0,
        quality_score,
      })
      return NextResponse.json({ database: record })
    }

    const insertData: Record<string, unknown> = {
      name,
      db_type,
      status,
      schema_json,
      data_json,
      row_count: row_count || 0,
      quality_score,
      user_id: userId,
    }

    const { data, error } = await admin
      .from('synthetic_databases')
      .insert(insertData)
      .select()
      .single()

    if (error) {
      console.error('[Databases API] Insert error:', error.message)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Invalidate all list caches after mutation
    for (const key of apiCache.keys()) {
      if (key.startsWith('databases:list:')) {
        apiCache.delete(key)
      }
    }

    return NextResponse.json({ database: data })
  } catch (err) {
    console.error('[Databases API] Error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  cleanup()

  const clientId = getClientId(request)

  if (!checkRateLimit(clientId, 'databases:patch')) {
    return NextResponse.json(
      { error: 'Too many requests. Please wait a moment.' },
      { status: 429 }
    )
  }

  try {
    // Limit request body size
    const text = await request.text()
    if (text.length > 5 * 1024 * 1024) { // 5MB limit
      return NextResponse.json(
        { error: 'Request body too large. Maximum size is 5MB.' },
        { status: 413 }
      )
    }

    const body = JSON.parse(text)
    const { id, data_json, schema_json, row_count, quality_score, status, name } = body

    if (!id) {
      return NextResponse.json({ error: 'Database ID is required' }, { status: 400 })
    }

    const admin = getSupabaseAdmin()
    const userId = getUserIdFromCookies(request) || DEFAULT_USER_ID

    if (!admin) {
      // In-memory fallback
      const patch: Record<string, unknown> = {}
      if (data_json !== undefined) patch.data_json = data_json
      if (schema_json !== undefined) patch.schema_json = schema_json
      if (row_count !== undefined) patch.row_count = row_count
      if (quality_score !== undefined) patch.quality_score = quality_score
      if (status !== undefined) patch.status = status
      if (name !== undefined) patch.name = name
      const updated = updateDatabaseInMemory(userId, id, patch)
      if (!updated) {
        return NextResponse.json({ error: 'Database not found' }, { status: 404 })
      }
      return NextResponse.json({ database: updated })
    }

    const updateData: Record<string, unknown> = {}
    if (data_json !== undefined) updateData.data_json = data_json
    if (schema_json !== undefined) updateData.schema_json = schema_json
    if (row_count !== undefined) updateData.row_count = row_count
    if (quality_score !== undefined) updateData.quality_score = quality_score
    if (status !== undefined) updateData.status = status
    if (name !== undefined) updateData.name = name

    const { data, error } = await admin
      .from('synthetic_databases')
      .update(updateData)
      .eq('id', id)
      .select()
      .single()

    if (error) {
      console.error('[Databases API] Patch error:', error.message)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Invalidate caches
    for (const key of apiCache.keys()) {
      if (key.startsWith('databases:list:')) {
        apiCache.delete(key)
      }
    }

    return NextResponse.json({ database: data })
  } catch (err) {
    console.error('[Databases API] Patch error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  cleanup()

  const clientId = getClientId(request)

  if (!checkRateLimit(clientId, 'databases:delete')) {
    return NextResponse.json(
      { error: 'Too many requests. Please wait a moment.' },
      { status: 429 }
    )
  }

  try {
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json({ error: 'Database ID is required' }, { status: 400 })
    }

    const admin = getSupabaseAdmin()
    const userId = getUserIdFromCookies(request) || DEFAULT_USER_ID

    if (!admin) {
      // In-memory fallback
      const ok = deleteDatabaseInMemory(userId, id)
      if (!ok) {
        return NextResponse.json({ error: 'Database not found' }, { status: 404 })
      }
      return NextResponse.json({ success: true })
    }

    const { error } = await admin
      .from('synthetic_databases')
      .delete()
      .eq('id', id)

    if (error) {
      console.error('[Databases API] Delete error:', error.message)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Invalidate all list caches after mutation
    for (const key of apiCache.keys()) {
      if (key.startsWith('databases:list:')) {
        apiCache.delete(key)
      }
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[Databases API] Delete error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
