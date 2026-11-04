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
import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'

/** Max rows returned to the client per statement. */
const MAX_RESULT_ROWS = 1000

/**
 * TLS certificate verification for external databases. Off by default because
 * most managed providers (Supabase pooler, shared hosts) use certs that are not
 * in Node's CA store; set DB_SSL_REJECT_UNAUTHORIZED=true to enforce it.
 */
const SSL_REJECT_UNAUTHORIZED = process.env.DB_SSL_REJECT_UNAUTHORIZED === 'true'

// ─── SSRF guard ───
// Users supply arbitrary hosts. In production, refuse loopback / private /
// link-local targets (cloud metadata endpoints, internal services) unless
// explicitly allowed with ALLOW_PRIVATE_DB_HOSTS=true.
function isPrivateAddress(ip: string): boolean {
  if (ip.includes(':')) {
    const v = ip.toLowerCase()
    if (v === '::1' || v === '::') return true
    if (v.startsWith('fc') || v.startsWith('fd') || v.startsWith('fe80')) return true
    const mapped = v.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/)
    return mapped ? isPrivateAddress(mapped[1]) : false
  }
  const [a, b] = ip.split('.').map(Number)
  return a === 10 || a === 127 || a === 0 ||
    (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127)
}

async function assertHostAllowed(host: string): Promise<void> {
  const allowPrivate = process.env.ALLOW_PRIVATE_DB_HOSTS === 'true' || process.env.NODE_ENV !== 'production'
  if (allowPrivate) return
  const addresses = isIP(host) ? [host] : (await lookup(host, { all: true })).map(a => a.address)
  if (addresses.some(isPrivateAddress)) {
    throw new Error(`Connections to private or internal network addresses are not allowed (${host}).`)
  }
}

/** Identifies the connection parameters a pool was built with. */
function poolFingerprint(conn: DbConnectionRecord): string {
  return [conn.dialect, conn.host, conn.port, conn.username, conn.password, conn.database, conn.ssl ? 1 : 0, conn.schema || ''].join('|')
}

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
// Use globalThis so the pool cache survives Next.js dev hot-reloads.
interface PoolEntry {
  pool: unknown  // either pg.Pool or mysql2.Pool
  dialect: 'postgres' | 'mysql'
  lastUsedAt: number
  fingerprint: string
  close: () => Promise<void>
}
const globalForPool = globalThis as unknown as {
  __synthPoolCache?: Map<string, PoolEntry>
}
const poolCache: Map<string, PoolEntry> =
  globalForPool.__synthPoolCache ?? (globalForPool.__synthPoolCache = new Map())
// BUGFIX (disconnect): Increased from 10 → 30 minutes. During long AI chat
// sessions (DeepSeek reasoning can take 30-60s per turn, and multi-step
// agent loops run several turns), a 10-minute TTL could evict the pool
// between queries — forcing a fresh TCP+auth+SSL handshake on the next
// SQL execution, which added latency and occasionally failed if the
// provider rate-limits new connections. 30 minutes keeps the pool warm
// for the duration of a typical chat session.
const POOL_TTL_MS = 30 * 60 * 1000

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

// ─── Supabase host helpers ───
// Supabase exposes two connection endpoints, both of which REQUIRE SSL:
//   1. Pooler (Supavisor): `*.pooler.supabase.com:6543` — identifies the
//      target project via the username (`postgres.<project-ref>`) OR via the
//      TLS SNI extension set to `<project-ref>.supabase.com`.
//   2. Direct host: `db.<project-ref>.supabase.co:5432` — routes directly to
//      the project's Postgres instance; SSL is mandatory.
// If SSL is misconfigured the handshake fails with a cryptic
// "ENOTFOUND"/"ETIMEDOUT"/"certificate" error. We therefore force SSL ON
// for every Supabase host and set the SNI servername for pooler hosts.
function isSupabasePoolerHost(host: string): boolean {
  return /\.pooler\.supabase\.com$/i.test(host || '')
}

function isSupabaseDirectHost(host: string): boolean {
  return /^db\.[a-z0-9]+\.supabase\.co$/i.test(host || '')
}

function isSupabaseHost(host: string): boolean {
  return isSupabasePoolerHost(host) || isSupabaseDirectHost(host)
}

/**
 * Extract the Supabase project reference from a pooler username OR a direct
 * host. Supabase pooler usernames have the format `postgres.<project-ref>`
 * where `<project-ref>` is a 20-char alphanumeric string. Direct hosts are
 * `db.<project-ref>.supabase.co`.
 * Returns the project ref, or null if it can't be derived.
 */
function extractSupabaseProjectRef(username: string, host?: string): string | null {
  if (username) {
    // Format: postgres.<project-ref>
    const match = username.match(/^postgres\.([a-zA-Z0-9]{10,30})$/)
    if (match) return match[1]
    // Some users paste the full `postgres.project-ref.` — also accept a 2nd dot segment
    const match2 = username.match(/^postgres\.([a-zA-Z0-9]+)\./)
    if (match2) return match2[1]
  }
  // Fall back to the direct host: db.<project-ref>.supabase.co
  if (host) {
    const hostMatch = host.match(/^db\.([a-z0-9]+)\.supabase\.co$/i)
    if (hostMatch) return hostMatch[1]
  }
  return null
}

/**
 * Build the SSL options for a Postgres connection. SSL is mandatory for all
 * Supabase hosts (pooler + direct). For other hosts we respect the user's
 * SSL toggle. `rejectUnauthorized` is false so self-signed / Supabase pooler
 * certs don't require a custom CA — this is the same tradeoff psql makes by
 * default with `sslmode=require`.
 */
function buildPostgresSslOptions(conn: DbConnectionRecord): false | { rejectUnauthorized: boolean; servername?: string } {
  if (conn.dialect !== 'postgres') return false
  if (isSupabaseHost(conn.host)) {
    // Both Supabase pooler AND direct hosts require SSL. For the pooler we
    // also set the SNI servername to the project-specific host so Supavisor
    // can route the connection to the right tenant.
    const projectRef = extractSupabaseProjectRef(conn.username, conn.host)
    return {
      rejectUnauthorized: SSL_REJECT_UNAUTHORIZED,
      ...(projectRef ? { servername: `${projectRef}.supabase.com` } : {}),
    }
  }
  // Non-Supabase: respect the user's SSL toggle.
  return conn.ssl ? { rejectUnauthorized: SSL_REJECT_UNAUTHORIZED } : false
}

async function getPool(conn: DbConnectionRecord): Promise<PoolEntry> {
  evictExpired() // lazy cleanup of expired pools
  const fingerprint = poolFingerprint(conn)
  const existing = poolCache.get(conn.id)
  if (existing && existing.fingerprint === fingerprint) {
    existing.lastUsedAt = Date.now()
    return existing
  }
  if (existing) {
    // Credentials/host changed since the pool was built — rebuild it.
    existing.close().catch(() => {})
    poolCache.delete(conn.id)
  }
  await assertHostAllowed(conn.host)

  if (conn.dialect === 'postgres') {
    const Pool = await getPostgresPool()
    const sslOptions = buildPostgresSslOptions(conn)
    const pool = new Pool({
      host: conn.host,
      port: conn.port,
      user: conn.username,
      password: conn.password,
      database: conn.database,
      ssl: sslOptions,
      max: 5,
      idleTimeoutMillis: 30000,
      // SSL handshake over a pooler / cross-region link can take a few
      // seconds; give it room before timing out.
      connectionTimeoutMillis: 20000,
      // Allow longer query timeouts for AI-driven complex operations
      statement_timeout: 60000,
    })
    // An idle client erroring (server restart, network blip) emits 'error' on
    // the pool; without a listener Node treats it as an uncaught exception.
    ;(pool as unknown as { on: (ev: string, cb: (err: Error) => void) => void }).on('error', (err) => {
      console.warn(`[executor] Postgres pool error for connection ${conn.id}:`, err.message)
      poolCache.delete(conn.id)
    })
    const entry: PoolEntry = {
      pool,
      dialect: 'postgres',
      fingerprint,
      lastUsedAt: Date.now(),
      close: async () => { await (pool as { end: () => Promise<void> }).end() },
    }
    poolCache.set(conn.id, entry)
    return entry
  }

  if (conn.dialect === 'mysql') {
    const createPool = await getMysqlPool()
    // BUGFIX (SSL): Previously `ssl: conn.ssl ? {} : undefined` — passing `{}`
    // enables SSL but defaults to `rejectUnauthorized: true`, which rejects
    // servers using self-signed certificates (the common case for shared
    // hosting providers like freedb.tech, PlanetScale, etc.). This made the
    // "Use SSL" toggle appear broken: every SSL connection failed with
    // "self-signed certificate in certificate chain".
    // Fix: explicitly set `rejectUnauthorized: false` so SSL is used for
    // transport encryption but self-signed / provider certs are accepted.
    // This mirrors the Postgres SSL behaviour (`rejectUnauthorized: false`)
    // and the `sslmode=require` tradeoff that psql makes by default.
    const pool = createPool({
      host: conn.host,
      port: conn.port,
      user: conn.username,
      password: conn.password,
      database: conn.database,
      ssl: conn.ssl ? { rejectUnauthorized: SSL_REJECT_UNAUTHORIZED } : undefined,
      waitForConnections: true,
      connectionLimit: 5,
      queueLimit: 0,
      connectTimeout: 20000,
      enableKeepAlive: true,
      dateStrings: true,
    })
    const entry: PoolEntry = {
      pool,
      dialect: 'mysql',
      fingerprint,
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

  // ─── Pre-flight validation for Supabase pooler connections ───
  // The Supabase pooler (Supavisor) requires either a project-ref in the
  // username ("postgres.<ref>") or an SNI servername. If the user supplied a
  // bare "postgres" username against a pooler host, we fail fast with a clear
  // message instead of letting the TLS handshake fail cryptically.
  if (conn.dialect === 'postgres' && isSupabaseHost(conn.host)) {
    const ref = extractSupabaseProjectRef(conn.username, conn.host)
    if (!ref) {
      return {
        ok: false,
        error: '(ENOIDENTIFIER) no tenant identifier provided (external_id or sni_hostname required)',
        hint: `The Supabase connection requires the project reference. Either:\n  • Use the pooler host (aws-X-<region>.pooler.supabase.com) with username "postgres.<project-ref>" (e.g. "postgres.abcdefghijklmnopqrst"), OR\n  • Use the direct host "db.<project-ref>.supabase.co" (the ref is derived from the host).\nFind your project ref in the Supabase dashboard under Project Settings → Database → Connection string.`,
        latencyMs: Date.now() - start,
      }
    }
  }

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

  // ─── Supavisor "tenant/user not found" (NOT a DNS error) ───
  // The pg driver wraps Supavisor's rejection as `(ENOTFOUND) tenant/user
  // <name> not found`. This looks like a DNS failure but actually means the
  // pooler doesn't recognise the project ref / username combo. Must be checked
  // BEFORE the generic ENOTFOUND branch below.
  if (m.includes('tenant/user') && m.includes('not found')) {
    return `The Supabase pooler does not recognise this project/user combination. The pooler username must be "postgres.<project-ref>" and the project-ref must match the host region. Verify: (1) the username is "postgres.<your-project-ref>" (find it in Supabase dashboard → Project Settings → Database → Connection string → pooling); (2) the pooler host region matches your project (try aws-0-<region>.pooler.supabase.com — the region is shown in your dashboard URL); (3) the database password is your Postgres password (NOT the Supabase anon/service API key).`
  }

  // DNS resolution failures (genuine hostname resolution failures only)
  if ((m.includes('enotfound') && !m.includes('tenant/user')) || m.includes('getaddrinfo')) {
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
  if (m.includes('ssl') || m.includes('tls') || m.includes('certificate') || m.includes('handshake')) {
    if (isSupabaseHost(conn.host)) {
      return `SSL/TLS handshake failed against the Supabase host "${conn.host}". Supabase requires SSL. Verify the host format (pooler: aws-X-<region>.pooler.supabase.com with username "postgres.<project-ref>"; direct: db.<project-ref>.supabase.co) and that the project is not paused. If the error persists, try switching between the pooler (port 6543) and direct (port 5432) hosts.`
    }
    return `SSL/TLS handshake failed. Try toggling the "Use SSL" option, or for self-signed certs, the connection may require a custom CA.`
  }

  // Pooler-specific Supavisor errors
  if (m.includes('tenant/user') && m.includes('not found')) {
    return `The Supabase pooler does not recognize this project. The pooler username should be "postgres.<project-ref>" (e.g. postgres.abcdefghij). Check the username format.`
  }

  // ENOIDENTIFIER — Supavisor can't determine which project to route to.
  // This is THE most common Supabase pooler error. It means the username
  // is the bare "postgres" (missing the ".<project-ref>" suffix) AND we
  // couldn't set an SNI servername. Tell the user exactly how to fix it.
  if (m.includes('enoidentifier') || m.includes('no tenant identifier provided') || (m.includes('external_id') && m.includes('sni_hostname'))) {
    if (isSupabaseHost(conn.host)) {
      const hasRef = !!extractSupabaseProjectRef(conn.username, conn.host)
      if (!hasRef) {
        return `The Supabase pooler could not identify your project. The Username field must be in the format "postgres.<project-ref>" — for example "postgres.abcdefghijklmnopqrst". Find your project ref in the Supabase dashboard (Project Settings → Database → Connection string → pooling). The bare username "postgres" does not work with the pooler host ${conn.host}.`
      }
      // The username had a ref but SNI still failed — rare; suggest retry / direct host.
      return `The Supabase pooler rejected the connection even though the username looks correct. Try toggling SSL on, or switch to the direct (non-pooler) host "db.<project-ref>.supabase.co" on port 5432 with SSL enabled.`
    }
    return `The connection requires a tenant identifier. If this is a Supabase database, use the pooler hostname and a username of the form "postgres.<project-ref>".`
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
 *
 * BUGFIX (BUG-19): the previous version rejected any table name containing
 * characters outside [a-zA-Z0-9_.] — which excluded legitimate quoted
 * identifiers like `"order-details"` or `"User Data"`. Now we properly
 * quote the identifier for each dialect after validating against a
 * SQL-injection whitelist (letters, digits, underscore, dot, hyphen,
 * space — all safely quotable).
 */
export async function fetchSampleRows(conn: DbConnectionRecord, tableName: string, limit = 100): Promise<{ rows: Record<string, unknown>[]; columns: string[] }> {
  const entry = await getPool(conn)

  // Whitelist of characters allowed in a table identifier. Anything outside
  // this set is rejected to prevent SQL injection (we can't use parameterized
  // queries for identifiers in pg/mysql2).
  if (!/^[a-zA-Z0-9_.\-\s]+$/.test(tableName)) {
    throw new Error(`Invalid table name: ${tableName}`)
  }

  if (entry.dialect === 'postgres') {
    // Postgres uses double quotes for identifiers. Escape any embedded
    // double quotes by doubling them.
    const schemaName = conn.schema || 'public'
    const quoted = `"${schemaName.replace(/"/g, '""')}"."${tableName.replace(/"/g, '""')}"`
    const pool = entry.pool as { query: (text: string, values?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }> }
    const { rows } = await pool.query(`SELECT * FROM ${quoted} LIMIT $1`, [limit])
    const columns = rows.length > 0 ? Object.keys(rows[0]) : []
    return { rows, columns }
  }

  // MySQL uses backticks for identifiers. Escape any embedded backticks.
  const quoted = `\`${tableName.replace(/`/g, '``')}\``
  const pool = entry.pool as { query: (sql: string, values?: unknown[]) => Promise<unknown> }
  const raw = await pool.query(`SELECT * FROM ${quoted} LIMIT ?`, [limit])
  const rows = (Array.isArray(raw) && Array.isArray(raw[0]) ? raw[0] : raw) as Record<string, unknown>[]
  const columns = rows.length > 0 ? Object.keys(rows[0]) : []
  return { rows, columns }
}

/**
 * Split a multi-statement SQL string into individual statements.
 * Handles string literals, dollar-quotes, and comments so semicolons inside
 * strings/comments are not treated as statement separators.
 */
function splitSqlStatements(sql: string): string[] {
  const statements: string[] = []
  let current = ''
  let i = 0
  const len = sql.length
  let inSingle = false
  let inDouble = false
  let inDollarQuote = false
  let dollarTag = ''

  while (i < len) {
    const ch = sql[i]
    const next = sql[i + 1]

    if (!inDouble && !inDollarQuote && ch === "'") {
      inSingle = !inSingle
      current += ch
      i++
      continue
    }
    if (!inSingle && !inDollarQuote && ch === '"') {
      inDouble = !inDouble
      current += ch
      i++
      continue
    }

    if (!inSingle && !inDouble && ch === '$') {
      const dollarMatch = sql.slice(i).match(/^\$(\w*)\$/)
      if (dollarMatch) {
        const tag = dollarMatch[1]
        if (!inDollarQuote) {
          inDollarQuote = true
          dollarTag = tag
          current += dollarMatch[0]
          i += dollarMatch[0].length
          continue
        } else if (tag === dollarTag) {
          inDollarQuote = false
          dollarTag = ''
          current += dollarMatch[0]
          i += dollarMatch[0].length
          continue
        }
      }
    }

    if (!inSingle && !inDouble && !inDollarQuote && ch === '-' && next === '-') {
      while (i < len && sql[i] !== '\n') { current += sql[i]; i++ }
      continue
    }

    if (!inSingle && !inDouble && !inDollarQuote && ch === '/' && next === '*') {
      current += '/*'
      i += 2
      while (i < len && !(sql[i] === '*' && sql[i + 1] === '/')) { current += sql[i]; i++ }
      if (i < len) { current += '*/'; i += 2 }
      continue
    }

    if (!inSingle && !inDouble && !inDollarQuote && ch === ';') {
      const trimmed = current.trim()
      if (trimmed) statements.push(trimmed)
      current = ''
      i++
      continue
    }

    current += ch
    i++
  }

  const trimmed = current.trim()
  if (trimmed) statements.push(trimmed)
  return statements
}

type Runner = (sql: string) => Promise<unknown>

/** Normalise a driver result into ExecuteResult (without timing). */
function normaliseResult(dialect: 'postgres' | 'mysql', raw: unknown): Omit<ExecuteResult, 'executionTime'> {
  if (dialect === 'postgres') {
    const results = (Array.isArray(raw) ? raw : [raw]) as Array<{ rows?: Record<string, unknown>[]; rowCount?: number | null; command?: string; fields?: Array<{ name: string }> }>
    const last = results[results.length - 1] || {}
    const rows = last.rows || []
    const columns = last.fields?.map(f => f.name) ?? (rows.length > 0 ? Object.keys(rows[0]) : [])
    const isMutation = !!last.command && last.command !== 'SELECT'
    return {
      rows: rows.slice(0, MAX_RESULT_ROWS),
      columns,
      rowCount: rows.length,
      affectedRows: isMutation ? (last.rowCount || 0) : 0,
      truncated: rows.length > MAX_RESULT_ROWS,
    }
  }
  const header = Array.isArray(raw) ? raw[0] : raw
  if (typeof header === 'object' && header !== null && !Array.isArray(header) && 'affectedRows' in header) {
    return { rows: [], columns: [], rowCount: 0, affectedRows: (header as { affectedRows?: number }).affectedRows || 0 }
  }
  const rows = (Array.isArray(raw) && Array.isArray(raw[0]) ? raw[0] : raw) as Record<string, unknown>[]
  const fields = (Array.isArray(raw) && Array.isArray(raw[1]) ? raw[1] : []) as Array<{ name: string }>
  const columns = fields.length > 0 ? fields.map(f => f.name) : (rows.length > 0 ? Object.keys(rows[0]) : [])
  return {
    rows: rows.slice(0, MAX_RESULT_ROWS),
    columns,
    rowCount: rows.length,
    affectedRows: 0,
    truncated: rows.length > MAX_RESULT_ROWS,
  }
}

// Statements Postgres/MySQL refuse to run inside an explicit transaction.
const NON_TRANSACTIONAL = /^\s*(VACUUM|CREATE\s+DATABASE|DROP\s+DATABASE|CREATE\s+INDEX\s+CONCURRENTLY|DROP\s+INDEX\s+CONCURRENTLY|REINDEX\s+DATABASE|ALTER\s+SYSTEM|BEGIN|START\s+TRANSACTION|COMMIT|ROLLBACK)\b/i

/**
 * Execute arbitrary SQL against the external DB.
 *
 * Multiple statements run on ONE dedicated connection inside a transaction:
 * if any statement fails, everything is rolled back and the error names the
 * failing statement — the database is never left half-modified. (Statements
 * that cannot run in a transaction, e.g. VACUUM, run without one.)
 */
export async function executeSql(
  conn: DbConnectionRecord,
  sql: string,
): Promise<ExecuteResult> {
  const start = Date.now()
  const fail = (error: string, extra: Partial<ExecuteResult> = {}): ExecuteResult => ({
    rows: [], columns: [], rowCount: 0, affectedRows: 0, executionTime: Date.now() - start, error, ...extra,
  })

  const statements = splitSqlStatements(sql)
  if (statements.length === 0) return fail('No SQL statements to execute')

  let entry: PoolEntry
  try {
    entry = await getPool(conn)
  } catch (err) {
    return fail(err instanceof Error ? err.message : String(err))
  }

  const useTransaction = statements.length > 1 && !statements.some(st => NON_TRANSACTIONAL.test(st))

  // Acquire a dedicated client so BEGIN/COMMIT apply to the same session.
  let run: Runner
  let release: () => void = () => {}
  try {
    if (entry.dialect === 'postgres') {
      const client = await (entry.pool as { connect: () => Promise<{ query: Runner; release: () => void }> }).connect()
      run = (q) => client.query(q)
      release = () => client.release()
    } else {
      const c = await (entry.pool as { getConnection: () => Promise<{ query: Runner; release: () => void }> }).getConnection()
      run = (q) => c.query(q)
      release = () => c.release()
    }
  } catch (err) {
    return fail(err instanceof Error ? err.message : String(err))
  }

  const statementResults: NonNullable<ExecuteResult['statements']> = []
  let last: Omit<ExecuteResult, 'executionTime'> = { rows: [], columns: [], rowCount: 0, affectedRows: 0 }
  let lastWithRows: typeof last | null = null
  let totalAffected = 0

  try {
    if (useTransaction) await run(entry.dialect === 'postgres' ? 'BEGIN' : 'START TRANSACTION')
    for (let i = 0; i < statements.length; i++) {
      const stmt = statements[i]
      try {
        last = normaliseResult(entry.dialect, await run(stmt))
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        if (useTransaction) {
          try { await run('ROLLBACK') } catch { /* connection may be gone */ }
        }
        statementResults.push({ sql: stmt, rowCount: 0, affectedRows: 0, error: message })
        const prefix = statements.length > 1
          ? `Statement ${i + 1} of ${statements.length} failed${useTransaction ? ' — all changes were rolled back' : ''}: `
          : ''
        return fail(prefix + message, { statements: statementResults, affectedRows: useTransaction ? 0 : totalAffected })
      }
      totalAffected += last.affectedRows
      if (last.columns.length > 0) lastWithRows = last
      statementResults.push({ sql: stmt, rowCount: last.rowCount, affectedRows: last.affectedRows })
    }
    if (useTransaction) await run('COMMIT')
  } catch (err) {
    if (useTransaction) {
      try { await run('ROLLBACK') } catch { /* ignore */ }
    }
    return fail(err instanceof Error ? err.message : String(err), { statements: statementResults })
  } finally {
    release()
  }

  const shown = lastWithRows ?? last
  return {
    ...shown,
    affectedRows: totalAffected,
    executionTime: Date.now() - start,
    statements: statements.length > 1 ? statementResults : undefined,
  }
}

/**
 * Convenience wrapper used by /api/sql/execute when a connectionId is supplied.
 * Loads the connection record (regardless of user — the route is responsible
 * for authentication), then runs `executeSql`.
 */
export async function executeSqlOnExternalConnection(userId: string, connectionId: string, sql: string): Promise<ExecuteResult & { error?: string }> {
  const conn = await getConnection(userId, connectionId)
  if (!conn) {
    return {
      rows: [], columns: [], rowCount: 0, affectedRows: 0, executionTime: 0,
      error: `Connection ${connectionId} not found`,
    }
  }
  return executeSql(conn, sql)
}

/**
 * One page of a live table, with the exact total row count — used by the
 * studio's Data tab so large tables are browsed server-side instead of being
 * loaded into the browser.
 */
export async function fetchTablePage(
  conn: DbConnectionRecord,
  tableName: string,
  opts: { offset?: number; limit?: number; sort?: string; dir?: 'asc' | 'desc' } = {},
): Promise<{ rows: Record<string, unknown>[]; columns: string[]; total: number; offset: number; limit: number }> {
  const offset = Math.max(0, Math.floor(opts.offset ?? 0))
  const limit = Math.min(1000, Math.max(1, Math.floor(opts.limit ?? 100)))
  const dir = opts.dir === 'desc' ? 'DESC' : 'ASC'
  const entry = await getPool(conn)

  if (entry.dialect === 'postgres') {
    const q = (id: string) => `"${id.replace(/"/g, '""')}"`
    const target = `${q(conn.schema || 'public')}.${q(tableName)}`
    const order = opts.sort ? ` ORDER BY ${q(opts.sort)} ${dir} NULLS LAST` : ''
    const pool = entry.pool as { query: (text: string, values?: unknown[]) => Promise<{ rows: Record<string, unknown>[]; fields?: Array<{ name: string }> }> }
    const [page, count] = await Promise.all([
      pool.query(`SELECT * FROM ${target}${order} LIMIT $1 OFFSET $2`, [limit, offset]),
      pool.query(`SELECT COUNT(*)::bigint AS n FROM ${target}`),
    ])
    return {
      rows: page.rows,
      columns: page.fields?.map(f => f.name) ?? (page.rows[0] ? Object.keys(page.rows[0]) : []),
      total: Number(count.rows[0]?.n ?? 0),
      offset,
      limit,
    }
  }

  const q = (id: string) => '`' + id.replace(/`/g, '``') + '`'
  const order = opts.sort ? ` ORDER BY ${q(opts.sort)} ${dir}` : ''
  const pool = entry.pool as { query: (sql: string, values?: unknown[]) => Promise<unknown> }
  const [pageRaw, countRaw] = await Promise.all([
    pool.query(`SELECT * FROM ${q(tableName)}${order} LIMIT ? OFFSET ?`, [limit, offset]),
    pool.query(`SELECT COUNT(*) AS n FROM ${q(tableName)}`),
  ])
  const rows = (Array.isArray(pageRaw) ? pageRaw[0] : pageRaw) as Record<string, unknown>[]
  const fields = (Array.isArray(pageRaw) ? pageRaw[1] : []) as Array<{ name: string }>
  const countRows = (Array.isArray(countRaw) ? countRaw[0] : countRaw) as Array<{ n: number | string }>
  return {
    rows,
    columns: fields?.length ? fields.map(f => f.name) : (rows[0] ? Object.keys(rows[0]) : []),
    total: Number(countRows[0]?.n ?? 0),
    offset,
    limit,
  }
}

/** Exact row counts for up to `max` tables (−1 when a count fails). */
export async function fetchTableCounts(conn: DbConnectionRecord, tables: string[], max = 100): Promise<Record<string, number>> {
  const out: Record<string, number> = {}
  await Promise.all(tables.slice(0, max).map(async t => {
    try { out[t] = (await fetchTablePage(conn, t, { limit: 1 })).total } catch { out[t] = -1 }
  }))
  return out
}
