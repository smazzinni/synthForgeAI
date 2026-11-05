import { describe, expect, it } from 'vitest'
import { addMessagesInMemory, createConversationInMemory, getConversationInMemory } from '../in-memory-store'

describe('in-memory conversations', () => {
  const msgs = [{ role: 'user', content: 'hi' }, { role: 'assistant', content: 'yo' }]

  it('appends messages to an existing conversation', () => {
    const c = createConversationInMemory('u1', { title: 't' })
    expect(addMessagesInMemory('u1', c.id, msgs)).toBe(true)
    expect(addMessagesInMemory('u1', c.id, msgs)).toBe(true)
    expect(getConversationInMemory('u1', c.id)?.messages).toHaveLength(4)
  })

  it('returns false for an unknown id', () => {
    expect(addMessagesInMemory('u1', 'nope', msgs)).toBe(false)
  })

  it("returns false for another user's conversation", () => {
    const c = createConversationInMemory('u1', {})
    expect(addMessagesInMemory('u2', c.id, msgs)).toBe(false)
    expect(getConversationInMemory('u1', c.id)?.messages).toHaveLength(0)
  })
})
