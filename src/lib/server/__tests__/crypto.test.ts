import { describe, expect, it, beforeAll } from 'vitest'

beforeAll(() => { process.env.CONNECTION_ENCRYPTION_KEY = 'test-key-123' })

describe('secret encryption', () => {
  it('round-trips and is non-deterministic', async () => {
    const { encryptSecret, decryptSecret, isEncrypted } = await import('../crypto')
    const a = encryptSecret('hunter2')
    const b = encryptSecret('hunter2')
    expect(isEncrypted(a)).toBe(true)
    expect(a).not.toBe(b)
    expect(decryptSecret(a)).toBe('hunter2')
  })

  it('passes legacy plaintext through and does not double-encrypt', async () => {
    const { encryptSecret, decryptSecret } = await import('../crypto')
    expect(decryptSecret('plain')).toBe('plain')
    const once = encryptSecret('x')
    expect(encryptSecret(once)).toBe(once)
  })

  it('rejects tampered ciphertext', async () => {
    const { encryptSecret, decryptSecret } = await import('../crypto')
    const enc = encryptSecret('secret')
    const tampered = enc.slice(0, -4) + (enc.endsWith('AAAA') ? 'BBBB' : 'AAAA')
    expect(() => decryptSecret(tampered)).toThrow()
  })
})
