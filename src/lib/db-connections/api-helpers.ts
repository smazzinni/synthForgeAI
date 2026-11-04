import type { NextRequest } from 'next/server'
import type { DbConnectionInput, DbDialect } from './types'

// ─── Default user id (matches the convention used by /api/databases) ───
export const DEFAULT_USER_ID = '5a784d48-945a-47d3-ae95-d2aa5d9abe8c'

/**
 * Validate a connection input body. Returns either the validated input
 * or an error message suitable for returning to the client.
 */
export function validateInput(body: unknown): { ok: true; input: DbConnectionInput } | { ok: false; error: string } {
  if (typeof body !== 'object' || body === null) return { ok: false, error: 'Invalid body' }
  const b = body as Record<string, unknown>
  const name = typeof b.name === 'string' ? b.name.trim() : ''
  const dialect = typeof b.dialect === 'string' ? (b.dialect as DbDialect) : 'postgres'
  const host = typeof b.host === 'string' ? b.host.trim() : ''
  const port = typeof b.port === 'number' ? b.port : parseInt(String(b.port ?? ''), 10)
  const username = typeof b.username === 'string' ? b.username.trim() : ''
  const password = typeof b.password === 'string' ? b.password : ''
  const database = typeof b.database === 'string' ? b.database.trim() : ''
  const ssl = typeof b.ssl === 'boolean' ? b.ssl : false
  const schema = typeof b.schema === 'string' ? b.schema.trim() || undefined : undefined

  if (!name) return { ok: false, error: 'Name is required' }
  if (dialect !== 'postgres' && dialect !== 'mysql') return { ok: false, error: 'dialect must be "postgres" or "mysql"' }
  if (!host) return { ok: false, error: 'Host is required' }
  if (!Number.isInteger(port) || port < 1 || port > 65535) return { ok: false, error: 'Port must be an integer between 1 and 65535' }
  if (!username) return { ok: false, error: 'Username is required' }
  if (!database) return { ok: false, error: 'Database name is required' }

  return {
    ok: true,
    input: { name, dialect, host, port, username, password, database, ssl, schema },
  }
}
