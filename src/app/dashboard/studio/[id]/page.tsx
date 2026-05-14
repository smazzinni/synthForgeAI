'use client'

import { use, useEffect, useState } from 'react'
import StudioPage from '../page'
import { Loader2 } from 'lucide-react'

interface SchemaTable {
  name: string
  columns: { name: string; type: string }[]
}

export default function StudioDatabasePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const [loading, setLoading] = useState(true)
  const [dbName, setDbName] = useState('')
  const [schema, setSchema] = useState<SchemaTable[]>([])
  const [data, setData] = useState<Record<string, unknown[]>>({})
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function loadDatabase() {
      try {
        const res = await fetch(`/api/databases?id=${id}`)
        if (!res.ok) throw new Error('Failed to load database')
        const result = await res.json()
        const db = result.database
        if (!db) {
          setError('Database not found')
          setLoading(false)
          return
        }

        setDbName(db.name || '')

        // Convert schema_json to SchemaTable[] format if it's stored as the table-column format
        if (Array.isArray(db.schema_json)) {
          const schemaTables: SchemaTable[] = db.schema_json.map((t: { name: string; columns: { name: string; type: string }[] }) => ({
            name: t.name,
            columns: t.columns || [],
          }))
          setSchema(schemaTables)
        }

        // Convert data_json to Record<string, unknown[]> format
        if (db.data_json && typeof db.data_json === 'object') {
          const dataMap: Record<string, unknown[]> = {}
          for (const [key, val] of Object.entries(db.data_json as Record<string, unknown>)) {
            if (Array.isArray(val)) {
              dataMap[key] = val
            }
          }
          setData(dataMap)
        }

        setLoading(false)
      } catch (err) {
        console.error('[Studio] Error loading database:', err)
        setError('Failed to load database')
        setLoading(false)
      }
    }
    loadDatabase()
  }, [id])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-amber-600" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-screen">
        <p className="text-muted-foreground">{error}</p>
      </div>
    )
  }

  return (
    <StudioPage
      databaseId={id}
      initialName={dbName}
      initialSchema={schema}
      initialData={data}
    />
  )
}
