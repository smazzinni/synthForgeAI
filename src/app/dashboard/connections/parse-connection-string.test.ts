import { describe, expect, it } from 'vitest'
import { parseConnectionString } from './parse-connection-string'

describe('parseConnectionString', () => {
  it('parses a Supabase pooler URL with encoded password', () => {
    const r = parseConnectionString('postgresql://postgres.abcdefgh:p%40ss%2Fw%23rd@aws-0-eu-west-1.pooler.supabase.com:6543/postgres')
    expect(r).toEqual({
      ok: true,
      value: {
        dialect: 'postgres', host: 'aws-0-eu-west-1.pooler.supabase.com', port: 6543,
        username: 'postgres.abcdefgh', password: 'p@ss/w#rd', database: 'postgres', ssl: false,
      },
    })
  })

  it('parses a Neon URL with sslmode=require', () => {
    const r = parseConnectionString('postgres://user:pw@ep-cool-123.us-east-2.aws.neon.tech/neondb?sslmode=require')
    expect(r.ok && r.value).toMatchObject({ dialect: 'postgres', port: 5432, database: 'neondb', ssl: true })
  })

  it('parses schema params', () => {
    const r = parseConnectionString('postgres://u:p@h/db?currentSchema=app')
    expect(r.ok && r.value.schema).toBe('app')
  })

  it('parses a mysql URL without port', () => {
    const r = parseConnectionString('mysql://root:secret@db.example.com/shop')
    expect(r.ok && r.value).toMatchObject({ dialect: 'mysql', port: 3306, host: 'db.example.com', database: 'shop', ssl: false })
  })

  it('treats mariadb as mysql and ssl=true as ssl on', () => {
    const r = parseConnectionString('mariadb://u:p@h:3307/d?ssl=true')
    expect(r.ok && r.value).toMatchObject({ dialect: 'mysql', port: 3307, ssl: true })
  })

  it('rejects invalid strings', () => {
    expect(parseConnectionString('not a url').ok).toBe(false)
    expect(parseConnectionString('http://example.com').ok).toBe(false)
    expect(parseConnectionString('').ok).toBe(false)
  })
})
