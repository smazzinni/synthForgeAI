import { describe, expect, it } from 'vitest'
import { expandDataset } from '../data-expander'

const tables = [
  { name: 'customers', columns: [{ name: 'id', type: 'uuid' }, { name: 'name', type: 'text' }, { name: 'email', type: 'text' }, { name: 'tier', type: 'text' }, { name: 'created_at', type: 'timestamp' }] },
  { name: 'orders', columns: [{ name: 'id', type: 'uuid' }, { name: 'customer_id', type: 'uuid' }, { name: 'total', type: 'numeric' }, { name: 'paid', type: 'boolean' }] },
]
const seed = {
  customers: [
    { id: '7f1c6a52-3b7e-4d2a-9c11-0a1b2c3d4e5f', name: 'Ann Lee', email: 'ann@shop.io', tier: 'gold', created_at: '2024-01-01T10:00:00Z' },
    { id: '8a2d7b63-4c8f-4e3b-8d22-1b2c3d4e5f60', name: 'Bo Chan', email: 'bo@shop.io', tier: 'silver', created_at: '2024-03-01T10:00:00Z' },
    { id: '9b3e8c74-5d90-4f4c-9e33-2c3d4e5f6071', name: 'Cy Diaz', email: 'cy@mail.com', tier: 'gold', created_at: '2024-06-01T10:00:00Z' },
  ],
  orders: [
    { id: 'a1111111-1111-4111-8111-111111111111', customer_id: '7f1c6a52-3b7e-4d2a-9c11-0a1b2c3d4e5f', total: 10.5, paid: true },
    { id: 'a2222222-2222-4222-8222-222222222222', customer_id: '8a2d7b63-4c8f-4e3b-8d22-1b2c3d4e5f60', total: 99.99, paid: false },
  ],
}

describe('expandDataset', () => {
  const out = expandDataset(tables, seed, { customers: 5000, orders: 20000 }, { seed: 42 })

  it('reaches the requested row counts and keeps the seed rows', () => {
    expect(out.customers).toHaveLength(5000)
    expect(out.orders).toHaveLength(20000)
    expect(out.customers.slice(0, 3)).toEqual(seed.customers)
  })

  it('generates unique ids and unique emails', () => {
    expect(new Set(out.customers.map(r => r.id)).size).toBe(5000)
    expect(new Set(out.orders.map(r => r.id)).size).toBe(20000)
    expect(new Set(out.customers.map(r => r.email)).size).toBe(5000)
  })

  it('keeps every foreign key pointing at an existing parent row', () => {
    const ids = new Set(out.customers.map(r => r.id))
    expect(out.orders.every(o => ids.has(o.customer_id))).toBe(true)
    // and uses expanded parents, not only the seed ones
    expect(new Set(out.orders.map(o => o.customer_id)).size).toBeGreaterThan(100)
  })

  it('preserves column shapes', () => {
    const o = out.orders[12345]
    expect(typeof o.total).toBe('number')
    expect(typeof o.paid).toBe('boolean')
    expect(['gold', 'silver']).toContain(out.customers[4000].tier)
    expect(Number.isNaN(Date.parse(String(out.customers[4000].created_at)))).toBe(false)
  })

  it('is deterministic for the same seed', () => {
    const again = expandDataset(tables, seed, { customers: 50, orders: 50 }, { seed: 42 })
    const first = expandDataset(tables, seed, { customers: 50, orders: 50 }, { seed: 42 })
    expect(again).toEqual(first)
  })

  it('continues integer id sequences', () => {
    const r = expandDataset([{ name: 't', columns: [{ name: 'id', type: 'int' }] }], { t: [{ id: 1 }, { id: 2 }] }, { t: 5 })
    expect(r.t.map(x => x.id)).toEqual([1, 2, 3, 4, 5])
  })
})

describe('expandDataset — realism', () => {
  it('recombines seed person names (keeps locale) and keeps phone formats', () => {
    const t = [{ name: 'people', columns: [{ name: 'id', type: 'uuid' }, { name: 'name', type: 'text' }, { name: 'phone', type: 'text' }] }]
    const seed = { people: [
      { id: 'a', name: 'Aarav Sharma', phone: '+91 98765 43210' },
      { id: 'b', name: 'Priya Patel', phone: '+91 91234 56789' },
      { id: 'c', name: 'Rohan Gupta', phone: '+91 99887 76655' },
    ] }
    const out = expandDataset(t, seed, { people: 200 }, { seed: 7 })
    const firsts = new Set(['Aarav', 'Priya', 'Rohan'])
    const lasts = new Set(['Sharma', 'Patel', 'Gupta'])
    for (const p of out.people.slice(3)) {
      const [f, l] = String(p.name).split(' ')
      expect(firsts.has(f) && lasts.has(l)).toBe(true)
      expect(String(p.phone)).toMatch(/^\+\d{2} \d{5} \d{5}$/)
    }
  })

  it('falls back to Faker for well-known columns with a tiny seed', () => {
    const t = [{ name: 'c', columns: [{ name: 'id', type: 'uuid' }, { name: 'company', type: 'text' }] }]
    const out = expandDataset(t, { c: [{ id: 'x', company: 'Acme' }, { id: 'y', company: 'Globex' }] }, { c: 100 }, { seed: 3 })
    expect(new Set(out.c.map(r => r.company)).size).toBeGreaterThan(20)
  })
})

describe('synthesizeTable (no-AI fallback)', () => {
  it('builds typed, realistic rows from the schema alone', async () => {
    const { synthesizeTable } = await import('../data-expander')
    const rows = synthesizeTable({ name: 'customers', columns: [
      { name: 'id', type: 'uuid' }, { name: 'full_name', type: 'varchar(100)' }, { name: 'email', type: 'varchar' },
      { name: 'age', type: 'int' }, { name: 'is_active', type: 'boolean' }, { name: 'balance', type: 'numeric(10,2)' },
      { name: 'created_at', type: 'timestamp' }, { name: 'updated_at', type: 'timestamp' }, { name: 'account_id', type: 'uuid' },
    ] }, 50, { seed: 1 })
    expect(rows).toHaveLength(50)
    expect(new Set(rows.map(r => r.id)).size).toBe(50)
    expect(new Set(rows.map(r => r.email)).size).toBe(50)
    for (const r of rows) {
      expect(typeof r.age).toBe('number')
      expect(typeof r.is_active).toBe('boolean')
      expect(typeof r.balance).toBe('number')
      expect(String(r.full_name).split(' ').length).toBeGreaterThanOrEqual(2)
      expect(r.account_id).toBeNull()
      expect(String(r.updated_at) >= String(r.created_at)).toBe(true)
    }
  })
})

describe('expandDataset — temporal order', () => {
  it('dates expanded children at or after their parent', () => {
    const t = [
      { name: 'users', columns: [{ name: 'id', type: 'uuid' }, { name: 'created_at', type: 'timestamp' }] },
      { name: 'orders', columns: [{ name: 'id', type: 'uuid' }, { name: 'user_id', type: 'uuid' }, { name: 'created_at', type: 'timestamp' }] },
    ]
    const seed = {
      users: [{ id: 'u1', created_at: '2024-01-01T00:00:00.000Z' }, { id: 'u2', created_at: '2025-06-01T00:00:00.000Z' }],
      orders: [{ id: 'o1', user_id: 'u1', created_at: '2024-02-01T00:00:00.000Z' }, { id: 'o2', user_id: 'u2', created_at: '2025-07-01T00:00:00.000Z' }],
    }
    const out = expandDataset(t, seed, { users: 500, orders: 3000 }, { seed: 9 })
    const byId = new Map(out.users.map(u => [u.id, u]))
    const bad = out.orders.filter(o => String(o.created_at) < String(byId.get(o.user_id)?.created_at))
    expect(bad).toHaveLength(0)
  })
})
