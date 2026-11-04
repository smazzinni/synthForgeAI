const B = process.env.BASE || 'http://localhost:3142'
const RUN = Date.now()
const PW = 'e2e-password-1'
async function register(tag, password = PW) {
  const r = await fetch(B + '/api/auth/register', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: `e2e-${tag}-${RUN}@example.com`, password, name: tag }) })
  const m = (r.headers.getSetCookie?.() || []).join(';').match(/sf_session=([^;]+)/)
  return { status: r.status, email: `e2e-${tag}-${RUN}@example.com`, token: m ? m[1] : null }
}
const ALICE = (await register('alice')).token, BOB = (await register('bob')).token
let pass = 0, fail = 0
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : '  ' + extra}`) }
async function api(method, path, body, token = ALICE) {
  const r = await fetch(B + path, { method, headers: { 'content-type': 'application/json', ...(token ? { cookie: `sf_session=${token}` } : {}) }, body: body === undefined ? undefined : (typeof body === 'string' ? body : JSON.stringify(body)) })
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
check('forged token → 401', (await api('GET', '/api/connections', undefined, Math.random().toString(36).slice(2).repeat(6))).status === 401)

// ─── auth scenarios ───
{
  const post = (path, body, token) => api('POST', path, body, token)
  const em = `e2e-auth-${RUN}@example.com`
  check('register: bad email → 400', (await post('/api/auth/register', { email: 'nope', password: PW })).status === 400)
  check('register: short password → 400', (await post('/api/auth/register', { email: em, password: 'short' })).status === 400)
  const reg = await post('/api/auth/register', { email: em, password: PW })
  check('register: ok → 201', reg.status === 201 && reg.json.user?.email === em, JSON.stringify(reg.json))
  check('register: duplicate email → 409', (await post('/api/auth/register', { email: em, password: PW })).status === 409)
  check('login: wrong password → 401', (await post('/api/auth/login', { email: em, password: 'wrong-password' })).status === 401)
  const l1 = await post('/api/auth/login', { email: em, password: PW })
  const t1 = l1.json.token
  check('login: ok returns token', l1.status === 200 && !!t1, JSON.stringify(l1.json))
  const sess = await api('GET', '/api/auth/session', undefined, t1)
  check('session: authenticated', sess.json.authenticated === true && sess.json.user?.email === em, JSON.stringify(sess.json))
  const t2 = (await post('/api/auth/login', { email: em, password: PW })).json.token
  check('logout: ok', (await post('/api/auth/logout', {}, t1)).status === 200)
  check('logout: old token rejected', (await api('GET', '/api/connections', undefined, t1)).status === 401)
  check('logout: other session still valid', (await api('GET', '/api/connections', undefined, t2)).status === 200)
  const t3 = (await post('/api/auth/login', { email: em, password: PW })).json.token
  const NEWPW = 'e2e-password-2'
  const ch = await api('PATCH', '/api/auth/user', { currentPassword: PW, newPassword: NEWPW }, t2)
  check('password change: ok', ch.status === 200, JSON.stringify(ch.json))
  check('password change: other session signed out', (await api('GET', '/api/connections', undefined, t3)).status === 401)
  check('password change: current session kept', (await api('GET', '/api/connections', undefined, t2)).status === 200)
  check('password change: new password logs in', (await post('/api/auth/login', { email: em, password: NEWPW })).status === 200)
  check('forgot-password: unknown email → ok', (await post('/api/auth/forgot-password', { email: `nobody-${RUN}@example.com` })).json.ok === true)
  check('reset-password: bad token → 400', (await post('/api/auth/reset-password', { token: 'bogus-token', password: 'whatever-123' })).status === 400)
}

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
    const r = await fetch(B + '/api/export', { method: 'POST', headers: { 'content-type': 'application/json', cookie: `sf_session=${ALICE}` }, body: JSON.stringify({ connectionId: id, format }) })
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
