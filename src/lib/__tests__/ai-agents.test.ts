import { describe, it, expect } from 'vitest'
import { parseAgentStatus, parseAllInteractiveOptions, cleanDisplayText } from '../ai-agents'

describe('parseAgentStatus', () => {
  it('returns the last status', () => {
    const t = '{"type":"agent_status","agent":"A","status":"x","progress":10}\ntext\n{"type": "agent_status", "agent": "B", "status": "y", "progress": 80}'
    expect(parseAgentStatus(t)).toEqual({ agent: 'B', status: 'y', progress: 80 })
  })
  it('returns null when absent', () => {
    expect(parseAgentStatus('hello')).toBeNull()
  })
})

describe('parseAllInteractiveOptions', () => {
  const blk = (q: string, multi = false) =>
    `{"type":"options","question":"${q}","choices":[{"label":"A (recommended)","value":"a"},{"label":"B","value":"b"}],"multi":${multi}}`
  const reply = `Let me ask a few things.\n${blk('Q1')}\nSome prose.\n\`\`\`json\n${blk('Q2', true)}\n\`\`\`\nMore ${blk('Q3')} end.`

  it('returns all 3 questions', () => {
    const r = parseAllInteractiveOptions(reply)
    expect(r.map(o => o.question)).toEqual(['Q1', 'Q2', 'Q3'])
    expect(r[1].multi).toBe(true)
  })

  it('strips every block from displayed text', () => {
    const t = cleanDisplayText(reply)
    expect(t).not.toContain('"type"')
    expect(t).not.toContain('```')
    expect(t).toContain('Some prose.')
  })
})
