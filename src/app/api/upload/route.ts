import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { extractSchemaFromSQL, extractSchemaFromCSV, extractSchemaFromJSON } from '@/lib/ai'

// POST /api/upload - Upload and parse files
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get('file') as File
    const databaseId = formData.get('databaseId') as string | null

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

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
    } else if (filename.endsWith('.json')) {
      fileType = 'json'
      extractedSchema = extractSchemaFromJSON(text)
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

    // If databaseId provided, update the database schema
    if (databaseId && Object.keys(extractedSchema).length > 0) {
      const database = await db.database.findUnique({ where: { id: databaseId } })
      if (database) {
        const currentSchema = JSON.parse(database.schemaJson || '{}')
        const mergedSchema = { ...currentSchema, ...extractedSchema }
        await db.database.update({
          where: { id: databaseId },
          data: { schemaJson: JSON.stringify(mergedSchema) }
        })
      }
    }

    return NextResponse.json({
      file: {
        id: fileUpload.id,
        filename,
        fileType,
        size: file.size,
        extractedSchema,
        contentPreview: text.slice(0, 500)
      }
    })
  } catch (error) {
    console.error('Upload error:', error)
    return NextResponse.json({ error: 'Failed to process uploaded file' }, { status: 500 })
  }
}
