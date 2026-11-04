import { createHmac } from 'node:crypto'
const B = process.env.BASE || 'http://localhost:3142'
const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url')
const tok = sub => { const h = b64({ alg: 'HS256', typ: 'JWT' }), p = b64({ sub, email: sub + '@t.io', exp: Math.floor(Date.now() / 1000) + 3600 }); return `${h}.${p}.${createHmac('sha256', 'e2e-secret').update(`${h}.${p}`).digest('base64url')}` }
const ALICE = tok('11111111-1111-1111-1111-111111111111'), BOB = tok('22222222-2222-2222-2222-222222222222')
let pass = 0, fail = 0
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : '  ' + extra}`) }
async function api(method, path, body, token = ALICE) {
  const r = await fetch(B + path, { method, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body === undefined ? undefined : (typeof body === 'string' ? body : JSON.stringify(body)) })
  const text = await r.text(); let json; try { json = JSON.parse(text) } catch { json = text }
  return { status: r.status, json, headers: r.headers }
}
const exec = (id, sql, skip = false, token = ALICE) => api('POST', '/api/connections/execute', { connectionId: id, sql, skipDangerousCheck: skip }, token)

const engines = [
  { dialect: 'postgres', host: '127.0.0.1', port: 5432, username: 'app', password: 'apppass', database: 'shop', q: n => `"${n}"` },
  { dialect: 'mysql', host: '127.0.0.1', port: 3306, username: 'app', password: 'apppass', database: 'shop', q: n => '`' + n + '`' },
]

// ─── auth ───
check('no token → 401', (await api('GET', '/api/connections', undefined, null)).status === 401)
check('forged token → 401', (await api('GET', '/api/connections', undefined, ALICE.slice(0, -3) + 'abc')).status === 401)

for (const e of engines) {
  const D = e.dialect
  // ─── create / validation / errors ───
  check(`${D}: missing host → 400`, (await api('POST', '/api/connections', { name: 'x', dialect: D, port: e.port, username: 'a', database: 'b' })).status === 400)
  check(`${D}: bad JSON → 400`, (await api('POST', '/api/connections', '{oops')).status === 400)
  const bad = await api('POST', '/api/connections', { ...e, name: `${D} wrong pw`, password: 'nope' })
  check(`${D}: wrong password → saved, test failed with hint`, bad.status === 200 && bad.json.test?.ok === false && !!bad.json.test?.error, JSON.stringify(bad.json).slice(0, 300))
  const down = await api('POST', '/api/connections', { ...e, name: `${D} down`, port: 6553 })
  check(`${D}: closed port → test failed + hint`, down.json.test?.ok === false && /refused|ECONNREFUSED/i.test(down.json.test?.error + down.json.test?.hint), JSON.stringify(down.json.test).slice(0, 200))
  const created = await api('POST', '/api/connections', { ...e, name: `${D} shop` })
  const conn = created.json.connection
  check(`${D}: valid connection → connected`, created.json.test?.ok === true && conn?.status === 'connected', JSON.stringify(created.json).slice(0, 300))
  check(`${D}: password never returned`, !JSON.stringify(created.json).includes('apppass') && conn.password_masked === '••••••••')
  const id = conn.id

  // ─── isolation ───
  check(`${D}: other user cannot read`, (await api('GET', `/api/connections/${id}`, undefined, BOB)).status === 404)
  check(`${D}: other user cannot execute`, (await exec(id, 'SELECT 1', false, BOB)).status === 404)
  check(`${D}: other user list excludes it`, !(await api('GET', '/api/connections', undefined, BOB)).json.connections.some(c => c.id === id))

  // ─── introspect ───
  const intro = await api('GET', `/api/connections/${id}?include=introspect`)
  const tables = (intro.json.schema || []).map(t => t.name)
  check(`${D}: introspect lists tables`, tables.includes('customers') && tables.includes('orders'), JSON.stringify(intro.json).slice(0, 300))
  if (D === 'postgres') check(`${D}: table with space name sampled`, (intro.json.data?.['Order Details'] || []).length === 1, JSON.stringify(intro.json.data).slice(0, 200))
  const agent = await api('POST', `/api/connections/${id}/agent`, { action: 'introspect' })
  check(`${D}: agent introspect row counts`, agent.json.tableStats?.find(t => t.name === 'customers')?.rowCount === 2, JSON.stringify(agent.json.tableStats))

  // ─── read / write ───
  const join = await exec(id, `SELECT c.name, SUM(o.total) AS spent FROM customers c JOIN orders o ON o.customer_id = c.id GROUP BY c.name ORDER BY c.name`)
  check(`${D}: SELECT JOIN`, join.status === 200 && join.json.rows?.length === 2, JSON.stringify(join.json).slice(0, 200))
  const ins = await exec(id, `INSERT INTO customers (name, email) VALUES ('Cy', 'cy@x.com'), ('O''Brien', 'ob@x.com')`)
  check(`${D}: INSERT (with apostrophe) affected 2`, ins.json.affectedRows === 2, JSON.stringify(ins.json).slice(0, 200))
  const upd = await exec(id, `UPDATE customers SET email = 'cy2@x.com' WHERE name = 'Cy'`)
  check(`${D}: UPDATE with WHERE runs directly`, upd.json.affectedRows === 1, JSON.stringify(upd.json).slice(0, 200))
  const mass = await exec(id, `UPDATE customers SET email = lower(email)`)
  check(`${D}: UPDATE without WHERE asks to confirm`, mass.json.requiresConfirmation === true)
  check(`${D}: confirmed mass UPDATE runs`, (await exec(id, `UPDATE customers SET email = lower(email)`, true)).status === 200)
  const del = await exec(id, `DELETE FROM customers WHERE name = 'Cy'`)
  check(`${D}: DELETE asks to confirm`, del.json.requiresConfirmation === true)
  const delOk = await exec(id, `DELETE FROM customers WHERE name = 'Cy'`, true)
  check(`${D}: confirmed DELETE runs`, delOk.json.affectedRows === 1, JSON.stringify(delOk.json).slice(0, 200))
  const lit = await exec(id, `SELECT 'drop table customers' AS note`)
  check(`${D}: keyword in string literal not flagged`, lit.status === 200 && !lit.json.requiresConfirmation)

  // ─── DDL ───
  const ddl = await exec(id, D === 'postgres'
    ? `CREATE TABLE products (id SERIAL PRIMARY KEY, title TEXT NOT NULL, price NUMERIC(10,2)); CREATE TABLE reviews (id SERIAL PRIMARY KEY, product_id INT REFERENCES products(id) ON DELETE CASCADE, stars INT)`
    : `CREATE TABLE products (id INT AUTO_INCREMENT PRIMARY KEY, title VARCHAR(100) NOT NULL, price DECIMAL(10,2)); CREATE TABLE reviews (id INT AUTO_INCREMENT PRIMARY KEY, product_id INT, stars INT, FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE)`)
  check(`${D}: CREATE TABLE x2 (with ON DELETE CASCADE) runs without confirm`, ddl.status === 200 && !ddl.json.requiresConfirmation && !ddl.json.error, JSON.stringify(ddl.json).slice(0, 300))
  const alter = await exec(id, `ALTER TABLE products ADD COLUMN sku VARCHAR(20)`, true)
  check(`${D}: ALTER TABLE (confirmed)`, alter.status === 200 && !alter.json.error, JSON.stringify(alter.json).slice(0, 200))
  check(`${D}: INSERT into new table`, (await exec(id, `INSERT INTO products (title, price, sku) VALUES ('Pen', 1.5, 'P1')`)).json.affectedRows === 1)

  // ─── transaction rollback ───
  const before = (await exec(id, 'SELECT COUNT(*) AS n FROM products')).json.rows[0]
  const tx = await exec(id, `INSERT INTO products (title, price) VALUES ('A', 1); INSERT INTO products (title, price) VALUES (NULL, 2)`)
  const after = (await exec(id, 'SELECT COUNT(*) AS n FROM products')).json.rows[0]
  check(`${D}: failing multi-statement rolls back`, tx.status === 400 && /rolled back/.test(tx.json.error) && String(Object.values(before)[0]) === String(Object.values(after)[0]), `${JSON.stringify(tx.json).slice(0, 200)} before=${JSON.stringify(before)} after=${JSON.stringify(after)}`)
  const syntax = await exec(id, 'SELEC * FROM products')
  check(`${D}: syntax error → 400 with DB message`, syntax.status === 400 && !!syntax.json.error)

  // ─── other statement types ───
  const meta = await exec(id, D === 'postgres' ? 'EXPLAIN SELECT * FROM customers' : 'SHOW TABLES')
  check(`${D}: ${D === 'postgres' ? 'EXPLAIN' : 'SHOW TABLES'} allowed`, meta.status === 200 && meta.json.rows?.length > 0, JSON.stringify(meta.json).slice(0, 200))
  if (D === 'postgres') {
    const other = await exec(id, `SELECT * FROM sales.leads`)
    check(`${D}: other schema readable`, other.json.rows?.length === 1)
  }
  check(`${D}: verify action rejects writes`, (await api('POST', `/api/connections/${id}/agent`, { action: 'verify', sql: "INSERT INTO products (title) VALUES ('x')" })).status === 400)
  check(`${D}: via /api/sql/execute too`, (await api('POST', '/api/sql/execute', { connectionId: id, sql: 'SELECT COUNT(*) AS n FROM customers' })).status === 200)

  // ─── export live DB ───
  for (const format of ['sql', 'csv', 'json', 'xlsx']) {
    const r = await fetch(B + '/api/export', { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${ALICE}` }, body: JSON.stringify({ connectionId: id, format }) })
    const t = await r.text()
    const ok = r.status === 200 && (format === 'sql' ? /CREATE TABLE IF NOT EXISTS "customers"/.test(t) && /INSERT INTO "orders"/.test(t)
      : format === 'json' ? JSON.parse(t).customers?.length >= 2
      : format === 'csv' ? /# table: customers/.test(t) && /O'Brien/.test(t)
      : /<Worksheet ss:Name="customers">/.test(t))
    check(`${D}: export live ${format}`, ok, `${r.status} ${t.slice(0, 200)}`)
  }
  const one = await api('POST', '/api/export', { connectionId: id, format: 'json', tableName: 'orders' })
  check(`${D}: export single table`, Array.isArray(one.json) && one.json.length === 3, JSON.stringify(one.json).slice(0, 200))
  check(`${D}: other user cannot export`, (await api('POST', '/api/export', { connectionId: id, format: 'json' }, BOB)).status === 404)

  // ─── edit / delete ───
  const pBad = await api('PATCH', `/api/connections/${id}`, { password: 'wrong', test: true })
  check(`${D}: PATCH wrong password → test fails`, pBad.json.test?.ok === false, JSON.stringify(pBad.json).slice(0, 200))
  check(`${D}: query fails with wrong password (pool rebuilt)`, (await exec(id, 'SELECT 1 AS x')).status === 400)
  const pOk = await api('PATCH', `/api/connections/${id}`, { password: 'apppass', name: `${D} renamed`, test: true })
  check(`${D}: PATCH fixes password`, pOk.json.test?.ok === true && pOk.json.connection?.name === `${D} renamed`, JSON.stringify(pOk.json).slice(0, 200))
  check(`${D}: query works again`, (await exec(id, 'SELECT 1 AS x')).status === 200)

  // cleanup tables so reruns are idempotent
  await exec(id, 'DROP TABLE reviews; DROP TABLE products', true)
  await exec(id, `DELETE FROM customers WHERE name = 'O''Brien'`, true)
  check(`${D}: other user cannot delete`, (await api('DELETE', `/api/connections/${id}`, undefined, BOB)).status === 404)
  check(`${D}: delete connection`, (await api('DELETE', `/api/connections/${id}`)).status === 200 && (await api('GET', `/api/connections/${id}`)).status === 404)
  for (const c of [bad.json.connection, down.json.connection]) if (c) await api('DELETE', `/api/connections/${c.id}`)
}

// ─── SSRF guard is env-gated: unreachable host error is clean ───
const nx = await api('POST', '/api/connections', { name: 'nx', dialect: 'postgres', host: 'no-such-host.invalid', port: 5432, username: 'a', password: 'b', database: 'c' })
check('unknown host → test failed with hint', nx.json.test?.ok === false && !!nx.json.test?.hint, JSON.stringify(nx.json.test).slice(0, 200))
if (nx.json.connection) await api('DELETE', `/api/connections/${nx.json.connection.id}`)

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
