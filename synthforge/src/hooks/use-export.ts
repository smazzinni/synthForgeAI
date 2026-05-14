import { useCallback } from 'react'
import { useToast } from '@/hooks/use-toast'

export function useExport() {
  const { toast } = useToast()

  const exportData = useCallback((tables: Record<string, Record<string, unknown>[]>, format: string) => {
    let content = ''
    let filename = 'synthforge-data'
    let type = 'text/plain'

    if (format === 'json') {
      content = JSON.stringify(tables, null, 2)
      filename += '.json'
      type = 'application/json'
    } else if (format === 'csv') {
      const parts: string[] = []
      for (const [tableName, rows] of Object.entries(tables)) {
        if (rows?.length > 0) {
          const headers = Object.keys(rows[0])
          parts.push(`-- Table: ${tableName}`)
          parts.push(headers.map(h => `"${tableName}.${h}"`).join(','))
          for (const row of rows) {
            parts.push(headers.map(h => {
              const v = row[h]
              if (v === null || v === undefined) return '""'
              const s = String(v).replace(/"/g, '""')
              return `"${s}"`
            }).join(','))
          }
          parts.push('')
        }
      }
      content = parts.join('\n')
      filename += '.csv'
      type = 'text/csv'
    } else if (format === 'sql-insert') {
      const statements: string[] = []
      for (const [tableName, rows] of Object.entries(tables)) {
        if (rows?.length > 0) {
          const cols = Object.keys(rows[0])
          for (const row of rows) {
            const values = cols.map(c => {
              const v = row[c]
              return typeof v === 'string' ? `'${v.replace(/'/g, "''")}'` : String(v ?? 'NULL')
            })
            statements.push(`INSERT INTO ${tableName} (${cols.join(', ')}) VALUES (${values.join(', ')});`)
          }
        }
      }
      content = statements.join('\n')
      filename += '.sql'
      type = 'text/plain'
    } else if (format === 'sql-full') {
      const statements: string[] = []
      for (const [tableName, rows] of Object.entries(tables)) {
        if (rows?.length > 0) {
          const cols = Object.keys(rows[0])
          const colDefs = cols.map(c => {
            const sampleVal = rows[0][c]
            let sqlType = 'VARCHAR(255)'
            if (typeof sampleVal === 'number') sqlType = Number.isInteger(sampleVal) ? 'INTEGER' : 'DECIMAL(10,2)'
            else if (typeof sampleVal === 'boolean') sqlType = 'BOOLEAN'
            else if (c === 'id') sqlType = 'SERIAL PRIMARY KEY'
            else if (c.endsWith('_id')) sqlType = 'INTEGER REFERENCES ' + c.replace(/_id$/, '') + 's(id)'
            else if (typeof sampleVal === 'string' && /^\d{4}-\d{2}-\d{2}/.test(sampleVal)) sqlType = 'TIMESTAMP'
            return `${c} ${sqlType}`
          })
          statements.push(`CREATE TABLE ${tableName} (\n  ${colDefs.join(',\n  ')}\n);\n`)
          for (const row of rows) {
            const values = cols.map(c => {
              const v = row[c]
              return typeof v === 'string' ? `'${v.replace(/'/g, "''")}'` : String(v ?? 'NULL')
            })
            statements.push(`INSERT INTO ${tableName} (${cols.join(', ')}) VALUES (${values.join(', ')});`)
          }
          statements.push('')
        }
      }
      content = statements.join('\n')
      filename += '.sql'
      type = 'text/plain'
    }

    const blob = new Blob([content], { type })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = filename; a.click()
    URL.revokeObjectURL(url)
    toast({ title: 'Exported!', description: `Downloaded as ${filename}` })
  }, [toast])

  const exportTable = useCallback((tableName: string, rows: Record<string, unknown>[], format: string) => {
    exportData({ [tableName]: rows }, format)
  }, [exportData])

  const copyTable = useCallback((tableName: string, rows: Record<string, unknown>[]) => {
    const content = JSON.stringify({ [tableName]: rows }, null, 2)
    navigator.clipboard.writeText(content)
    toast({ title: 'Copied!', description: `${tableName} data copied to clipboard` })
  }, [toast])

  const copyAllData = useCallback((tables: Record<string, Record<string, unknown>[]>, format: string) => {
    let content = ''
    if (format === 'json') {
      content = JSON.stringify(tables, null, 2)
    } else if (format === 'sql') {
      const statements: string[] = []
      for (const [tableName, rows] of Object.entries(tables)) {
        if (rows?.length > 0) {
          const cols = Object.keys(rows[0])
          for (const row of rows) {
            const values = cols.map(c => {
              const v = row[c]
              return typeof v === 'string' ? `'${v.replace(/'/g, "''")}'` : String(v ?? 'NULL')
            })
            statements.push(`INSERT INTO ${tableName} (${cols.join(', ')}) VALUES (${values.join(', ')});`)
          }
        }
      }
      content = statements.join('\n')
    } else {
      content = JSON.stringify(tables, null, 2)
    }
    navigator.clipboard.writeText(content)
    toast({ title: 'Copied!', description: 'Data copied to clipboard' })
  }, [toast])

  const copyToClipboard = useCallback((text: string) => {
    navigator.clipboard.writeText(text)
    toast({ title: 'Copied!', description: 'Content copied to clipboard' })
  }, [toast])

  return { exportData, exportTable, copyTable, copyAllData, copyToClipboard }
}
