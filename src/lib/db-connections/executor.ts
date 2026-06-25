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
// every request. Pools are evicted after 10 minutes of inactivity.
interface PoolEntry {
  pool: unknown  // either pg.Pool or mysql2.Pool
  dialect: 'postgres' | 'mysql'
  lastUsedAt: number
  close: () => Promise<void>
}
const poolCache = new Map<string, PoolEntry>()
const POOL_TTL_MS = 10 * 60 * 1000

setInterval(() => {
  const now = Date.now()
  for (const [id, entry] of poolCache.entries()) {
    if (now - entry.lastUsedAt > POOL_TTL_MS) {
      entry.close().catch(() => {})
      poolCache.delete(id)
    }
  }
}, 60 * 1000).unref?.()

async function getPool(conn: DbConnectionRecord): Promise<PoolEntry> {
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
 * Test connectivity. Returns `{ ok, error? }`. Does NOT throw.
 */
export async function testConnection(conn: DbConnectionRecord): Promise<{ ok: boolean; error?: string; latencyMs?: number }> {
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
    return { ok: false, error: err instanceof Error ? err.message : String(err), latencyMs: Date.now() - start }
  }
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
    const rows = (Array.isArray(raw) && Array.isArray(raw[0]) ? raw[0] : raw) as Record<string, unknown>[]
    const fields = (Array.isArray(raw) && Array.isArray(raw[1]) ? raw[1] : []) as Array<{ name: string }>
    const columns = fields.length > 0 ? fields.map(f => f.name) : (rows.length > 0 ? Object.keys(rows[0]) : [])
    const affectedRows = (raw as unknown as { affectedRows?: number }).affectedRows || 0
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
