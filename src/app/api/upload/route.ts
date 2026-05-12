import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { extractSchemaFromSQL, extractSchemaFromCSV, extractSchemaFromJSON, extractSchemaFromXML, inferSchemaFromData, detectPII } from '@/lib/ai'

// POST /api/upload - Upload and parse files (supports multi-file)
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const databaseId = formData.get('databaseId') as string | null

    // Support multiple files
    const files: File[] = []
    // Check for multiple files (file, file1, file2, etc. or 'files' array)
    for (const [key, value] of formData.entries()) {
      if (value instanceof File) {
        files.push(value)
      }
    }

    if (files.length === 0) {
      return NextResponse.json({ error: 'No files provided' }, { status: 400 })
    }

    const results: {
      id: string
      filename: string
      fileType: string
      size: number
      extractedSchema: Record<string, unknown>
      inferredSchema?: Record<string, unknown>
      piiCheck?: { hasPII: boolean; findings: unknown[] }
      contentPreview: string
    }[] = []

    const allSchemas: Record<string, { columns: Record<string, string>; relationships?: string[] }> = {}
    const allTableData: Record<string, Record<string, unknown>[]> = {}
    const crossFileRelationships: { from: string; to: string; via: string }[] = []

    for (const file of files) {
      const text = await file.text()
      const filename = file.name
      const mimeType = file.type

      // Determine file type
      let fileType = 'unknown'
      let extractedSchema: Record<string, unknown> = {}

      if (filename.endsWith('.sql') || mimeType.includes('sql')) {
        fileType = 'sql'
        extractedSchema = extractSchemaFromSQL(text)
      } else if (filename.endsWith('.csv') || filename.endsWith('.tsv')) {
        fileType = 'csv'
        extractedSchema = extractSchemaFromCSV(text, filename)

        // Parse CSV data for quality scoring
        try {
          const lines = text.trim().split('\n')
          if (lines.length > 1) {
            const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''))
            const tableName = filename.replace(/\.(csv|tsv)$/i, '').replace(/[^a-zA-Z0-9_]/g, '_').toLowerCase()
            const rows: Record<string, unknown>[] = []
            for (const line of lines.slice(1, 51)) { // limit to 50 rows for preview
              const values = line.split(',').map(v => v.trim().replace(/"/g, ''))
              const row: Record<string, unknown> = {}
              headers.forEach((h, i) => { row[h] = values[i] || null })
              rows.push(row)
            }
            if (rows.length > 0) allTableData[tableName] = rows
          }
        } catch { /* CSV parse failed */ }
      } else if (filename.endsWith('.json')) {
        fileType = 'json'
        extractedSchema = extractSchemaFromJSON(text)

        // Parse JSON data
        try {
          const data = JSON.parse(text)
          if (Array.isArray(data) && data.length > 0 && typeof data[0] === 'object') {
            allTableData['imported_data'] = data.slice(0, 50)
          } else if (typeof data === 'object') {
            for (const [tn, td] of Object.entries(data)) {
              if (Array.isArray(td) && td.length > 0 && typeof td[0] === 'object') {
                allTableData[tn] = (td as Record<string, unknown>[]).slice(0, 50)
              }
            }
          }
        } catch { /* JSON parse failed */ }
      } else if (filename.endsWith('.xml')) {
        fileType = 'xml'
        extractedSchema = extractSchemaFromXML(text, filename)
      } else if (filename.endsWith('.xlsx') || filename.endsWith('.xls')) {
        fileType = 'excel'
        extractedSchema = { note: 'Excel parsing requires server-side library' }
      } else if (mimeType.includes('pdf')) {
        fileType = 'pdf'
        extractedSchema = { note: 'PDF text extraction - basic mode' }
      } else if (mimeType.includes('image')) {
        fileType = 'image'
        extractedSchema = { note: 'Image analysis requires vision AI' }
      }

      // Save file upload record
      const fileUpload = await db.fileUpload.create({
        data: {
          filename,
          mimeType,
          size: file.size,
          content: text.slice(0, 50000),
          fileType,
          extractedSchema: JSON.stringify(extractedSchema),
          databaseId: databaseId || undefined
        }
      })

      // Merge schema
      for (const [key, value] of Object.entries(extractedSchema)) {
        allSchemas[key] = value as { columns: Record<string, string>; relationships?: string[] }
      }

      // Run inferred schema analysis if we have data
      let inferredSchema: Record<string, unknown> | undefined
      if (Object.keys(allTableData).length > 0) {
        try {
          const inferred = inferSchemaFromData(allTableData)
          inferredSchema = {}
          for (const [tn, td] of Object.entries(inferred.tables)) {
            const columns: Record<string, string> = {}
            for (const [cn, cd] of Object.entries(td.columns)) {
              columns[cn] = cd.type
            }
            ;(inferredSchema as Record<string, unknown>)[tn] = {
              columns,
              primaryKey: td.primaryKey,
              foreignKeys: td.foreignKeys,
              constraints: td.constraints,
              relationships: td.relationships
            }
          }
        } catch { /* inference failed */ }
      }

      // Run PII check on data
      let piiCheck: { hasPII: boolean; findings: unknown[] } | undefined
      if (Object.keys(allTableData).length > 0) {
        try {
          const piiResult = detectPII(allTableData)
          piiCheck = { hasPII: piiResult.hasPII, findings: piiResult.findings }
        } catch { /* PII check failed */ }
      }

      results.push({
        id: fileUpload.id,
        filename,
        fileType,
        size: file.size,
        extractedSchema,
        inferredSchema,
        piiCheck,
        contentPreview: text.slice(0, 500)
      })
    }

    // Detect cross-file relationships
    const tableNames = Object.keys(allSchemas)
    for (let i = 0; i < tableNames.length; i++) {
      for (let j = 0; j < tableNames.length; j++) {
        if (i === j) continue
        const sourceTable = allSchemas[tableNames[i]]
        const targetTable = allSchemas[tableNames[j]]
        if (!sourceTable?.columns || !targetTable?.columns) continue

        // Check if source has an FK pointing to target
        for (const colName of Object.keys(sourceTable.columns)) {
          if (colName.endsWith('_id') && colName !== 'id') {
            const refTableName = colName.replace(/_id$/, '') + 's'
            if (refTableName === tableNames[j] || refTableName === tableNames[j].replace(/s$/, '') + 's') {
              crossFileRelationships.push({
                from: tableNames[i],
                to: tableNames[j],
                via: colName
              })
            }
          }
        }
      }
    }

    // If databaseId provided, update the database schema
    if (databaseId && Object.keys(allSchemas).length > 0) {
      const database = await db.database.findUnique({ where: { id: databaseId } })
      if (database) {
        const currentSchema = JSON.parse(database.schemaJson || '{}')
        const mergedSchema = { ...currentSchema, ...allSchemas }
        await db.database.update({
          where: { id: databaseId },
          data: { schemaJson: JSON.stringify(mergedSchema) }
        })

        // Create schema version
        await db.schemaVersion.create({
          data: {
            schemaJson: JSON.stringify(mergedSchema),
            description: `Uploaded ${files.length} file${files.length > 1 ? 's' : ''}: ${files.map(f => f.name).join(', ')}`,
            databaseId
          }
        })
      }
    }

    return NextResponse.json({
      files: results,
      mergedSchema: allSchemas,
      inferredSchema: Object.keys(allTableData).length > 0 ? inferSchemaFromData(allTableData) : null,
      crossFileRelationships,
      totalTables: Object.keys(allSchemas).length
    })
  } catch (error) {
    console.error('Upload error:', error)
    return NextResponse.json({ error: 'Failed to process uploaded file(s)' }, { status: 500 })
  }
}
