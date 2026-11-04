// Browser E2E: AI chat operating a live Postgres database (scripted AI).
// Needs: app on BASE (AUTH_REQUIRED=false, DEEPSEEK_BASE_URL=mock-chat-ai),
// e2e/mock-chat-ai.mjs on MOCK (default :4601), seeded `shop` DB (e2e/seed.sh).
const { chromium } = require('playwright')
const { execSync } = require('child_process')
const BASE = process.env.BASE || 'http://127.0.0.1:3000'
const MOCK = process.env.MOCK || 'http://127.0.0.1:4601'
const PG = process.env.SHOP_PG || 'postgresql://app:apppass@127.0.0.1:5432/shop'
const q = s => execSync(`psql "${PG}" -tAc "${s.replace(/"/g, '\\"')}"`).toString().trim()
let pass = 0, fail = 0
const check = (n, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${ok ? '' : '  ' + extra}`) }
const sleep = ms => new Promise(r => setTimeout(r, ms))

;(async () => {
  await fetch(MOCK + '/__reset')
  const conn = await (await fetch(BASE + '/api/connections', { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'shop (e2e)', dialect: 'postgres', host: '127.0.0.1', port: 5432, username: 'app', password: 'apppass', database: 'shop' }) })).json()
  check('connection created + tested', conn.test?.ok === true, JSON.stringify(conn).slice(0, 200))
  const id = conn.connection.id

  const browser = await chromium.launch()
  const page = await (await browser.newContext({ viewport: { width: 1400, height: 900 } })).newPage()
  const errors = []
  page.on('pageerror', e => errors.push(e.message))
  let dialogMode = 'accept'
  const dialogs = []
  page.on('dialog', d => { dialogs.push(d.message().slice(0, 80)); dialogMode === 'accept' ? d.accept() : d.dismiss() })
  await page.goto(`${BASE}/dashboard/studio?connectionId=${id}`, { waitUntil: 'networkidle' })
  await sleep(1500)
  const input = page.locator('textarea').first()
  const send = async t => { await input.fill(t); await input.press('Enter'); await sleep(300); if (await input.inputValue()) await input.press('Control+Enter') }
  const lastReq = async () => (await (await fetch(MOCK + '/__log')).json()).slice(-1)[0]
  const allReqs = async () => (await (await fetch(MOCK + '/__log')).json())

  // 1. read-only + agent status + schema context
  await send('list the tables'); await sleep(4000)
  const first = (await allReqs())[0]
  check('AI gets live-DB system prompt', /LIVE EXTERNAL DATABASE MODE/.test(first.system))
  check('AI gets REAL foreign keys from the catalog', /customer_id [^,]*FK→customers\.id/.test(first.system), (first.system.match(/- orders[^\n]*/) || [''])[0])
  check('AI gets exact row counts', /- customers \(2 rows\)/.test(first.system), (first.system.match(/- customers[^\n]*/) || [''])[0])
  check('table list shown in chat', await page.getByText('Order Details').count() > 0)
  check('agent status shown', await page.getByText(/introspecting/i).count() > 0)

  // 2. question → answer → insert
  await send('add some customers')
  const choice = page.getByText('3 customers (recommended)')
  await choice.first().waitFor({ timeout: 10000 }).catch(() => {})
  check('AI asks a question with choices', await choice.count() > 0)
  await choice.first().click(); await sleep(5000)
  check('INSERT ran after answering (2 → 5 customers)', q('select count(*) from customers') === '5')
  const afterInsert = (await allReqs()).find(r => /^\[Auto-continue\]/.test(r.last))
  check('follow-up tells AI the real outcome', !!afterInsert && /succeeded|OK/.test(afterInsert.last), afterInsert?.last)
  check('history carries the full SQL + result', (afterInsert?.history || []).some(m => /\[SQL RESULT for "[^"]*INSERT INTO customers \(name, email\) VALUES \('Dee'[^"]*'fay@example\.com'\)/.test(m.content)))

  // 3. DDL (server asks confirmation for ALTER) + 4. UPDATE
  await send('add a loyalty_tier column to customers'); await sleep(4000)
  check('ALTER TABLE ran (after confirmation)', q("select count(*) from information_schema.columns where table_name='customers' and column_name='loyalty_tier'") === '1', JSON.stringify(dialogs))
  await send('mark Ann as gold'); await sleep(4000)
  check('UPDATE ran', q("select loyalty_tier from customers where name='Ann'") === 'gold')

  // 5. self-correction after a SQL error
  await send('how many products do we have?'); await sleep(7000)
  const reqs = await allReqs()
  const errFollowUp = reqs.find(r => /^\[Auto-continue\]/.test(r.last) && /ERROR/.test(r.last))
  check('SQL error is reported to the AI (not "success")', !!errFollowUp && /produkts/.test(errFollowUp.last), (reqs.slice(-2).map(r => r.last).join(' || ')).slice(0, 300))
  check('AI corrected the query and it ran', await page.getByText('order_count').count() > 0)

  // 6. destructive: accept DELETE, decline DROP
  await send('remove Fay'); await sleep(4000)
  check('DELETE asked for confirmation and ran when accepted', q("select count(*) from customers where name='Fay'") === '0' && dialogs.some(d => /DELETE|destroy|modify/i.test(d)), JSON.stringify(dialogs))
  dialogMode = 'dismiss'
  const before = (await allReqs()).length
  await send('drop the orders table'); await sleep(4000)
  check('declined DROP did not run', q("select count(*) from information_schema.tables where table_name='orders'") === '1')
  const after = await allReqs()
  check('no automatic follow-up after a declined statement', after.length === before + 1, `${before} → ${after.length}`)

  check('no page errors', errors.length === 0, errors.join(' | '))
  await page.screenshot({ path: __dirname + '/chat-live-db.png', fullPage: false })
  await browser.close()
  // cleanup
  q("delete from customers where name in ('Dee','Eve','Fay')"); q('alter table customers drop column if exists loyalty_tier')
  await fetch(`${BASE}/api/connections/${id}`, { method: 'DELETE' })
  console.log(`\n${pass} passed, ${fail} failed`)
  process.exit(fail ? 1 : 0)
})().catch(e => { console.error(e); process.exit(1) })
