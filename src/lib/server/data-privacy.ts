/**
 * Privacy Officer — makes generated data safe to share.
 *
 * An LLM asked for "realistic" data can emit values that belong to real
 * people (a plausible gmail address, a valid card number). This pass rewrites
 * such values into forms that are structurally realistic but cannot identify
 * anyone:
 *
 *  - emails at real consumer providers → same local part @ a reserved domain
 *    (example.com / example.net / example.org, RFC 2606)
 *  - US SSN-shaped values → area number 9xx (never issued)
 *  - payment card numbers that pass the Luhn check → well-known test numbers
 *    of the same brand (Visa 4111…, Mastercard 5555…, Amex 3782…)
 *
 * Disable with PRIVACY_MASKING=off when you deliberately need raw values.
 */
type Row = Record<string, unknown>

export interface PrivacyReport {
  emails: number
  ssns: number
  cards: number
}

const REAL_EMAIL_DOMAINS = /@(gmail|googlemail|yahoo|ymail|hotmail|outlook|live|msn|icloud|me|mac|aol|proton|protonmail|gmx|zoho|yandex|mail|qq|163|126|rediffmail)\.[a-z.]+$/i
const RESERVED = ['example.com', 'example.net', 'example.org']
const SSN_RE = /^(?!9)(\d{3})-(\d{2})-(\d{4})$/
const CARD_RE = /^(?:\d[ -]?){12,18}\d$/

function luhnValid(digits: string): boolean {
  let sum = 0
  let dbl = false
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = digits.charCodeAt(i) - 48
    if (dbl) { d *= 2; if (d > 9) d -= 9 }
    sum += d
    dbl = !dbl
  }
  return sum % 10 === 0
}

function testCardFor(digits: string): string {
  if (digits.startsWith('34') || digits.startsWith('37')) return '378282246310005'
  if (/^5[1-5]/.test(digits) || /^2[2-7]/.test(digits)) return '5555555555554444'
  if (digits.startsWith('6')) return '6011111111111117'
  return '4111111111111111'
}

export function privacyMaskingEnabled(): boolean {
  return (process.env.PRIVACY_MASKING || 'on').toLowerCase() !== 'off'
}

/** Mask in place-copy; returns new data and counts of what was changed. */
export function applyPrivacy(data: Record<string, Row[]>): { data: Record<string, Row[]>; report: PrivacyReport } {
  const report: PrivacyReport = { emails: 0, ssns: 0, cards: 0 }
  const out: Record<string, Row[]> = {}
  for (const [table, rows] of Object.entries(data)) {
    out[table] = (rows || []).map((row, i) => {
      let copy: Row | null = null
      for (const [col, value] of Object.entries(row)) {
        if (typeof value !== 'string' || value.length > 254) continue
        let next = value
        if (value.includes('@') && REAL_EMAIL_DOMAINS.test(value)) {
          next = value.replace(/@.+$/, `@${RESERVED[i % RESERVED.length]}`)
          report.emails++
        } else if (SSN_RE.test(value)) {
          next = value.replace(SSN_RE, (_m, _a, b, c) => `9${String(i % 100).padStart(2, '0')}-${b}-${c}`)
          report.ssns++
        } else if (CARD_RE.test(value)) {
          const digits = value.replace(/[ -]/g, '')
          if (digits.length >= 13 && digits.length <= 19 && luhnValid(digits) && /card|pan|cc|credit|payment/i.test(col)) {
            next = testCardFor(digits)
            report.cards++
          }
        }
        if (next !== value) (copy ??= { ...row })[col] = next
      }
      return copy ?? row
    })
  }
  return { data: out, report }
}
