import { describe, it, expect } from 'vitest'
import { parseAgentStatus } from '../ai-agents'

describe('parseAgentStatus', () => {
  it('returns the last status', () => {
    const t = '{"type":"agent_status","agent":"A","status":"x","progress":10}\ntext\n{"type": "agent_status", "agent": "B", "status": "y", "progress": 80}'
    expect(parseAgentStatus(t)).toEqual({ agent: 'B', status: 'y', progress: 80 })
  })
  it('returns null when absent', () => {
    expect(parseAgentStatus('hello')).toBeNull()
  })
})
