import { describe, expect, it } from 'vitest'
import { applyPrivacy } from '../data-privacy'

describe('applyPrivacy (Privacy Officer)', () => {
  const input = {
    users: [
      { id: 1, email: 'jane.doe@gmail.com', ssn: '123-45-6789', note: 'ok' },
      { id: 2, email: 'team@acme-corp.io', ssn: '987-65-4321' },
    ],
    payments: [
      { id: 1, card_number: '4539 1488 0343 6467', amount: 10 },   // valid Luhn Visa
      { id: 2, card_number: '5500000000000005', amount: 5 },       // valid Luhn MC (wait: test via luhn)
      { id: 3, card_number: '1234567812345678', amount: 1 },       // invalid Luhn → untouched
      { id: 4, order_ref: '4539148803436467' },                    // not a card column → untouched
    ],
  }
  const { data, report } = applyPrivacy(input)

  it('moves real-provider emails to reserved domains, keeps company domains', () => {
    expect(data.users[0].email).toMatch(/^jane\.doe@example\.(com|net|org)$/)
    expect(data.users[1].email).toBe('team@acme-corp.io')
  })

  it('makes SSNs unissuable (9xx area) and leaves 9xx ones alone', () => {
    expect(String(data.users[0].ssn)).toMatch(/^9\d\d-45-6789$/)
    expect(data.users[1].ssn).toBe('987-65-4321')
  })

  it('replaces Luhn-valid card numbers in card columns with test numbers', () => {
    expect(data.payments[0].card_number).toBe('4111111111111111')
    expect(data.payments[2].card_number).toBe('1234567812345678')
    expect(data.payments[3].order_ref).toBe('4539148803436467')
    expect(report.cards).toBeGreaterThanOrEqual(1)
  })

  it('does not mutate input and counts changes', () => {
    expect(input.users[0].email).toBe('jane.doe@gmail.com')
    expect(report.emails).toBe(1)
    expect(report.ssns).toBe(1)
  })
})
