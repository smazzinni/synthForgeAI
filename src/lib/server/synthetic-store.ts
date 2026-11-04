/**
 * Single, owner-scoped data-access layer for synthetic databases.
 *
 * Backend selection (decided once per call):
 *   1. Prisma (PostgreSQL via DATABASE_URL)
 *   2. In-memory (fallback when Prisma fails / no DATABASE_URL)
 *
 * Every read/write is filtered by `user_id`, so one user can never read or
 * modify another user's database by guessing its id.
 */
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

export async function listDatabases(userId: string, opts: { includeData?: boolean } = {}): Promise<SyntheticDatabaseRecord[]> {
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
  try {
    const rec = await getDatabasePrisma(userId, id)
    if (rec) return rec
  } catch { /* fall through */ }
  return getDatabaseInMemory(userId, id)
}

export async function createDatabase(userId: string, input: SyntheticDatabaseInput): Promise<SyntheticDatabaseRecord> {
  try {
    return await createDatabasePrisma(userId, input)
  } catch (err) {
    console.warn('[synthetic-store] Prisma create failed, using in-memory store:', err)
    return createDatabaseInMemory(userId, input)
  }
}

export async function updateDatabase(userId: string, id: string, patch: SyntheticDatabasePatch): Promise<SyntheticDatabaseRecord | null> {
  try {
    const rec = await updateDatabasePrisma(userId, id, patch)
    if (rec) return rec
  } catch { /* fall through */ }
  return updateDatabaseInMemory(userId, id, patch)
}

export async function deleteDatabase(userId: string, id: string): Promise<boolean> {
  let ok = false
  try { ok = await deleteDatabasePrisma(userId, id) } catch { /* ignore */ }
  return deleteDatabaseInMemory(userId, id) || ok
}

export function countRows(data: Record<string, unknown[]>): number {
  return Object.values(data).reduce((sum, rows) => sum + (Array.isArray(rows) ? rows.length : 0), 0)
}
