// Deterministic stand-in for the DeepSeek streaming API used by e2e tests.
// Behaviour is chosen from the system prompt so tests can drive edge cases.
import http from 'node:http'

const PORT = Number(process.env.MOCK_AI_PORT || 4600)
const rows = (table, n, make) => [`###TABLE:${table}###`, ...Array.from({ length: n }, (_, i) => JSON.stringify(make(i)))]

function replyFor(sys, lastUser) {
  const cont = sys.match(/more realistic records for the "(\w+)" table/)
  if (cont) {
    const t = cont[1]
    const stamp = Date.now()
    return rows(t, 40, i => t === 'users' ? { id: `u-${stamp}-${i}`, email: `c${stamp}${i}@x.io`, created_at: '2024-05-01T00:00:00Z' }
      : { id: `o-${stamp}-${i}`, user_id: `u${i % 5}`, total: i, created_at: '2024-06-01T00:00:00Z' }).join('\n')
  }
  if (sys.includes('DATABASE: nasty')) {
    return ['Sure! Here is your data:', '```json', '## TABLE: Orders ##',
      JSON.stringify({ id: 'o1', user_id: 'ghost', total: '12.50', created_at: '2020-01-01T00:00:00Z' }),
      JSON.stringify({ id: 'o1', user_id: 'u1', total: 9, created_at: '2020-01-01T00:00:00Z' }) + ',',
      '{"id": "o3", "user_id": "u2", "total": 3, ',
      JSON.stringify({ id: 'x', shop_id: 's0', price: 1 }),
      '###TABLE:audit_log###', JSON.stringify({ id: 'a1', msg: 'dropped' }),
      '###TABLE:users###',
      JSON.stringify({ id: 'u1', email: 'dup@x.io', created_at: '2024-01-01T00:00:00Z' }),
      JSON.stringify({ id: 'u2', email: 'DUP@x.io', created_at: '2024-02-01T00:00:00Z' }),
      JSON.stringify({ email: 'noid@x.io', created_at: '2024-03-01T00:00:00Z' }),
      JSON.stringify([1, 2, 3]), 'null', '```'].join('\n')
  }
  if (sys.includes('data generation engine')) {
    const slow = sys.includes('DATABASE: slow')
    const n = slow ? 200 : 30
    return [...rows('users', n, i => ({ id: `u${i}`, email: `user${i}@x.io`, created_at: '2024-01-01T00:00:00Z' })),
      ...rows('orders', n, i => ({ id: `o${i}`, user_id: `u${i % n}`, total: i, created_at: '2024-02-01T00:00:00Z' }))].join('\n')
  }
  return 'OK.'
}

http.createServer((req, res) => {
  let body = ''
  req.on('data', c => (body += c))
  req.on('end', () => {
    let j = {}
    try { j = JSON.parse(body || '{}') } catch { /* ignore */ }
    const msgs = j.messages || []
    const sys = msgs.find(m => m.role === 'system')?.content || ''
    const last = [...msgs].reverse().find(m => m.role === 'user')?.content || ''
    if (sys.includes('DATABASE: ai-down')) { res.writeHead(503, { 'Content-Type': 'application/json' }); return res.end('{"error":"overloaded"}') }
    const reply = replyFor(sys, last) + '\n'
    const delay = sys.includes('DATABASE: slow') ? 40 : 2
    res.writeHead(200, { 'Content-Type': 'text/event-stream' })
    const lines = reply.split('\n')
    let i = 0
    const t = setInterval(() => {
      if (i >= lines.length || res.destroyed) {
        clearInterval(t)
        if (!res.destroyed) { res.write('data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n'); res.end() }
        return
      }
      res.write('data: ' + JSON.stringify({ choices: [{ delta: { content: lines[i++] + '\n' } }] }) + '\n\n')
    }, delay)
  })
}).listen(PORT, () => console.log(`mock AI on :${PORT}`))
