import { describe, expect, it } from 'vitest'
import { repairDataset } from '../data-integrity'

const tables = [
  { name: 'users', columns: [{ name: 'id', type: 'uuid' }, { name: 'email', type: 'varchar' }, { name: 'created_at', type: 'timestamp' }, { name: 'age', type: 'int' }, { name: 'active', type: 'boolean' }] },
  { name: 'orders', columns: [{ name: 'id', type: 'uuid' }, { name: 'user_id', type: 'uuid' }, { name: 'total', type: 'numeric(10,2)' }, { name: 'created_at', type: 'timestamp' }] },
  { name: 'categories', columns: [{ name: 'id', type: 'int' }, { name: 'parent_id', type: 'int references categories(id)' }] },
]
const U1 = '11111111-1111-4111-8111-111111111111'
const U2 = '22222222-2222-4222-8222-222222222222'

describe('repairDataset', () => {
  const input = {
    users: [
      { id: U1, email: 'a@x.io', created_at: '2024-05-01T00:00:00Z', age: '31', active: 'yes' },
      { id: U2, email: 'A@x.io', created_at: '2024-06-01T00:00:00Z', age: 40, active: false },
      { id: U2, email: 'b@x.io', created_at: '2024-06-02T00:00:00Z', age: 22, active: true },
      { email: 'c@x.io', created_at: '2024-06-03T00:00:00Z', age: 19, active: true },
    ],
    orders: [
      { id: 'o1', user_id: U1, total: '19.99', created_at: '2024-04-01T00:00:00Z' },   // before its user
      { id: 'o2', user_id: 'ghost-user', total: 5, created_at: '2024-07-01T00:00:00Z' }, // dangling
      { id: 'o2', user_id: U2, total: 7, created_at: '2024-07-02T00:00:00Z' },           // duplicate pk
    ],
    categories: [{ id: 1, parent_id: null }, { id: 2, parent_id: 1 }, { id: 3, parent_id: 99 }],
    stray: [{ id: 1 }],
  }
  const { data, report } = repairDataset(tables, input)
  const kinds = (k: string) => report.issues.filter(i => i.kind === k)

  it('does not mutate its input', () => {
    expect(input.users[0].age).toBe('31')
    expect(input.orders[1].user_id).toBe('ghost-user')
  })

  it('fixes missing and duplicate primary keys', () => {
    expect(new Set(data.users.map(r => r.id)).size).toBe(4)
    expect(new Set(data.orders.map(r => r.id)).size).toBe(3)
    expect(kinds('missing_pk')[0]).toMatchObject({ table: 'users', count: 1 })
    expect(kinds('duplicate_pk').map(i => i.table).sort()).toEqual(['orders', 'users'])
  })

  it('re-points dangling foreign keys to existing parents (incl. self-references)', () => {
    const ids = new Set(data.users.map(r => r.id))
    expect(data.orders.every(o => ids.has(o.user_id))).toBe(true)
    expect([1, 2, 3]).toContain(data.categories[2].parent_id)
    expect(kinds('dangling_fk').map(i => `${i.table}.${i.column}`).sort()).toEqual(['categories.parent_id', 'orders.user_id'])
    expect(report.relationships.orders).toEqual({ user_id: 'users' })
  })

  it('moves child dates after their parent', () => {
    const o1 = data.orders.find(o => o.id === 'o1')!
    const u = data.users.find(x => x.id === o1.user_id)!
    expect(Date.parse(String(o1.created_at))).toBeGreaterThanOrEqual(Date.parse(String(u.created_at)))
  })

  it('coerces declared types', () => {
    expect(data.users[0].age).toBe(31)
    expect(data.users[0].active).toBe(true)
    expect(data.orders[0].total).toBe(19.99)
  })

  it('de-duplicates unique columns case-insensitively', () => {
    const emails = data.users.map(u => String(u.email).toLowerCase())
    expect(new Set(emails).size).toBe(emails.length)
  })

  it('reports unknown tables and scores quality', () => {
    expect(kinds('unknown_table')[0]).toMatchObject({ table: 'stray' })
    expect(report.score).toBeGreaterThan(0)
    expect(report.score).toBeLessThan(1)
    expect(repairDataset(tables, data).report.issues.filter(i => i.kind !== 'unknown_table')).toEqual([])
  })

  it('handles empty input', () => {
    const r = repairDataset(tables, {})
    expect(r.report.score).toBe(1)
    expect(r.data.users).toEqual([])
  })
})

describe('dependencyOrder', () => {
  it('puts parents before children regardless of input order', async () => {
    const { dependencyOrder } = await import('../data-integrity')
    const t = [
      { name: 'order_items', columns: [{ name: 'id', type: 'uuid' }, { name: 'order_id', type: 'uuid' }, { name: 'product_id', type: 'uuid' }] },
      { name: 'orders', columns: [{ name: 'id', type: 'uuid' }, { name: 'customer_id', type: 'uuid' }] },
      { name: 'products', columns: [{ name: 'id', type: 'uuid' }] },
      { name: 'customers', columns: [{ name: 'id', type: 'uuid' }] },
    ]
    const names = dependencyOrder(t).map(x => x.name)
    expect(names.indexOf('customers')).toBeLessThan(names.indexOf('orders'))
    expect(names.indexOf('orders')).toBeLessThan(names.indexOf('order_items'))
    expect(names.indexOf('products')).toBeLessThan(names.indexOf('order_items'))
  })
})
