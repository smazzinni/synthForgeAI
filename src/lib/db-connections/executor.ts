/**
 * Live SQL executor against user-supplied external databases.
 *
 * Supports PostgreSQL (via `pg`) and MySQL (via `mysql2`).
 *
 * This module is only imported on the server (API routes) — never on the
 * client — because it imports `pg` and `mysql2` which depend on Node APIs.
 */

import type { DbConnectionRecord, ExecuteResult, SchemaTable } from './types'
import { getConnection } from './store'

// ─── Lazy driver imports (so the bundle doesn't try to ship pg/mysql2) ───
async function getPostgresPool() {
  const pg = await import('pg')
  return pg.Pool
}

async function getMysqlPool() {
  const mysql = await import('mysql2/promise')
  return mysql.createPool
}

// ─── Connection-pool cache ───
// We keep one pool per connection id so we don't pay the TCP+auth cost on
// every request. Pools are evicted after 10 minutes of inactivity OR when
// the underlying connection record changes (PATCH) or is deleted.
interface PoolEntry {
  pool: unknown  // either pg.Pool or mysql2.Pool
  dialect: 'postgres' | 'mysql'
  lastUsedAt: number
  close: () => Promise<void>
}
const poolCache = new Map<string, PoolEntry>()
const POOL_TTL_MS = 10 * 60 * 1000

/**
 * Evict (close + remove) a cached pool. Called by the connections PATCH
 * and DELETE handlers so that credential changes take effect immediately
 * instead of after the 10-minute TTL.
 */
export async function evictPool(connectionId: string): Promise<void> {
  const entry = poolCache.get(connectionId)
  if (!entry) return
  try { await entry.close() } catch { /* ignore */ }
  poolCache.delete(connectionId)
}

// Lazy TTL check — instead of a setInterval that may be cleared by the
// serverless runtime, we evict expired entries on every `getPool` call.
function evictExpired() {
  const now = Date.now()
  for (const [id, entry] of poolCache.entries()) {
    if (now - entry.lastUsedAt > POOL_TTL_MS) {
      entry.close().catch(() => {})
      poolCache.delete(id)
    }
  }
}

async function getPool(conn: DbConnectionRecord): Promise<PoolEntry> {
  evictExpired() // lazy cleanup of expired pools
  const existing = poolCache.get(conn.id)
  if (existing) {
    existing.lastUsedAt = Date.now()
    return existing
  }

  if (conn.dialect === 'postgres') {
    const Pool = await getPostgresPool()
    const pool = new Pool({
      host: conn.host,
      port: conn.port,
      user: conn.username,
      password: conn.password,
      database: conn.database,
      ssl: conn.ssl ? { rejectUnauthorized: false } : false,
      max: 5,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
    })
    const entry: PoolEntry = {
      pool,
      dialect: 'postgres',
      lastUsedAt: Date.now(),
      close: async () => { await (pool as { end: () => Promise<void> }).end() },
    }
    poolCache.set(conn.id, entry)
    return entry
  }

  if (conn.dialect === 'mysql') {
    const createPool = await getMysqlPool()
    const pool = createPool({
      host: conn.host,
      port: conn.port,
      user: conn.username,
      password: conn.password,
      database: conn.database,
      ssl: conn.ssl ? {} : undefined,
      waitForConnections: true,
      connectionLimit: 5,
      queueLimit: 0,
      connectTimeout: 10000,
    })
    const entry: PoolEntry = {
      pool,
      dialect: 'mysql',
      lastUsedAt: Date.now(),
      close: async () => { await (pool as { end: () => Promise<void> }).end() },
    }
    poolCache.set(conn.id, entry)
    return entry
  }

  throw new Error(`Unsupported dialect: ${(conn as { dialect: string }).dialect}`)
}

// ─── Public API ───

/**
 * Test connectivity. Returns `{ ok, error?, hint?, latencyMs? }`. Does NOT throw.
 *
 * The `hint` field provides a human-friendly explanation for the most common
 * failure modes (paused Supabase project, IPv6-only host, wrong credentials,
 * etc.) so the user can fix the issue without reading raw socket errors.
 */
export async function testConnection(conn: DbConnectionRecord): Promise<{ ok: boolean; error?: string; hint?: string; latencyMs?: number }> {
  const start = Date.now()
  try {
    const entry = await getPool(conn)
    if (entry.dialect === 'postgres') {
      const pool = entry.pool as { query: (text: string) => Promise<{ rows: unknown[] }> }
      await pool.query('SELECT 1 AS ok')
    } else {
      const pool = entry.pool as { query: (sql: string, values?: unknown) => Promise<unknown> }
      await pool.query('SELECT 1 AS ok')
    }
    return { ok: true, latencyMs: Date.now() - start }
  } catch (err) {
    // Evict the pool so subsequent retries start fresh
    const entry = poolCache.get(conn.id)
    if (entry) {
      entry.close().catch(() => {})
      poolCache.delete(conn.id)
    }

    const rawError = err instanceof Error ? err.message : String(err)
    const hint = explainConnectionError(rawError, conn)

    return { ok: false, error: rawError, hint, latencyMs: Date.now() - start }
  }
}

/**
 * Map raw connection errors to user-actionable hints.
 */
function explainConnectionError(message: string, conn: DbConnectionRecord): string {
  const m = message.toLowerCase()

  // DNS resolution failures
  if (m.includes('enotfound') || m.includes('getaddrinfo')) {
    if (conn.host.endsWith('.supabase.co')) {
      return `The Supabase project "${conn.host.split('.')[0]}" could not be found. The project may be paused or deleted — log into your Supabase dashboard to check its status. For newer Supabase projects, use the pooler hostname (aws-0-<region>.pooler.supabase.com) instead of the direct host.`
    }
    return `Hostname "${conn.host}" could not be resolved. Check for typos, or that the host is reachable from this network.`
  }

  // TCP connection refused (port not listening)
  if (m.includes('econnrefused')) {
    if (conn.host.endsWith('.supabase.co')) {
      return `The Supabase project refused the connection on port ${conn.port}. This usually means the project is PAUSED (free-tier Supabase projects auto-pause after 7 days of inactivity). Log into your Supabase dashboard and click "Restore project". Alternatively, use the pooler hostname aws-0-<region>.pooler.supabase.com (port 6543 for transaction mode, 5432 for session mode).`
    }
    return `Connection refused on ${conn.host}:${conn.port}. The database server may not be running, the port may be blocked by a firewall, or you may need to use a different port.`
  }

  // TCP connection timeout
  if (m.includes('etimedout') || m.includes('timeout') || m.includes('timeoutexpired')) {
    return `Connection timed out after 10 seconds. The host may be unreachable from this network, or a firewall is blocking port ${conn.port}. For cloud DBs, verify the IP allowlist includes this server's IP.`
  }

  // Authentication failures
  if (m.includes('password authentication failed') || m.includes('28p01') || m.includes('access denied')) {
    return `Authentication failed — the username or password is incorrect. Verify the credentials and try again.`
  }

  // Database doesn't exist
  if (m.includes('3d000') || m.includes('database') && m.includes('does not exist')) {
    return `Database "${conn.database}" does not exist on the server. Check the database name.`
  }

  // SSL handshake failures
  if (m.includes('ssl') || m.includes('tls') || m.includes('certificate')) {
    return `SSL/TLS handshake failed. Try toggling the "Use SSL" option, or for self-signed certs, the connection may require a custom CA.`
  }

  // Pooler-specific Supavisor errors
  if (m.includes('tenant/user') && m.includes('not found')) {
    return `The Supabase pooler does not recognize this project. The pooler username should be "postgres.<project-ref>" (e.g. postgres.abcdefghij). Check the username format.`
  }

  return ''
}

/**
 * Fetch the schema (tables + columns) of an external database.
 */
export async function fetchExternalSchema(conn: DbConnectionRecord): Promise<SchemaTable[]> {
  const entry = await getPool(conn)
  if (entry.dialect === 'postgres') {
    const pool = entry.pool as { query: (text: string, values?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }> }
    const schemaName = conn.schema || 'public'
    const { rows } = await pool.query(
      `SELECT
         t.table_name AS table_name,
         c.column_name AS column_name,
         c.data_type AS data_type,
         c.is_nullable AS is_nullable,
         (CASE WHEN pk.column_name IS NOT NULL THEN 'YES' ELSE 'NO' END) AS is_primary
       FROM information_schema.tables t
       JOIN information_schema.columns c
         ON c.table_schema = t.table_schema AND c.table_name = t.table_name
       LEFT JOIN information_schema.table_constraints tc
         ON tc.table_schema = t.table_schema AND tc.table_name = t.table_name AND tc.constraint_type = 'PRIMARY KEY'
       LEFT JOIN information_schema.key_column_usage pk
         ON pk.constraint_name = tc.constraint_name AND pk.column_name = c.column_name
       WHERE t.table_schema = $1 AND t.table_type = 'BASE TABLE'
       ORDER BY t.table_name, c.ordinal_position`,
      [schemaName],
    )
    return groupRowsByTable(rows)
  }

  // MySQL
  const pool = entry.pool as { query: (sql: string, values?: unknown) => Promise<unknown[]> }
  const resultRows = (await pool.query(`
    SELECT
      t.TABLE_NAME AS table_name,
      c.COLUMN_NAME AS column_name,
      c.DATA_TYPE AS data_type,
      c.IS_NULLABLE AS is_nullable,
      (CASE WHEN c.COLUMN_KEY = 'PRI' THEN 'YES' ELSE 'NO' END) AS is_primary
    FROM information_schema.TABLES t
    JOIN information_schema.COLUMNS c
      ON c.TABLE_SCHEMA = t.TABLE_SCHEMA AND c.TABLE_NAME = t.TABLE_NAME
    WHERE t.TABLE_SCHEMA = ? AND t.TABLE_TYPE = 'BASE TABLE'
    ORDER BY t.TABLE_NAME, c.ORDINAL_POSITION
  `, [conn.database])) as unknown as Record<string, unknown>[]
  // mysql2 returns [rows, fields] — normalize
  const rows = Array.isArray(resultRows) && Array.isArray(resultRows[0]) && !resultRows[0]?.table_name
    ? (resultRows[0] as Record<string, unknown>[])
    : resultRows
  return groupRowsByTable(rows)
}

function groupRowsByTable(rows: Record<string, unknown>[]): SchemaTable[] {
  const byTable = new Map<string, SchemaTable>()
  for (const row of rows) {
    const tableName = String(row.table_name || row.TABLE_NAME)
    if (!tableName) continue
    if (!byTable.has(tableName)) {
      byTable.set(tableName, { name: tableName, columns: [] })
    }
    byTable.get(tableName)!.columns.push({
      name: String(row.column_name || row.COLUMN_NAME),
      type: String(row.data_type || row.DATA_TYPE || 'varchar'),
      is_nullable: String(row.is_nullable || row.IS_NULLABLE || 'YES').toUpperCase() === 'YES',
      is_primary: String(row.is_primary || row.IS_PRIMARY || 'NO').toUpperCase() === 'YES',
    })
  }
  return Array.from(byTable.values())
}

/**
 * Fetch sample rows for a table (default 100). Used to pre-populate the
 * studio's data tab when the user opens an external DB.
 */
export async function fetchSampleRows(conn: DbConnectionRecord, tableName: string, limit = 100): Promise<{ rows: Record<string, unknown>[]; columns: string[] }> {
  const entry = await getPool(conn)
  // Sanitize table name — only allow word chars + dots
  const safeName = tableName.replace(/[^a-zA-Z0-9_.]/g, '')
  if (safeName !== tableName) {
    throw new Error(`Invalid table name: ${tableName}`)
  }

  if (entry.dialect === 'postgres') {
    const pool = entry.pool as { query: (text: string, values?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }> }
    const { rows } = await pool.query(`SELECT * FROM ${safeName} LIMIT $1`, [limit])
    const columns = rows.length > 0 ? Object.keys(rows[0]) : []
    return { rows, columns }
  }

  const pool = entry.pool as { query: (sql: string, values?: unknown[]) => Promise<unknown> }
  const raw = await pool.query(`SELECT * FROM ${safeName} LIMIT ?`, [limit])
  const rows = (Array.isArray(raw) && Array.isArray(raw[0]) ? raw[0] : raw) as Record<string, unknown>[]
  const columns = rows.length > 0 ? Object.keys(rows[0]) : []
  return { rows, columns }
}

/**
 * Execute arbitrary SQL against the external DB. Used by the AI chat for
 * CRUD operations (INSERT/UPDATE/DELETE/DROP/CREATE/ALTER etc.) as well as
 * read queries (SELECT).
 */
export async function executeSql(
  conn: DbConnectionRecord,
  sql: string,
): Promise<ExecuteResult> {
  const start = Date.now()
  const entry = await getPool(conn)

  try {
    if (entry.dialect === 'postgres') {
      const pool = entry.pool as { query: (text: string) => Promise<{ rows: Record<string, unknown>[]; rowCount: number; command?: string }> }
      const result = await pool.query(sql)
      const columns = result.rows.length > 0 ? Object.keys(result.rows[0]) : []
      const isMutation = !!result.command && result.command !== 'SELECT'
      return {
        rows: result.rows.slice(0, 1000),
        columns,
        rowCount: result.rows.length,
        affectedRows: isMutation ? (result.rowCount || 0) : 0,
        executionTime: Date.now() - start,
      }
    }

    // MySQL
    const pool = entry.pool as { query: (sql: string, values?: unknown) => Promise<unknown> }
    const raw = await pool.query(sql)

    // mysql2/promise returns:
    //   - For SELECT: [rows[], fields[]]
    //   - For INSERT/UPDATE/DELETE: [ResultSetHeader, fields[]]
    //     where ResultSetHeader is an OBJECT (not an array) with
    //     { fieldCount, affectedRows, insertId, info, serverStatus, warningStatus }
    //
    // BUGFIX (BUG-16): the previous code assumed `raw[0]` was always an
    // array. For mutations it's the ResultSetHeader object, so:
    //   - `Array.isArray(raw[0])` is false → `rows = raw` (the 2-element tuple)
    //   - `Object.keys(rows[0])` returned the ResultSetHeader's keys
    //   - `affectedRows` was read off the array (always undefined → 0)
    // The studio then showed "INSERT OK — 0 row(s) affected" and rendered
    // the ResultSetHeader as if it were a data row.
    const header = Array.isArray(raw) ? raw[0] : raw
    const isResultSetHeader =
      typeof header === 'object' && header !== null && !Array.isArray(header) && 'affectedRows' in header

    let rows: Record<string, unknown>[]
    let fields: Array<{ name: string }>
    let affectedRows: number

    if (isResultSetHeader) {
      // INSERT / UPDATE / DELETE / DDL
      rows = []
      fields = []
      affectedRows = (header as { affectedRows?: number }).affectedRows || 0
    } else {
      // SELECT
      rows = (Array.isArray(raw) && Array.isArray(raw[0]) ? raw[0] : raw) as Record<string, unknown>[]
      fields = (Array.isArray(raw) && Array.isArray(raw[1]) ? raw[1] : []) as Array<{ name: string }>
      affectedRows = 0
    }

    const columns = fields.length > 0 ? fields.map(f => f.name) : (rows.length > 0 ? Object.keys(rows[0]) : [])

    return {
      rows: rows.slice(0, 1000),
      columns,
      rowCount: rows.length,
      affectedRows,
      executionTime: Date.now() - start,
    }
  } catch (err) {
    return {
      rows: [],
      columns: [],
      rowCount: 0,
      affectedRows: 0,
      executionTime: Date.now() - start,
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

/**
 * Convenience wrapper used by /api/sql/execute when a connectionId is supplied.
 * Loads the connection record (regardless of user — the route is responsible
 * for authentication), then runs `executeSql`.
 */
export async function executeSqlOnExternalConnection(connectionId: string, sql: string): Promise<ExecuteResult & { error?: string }> {
  // Use empty user id — getConnection falls back to a global in-memory search.
  const conn = await getConnection('', connectionId)
  if (!conn) {
    return {
      rows: [], columns: [], rowCount: 0, affectedRows: 0, executionTime: 0,
      error: `Connection ${connectionId} not found`,
    }
  }
  return executeSql(conn, sql)
}
