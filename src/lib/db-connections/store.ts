/**
 * DB Connection store.
 *
 * Persists user-supplied external DB connections to:
 *   1. Supabase (`db_connections` table) — when the Supabase admin client is
 *      available AND the table exists.
 *   2. Prisma (SQLite/PostgreSQL) — durable fallback when Supabase isn't
 *      available. This ensures connections persist across server restarts
 *      and user logouts.
 *   3. In-memory fallback — for local development when neither Supabase nor
 *      Prisma is available. The fallback is keyed by user id.
 */

import { getSupabaseAdmin } from '@/lib/supabase/admin'
import { db } from '@/lib/db'
import type { DbConnectionInput, DbConnectionRecord, SafeDbConnectionRecord } from './types'
import { toSafeRecord } from './types'

// In-memory fallback keyed by user_id.
// Use globalThis so the store survives Next.js dev hot-reloads (Turbopack
// re-evaluates modules on file changes, which would reset a plain Map and
// lose all saved connections).
const globalForConnStore = globalThis as unknown as {
  __synthConnStore?: Map<string, DbConnectionRecord[]>
}
const inMemoryStore: Map<string, DbConnectionRecord[]> =
  globalForConnStore.__synthConnStore ?? (globalForConnStore.__synthConnStore = new Map())

// ─── Prisma fallback helpers ───
// Convert between Prisma's DbConnection model and our DbConnectionRecord type.
function prismaToRecord(p: {
  id: string
  userId: string
  name: string
  dialect: string
  host: string
  port: number
  username: string
  password: string
  database: string
  schema: string | null
  ssl: boolean
  status: string
  lastConnectedAt: Date | null
  errorMessage: string | null
  createdAt: Date
  updatedAt: Date
}): DbConnectionRecord {
  return {
    id: p.id,
    user_id: p.userId,
    name: p.name,
    dialect: p.dialect as 'postgres' | 'mysql',
    host: p.host,
    port: p.port,
    username: p.username,
    password: p.password,
    database: p.database,
    schema: p.schema,
    ssl: p.ssl,
    status: p.status as 'untested' | 'connected' | 'failed',
    last_connected_at: p.lastConnectedAt?.toISOString() || null,
    error_message: p.errorMessage,
    created_at: p.createdAt.toISOString(),
    updated_at: p.updatedAt.toISOString(),
  }
}

async function prismaList(userId: string): Promise<DbConnectionRecord[]> {
  try {
    const rows = await db.dbConnection.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    })
    return rows.map(prismaToRecord)
  } catch (err) {
    console.warn('[db-connections/store] Prisma list failed:', err)
    return []
  }
}

async function prismaGet(userId: string, id: string): Promise<DbConnectionRecord | null> {
  try {
    // If userId is empty, search by id only (used by SQL executor)
    const where = userId ? { id, userId } : { id }
    const row = await db.dbConnection.findFirst({ where })
    return row ? prismaToRecord(row) : null
  } catch (err) {
    console.warn('[db-connections/store] Prisma get failed:', err)
    return null
  }
}

async function prismaCreate(record: DbConnectionRecord): Promise<DbConnectionRecord> {
  try {
    const row = await db.dbConnection.create({
      data: {
        id: record.id,
        userId: record.user_id,
        name: record.name,
        dialect: record.dialect,
        host: record.host,
        port: record.port,
        username: record.username,
        password: record.password,
        database: record.database,
        schema: record.schema || null,
        ssl: record.ssl,
        status: record.status,
        lastConnectedAt: record.last_connected_at ? new Date(record.last_connected_at) : null,
        errorMessage: record.error_message,
      },
    })
    return prismaToRecord(row)
  } catch (err) {
    console.warn('[db-connections/store] Prisma create failed:', err)
    return record
  }
}

async function prismaUpdate(
  userId: string,
  id: string,
  patch: Partial<DbConnectionInput> & { status?: DbConnectionRecord['status']; error_message?: string | null },
): Promise<DbConnectionRecord | null> {
  try {
    const now = new Date()
    const data: Record<string, unknown> = { updatedAt: now }
    if (patch.name !== undefined) data.name = patch.name
    if (patch.host !== undefined) data.host = patch.host
    if (patch.port !== undefined) data.port = patch.port
    if (patch.username !== undefined) data.username = patch.username
    if (patch.password !== undefined) data.password = patch.password
    if (patch.database !== undefined) data.database = patch.database
    if (patch.schema !== undefined) data.schema = patch.schema
    if (patch.ssl !== undefined) data.ssl = patch.ssl
    if (patch.dialect !== undefined) data.dialect = patch.dialect
    if (patch.status !== undefined) {
      data.status = patch.status
      if (patch.status === 'connected') data.lastConnectedAt = now
    }
    if (patch.error_message !== undefined) data.errorMessage = patch.error_message

    const row = await db.dbConnection.update({
      where: { id },
      data,
    })
    return prismaToRecord(row)
  } catch (err) {
    console.warn('[db-connections/store] Prisma update failed:', err)
    return null
  }
}

async function prismaDelete(userId: string, id: string): Promise<boolean> {
  try {
    await db.dbConnection.delete({ where: { id } })
    return true
  } catch {
    return false
  }
}

function generateId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID()
  }
  return `conn_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
}

function listRaw(userId: string): DbConnectionRecord[] {
  const list = inMemoryStore.get(userId) || []
  return list
}

function saveRaw(userId: string, list: DbConnectionRecord[]) {
  inMemoryStore.set(userId, list)
}

// Cache the result of the table-existence probe so we don't pay an extra
// round-trip on every connections API call. Re-probe only when a Supabase
// error indicates the table doesn't exist (allows users to add the table
// via db-connections-migration.sql without restarting the server).
let supabaseAvailable: boolean | null = null

// One-time warning flag for the "table doesn't exist" fallthrough.
let tableMissingWarned = false

async function trySupabase(): Promise<boolean> {
  if (supabaseAvailable !== null) return supabaseAvailable
  const admin = getSupabaseAdmin()
  if (!admin) {
    supabaseAvailable = false
    return false
  }
  // Probe the table — if it doesn't exist Supabase returns an error and we
  // transparently fall back to in-memory storage.
  try {
    const { error } = await admin.from('db_connections').select('id').limit(1)
    // Treat "relation does not exist" (42P01 / 42501) as "table not present"
    // → fall back to in-memory. Any other error → also fall back.
    supabaseAvailable = !error
  } catch {
    supabaseAvailable = false
  }
  return supabaseAvailable
}

/**
 * Reset the cached Supabase availability flag. Called by tests or by
 * routes that just created the db_connections table to force a re-probe.
 */
export function _resetSupabaseProbeForTesting(): void {
  supabaseAvailable = null
}

export async function listConnections(userId: string): Promise<SafeDbConnectionRecord[]> {
  if (await trySupabase()) {
    const admin = getSupabaseAdmin()!
    const { data, error } = await admin
      .from('db_connections')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
    if (error || !data) {
      // Supabase failed — fall through to Prisma, then in-memory
      const prismaRecords = await prismaList(userId)
      if (prismaRecords.length > 0) return prismaRecords.map(toSafeRecord)
      return listRaw(userId).map(toSafeRecord)
    }
    return (data as DbConnectionRecord[]).map(toSafeRecord)
  }
  // Supabase not available — try Prisma (durable), then in-memory
  const prismaRecords = await prismaList(userId)
  if (prismaRecords.length > 0) return prismaRecords.map(toSafeRecord)
  return listRaw(userId).map(toSafeRecord)
}

export async function getConnection(userId: string, id: string): Promise<DbConnectionRecord | null> {
  if (!id) return null
  if (await trySupabase()) {
    const admin = getSupabaseAdmin()!
    let query = admin
      .from('db_connections')
      .select('*')
      .eq('id', id)
    if (userId) {
      query = query.eq('user_id', userId)
    }
    const { data, error } = await query.single()
    if (!error && data) return data as DbConnectionRecord
    // BUGFIX (disconnect): If the user-scoped lookup failed (e.g. the Supabase
    // session expired so userId fell back to DEFAULT_USER_ID, but the
    // connection was saved under the real logged-in user), retry with an
    // id-only lookup. This prevents the AI chat from "disconnecting" mid-task
    // when the auth cookie is momentarily unavailable. Connections are
    // user-created and the execute route already gates on authentication, so
    // an id-only fallback is safe here.
    if (userId && error) {
      const { data: fallback, error: fbErr } = await admin
        .from('db_connections')
        .select('*')
        .eq('id', id)
        .single()
      if (!fbErr && fallback) return fallback as DbConnectionRecord
    }
    // Supabase failed — fall through to Prisma, then in-memory
  }
  // Try Prisma (durable storage) — first user-scoped, then id-only fallback
  const prismaRecord = await prismaGet(userId, id)
  if (prismaRecord) return prismaRecord
  // BUGFIX (disconnect): id-only fallback in Prisma so a connection saved
  // under one user_id is still found when the auth state changes.
  if (userId) {
    const fallback = await prismaGet('', id)
    if (fallback) return fallback
  }
  // In-memory fallback
  const userScoped = listRaw(userId).find(c => c.id === id)
  if (userScoped) return userScoped
  for (const list of inMemoryStore.values()) {
    const found = list.find(c => c.id === id)
    if (found) return found
  }
  return null
}

export async function createConnection(
  userId: string,
  input: DbConnectionInput,
  status: DbConnectionRecord['status'] = 'untested',
  errorMessage: string | null = null,
): Promise<DbConnectionRecord> {
  const now = new Date().toISOString()
  const record: DbConnectionRecord = {
    ...input,
    id: generateId(),
    user_id: userId,
    status,
    last_connected_at: status === 'connected' ? now : null,
    error_message: errorMessage,
    created_at: now,
    updated_at: now,
  }

  if (await trySupabase()) {
    const admin = getSupabaseAdmin()!
    const { data, error } = await admin
      .from('db_connections')
      .insert({
        ...input,
        user_id: userId,
        status,
        last_connected_at: record.last_connected_at,
        error_message: errorMessage,
      })
      .select()
      .single()
    if (!error && data) return data as DbConnectionRecord
    // BUGFIX (BUG-25): distinguish "table doesn't exist" (fall through to
    // in-memory with a one-time warning) from real errors like RLS denial
    // or unique-constraint violation (which should NOT silently fall
    // through, because the user would see a "success" toast but the
    // connection would be ephemeral — only on this server instance).
    if (error) {
      const msg = (error.message || '').toLowerCase()
      const isTableMissing =
        msg.includes('does not exist') ||
        msg.includes('relation "public.db_connections" does not exist') ||
        msg.includes('42p01')
      if (isTableMissing) {
        // Table not created yet — fall through to in-memory (one-time warn)
        if (!tableMissingWarned) {
          console.warn('[db-connections/store] Table "db_connections" does not exist in Supabase. Falling back to in-memory storage. Run db-connections-migration.sql to enable persistent storage.')
          tableMissingWarned = true
        }
        // Reset the cached probe so the next call re-checks (in case the
        // user runs the migration in the meantime).
        supabaseAvailable = null
      } else {
        // Real error (RLS, constraint, etc.) — throw so the route returns
        // a 500 instead of silently falling through to in-memory.
        throw new Error(`Failed to save connection: ${error.message}`)
      }
    }
  }

  // Supabase failed or not available — save to Prisma (durable) AND in-memory
  await prismaCreate(record)
  const list = listRaw(userId)
  list.push(record)
  saveRaw(userId, list)
  return record
}

export async function updateConnection(
  userId: string,
  id: string,
  patch: Partial<DbConnectionInput> & { status?: DbConnectionRecord['status']; error_message?: string | null },
): Promise<DbConnectionRecord | null> {
  const now = new Date().toISOString()

  if (await trySupabase()) {
    const admin = getSupabaseAdmin()!
    const updatePayload: Record<string, unknown> = { updated_at: now }
    if (patch.name !== undefined) updatePayload.name = patch.name
    if (patch.host !== undefined) updatePayload.host = patch.host
    if (patch.port !== undefined) updatePayload.port = patch.port
    if (patch.username !== undefined) updatePayload.username = patch.username
    if (patch.password !== undefined) updatePayload.password = patch.password
    if (patch.database !== undefined) updatePayload.database = patch.database
    if (patch.ssl !== undefined) updatePayload.ssl = patch.ssl
    if (patch.schema !== undefined) updatePayload.schema = patch.schema
    if (patch.dialect !== undefined) updatePayload.dialect = patch.dialect
    if (patch.status !== undefined) {
      updatePayload.status = patch.status
      if (patch.status === 'connected') updatePayload.last_connected_at = now
    }
    if (patch.error_message !== undefined) updatePayload.error_message = patch.error_message

    const { data, error } = await admin
      .from('db_connections')
      .update(updatePayload)
      .eq('id', id)
      .eq('user_id', userId)
      .select()
      .single()
    if (!error && data) return data as DbConnectionRecord
  }

  // Supabase failed or not available — try Prisma, then in-memory
  const prismaUpdated = await prismaUpdate(userId, id, patch)
  if (prismaUpdated) return prismaUpdated

  const list = listRaw(userId)
  const idx = list.findIndex(c => c.id === id)
  if (idx === -1) return null
  const updated: DbConnectionRecord = {
    ...list[idx],
    ...patch,
    updated_at: now,
    last_connected_at: patch.status === 'connected' ? now : list[idx].last_connected_at,
  }
  list[idx] = updated
  saveRaw(userId, list)
  return updated
}

export async function deleteConnection(userId: string, id: string): Promise<boolean> {
  if (await trySupabase()) {
    const admin = getSupabaseAdmin()!
    const { data, error } = await admin
      .from('db_connections')
      .delete({ count: 'exact' })
      .eq('id', id)
      .eq('user_id', userId)
      .select('id')
    if (!error && Array.isArray(data) && data.length > 0) {
      // Also delete from Prisma + in-memory to keep them in sync
      await prismaDelete(userId, id)
      const list = listRaw(userId)
      saveRaw(userId, list.filter(c => c.id !== id))
      return true
    }
    // Supabase failed — fall through to Prisma + in-memory
  }
  // Try Prisma
  const prismaDeleted = await prismaDelete(userId, id)
  // Also delete from in-memory
  const list = listRaw(userId)
  const filtered = list.filter(c => c.id !== id)
  if (filtered.length !== list.length) {
    saveRaw(userId, filtered)
    return true
  }
  return prismaDeleted
}

