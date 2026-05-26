import { validateAndCorrectColumnValue } from './column-validation'

export interface ValidationResult {
  valid: boolean
  cleanedRecord: Record<string, unknown>
  failures: Array<{ column: string; value: unknown; reason: string }>
}

export function validateAndCleanRecord(
  tableName: string,
  record: Record<string, unknown>,
  schemaColumns: Array<{ name: string; type: string }>,
  existingPrimaryKeys: Set<string>
): ValidationResult {
  const failures: Array<{ column: string; value: unknown; reason: string }> = []
  const cleanedRecord: Record<string, unknown> = {}

  const validColumns = new Set(schemaColumns.map(c => c.name))
  const typeLookup = new Map(schemaColumns.map(c => [c.name, c.type.toLowerCase()]))

  for (const [key, value] of Object.entries(record)) {
    if (!validColumns.has(key)) continue
    cleanedRecord[key] = value
  }

  for (const col of schemaColumns) {
    if (!(col.name in cleanedRecord)) cleanedRecord[col.name] = null
  }

  for (const col of schemaColumns) {
    let value = cleanedRecord[col.name]
    const colType = typeLookup.get(col.name) || col.type || ''
    const colName = col.name.toLowerCase()

    // 1. Try UUID correction first (pre-validation) if it's a UUID column
    if (colType.includes('uuid') || colName === 'id' || (colName.endsWith('_id') && colType.includes('uuid'))) {
      if (typeof value === 'string') {
        const fixed = tryFixUUID(value)
        if (fixed && fixed !== value) {
          value = fixed
          cleanedRecord[col.name] = fixed
          failures.push({ column: col.name, value, reason: `Auto-corrected malformed UUID to ${fixed}` })
        }
      }
    }

    // 2. Call the advanced column validation utility
    const result = validateAndCorrectColumnValue(value, col.name, colType)
    if (!result.isValid) {
      // If this is an ID/UUID column, generate a safe fallback UUID instead
      const isIdColumn = colName === 'id' || colName.endsWith('_id')
      if (isIdColumn) {
        // ensure uniqueness against existingPrimaryKeys
        let newUuid: string | null = null
        for (let attempts = 0; attempts < 5; attempts++) {
          const candidate = generateUUID()
          if (!existingPrimaryKeys.has(candidate)) {
            newUuid = candidate
            break
          }
        }
        if (!newUuid) newUuid = generateUUID()
        cleanedRecord[col.name] = newUuid
        failures.push({
          column: col.name,
          value,
          reason: `Invalid UUID replaced with generated UUID ${newUuid}`,
        })
        // record the new PK to avoid future duplicates
        try { existingPrimaryKeys.add(String(newUuid)) } catch {}
      } else {
        const alreadyReported = failures.some(f => f.column === col.name)
        if (!alreadyReported || result.correctedValue === null) {
          failures.push({
            column: col.name,
            value,
            reason: result.issues.join('; ')
          })
        }
        cleanedRecord[col.name] = result.correctedValue ?? null
      }
    } else {
      cleanedRecord[col.name] = result.value
    }
  }

  return { valid: true, cleanedRecord, failures }
}

export function tryFixUUID(raw: string): string | null {
  if (typeof raw !== 'string') return null
  const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  if (uuidRe.test(raw)) return raw.toLowerCase()
  if (raw.length !== 36) return null

  const candidate = raw
    .split('')
    .map((ch, idx) => {
      if ([8, 13, 18, 23].includes(idx)) {
        return ch === '-' ? '-' : '?'
      }
      if (/[0-9a-fA-F]/.test(ch)) {
        return ch.toLowerCase()
      }
      if (/[Oo]/.test(ch)) {
        return '0'
      }
      if (/[lLiI]/.test(ch)) {
        return '1'
      }
      return '?'
    })
    .join('')

  if (candidate.includes('?')) return null
  if (uuidRe.test(candidate)) return candidate
  return null
}

function generateUUID(): string {
  try {
    if (typeof (globalThis as any).crypto?.randomUUID === 'function') {
      return (globalThis as any).crypto.randomUUID()
    }
  } catch {}

  // Fallback UUID v4 implementation (not cryptographically strong)
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}
