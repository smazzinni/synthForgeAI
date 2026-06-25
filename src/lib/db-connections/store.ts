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

// In-memory fallback keyed by user_id
const inMemoryStore = new Map<string, DbConnectionRecord[]>()

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

async function trySupabase(): Promise<boolean> {
  const admin = getSupabaseAdmin()
  if (!admin) return false
  // Probe the table — if it doesn't exist Supabase returns an error and we
  // transparently fall back to in-memory storage.
  const { error } = await admin.from('db_connections').select('id').limit(1)
  return !error
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
    const { data, error } = await admin
      .from('db_connections')
      .select('*')
      .eq('id', id)
      .single()
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
    // Fall through to in-memory on error
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
    const { error } = await admin
      .from('db_connections')
      .delete()
      .eq('id', id)
      .eq('user_id', userId)
    if (!error) return true
  }
  const list = listRaw(userId)
  const filtered = list.filter(c => c.id !== id)
  if (filtered.length === list.length) return false
  saveRaw(userId, filtered)
  return true
}
