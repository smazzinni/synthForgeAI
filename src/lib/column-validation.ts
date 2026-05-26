/**
 * Advanced column validation and type checking for generated synthetic data
 * Validates dates, UUIDs, emails, numeric ranges, and domain-specific patterns
 */

export interface ColumnValidationRule {
  columnName: string
  columnType: string
  isNullable: boolean
  isPrimary: boolean
  isForeignKey: boolean
}

export interface ColumnValidationResult {
  isValid: boolean
  value: unknown
  correctedValue?: unknown
  issues: string[]
}

/**
 * Parse column type and infer semantic meaning
 */
export function parseColumnType(columnType: string): {
  baseType: string
  isDate: boolean
  isUuid: boolean
  isNumeric: boolean
  isBoolean: boolean
  isText: boolean
  maxLength?: number
} {
  const lower = columnType.toLowerCase()
  
  return {
    baseType: lower,
    isDate: /timestamp|date|time|datetime/i.test(lower),
    isUuid: /uuid|guid/i.test(lower),
    isNumeric: /int|float|double|decimal|numeric|number/i.test(lower),
    isBoolean: /boolean|bool|bit/i.test(lower),
    isText: /varchar|char|text|string/i.test(lower),
    maxLength: extractMaxLength(lower),
  }
}

function extractMaxLength(columnType: string): number | undefined {
  const match = columnType.match(/varchar\((\d+)\)|char\((\d+)\)/)
  if (match) {
    return parseInt(match[1] || match[2], 10)
  }
  return undefined
}

/**
 * Validate and correct a value based on column metadata and inferred type
 */
export function validateAndCorrectColumnValue(
  value: unknown,
  columnName: string,
  columnType: string,
  rule?: ColumnValidationRule
): ColumnValidationResult {
  const issues: string[] = []
  let correctedValue = value

  // Allow nulls for nullable columns
  if ((value === null || value === undefined) && (rule?.isNullable ?? true)) {
    return { isValid: true, value: null, issues: [] }
  }

  // Disallow nulls for non-nullable columns
  if ((value === null || value === undefined) && !(rule?.isNullable ?? true)) {
    return {
      isValid: false,
      value,
      issues: [`Non-nullable column "${columnName}" has NULL value`],
    }
  }

  const typeInfo = parseColumnType(columnType)

  // ─── Date/Timestamp validation ───
  if (typeInfo.isDate) {
    if (typeof value === 'string' || typeof value === 'number') {
      const dateVal = new Date(value)
      if (isNaN(dateVal.getTime())) {
        issues.push(`Invalid date format for column "${columnName}": ${String(value).substring(0, 50)}`)
      } else {
        const year = dateVal.getFullYear()
        // Plausible date range: 2000 to 2030 for synthetic data
        if (year < 2000 || year > 2030) {
          issues.push(`Date year ${year} outside plausible range (2000-2030) for column "${columnName}"`)
          // Auto-correct: If it looks like a birth year in a created_at/updated_at column, replace with current date
          if (columnName.includes('created_at') || columnName.includes('updated_at')) {
            correctedValue = new Date().toISOString()
          }
        }
        correctedValue = dateVal.toISOString()
      }
    } else {
      issues.push(`Date column "${columnName}" has non-string/non-number value: ${typeof value}`)
    }
  }

  // ─── UUID validation ───
  if (typeInfo.isUuid || columnName === 'id' || (columnName.endsWith('_id') && typeInfo.isUuid)) {
    if (typeof value !== 'string') {
      issues.push(`UUID column "${columnName}" has non-string value: ${typeof value}`)
    } else {
      const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
      if (!uuidRe.test(value)) {
        issues.push(`Invalid UUID format in column "${columnName}": ${value.substring(0, 50)}`)
      }
    }
  }

  // ─── Email validation ───
  if (columnName.toLowerCase().includes('email')) {
    if (typeof value === 'string') {
      const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
      if (!emailRe.test(value)) {
        issues.push(`Invalid email format in column "${columnName}": ${value}`)
      }
    } else {
      issues.push(`Email column "${columnName}" has non-string value: ${typeof value}`)
    }
  }

  // ─── Numeric validation ───
  if (typeInfo.isNumeric) {
    if (typeof value === 'number') {
      // Check for NaN, Infinity
      if (!isFinite(value)) {
        issues.push(`Non-finite number in column "${columnName}": ${value}`)
        correctedValue = 0
      }
    } else if (typeof value === 'string') {
      const num = Number(value)
      if (isNaN(num)) {
        issues.push(`Non-numeric value in numeric column "${columnName}": ${value}`)
      } else {
        correctedValue = num
      }
    } else {
      issues.push(`Non-number type in numeric column "${columnName}": ${typeof value}`)
    }
  }

  // ─── Boolean validation ───
  if (typeInfo.isBoolean) {
    if (typeof value === 'boolean') {
      correctedValue = value
    } else if (typeof value === 'string') {
      if (/^(true|yes|1|on)$/i.test(value)) {
        correctedValue = true
      } else if (/^(false|no|0|off)$/i.test(value)) {
        correctedValue = false
      } else {
        issues.push(`Invalid boolean value in column "${columnName}": ${value}`)
      }
    } else if (typeof value === 'number') {
      correctedValue = value !== 0
    } else {
      issues.push(`Invalid type for boolean column "${columnName}": ${typeof value}`)
    }
  }

  // ─── Text length validation ───
  if (typeInfo.isText && typeInfo.maxLength && typeof value === 'string') {
    if (value.length > typeInfo.maxLength) {
      issues.push(`Text in column "${columnName}" exceeds max length ${typeInfo.maxLength}: ${value.length} chars`)
      correctedValue = value.substring(0, typeInfo.maxLength)
    }
  }

  const isValid = issues.length === 0
  return {
    isValid,
    value,
    correctedValue: isValid ? value : correctedValue,
    issues,
  }
}

/**
 * Batch validate all columns in a record
 */
export function validateRecord(
  record: Record<string, unknown>,
  columns: Array<{ name: string; type: string }>,
  rules?: Record<string, ColumnValidationRule>
): {
  isValid: boolean
  correctedRecord: Record<string, unknown>
  issues: Array<{ column: string; issues: string[] }>
} {
  const issues: Array<{ column: string; issues: string[] }> = []
  const correctedRecord: Record<string, unknown> = {}

  for (const col of columns) {
    const value = record[col.name]
    const rule = rules?.[col.name]
    const result = validateAndCorrectColumnValue(value, col.name, col.type, rule)

    correctedRecord[col.name] = result.correctedValue ?? result.value

    if (result.issues.length > 0) {
      issues.push({
        column: col.name,
        issues: result.issues,
      })
    }
  }

  return {
    isValid: issues.length === 0,
    correctedRecord,
    issues,
  }
}
