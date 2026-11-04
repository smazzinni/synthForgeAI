/**
 * Symmetric encryption for secrets stored at rest (e.g. external DB passwords).
 *
 * Format: `enc:v1:<iv b64>:<tag b64>:<ciphertext b64>` using AES-256-GCM.
 * Values without the prefix are treated as legacy plaintext and returned
 * unchanged, so existing rows keep working and are re-encrypted on next save.
 *
 * Key: CONNECTION_ENCRYPTION_KEY (any string; hashed to 32 bytes). Falls back
 * to SUPABASE_JWT_SECRET / SUPABASE_SERVICE_KEY so deployments that already
 * have a server secret are protected without extra config. In production a
 * missing key is logged loudly.
 */
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'

const PREFIX = 'enc:v1:'
let warned = false

function getKey(): Buffer | null {
  const material =
    process.env.CONNECTION_ENCRYPTION_KEY ||
    process.env.SUPABASE_JWT_SECRET ||
    process.env.SUPABASE_SERVICE_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!material) {
    if (!warned && process.env.NODE_ENV === 'production') {
      console.error('[crypto] CONNECTION_ENCRYPTION_KEY is not set — connection passwords are stored unencrypted.')
      warned = true
    }
    return null
  }
  return createHash('sha256').update(material).digest()
}

export function isEncrypted(value: string | null | undefined): boolean {
  return typeof value === 'string' && value.startsWith(PREFIX)
}

export function encryptSecret(plain: string): string {
  if (!plain || isEncrypted(plain)) return plain
  const key = getKey()
  if (!key) return plain
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return `${PREFIX}${iv.toString('base64')}:${tag.toString('base64')}:${ct.toString('base64')}`
}

export function decryptSecret(stored: string): string {
  if (!isEncrypted(stored)) return stored
  const key = getKey()
  if (!key) throw new Error('Cannot decrypt stored secret: encryption key is not configured')
  const [ivB64, tagB64, ctB64] = stored.slice(PREFIX.length).split(':')
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivB64, 'base64'))
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'))
  return Buffer.concat([decipher.update(Buffer.from(ctB64, 'base64')), decipher.final()]).toString('utf8')
}
