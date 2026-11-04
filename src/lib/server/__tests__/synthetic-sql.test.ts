import { describe, expect, it } from 'vitest'
import { runSyntheticSql } from '../synthetic-sql'

const data = {
  users: [{ id: 'u1', name: 'Ann', city: 'X' }, { id: 'u2', name: 'Bo', city: 'Y' }],
  orders: [
    { id: 'o1', user_id: 'u1', total: 10 },
    { id: 'o2', user_id: 'u1', total: 5 },
    { id: 'o3', user_id: 'u2', total: 7 },
  ],
}
const schema = [
  { name: 'users', columns: [{ name: 'id', type: 'uuid' }, { name: 'name', type: 'text' }, { name: 'city', type: 'text' }] },
  { name: 'orders', columns: [{ name: 'id', type: 'uuid' }, { name: 'user_id', type: 'uuid' }, { name: 'total', type: 'numeric' }] },
]

describe('runSyntheticSql', () => {
  it('runs JOIN + GROUP BY with keyword-like column names', () => {
    const r = runSyntheticSql('SELECT u.name, SUM(o.total) AS total FROM users u JOIN orders o ON o.user_id = u.id GROUP BY u.name ORDER BY total DESC', data, schema)
    expect(r.error).toBeUndefined()
    expect(r.rows).toEqual([{ name: 'Ann', total: 15 }, { name: 'Bo', total: 7 }])
    expect(r.mutated).toBe(false)
  })

  it('supports CTEs and ILIKE / ::casts', () => {
    expect(runSyntheticSql("SELECT * FROM users WHERE name ILIKE 'a%'", data, schema).rows).toHaveLength(1)
    const cte = runSyntheticSql('WITH t AS (SELECT user_id, COUNT(*) AS c FROM orders GROUP BY user_id) SELECT * FROM t', data, schema)
    expect(cte.rows).toHaveLength(2)
    expect(runSyntheticSql("SELECT total::int AS t FROM orders WHERE id = 'o1'", data, schema).rows).toEqual([{ t: 10 }])
  })

  it('applies UPDATE/DELETE only to matching rows and never mutates input', () => {
    const del = runSyntheticSql('DELETE FROM orders WHERE total < 8', data, schema)
    expect(del.affectedRows).toBe(2)
    expect(del.dataAfter.orders).toHaveLength(1)
    const upd = runSyntheticSql("UPDATE orders SET total = total * 2 WHERE user_id = 'u1'", data, schema)
    expect(upd.affectedRows).toBe(2)
    expect(data.orders[0].total).toBe(10)
  })

  it('handles tables without an id column', () => {
    const noId = { logs: [{ level: 'info', msg: 'a' }, { level: 'error', msg: 'b' }] }
    const r = runSyntheticSql("DELETE FROM logs WHERE level = 'error'", noId, [])
    expect(r.dataAfter.logs).toEqual([{ level: 'info', msg: 'a' }])
  })

  it('creates tables in multi-statement scripts and reports schema', () => {
    const r = runSyntheticSql("CREATE TABLE events (id INT, date DATE, value INT); INSERT INTO events (id, date, value) VALUES (1, '2024-01-01', 3); SELECT date, value FROM events", data, schema)
    expect(r.rows).toEqual([{ date: '2024-01-01', value: 3 }])
    expect(r.schemaAfter.find(t => t.name === 'events')?.columns.map(c => c.name)).toEqual(['id', 'date', 'value'])
  })

  it('reports parse errors without throwing', () => {
    const r = runSyntheticSql('SELEC * FROM', data, schema)
    expect(r.error).toBeTruthy()
    expect(r.parseError).toBe(true)
  })
})
