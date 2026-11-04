/**
 * Password hashing with scrypt (Node built-in, memory-hard).
 * Stored format: scrypt$N$r$p$<salt b64>$<hash b64> — parameters travel with
 * the hash so they can be raised later without breaking existing accounts.
 */
import { randomBytes, scrypt as scryptCb, timingSafeEqual, type ScryptOptions } from 'node:crypto'

const N = 16384
const R = 8
const P = 1
const KEYLEN = 64

function scrypt(password: string, salt: Buffer, keylen: number, opts: ScryptOptions): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCb(password, salt, keylen, opts, (err, key) => (err ? reject(err) : resolve(key)))
  })
}

export const PASSWORD_MIN = 8
export const PASSWORD_MAX = 128

export function passwordProblem(password: unknown): string | null {
  if (typeof password !== 'string') return 'Password is required'
  if (password.length < PASSWORD_MIN) return `Password must be at least ${PASSWORD_MIN} characters`
  if (password.length > PASSWORD_MAX) return `Password must be at most ${PASSWORD_MAX} characters`
  if (/^\s|\s$/.test(password)) return 'Password cannot start or end with a space'
  return null
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16)
  const hash = await scrypt(password.normalize('NFKC'), salt, KEYLEN, { N, r: R, p: P, maxmem: 64 * 1024 * 1024 })
  return `scrypt$${N}$${R}$${P}$${salt.toString('base64')}$${hash.toString('base64')}`
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = (stored || '').split('$')
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false
  const [, n, r, p, saltB64, hashB64] = parts
  const expected = Buffer.from(hashB64, 'base64')
  const actual = await scrypt(password.normalize('NFKC'), Buffer.from(saltB64, 'base64'), expected.length, {
    N: Number(n), r: Number(r), p: Number(p), maxmem: 64 * 1024 * 1024,
  })
  return actual.length === expected.length && timingSafeEqual(actual, expected)
}

// Used when the email doesn't exist so login takes the same time either way.
let dummyHash: Promise<string> | null = null
export function dummyPasswordHash(): Promise<string> {
  return (dummyHash ??= hashPassword('not-a-real-password-' + randomBytes(8).toString('hex')))
}
