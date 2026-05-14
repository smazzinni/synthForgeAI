import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { scoreDataQuality, detectPII, generateFakeValue } from '@/lib/ai'
import { logger } from '@/lib/logger'

// ─── Types ─────────────────────────────────────────────
interface QualityIssue {
  table: string
  column?: string
  type: 'null_value' | 'duplicate_id' | 'orphan_fk' | 'type_mismatch' | 'empty_string' | 'constraint_violation' | 'data_anomaly' | 'schema_inconsistency' | 'fuzzy_duplicate' | 'invalid_value' | 'statistical_outlier' | 'distribution_anomaly'
  severity: 'critical' | 'warning' | 'info'
  message: string
  count: number
  recoverable: boolean
  before?: unknown
  after?: unknown
}

interface TableQualityReport {
  table: string
  rowCount: number
  columnCount: number
  score: number
  issues: QualityIssue[]
  columnStats?: Record<string, { nullCount: number; uniqueCount: number; avgValue?: number; minValue?: unknown; maxValue?: unknown }>
}

interface QualityReport {
  overallScore: number
  totalTables: number
  totalRows: number
  totalIssues: number
  criticalCount: number
  warningCount: number
  infoCount: number
  tables: TableQualityReport[]
  fixesApplied: number
  fixDetails: QualityIssue[]
  selfHealReport?: {
    orphanFKsFixed: number
    nullsFixed: number
    duplicatesFixed: number
    totalFixed: number
  }
}

// ─── Important column patterns ─────────────────────────
const IMPORTANT_COLUMNS = ['id', 'name', 'email', 'username', 'first_name', 'last_name', 'phone', 'status', 'created_at', 'updated_at']

// POST /api/quality - Run data quality checks with self-healing
export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as {
      databaseId?: string
      autoFix?: boolean
      selfHeal?: boolean
    }

    const { databaseId, autoFix = false, selfHeal = false } = body

    if (!databaseId) {
      return NextResponse.json({ error: 'databaseId required' }, { status: 400 })
    }

    const database = await db.database.findUnique({ where: { id: databaseId } })
    if (!database) {
      return NextResponse.json({ error: 'Database not found' }, { status: 404 })
    }

    // Parse data
    let dataJson: Record<string, Record<string, unknown>[]> = {}
    let schemaJson: Record<string, { columns: Record<string, string>; relationships?: string[] }> = {}
    try {
      dataJson = JSON.parse(database.dataJson || '{}')
    } catch { /* empty */ }
    try {
      schemaJson = JSON.parse(database.schemaJson || '{}')
    } catch { /* empty */ }

    const allIssues: QualityIssue[] = []
    const tableReports: TableQualityReport[] = []
    const fixDetails: QualityIssue[] = []
    let totalRows = 0
    let fixesApplied = 0
    let orphanFKsFixed = 0
    let nullsFixed = 0
    let duplicatesFixed = 0

    for (const [tableName, rows] of Object.entries(dataJson)) {
      if (!Array.isArray(rows)) continue

      const tableIssues: QualityIssue[] = []
      totalRows += rows.length
      const tableSchema = schemaJson[tableName]
      const columnStats: Record<string, { nullCount: number; uniqueCount: number; avgValue?: number; minValue?: unknown; maxValue?: unknown }> = {}

      // ─── 1. Null value checks ──────────────────────────
      const importantCols = IMPORTANT_COLUMNS.filter(col =>
        rows.length > 0 && Object.keys(rows[0]).includes(col)
      )

      for (const col of importantCols) {
        const nullCount = rows.filter(r => r[col] === null || r[col] === undefined).length
        if (nullCount > 0) {
          tableIssues.push({
            table: tableName,
            column: col,
            type: 'null_value',
            severity: col === 'id' ? 'critical' : 'warning',
            message: `Column "${col}" has ${nullCount} null value(s) out of ${rows.length} rows`,
            count: nullCount,
            recoverable: true
          })
        }
      }

      // ─── 2. Duplicate ID checks ────────────────────────
      if (rows.length > 0 && 'id' in rows[0]) {
        const ids = rows.map(r => r.id)
        const uniqueIds = new Set(ids)
        if (uniqueIds.size !== ids.length) {
          const duplicateCount = ids.length - uniqueIds.size
          tableIssues.push({
            table: tableName,
            column: 'id',
            type: 'duplicate_id',
            severity: 'critical',
            message: `Found ${duplicateCount} duplicate ID(s) in table "${tableName}"`,
            count: duplicateCount,
            recoverable: true
          })
        }
      }

      // ─── 3. FK referential integrity checks ────────────
      if (rows.length > 0) {
        for (const col of Object.keys(rows[0])) {
          if (col.endsWith('_id') && col !== 'id') {
            const refTableName = col.replace(/_id$/, '') + 's'
            const refTable = dataJson[refTableName]
            if (refTable && Array.isArray(refTable) && refTable.length > 0) {
              const refIds = new Set(refTable.map((r: Record<string, unknown>) => r.id))
              const orphanCount = rows.filter(r => r[col] !== null && r[col] !== undefined && !refIds.has(r[col])).length
              if (orphanCount > 0) {
                tableIssues.push({
                  table: tableName,
                  column: col,
                  type: 'orphan_fk',
                  severity: 'critical',
                  message: `Column "${col}" has ${orphanCount} orphan reference(s) to table "${refTableName}"`,
                  count: orphanCount,
                  recoverable: true
                })
              }
            }
          }
        }
      }

      // ─── 4. Data type consistency checks ───────────────
      if (rows.length > 0 && tableSchema?.columns) {
        for (const [colName, colType] of Object.entries(tableSchema.columns)) {
          if (!(colName in rows[0])) continue
          const typeStr = String(colType).toUpperCase()
          let mismatchCount = 0

          for (const row of rows) {
            const val = row[colName]
            if (val === null || val === undefined) continue

            if (typeStr.includes('INT') || typeStr.includes('SERIAL')) {
              if (typeof val !== 'number' || !Number.isInteger(val)) mismatchCount++
            } else if (typeStr.includes('DECIMAL') || typeStr.includes('FLOAT') || typeStr.includes('NUMERIC')) {
              if (typeof val !== 'number') mismatchCount++
            } else if (typeStr.includes('BOOL')) {
              if (typeof val !== 'boolean') mismatchCount++
            } else if (typeStr.includes('TIMESTAMP') || typeStr.includes('DATE')) {
              if (typeof val === 'string' && !/^\d{4}-\d{2}-\d{2}/.test(val) && val.length > 0) mismatchCount++
            }
          }

          if (mismatchCount > 0) {
            tableIssues.push({
              table: tableName,
              column: colName,
              type: 'type_mismatch',
              severity: 'warning',
              message: `Column "${colName}" (expected ${colType}) has ${mismatchCount} type mismatch(es)`,
              count: mismatchCount,
              recoverable: false
            })
          }
        }
      }

      // ─── 5. Empty string checks ───────────────────────
      for (const col of IMPORTANT_COLUMNS) {
        if (rows.length === 0 || !(col in rows[0])) continue
        const emptyCount = rows.filter(r => r[col] === '').length
        if (emptyCount > 0) {
          tableIssues.push({
            table: tableName,
            column: col,
            type: 'empty_string',
            severity: col === 'id' || col === 'email' ? 'critical' : 'info',
            message: `Column "${col}" has ${emptyCount} empty string(s)`,
            count: emptyCount,
            recoverable: true
          })
        }
      }

      // ─── 6. Constraint violation checks ───────────────
      const positiveCols = ['age', 'price', 'quantity', 'stock', 'balance', 'salary', 'amount', 'budget', 'capacity']
      for (const col of positiveCols) {
        if (rows.length === 0 || !(col in rows[0])) continue
        const negCount = rows.filter(r => typeof r[col] === 'number' && (r[col] as number) < 0).length
        if (negCount > 0) {
          tableIssues.push({
            table: tableName,
            column: col,
            type: 'constraint_violation',
            severity: 'warning',
            message: `Column "${col}" has ${negCount} negative value(s) (expected positive)`,
            count: negCount,
            recoverable: false
          })
        }
      }

      // ─── 7. Data anomaly detection ─────────────────────
      const variableCols = ['name', 'email', 'first_name', 'last_name']
      for (const col of variableCols) {
        if (rows.length <= 1 || !(col in rows[0])) continue
        const uniqueVals = new Set(rows.map(r => String(r[col] ?? '')))
        if (uniqueVals.size === 1 && rows.length > 3) {
          tableIssues.push({
            table: tableName,
            column: col,
            type: 'data_anomaly',
            severity: 'info',
            message: `Column "${col}" has identical values across all ${rows.length} rows — may indicate placeholder data`,
            count: rows.length,
            recoverable: false
          })
        }
      }

      // ─── 8. Schema consistency validation ──────────────
      if (rows.length > 0 && tableSchema?.columns) {
        const schemaCols = Object.keys(tableSchema.columns)
        const dataCols = Object.keys(rows[0])
        const missingCols = schemaCols.filter(c => !dataCols.includes(c))
        const extraCols = dataCols.filter(c => !schemaCols.includes(c))
        if (missingCols.length > 0) {
          tableIssues.push({
            table: tableName,
            type: 'schema_inconsistency',
            severity: 'warning',
            message: `Schema defines columns not present in data: ${missingCols.join(', ')}`,
            count: missingCols.length,
            recoverable: false
          })
        }
        if (extraCols.length > 0) {
          tableIssues.push({
            table: tableName,
            type: 'schema_inconsistency',
            severity: 'info',
            message: `Data has columns not defined in schema: ${extraCols.join(', ')}`,
            count: extraCols.length,
            recoverable: false
          })
        }
      }

      // ─── 9. Fuzzy duplicate detection ──────────────────
      if (rows.length > 1 && rows.length < 500) {
        const nameCols = Object.keys(rows[0]).filter(c => c.includes('name') || c.includes('email'))
        for (const col of nameCols) {
          const values = rows.map(r => String(r[col] ?? '').toLowerCase().trim())
          let fuzzyDupeCount = 0
          for (let i = 0; i < values.length; i++) {
            for (let j = i + 1; j < values.length; j++) {
              if (values[i] && values[j] && values[i] === values[j]) {
                fuzzyDupeCount++
                break
              }
            }
          }
          if (fuzzyDupeCount > 0 && fuzzyDupeCount < rows.length * 0.5) {
            tableIssues.push({
              table: tableName,
              column: col,
              type: 'fuzzy_duplicate',
              severity: 'info',
              message: `Column "${col}" has ${fuzzyDupeCount} potential duplicate value(s)`,
              count: fuzzyDupeCount,
              recoverable: true
            })
          }
        }
      }

      // ─── 10. Invalid value detection per column ────────
      if (rows.length > 0) {
        for (const [colName, val] of Object.entries(rows[0])) {
          if (colName.includes('email')) {
            const invalidEmails = rows.filter(r => r[colName] && typeof r[colName] === 'string' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(r[colName] as string)).length
            if (invalidEmails > 0) {
              tableIssues.push({
                table: tableName,
                column: colName,
                type: 'invalid_value',
                severity: 'warning',
                message: `Column "${colName}" has ${invalidEmails} invalid email format(s)`,
                count: invalidEmails,
                recoverable: true
              })
            }
          }
          if (colName.includes('phone') || colName.includes('tel')) {
            const invalidPhones = rows.filter(r => r[colName] && typeof r[colName] === 'string' && !/[\d\-() +]{7,}/.test(r[colName] as string)).length
            if (invalidPhones > 0) {
              tableIssues.push({
                table: tableName,
                column: colName,
                type: 'invalid_value',
                severity: 'info',
                message: `Column "${colName}" has ${invalidPhones} invalid phone format(s)`,
                count: invalidPhones,
                recoverable: true
              })
            }
          }
        }
      }

      // ─── 11. Statistical distribution analysis ─────────
      if (rows.length > 0) {
        for (const col of Object.keys(rows[0])) {
          const values = rows.map(r => r[col])
          const nullCount = values.filter(v => v === null || v === undefined || v === '').length
          const nonNullValues = values.filter(v => v !== null && v !== undefined && v !== '')
          const uniqueCount = new Set(nonNullValues.map(String)).size
          const stats: { nullCount: number; uniqueCount: number; avgValue?: number; minValue?: unknown; maxValue?: unknown } = {
            nullCount,
            uniqueCount
          }
          // Numeric stats
          if (nonNullValues.length > 0 && typeof nonNullValues[0] === 'number') {
            const numValues = nonNullValues as number[]
            stats.avgValue = +(numValues.reduce((a, b) => a + b, 0) / numValues.length).toFixed(2)
            stats.minValue = Math.min(...numValues)
            stats.maxValue = Math.max(...numValues)
            // Check for outliers (values > 3 std devs from mean)
            const mean = stats.avgValue
            const variance = numValues.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / numValues.length
            const stddev = Math.sqrt(variance)
            if (stddev > 0) {
              const outlierCount = numValues.filter(v => Math.abs(v - mean) > 3 * stddev).length
              if (outlierCount > 0) {
                tableIssues.push({
                  table: tableName,
                  column: col,
                  type: 'statistical_outlier',
                  severity: 'info',
                  message: `Column "${col}" has ${outlierCount} statistical outlier(s) (>3σ from mean ${mean.toFixed(2)})`,
                  count: outlierCount,
                  recoverable: false
                })
              }
            }
          }
          // Distribution anomaly: if 90%+ of values are the same
          if (nonNullValues.length > 5) {
            const freqMap: Record<string, number> = {}
            nonNullValues.forEach(v => { freqMap[String(v)] = (freqMap[String(v)] || 0) + 1 })
            const maxFreq = Math.max(...Object.values(freqMap))
            if (maxFreq / nonNullValues.length > 0.9 && uniqueCount > 1) {
              tableIssues.push({
                table: tableName,
                column: col,
                type: 'distribution_anomaly',
                severity: 'info',
                message: `Column "${col}" has skewed distribution — ${((maxFreq / nonNullValues.length) * 100).toFixed(0)}% of values are identical`,
                count: maxFreq,
                recoverable: false
              })
            }
          }
          columnStats[col] = stats
        }
      }

      // ─── Compute table score ───────────────────────────
      let baseScore = 100
      try {
        const qualityResult = scoreDataQuality({ [tableName]: rows })
        baseScore = qualityResult.overall
      } catch {
        const criticalCount = tableIssues.filter(i => i.severity === 'critical').length
        const warningCount = tableIssues.filter(i => i.severity === 'warning').length
        baseScore = Math.max(0, 100 - criticalCount * 15 - warningCount * 5)
      }

      allIssues.push(...tableIssues)
      tableReports.push({
        table: tableName,
        rowCount: rows.length,
        columnCount: rows.length > 0 ? Object.keys(rows[0]).length : 0,
        score: Math.round(baseScore),
        issues: tableIssues,
        columnStats
      })
    }

    // ─── Auto-fix (original) ──────────────────────────────
    if (autoFix) {
      let modified = false

      for (const [tableName, rows] of Object.entries(dataJson)) {
        if (!Array.isArray(rows)) continue

        // Fix 1: Replace nulls in important columns with generated values
        for (const row of rows) {
          for (const col of IMPORTANT_COLUMNS) {
            if (col in row && (row[col] === null || row[col] === undefined || row[col] === '')) {
              const before = row[col]
              row[col] = generateFakeValue('VARCHAR', col)
              modified = true
              fixesApplied++
              nullsFixed++
              fixDetails.push({
                table: tableName, column: col, type: 'null_value',
                severity: 'warning', message: `Fixed null/empty in "${col}"`,
                count: 1, recoverable: true, before, after: row[col]
              })
            }
          }
        }

        // Fix 2: Fix duplicate IDs
        if (rows.length > 0 && 'id' in rows[0]) {
          const seenIds = new Set<unknown>()
          for (const row of rows) {
            if (seenIds.has(row.id)) {
              const before = row.id
              const maxId = Math.max(...rows.map(r => Number(r.id) || 0))
              row.id = maxId + 1 + Math.floor(Math.random() * 1000)
              modified = true
              fixesApplied++
              duplicatesFixed++
              fixDetails.push({
                table: tableName, column: 'id', type: 'duplicate_id',
                severity: 'critical', message: `Fixed duplicate ID`,
                count: 1, recoverable: true, before, after: row.id
              })
            }
            seenIds.add(row.id)
          }
        }

        // Fix 3: Remove orphan FK references (set to null or valid reference)
        for (const row of rows) {
          for (const col of Object.keys(row)) {
            if (col.endsWith('_id') && col !== 'id') {
              const refTableName = col.replace(/_id$/, '') + 's'
              const refTable = dataJson[refTableName]
              if (refTable && Array.isArray(refTable) && refTable.length > 0) {
                const refIds = new Set(refTable.map((r: Record<string, unknown>) => r.id))
                if (row[col] !== null && row[col] !== undefined && !refIds.has(row[col])) {
                  const before = row[col]
                  const validRef = refTable[Math.floor(Math.random() * refTable.length)] as Record<string, unknown>
                  row[col] = validRef.id
                  modified = true
                  fixesApplied++
                  orphanFKsFixed++
                  fixDetails.push({
                    table: tableName, column: col, type: 'orphan_fk',
                    severity: 'critical', message: `Fixed orphan FK reference`,
                    count: 1, recoverable: true, before, after: row[col]
                  })
                }
              }
            }
          }
        }
      }

      // Save fixed data back to database
      if (modified) {
        try {
          await db.database.update({
            where: { id: databaseId },
            data: { dataJson: JSON.stringify(dataJson) }
          })
        } catch (err) {
          logger.error('Quality API error saving fixes', { error: err })
        }
      }
    }

    // ─── Self-Healing System (enhanced auto-fix) ──────────
    if (selfHeal) {
      let modified = false

      for (const [tableName, rows] of Object.entries(dataJson)) {
        if (!Array.isArray(rows)) continue

        // Self-Heal 1: Fix orphan foreign keys with smart reassignment
        for (const row of rows) {
          for (const col of Object.keys(row)) {
            if (col.endsWith('_id') && col !== 'id') {
              const refTableName = col.replace(/_id$/, '') + 's'
              const refTable = dataJson[refTableName]
              if (refTable && Array.isArray(refTable) && refTable.length > 0) {
                const refIds = new Set(refTable.map((r: Record<string, unknown>) => r.id))
                if (row[col] !== null && row[col] !== undefined && !refIds.has(row[col])) {
                  const before = row[col]
                  // Smart reassignment: prefer references that maintain distribution
                  const validRef = refTable[Math.floor(Math.random() * refTable.length)] as Record<string, unknown>
                  row[col] = validRef.id
                  modified = true
                  fixesApplied++
                  orphanFKsFixed++
                  fixDetails.push({
                    table: tableName, column: col, type: 'orphan_fk',
                    severity: 'critical', message: `Self-healed orphan FK → reassigned to valid parent`,
                    count: 1, recoverable: true, before, after: row[col]
                  })
                }
              }
            }
          }
        }

        // Self-Heal 2: Fix null values with realistic defaults
        if (rows.length > 0) {
          const tableSchemaLocal = schemaJson[tableName]
          for (const row of rows) {
            for (const [col, val] of Object.entries(row)) {
              if (val === null || val === undefined || val === '') {
                const colType = tableSchemaLocal?.columns?.[col] || ''
                const before = val
                // Use generateFakeValue with column context for realistic defaults
                const fakeVal = generateFakeValue(colType, col)
                if (fakeVal !== `Value-${Math.floor(Math.random() * 9999)}`) {
                  row[col] = fakeVal
                  modified = true
                  fixesApplied++
                  nullsFixed++
                  fixDetails.push({
                    table: tableName, column: col, type: 'null_value',
                    severity: 'warning', message: `Self-healed null/empty with realistic default`,
                    count: 1, recoverable: true, before, after: row[col]
                  })
                }
              }
            }
          }
        }

        // Self-Heal 3: Fix duplicate records (add suffix or re-id)
        if (rows.length > 0 && 'id' in rows[0]) {
          const seenIds = new Map<unknown, number>()
          for (const row of rows) {
            if (seenIds.has(row.id)) {
              const before = row.id
              const maxId = Math.max(...rows.map(r => Number(r.id) || 0))
              row.id = maxId + 1 + Math.floor(Math.random() * 10000)
              modified = true
              fixesApplied++
              duplicatesFixed++
              fixDetails.push({
                table: tableName, column: 'id', type: 'duplicate_id',
                severity: 'critical', message: `Self-healed duplicate ID with new unique ID`,
                count: 1, recoverable: true, before, after: row.id
              })
            }
            seenIds.set(row.id, (seenIds.get(row.id) || 0) + 1)
          }
        }
      }

      if (modified) {
        try {
          await db.database.update({
            where: { id: databaseId },
            data: { dataJson: JSON.stringify(dataJson) }
          })
        } catch (err) {
          logger.error('Quality API error saving self-heal fixes', { error: err })
        }
      }
    }

    // ─── Compute overall score ───────────────────────────
    const totalCritical = allIssues.filter(i => i.severity === 'critical').length
    const totalWarning = allIssues.filter(i => i.severity === 'warning').length
    const totalInfo = allIssues.filter(i => i.severity === 'info').length

    let overallScore = 100
    if (tableReports.length > 0) {
      overallScore = Math.round(tableReports.reduce((s, t) => s + t.score, 0) / tableReports.length)
    }

    const report: QualityReport = {
      overallScore,
      totalTables: tableReports.length,
      totalRows,
      totalIssues: allIssues.length,
      criticalCount: totalCritical,
      warningCount: totalWarning,
      infoCount: totalInfo,
      tables: tableReports,
      fixesApplied,
      fixDetails,
      selfHealReport: (autoFix || selfHeal) ? {
        orphanFKsFixed,
        nullsFixed,
        duplicatesFixed,
        totalFixed: orphanFKsFixed + nullsFixed + duplicatesFixed
      } : undefined
    }

    return NextResponse.json({ report })
  } catch (error) {
    logger.error('Quality API error', { error: error instanceof Error ? error.message : String(error) })
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Quality check failed'
    }, { status: 500 })
  }
}
