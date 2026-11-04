/**
 * Database Connection types.
 *
 * A DbConnection represents a user-supplied external database that
 * SynthForge AI connects to LIVE (as opposed to the synthetic databases
 * stored in the app's own Supabase).
 */

export type DbDialect = 'postgres' | 'mysql'

export interface DbConnectionInput {
  name: string
  dialect: DbDialect
  host: string
  port: number
  username: string
  password: string
  database: string
  ssl?: boolean
  /** Optional default schema (Postgres only). Defaults to `public`. */
  schema?: string
}

export interface DbConnectionRecord extends DbConnectionInput {
  id: string
  user_id: string | null
  status: 'untested' | 'connected' | 'failed'
  last_connected_at: string | null
  error_message: string | null
  created_at: string
  updated_at: string
}

/**
 * Returned by the test/save endpoints. The password is NEVER sent back to
 * the client in plaintext — only a masked prefix.
 */
export type SafeDbConnectionRecord = Omit<DbConnectionRecord, 'password'> & {
  password_masked: string
}

export function maskPassword(password: string): string {
  // Never reveal any part of the secret (it may also be ciphertext).
  return password ? '••••••••' : ''
}

export function toSafeRecord(rec: DbConnectionRecord): SafeDbConnectionRecord {
  const { password: _drop, ...rest } = rec
  return { ...rest, password_masked: maskPassword(rec.password) }
}

export interface SchemaTable {
  name: string
  columns: Array<{ name: string; type: string; is_nullable?: boolean; is_primary?: boolean }>
}

export interface ExecuteResult {
  rows: Record<string, unknown>[]
  columns: string[]
  rowCount: number
  affectedRows: number
  executionTime: number
  error?: string
  /** True when more rows matched than were returned */
  truncated?: boolean
  /** Per-statement outcome for multi-statement SQL */
  statements?: Array<{ sql: string; rowCount: number; affectedRows: number; error?: string }>
  /** Refreshed schema after a DDL mutation, if applicable */
  refreshedSchema?: SchemaTable[]
}
