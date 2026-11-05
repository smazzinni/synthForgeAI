// Deterministic stand-in for the DeepSeek streaming API used by e2e tests.
// It answers the per-table generation prompt (header row + one JSON array per
// row) and simulates a realistic output speed with MOCK_TPS (tokens/second,
// default 0 = as fast as possible). Behaviour is chosen from the prompt:
//   database "nasty"   → messy output (fences, prose, duplicate/missing ids,
//                         dangling FKs, wrong-shaped rows, string numbers)
//   database "slow"    → ~40 tokens/s regardless of MOCK_TPS
//   database "ai-down" → HTTP 503 for every call
import http from 'node:http'

const PORT = Number(process.env.MOCK_AI_PORT || 4600)
const TPS = Number(process.env.MOCK_TPS || 0)
const CHARS_PER_TOKEN = 3.5
let calls = 0

function parsePrompt(sys) {
  const table = /^TABLE: (\S+)/m.exec(sys)?.[1] || 't'
  const db = /database "([^"]+)"/.exec(sys)?.[1] || ''
  const need = Number(/exactly (\d+) lines/.exec(sys)?.[1] || 10)
  const cols = []
  const block = sys.split('COLUMNS, in this exact order:')[1] || ''
  for (const line of block.split('\n')) {
    const m = /^\d+\. (\S+) \((.*)\)$/.exec(line.trim())
    if (m) cols.push({ name: m[1], type: m[2] })
    else if (cols.length && line.trim() === '') break
  }
  const fks = {}
  for (const m of sys.matchAll(/^- (\S+) → \S+?\.id, one of: (\[.*\])$/gm)) {
    try { fks[m[1]] = JSON.parse(m[2]) } catch { /* ignore */ }
  }
  return { table, db, need, cols, fks }
}

function value(col, i, table, fks) {
  const n = col.name, t = col.type.toLowerCase()
  if (n === 'id') return /int|serial/.test(t) ? i + 1 : `${table}-${Date.now().toString(36)}-${i}`
  if (fks[n]?.length) return fks[n][i % fks[n].length]
  if (/_id$/.test(n)) return `${n.replace(/_id$/, '')}-${i % 7}`
  if (/email/.test(n)) return `person${i}@example.com`
  if (/name/.test(n)) return ['Ava Patel', 'Liam Chen', 'Noah Garcia', 'Mia Rossi', 'Zoe Kim'][i % 5]
  if (/_at$|date/.test(n)) return new Date(Date.UTC(2024, i % 12, 1 + (i % 27))).toISOString()
  if (/int|serial/.test(t)) return (i * 7) % 100
  if (/numeric|decimal|float|double|real/.test(t)) return Math.round((i * 13.37) % 500 * 100) / 100
  if (/bool/.test(t)) return i % 3 !== 0
  return `${n}-${i}`
}

function reply(sys) {
  const { table, db, need, cols, fks } = parsePrompt(sys)
  const header = JSON.stringify(cols.map(c => c.name))
  const rows = Array.from({ length: need }, (_, i) => JSON.stringify(cols.map(c => value(c, i, table, fks))))
  if (db === 'nasty') {
    const bad = [...rows]
    if (bad.length > 1) bad[1] = bad[0]                                    // duplicate id
    const ghost = cols.map(c => (/_id$/.test(c.name) ? 'ghost' : c.name === 'id' ? null : value(c, 99, table, fks)))
    return ['Sure! Here is your data:', '```json', header, ...bad,
      JSON.stringify(ghost),                                               // missing id + dangling FK
      JSON.stringify(cols.map(c => (/total|amount|price/.test(c.name) ? '12.50' : value(c, 50, table, fks)))), // string number
      '[1, 2]',                                                            // wrong shape
      '{"shop_id": "s0", "price": 1}',                                     // another table's row
      '{"id": "o3", "broken": ',                                           // broken JSON
      '```'].join('\n')
  }
  return [header, ...rows].join('\n')
}

http.createServer((req, res) => {
  let body = ''
  req.on('data', c => (body += c))
  req.on('end', () => {
    if (req.url === '/__calls') return res.end(String(calls))
    calls++
    let j = {}
    try { j = JSON.parse(body || '{}') } catch { /* ignore */ }
    const sys = (j.messages || []).find(m => m.role === 'system')?.content || ''
    const db = /database "([^"]+)"/.exec(sys)?.[1] || ''
    if (db === 'ai-down') { res.writeHead(503, { 'Content-Type': 'application/json' }); return res.end('{"error":"overloaded"}') }
    const text = reply(sys) + '\n'
    const tps = db === 'slow' ? 40 : TPS
    res.writeHead(200, { 'Content-Type': 'text/event-stream' })
    // Emit in ~50 ms ticks sized to the requested tokens/second.
    const perTick = tps > 0 ? Math.max(1, Math.round(tps * CHARS_PER_TOKEN / 20)) : 4000
    let pos = 0
    const tick = () => {
      if (res.destroyed) return
      if (pos >= text.length) {
        res.write('data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n')
        return res.end()
      }
      const chunk = text.slice(pos, pos + perTick)
      pos += perTick
      res.write('data: ' + JSON.stringify({ choices: [{ delta: { content: chunk } }] }) + '\n\n')
      setTimeout(tick, tps > 0 ? 50 : 0)
    }
    tick()
  })
}).listen(PORT, () => console.log(`mock AI on :${PORT}${TPS ? ` at ~${TPS} tokens/s` : ''}`))
