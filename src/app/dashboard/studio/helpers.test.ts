import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/ai-agents', () => ({
  cleanDisplayText: (s: string) => s,
}))

import { parseAIResponse, humanizeColumnName, columnPlainEnglishHint } from './helpers'

describe('parseAIResponse', () => {
  it('uses the last fenced JSON block that contains tables', () => {
    const content = `Here is context.
\`\`\`json
{"type":"questionnaire","questions":[]}
\`\`\`
Applied.
\`\`\`json
{"tables":{"users":[{"id":"1","email":"a@b.co"}],"orders":[]}}
\`\`\`
`
    const { tables, displayText } = parseAIResponse(content)
    expect(tables?.users).toHaveLength(1)
    expect(tables?.orders).toEqual([])
    expect(displayText).not.toContain('questionnaire')
    expect(displayText).not.toContain('"tables"')
  })
})

describe('humanizeColumnName', () => {
  it('title-cases snake_case', () => {
    expect(humanizeColumnName('created_at')).toBe('Created At')
    expect(humanizeColumnName('user_id')).toBe('User ID')
  })
})

describe('columnPlainEnglishHint', () => {
  it('describes foreign keys', () => {
    expect(columnPlainEnglishHint('patient_id')).toContain('another table')
  })
})
