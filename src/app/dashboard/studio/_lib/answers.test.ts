import { describe, it, expect } from 'vitest'
import { formatAnswers, normalizeInteractiveOptions } from './answers'

describe('formatAnswers', () => {
  const qs = [{ question: 'Industry?' }, { question: 'Features?' }, { question: 'Rows?' }]

  it('formats single, multi and custom answers', () => {
    expect(formatAnswers(qs, [['E-commerce'], ['Auth', 'Billing'], ['about 250']])).toBe(
      'Here are my answers:\n1. Industry? — E-commerce\n2. Features? — Auth, Billing\n3. Rows? — about 250',
    )
  })

  it('handles a single question', () => {
    expect(formatAnswers([qs[0]], [['SaaS']])).toBe('Here are my answers:\n1. Industry? — SaaS')
  })
})

describe('normalizeInteractiveOptions', () => {
  it('wraps legacy single objects', () => {
    const o = { question: 'q', choices: [], multi: false }
    expect(normalizeInteractiveOptions(o)).toEqual([o])
    expect(normalizeInteractiveOptions([o])).toEqual([o])
    expect(normalizeInteractiveOptions(null)).toBeNull()
  })
})
