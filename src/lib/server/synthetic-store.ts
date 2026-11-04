/**
 * Single, owner-scoped data-access layer for synthetic databases.
 *
 * Backend selection (decided once per call):
 *   1. Supabase (`synthetic_databases`) when the service-role client is configured
 *   2. Prisma (SQLite/Postgres via DATABASE_URL)
 *   3. In-memory (last-resort dev fallback)
 *
 * Every read/write is filtered by `user_id`, so one user can never read or
 * modify another user's database by guessing its id.
 */
import { getSupabaseAdmin } from '@/lib/supabase/admin'
import {
  createDatabasePrisma,
  deleteDatabasePrisma,
  getDatabasePrisma,
  listDatabasesPrisma,
  updateDatabasePrisma,
} from '@/lib/prisma-store'
import {
  createDatabaseInMemory,
  deleteDatabaseInMemory,
  getDatabaseInMemory,
  listDatabasesInMemory,
  updateDatabaseInMemory,
  type SyntheticDatabaseRecord,
} from '@/lib/in-memory-store'

export type { SyntheticDatabaseRecord }
export type SyntheticDatabaseInput = Omit<SyntheticDatabaseRecord, 'id' | 'user_id' | 'created_at' | 'updated_at'>
export type SyntheticDatabasePatch = Partial<Omit<SyntheticDatabaseRecord, 'id' | 'user_id' | 'created_at' | 'updated_at'>>

/** Columns returned by list queries — omits the (potentially huge) data_json. */
const LIST_COLUMNS = 'id, name, db_type, schema_json, row_count, quality_score, status, user_id, created_at, updated_at'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function supabase(): any | null {
  return getSupabaseAdmin()
}

function normalise(row: Record<string, unknown>): SyntheticDatabaseRecord {
  return {
    id: String(row.id),
    name: String(row.name ?? ''),
    db_type: String(row.db_type ?? 'postgresql'),
    schema_json: row.schema_json ?? [],
    data_json: (row.data_json as Record<string, unknown[]>) ?? {},
    row_count: Number(row.row_count ?? 0),
    quality_score: (row.quality_score as number | null) ?? null,
    status: String(row.status ?? 'draft'),
    user_id: String(row.user_id ?? ''),
    created_at: String(row.created_at ?? new Date().toISOString()),
    updated_at: String(row.updated_at ?? row.created_at ?? new Date().toISOString()),
  }
}

export async function listDatabases(userId: string, opts: { includeData?: boolean } = {}): Promise<SyntheticDatabaseRecord[]> {
  const sb = supabase()
  if (sb) {
    const { data, error } = await sb
      .from('synthetic_databases')
      .select(opts.includeData ? '*' : LIST_COLUMNS)
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(100)
    if (error) throw new Error(error.message)
    return (data as Record<string, unknown>[]).map(normalise)
  }
  let rows: SyntheticDatabaseRecord[]
  try {
    rows = await listDatabasesPrisma(userId)
  } catch {
    rows = listDatabasesInMemory(userId)
  }
  return opts.includeData ? rows : rows.map(r => ({ ...r, data_json: {} }))
}

export async function getDatabase(userId: string, id: string): Promise<SyntheticDatabaseRecord | null> {
  if (!id) return null
  const sb = supabase()
  if (sb) {
    const { data, error } = await sb
      .from('synthetic_databases')
      .select('*')
      .eq('id', id)
      .eq('user_id', userId)
      .maybeSingle()
    if (error) throw new Error(error.message)
    return data ? normalise(data) : null
  }
  try {
    const rec = await getDatabasePrisma(userId, id)
    if (rec) return rec
  } catch { /* fall through */ }
  return getDatabaseInMemory(userId, id)
}

export async function createDatabase(userId: string, input: SyntheticDatabaseInput): Promise<SyntheticDatabaseRecord> {
  const sb = supabase()
  if (sb) {
    const { data, error } = await sb
      .from('synthetic_databases')
      .insert({ ...input, user_id: userId })
      .select()
      .single()
    if (error) throw new Error(error.message)
    return normalise(data)
  }
  try {
    return await createDatabasePrisma(userId, input)
  } catch (err) {
    console.warn('[synthetic-store] Prisma create failed, using in-memory store:', err)
    return createDatabaseInMemory(userId, input)
  }
}

export async function updateDatabase(userId: string, id: string, patch: SyntheticDatabasePatch): Promise<SyntheticDatabaseRecord | null> {
  const sb = supabase()
  if (sb) {
    const { data, error } = await sb
      .from('synthetic_databases')
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('user_id', userId)
      .select(LIST_COLUMNS)
      .maybeSingle()
    if (error) throw new Error(error.message)
    return data ? normalise(data) : null
  }
  try {
    const rec = await updateDatabasePrisma(userId, id, patch)
    if (rec) return rec
  } catch { /* fall through */ }
  return updateDatabaseInMemory(userId, id, patch)
}

export async function deleteDatabase(userId: string, id: string): Promise<boolean> {
  const sb = supabase()
  if (sb) {
    // Conversations reference the database; detach them first (FK safety).
    await sb.from('conversations').update({ database_id: null }).eq('database_id', id).eq('user_id', userId)
    const { data, error } = await sb
      .from('synthetic_databases')
      .delete()
      .eq('id', id)
      .eq('user_id', userId)
      .select('id')
    if (error) throw new Error(error.message)
    return Array.isArray(data) && data.length > 0
  }
  let ok = false
  try { ok = await deleteDatabasePrisma(userId, id) } catch { /* ignore */ }
  return deleteDatabaseInMemory(userId, id) || ok
}

export function countRows(data: Record<string, unknown[]>): number {
  return Object.values(data).reduce((sum, rows) => sum + (Array.isArray(rows) ? rows.length : 0), 0)
}
