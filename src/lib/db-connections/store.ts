/**
 * DB Connection store.
 *
 * Persists user-supplied external DB connections to:
 *   1. Supabase (`db_connections` table) — when the Supabase admin client is
 *      available AND the table exists.
 *   2. In-memory fallback — for local development / when Supabase isn't
 *      configured. The fallback is keyed by user id.
 *
 * The fallback is per-process (not durable) but lets the feature work
 * end-to-end without requiring a Supabase migration. If you want durable
 * storage, run the SQL in `MIGRATION.sql` against your Supabase project.
 */

import { getSupabaseAdmin } from '@/lib/supabase/admin'
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
    if (error || !data) return []
    return (data as DbConnectionRecord[]).map(toSafeRecord)
  }
  return listRaw(userId).map(toSafeRecord)
}

export async function getConnection(userId: string, id: string): Promise<DbConnectionRecord | null> {
  if (await trySupabase()) {
    const admin = getSupabaseAdmin()!
    // SECURITY: always scope by user_id so a user can only fetch their own
    // connection (which contains the plaintext password). The previous
    // version omitted this filter, allowing any authenticated user to read
    // any other user's connection record by id.
    let query = admin
      .from('db_connections')
      .select('*')
      .eq('id', id)
    if (userId) {
      query = query.eq('user_id', userId)
    }
    const { data, error } = await query.single()
    if (error || !data) return null
    return data as DbConnectionRecord
  }
  // In-memory: scope to the supplied user, but fall back to a global search
  // (used by the SQL executor which doesn't always have the user id handy).
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
    // BUGFIX (BUG-10): use `.select('id')` after delete so we can detect
    // whether any row was actually removed. The previous version returned
    // `true` even when the id didn't exist, hiding 404s from the client.
    const { data, error } = await admin
      .from('db_connections')
      .delete({ count: 'exact' })
      .eq('id', id)
      .eq('user_id', userId)
      .select('id')
    if (error) return false
    return Array.isArray(data) && data.length > 0
  }
  const list = listRaw(userId)
  const filtered = list.filter(c => c.id !== id)
  if (filtered.length === list.length) return false
  saveRaw(userId, filtered)
  return true
}
