import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { scoreDataQuality, detectPII, generateFakeValue } from '@/lib/ai'
import { getAuthenticatedUser, AuthError, verifyDatabaseAccess } from '@/lib/auth'

// ─── Types ─────────────────────────────────────────────
interface QualityIssue {
  table: string
  column?: string
  type: 'null_value' | 'duplicate_id' | 'orphan_fk' | 'type_mismatch' | 'empty_string' | 'constraint_violation' | 'data_anomaly'
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
}

// ─── Important column patterns ─────────────────────────
const IMPORTANT_COLUMNS = ['id', 'name', 'email', 'username', 'first_name', 'last_name', 'phone', 'status', 'created_at', 'updated_at']

// POST /api/quality - Run data quality checks (tenant-scoped)
export async function POST(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request)

    let body: Record<string, unknown>
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    const { databaseId, autoFix = false } = body as {
      databaseId?: string
      autoFix?: boolean
    }

    if (!databaseId || typeof databaseId !== 'string') {
      return NextResponse.json({ error: 'databaseId required' }, { status: 400 })
    }

    // Verify database belongs to user
    const dbAccess = await verifyDatabaseAccess(databaseId, user.userId)
    if (!dbAccess) {
      return NextResponse.json({ error: 'Database not found or access denied' }, { status: 403 })
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

    for (const [tableName, rows] of Object.entries(dataJson)) {
      if (!Array.isArray(rows)) continue

      const tableIssues: QualityIssue[] = []
      totalRows += rows.length
      const tableSchema = schemaJson[tableName]

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
        issues: tableIssues
      })
    }

    // ─── Auto-fix ────────────────────────────────────────
    if (autoFix) {
      let modified = false

      for (const [tableName, rows] of Object.entries(dataJson)) {
        if (!Array.isArray(rows)) continue

        for (const row of rows) {
          for (const col of IMPORTANT_COLUMNS) {
            if (col in row && (row[col] === null || row[col] === undefined || row[col] === '')) {
              const before = row[col]
              row[col] = generateFakeValue('VARCHAR', col)
              modified = true
              fixesApplied++
              fixDetails.push({
                table: tableName, column: col, type: 'null_value',
                severity: 'warning', message: `Fixed null/empty in "${col}"`,
                count: 1, recoverable: true, before, after: row[col]
              })
            }
          }
        }

        if (rows.length > 0 && 'id' in rows[0]) {
          const seenIds = new Set<unknown>()
          for (const row of rows) {
            if (seenIds.has(row.id)) {
              const before = row.id
              const maxId = Math.max(...rows.map(r => Number(r.id) || 0))
              row.id = maxId + 1 + Math.floor(Math.random() * 1000)
              modified = true
              fixesApplied++
              fixDetails.push({
                table: tableName, column: 'id', type: 'duplicate_id',
                severity: 'critical', message: `Fixed duplicate ID`,
                count: 1, recoverable: true, before, after: row.id
              })
            }
            seenIds.add(row.id)
          }
        }

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

      if (modified) {
        try {
          await db.database.update({
            where: { id: databaseId },
            data: { dataJson: JSON.stringify(dataJson) }
          })
        } catch (err) {
          console.error('[Quality API] Error saving fixes:', err)
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
      fixDetails
    }

    return NextResponse.json({ report })
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode })
    }
    console.error('[Quality API] Error:', error)
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Quality check failed'
    }, { status: 500 })
  }
}
