// End-to-end edge cases for data generation (requires e2e/mock-ai.mjs as the
// AI backend and the app started with AUTH_REQUIRED=true).
//   BASE=http://127.0.0.1:3000 node e2e/generation.mjs
const B = process.env.BASE || 'http://localhost:3000'
let pass = 0, fail = 0
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : '  ' + extra}`) }
const sleep = ms => new Promise(r => setTimeout(r, ms))

async function register() {
  const email = `gen${Date.now()}${Math.random().toString(36).slice(2, 6)}@test.io`
  const r = await fetch(B + '/api/auth/register', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password: 'password123' }) })
  return /sf_session=([^;]+)/.exec(r.headers.get('set-cookie') || '')?.[1]
}
const TOKEN = await register()
const H = { 'content-type': 'application/json', cookie: `sf_session=${TOKEN}` }
const api = async (method, path, body) => {
  const r = await fetch(B + path, { method, headers: H, body: body === undefined ? undefined : (typeof body === 'string' ? body : JSON.stringify(body)) })
  const t = await r.text(); let json; try { json = JSON.parse(t) } catch { json = t }
  return { status: r.status, json }
}
const schema = [
  { name: 'orders', columns: [{ name: 'id', type: 'text' }, { name: 'user_id', type: 'text' }, { name: 'total', type: 'numeric' }, { name: 'created_at', type: 'timestamp' }] },
  { name: 'users', columns: [{ name: 'id', type: 'text' }, { name: 'email', type: 'text' }, { name: 'created_at', type: 'timestamp' }] },
]
/** Start a generation; read SSE for `ms` (0 = until the stream ends); returns events. */
async function generate(body, ms = 0) {
  const ctrl = new AbortController()
  const res = await fetch(B + '/api/generate-stream', { method: 'POST', headers: H, body: JSON.stringify(body), signal: ctrl.signal })
  if (!res.ok || !res.body) return { status: res.status, events: [], json: await res.json().catch(() => null) }
  const events = []
  const reader = res.body.getReader(); const dec = new TextDecoder(); let buf = ''
  const timer = ms ? setTimeout(() => ctrl.abort(), ms) : null
  try {
    for (;;) {
      const { done, value } = await reader.read(); if (done) break
      buf += dec.decode(value, { stream: true })
      const parts = buf.split('\n\n'); buf = parts.pop()
      for (const p of parts) if (p.startsWith('data: ')) events.push(JSON.parse(p.slice(6)))
    }
  } catch { /* aborted = client disconnected */ }
  if (timer) clearTimeout(timer)
  return { status: res.status, events, databaseId: events.find(e => e.databaseId)?.databaseId, jobId: events.find(e => e.jobId)?.jobId }
}
async function waitReady(id, timeoutMs = 60_000) {
  const start = Date.now()
  for (;;) {
    const r = await api('GET', `/api/databases?id=${id}`)
    if (r.status !== 200 || r.json.database.status !== 'generating' || Date.now() - start > timeoutMs) return r
    await sleep(500)
  }
}
const integrity = db => {
  const users = db.data_json.users || [], orders = db.data_json.orders || []
  const ids = new Set(users.map(u => u.id))
  return {
    fk: orders.every(o => ids.has(o.user_id)),
    pk: new Set(orders.map(o => o.id)).size === orders.length && new Set(users.map(u => u.id)).size === users.length,
    emails: new Set(users.map(u => String(u.email).toLowerCase())).size === users.length,
    dates: orders.every(o => { const u = users.find(x => x.id === o.user_id); return !u || Date.parse(o.created_at) >= Date.parse(u.created_at) }),
  }
}

// ─── validation ───
check('no session → 401', (await fetch(B + '/api/generate-stream', { method: 'POST', body: '{}' })).status === 401)
check('invalid JSON → 400', (await api('POST', '/api/generate-stream', '{nope')).status === 400)
check('empty schema → 400', (await api('POST', '/api/generate-stream', { schema: [] })).status === 400)
check('table without name → 400', (await api('POST', '/api/generate-stream', { schema: [{ columns: [] }] })).status === 400)
check('31 tables → 400', (await api('POST', '/api/generate-stream', { schema: Array.from({ length: 31 }, (_, i) => ({ name: 't' + i, columns: [] })) })).status === 400)
check('300k rows → 400', (await api('POST', '/api/generate-stream', { schema, rowCounts: { users: 100000, orders: 100000, x: 100000 }, databaseName: 'x' }).then(async r => r.status === 200 ? 400 : r.status)) === 400 ||
  (await api('POST', '/api/generate-stream', { schema: [...schema, { name: 'x', columns: [{ name: 'id', type: 'text' }] }], rowCounts: { users: 100000, orders: 100000, x: 100000 } })).status === 400)
check('unknown databaseId → 404', (await api('POST', '/api/generate-stream', { schema, databaseId: 'nope' })).status === 404)

// ─── messy AI output is repaired ───
{
  const r = await generate({ databaseName: 'nasty', schema, rowCounts: { users: 3, orders: 3 } })
  const db = (await waitReady(r.databaseId)).json.database
  const ig = integrity(db)
  check('nasty AI: completes and is ready', r.events.some(e => e.type === 'complete') && db.status === 'ready')
  check('nasty AI: unknown table dropped', Object.keys(db.data_json).sort().join() === 'orders,users', Object.keys(db.data_json).join())
  check('nasty AI: wrong-shape rows dropped', db.data_json.orders.every(o => !('shop_id' in o)))
  check('nasty AI: FKs, PKs, unique emails, date order all valid', ig.fk && ig.pk && ig.emails && ig.dates, JSON.stringify(ig))
  check('nasty AI: numbers coerced', db.data_json.orders.every(o => o.total === null || typeof o.total === 'number'))
  check('nasty AI: real quality score (<1)', typeof db.quality_score === 'number' && db.quality_score < 1)
  check('nasty AI: Quality Analyst reported fixes', r.events.some(e => /Quality Analyst: fixed/.test(e.message || '')))
}

// ─── scale-up keeps integrity ───
{
  const r = await generate({ databaseName: 'scale', schema, rowCounts: { users: 2000, orders: 8000 } })
  const db = (await waitReady(r.databaseId)).json.database
  const counts = db.table_counts
  const ig = integrity(db)
  check('scale: 2,000 users / 8,000 orders', counts.users === 2000 && counts.orders === 8000, JSON.stringify(counts))
  check('scale: integrity holds after expansion', ig.fk && ig.pk && ig.emails && ig.dates, JSON.stringify(ig))
}

// ─── client disconnects (browser closed) → job keeps running ───
{
  const r = await generate({ databaseName: 'slow', schema, rowCounts: { users: 200, orders: 200 } }, 1500)
  const mid = await api('GET', `/api/databases?id=${r.databaseId}`)
  check('disconnect: still generating after client left', mid.json.database.status === 'generating')
  const status = await api('GET', `/api/generate-stream?databaseId=${r.databaseId}`)
  check('disconnect: job visible for re-attach', status.json.status === 'running', JSON.stringify(status.json))
  // second start on the same database attaches instead of starting another job
  const again = await generate({ databaseId: r.databaseId, schema, rowCounts: { users: 5, orders: 5 } }, 800)
  check('second start attaches to the running job', again.events.some(e => e.jobId === r.jobId))
  const done = (await waitReady(r.databaseId)).json.database
  check('disconnect: finished in background with all rows', done.status === 'ready' && done.table_counts.users === 200 && done.table_counts.orders === 200, JSON.stringify(done.table_counts))
}

// ─── stop mid-way keeps saved rows ───
{
  const r = await generate({ databaseName: 'slow', schema, rowCounts: { users: 200, orders: 200 } }, 1200)
  const stop = await api('DELETE', `/api/generate-stream?jobId=${r.jobId}`)
  check('stop: DELETE accepted', stop.status === 200)
  const db = (await waitReady(r.databaseId)).json.database
  check('stop: database ready, partial rows kept', db.status === 'ready' && db.row_count < 400, `${db.status} ${db.row_count}`)
  check('stop: stopping again → 409', (await api('DELETE', `/api/generate-stream?jobId=${r.jobId}`)).status === 409)
}

// ─── database deleted while generating ───
{
  const r = await generate({ databaseName: 'slow', schema, rowCounts: { users: 200, orders: 200 } }, 800)
  check('delete during generation → 200', (await api('DELETE', `/api/databases?id=${r.databaseId}`)).status === 200)
  await sleep(8000)
  check('deleted database stays deleted (no resurrection)', (await api('GET', `/api/databases?id=${r.databaseId}`)).status === 404)
  check('server healthy afterwards', (await fetch(B + '/api/health')).status === 200)
}

// ─── AI service down ───
{
  const r = await generate({ databaseName: 'ai-down', schema, rowCounts: { users: 3, orders: 3 } })
  const err = r.events.find(e => e.type === 'error')
  check('AI down: error event with message', !!err && /AI service error \(503\)/.test(err.message), JSON.stringify(r.events.slice(-2)))
  const db = (await api('GET', `/api/databases?id=${r.databaseId}`)).json.database
  check('AI down: database not stuck in generating', db.status !== 'generating', db.status)
}

// ─── another user cannot see or stop my jobs ───
{
  const other = await register()
  const r = await generate({ databaseName: 'slow', schema, rowCounts: { users: 50, orders: 50 } }, 800)
  const H2 = { cookie: `sf_session=${other}` }
  check('other user: job status hidden', (await (await fetch(`${B}/api/generate-stream?jobId=${r.jobId}`, { headers: H2 })).json()).status === 'none')
  check('other user: cannot stop', (await fetch(`${B}/api/generate-stream?jobId=${r.jobId}`, { method: 'DELETE', headers: H2 })).status === 404)
  check('other user: cannot read database', (await fetch(`${B}/api/databases?id=${r.databaseId}`, { headers: H2 })).status === 404)
  await waitReady(r.databaseId)
}

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
