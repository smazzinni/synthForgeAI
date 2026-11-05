// Scripted stand-in for the chat LLM: reacts to the conversation like a
// careful assistant so the live-DB chat loop can be tested end to end.
// GET /__log returns every request it received (for assertions).
import http from 'node:http'
const PORT = Number(process.env.MOCK_CHAT_PORT || 4601)
const log = []
const sql = (comment, body) => `\`\`\`sql\n-- ${comment}\n${body}\n\`\`\``
const status = (agent, s, p) => JSON.stringify({ type: 'agent_status', agent, status: s, progress: p })

function reply(last, sys) {
  if (/^\[Auto-continue\]/.test(last)) {
    if (/ERROR/.test(last) && /produkts/.test(last)) return `The table name was wrong — fixing it.\n\n${sql('Corrected: count orders', 'SELECT COUNT(*) AS order_count FROM orders;')}`
    return 'Done — results are shown above.'
  }
  if (/list the tables/i.test(last)) return `${status('Schema Architect', 'introspecting', 20)}\nLooking at your schema.\n\n${sql('List tables', "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name;")}`
  if (/add some customers/i.test(last)) return 'Before I insert anything, one question.\n\n{"type":"options","question":"How many customers should I add?","choices":[{"label":"3 customers (recommended)","value":"3"},{"label":"10 customers","value":"10"}]}'
  if (/^\s*3\b/.test(last) || /^Here are my answers:[\s\S]*— 3 customers/.test(last)) return `${status('Data Generator', 'inserting customers', 60)}\n${sql('Insert 3 customers', "INSERT INTO customers (name, email) VALUES ('Dee', 'dee@example.com'), ('Eve', 'eve@example.com'), ('Fay', 'fay@example.com');")}`
  if (/loyalty_tier column/i.test(last)) return sql('Add loyalty tier', 'ALTER TABLE customers ADD COLUMN loyalty_tier TEXT;')
  if (/mark ann as gold/i.test(last)) return sql('Ann is gold', "UPDATE customers SET loyalty_tier = 'gold' WHERE name = 'Ann';")
  if (/how many products/i.test(last)) return sql('Count products', 'SELECT COUNT(*) AS n FROM produkts;')
  if (/remove fay/i.test(last)) return sql('⚠️ DESTRUCTIVE: delete Fay', "DELETE FROM customers WHERE name = 'Fay';")
  if (/drop the orders table/i.test(last)) return sql('⚠️ DESTRUCTIVE: drop orders', 'DROP TABLE orders;')
  return 'OK.'
}

http.createServer((req, res) => {
  let body = ''
  req.on('data', c => (body += c))
  req.on('end', () => {
    if (req.url === '/__log') { res.setHeader('content-type', 'application/json'); return res.end(JSON.stringify(log)) }
    if (req.url === '/__reset') { log.length = 0; return res.end('ok') }
    let j = {}
    try { j = JSON.parse(body || '{}') } catch { /* ignore */ }
    const msgs = j.messages || []
    const sys = msgs.find(m => m.role === 'system')?.content || ''
    const last = [...msgs].reverse().find(m => m.role === 'user')?.content || ''
    log.push({ last, system: sys, history: msgs.filter(m => m.role !== 'system').map(m => ({ role: m.role, content: m.content })) })
    const text = reply(last, sys)
    res.writeHead(200, { 'Content-Type': 'text/event-stream' })
    const parts = text.match(/[\s\S]{1,16}/g) || []
    let i = 0
    const t = setInterval(() => {
      if (i >= parts.length) { clearInterval(t); res.write('data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n'); return res.end() }
      res.write('data: ' + JSON.stringify({ choices: [{ delta: { content: parts[i++] } }] }) + '\n\n')
    }, 5)
  })
}).listen(PORT, () => console.log(`mock chat AI on :${PORT}`))
