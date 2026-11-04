export interface ParsedConnection {
  dialect: 'postgres' | 'mysql'
  host: string
  port: number
  username: string
  password: string
  database: string
  schema?: string
  ssl: boolean
}

export type ParseResult = { ok: true; value: ParsedConnection } | { ok: false; error: string }

const SCHEMES: Record<string, { dialect: 'postgres' | 'mysql'; port: number }> = {
  'postgres:': { dialect: 'postgres', port: 5432 },
  'postgresql:': { dialect: 'postgres', port: 5432 },
  'mysql:': { dialect: 'mysql', port: 3306 },
  'mariadb:': { dialect: 'mysql', port: 3306 },
}

function decode(s: string): string {
  try { return decodeURIComponent(s) } catch { return s }
}

/** Parse a postgres://, postgresql://, mysql:// or mariadb:// connection URL. */
export function parseConnectionString(input: string): ParseResult {
  const raw = input.trim()
  const fail = (error: string): ParseResult => ({ ok: false, error })
  if (!raw) return fail('Enter a connection string.')
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return fail('Could not parse connection string. Expected postgres://user:password@host:port/database')
  }
  const scheme = SCHEMES[url.protocol.toLowerCase()]
  if (!scheme) return fail(`Unsupported scheme "${url.protocol.replace(':', '')}". Use postgres://, postgresql://, mysql:// or mariadb://`)
  if (!url.hostname) return fail('Connection string has no host.')

  const q = url.searchParams
  const sslmode = (q.get('sslmode') || '').toLowerCase()
  const sslParam = (q.get('ssl') || '').toLowerCase()
  const ssl = ['require', 'verify-full', 'verify-ca', 'prefer'].includes(sslmode) || sslParam === 'true' || sslParam === '1'
  const schema = q.get('schema') || q.get('currentSchema') || q.get('search_path') || undefined

  return {
    ok: true,
    value: {
      dialect: scheme.dialect,
      host: decode(url.hostname),
      port: url.port ? Number(url.port) : scheme.port,
      username: decode(url.username),
      password: decode(url.password),
      database: decode(url.pathname.replace(/^\//, '')),
      ...(schema ? { schema } : {}),
      ssl,
    },
  }
}
