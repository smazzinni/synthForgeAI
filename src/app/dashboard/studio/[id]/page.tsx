'use client'

import { use, useEffect, useState } from 'react'
import StudioPage from '../page'
import { Loader2 } from 'lucide-react'
import { apiGet } from '@/lib/api-client'

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
        const result = await apiGet<{ database: Record<string, unknown> | null }>(
          `/api/databases?id=${id}`,
          { cacheTtl: 5000, timeout: 10000 }
        )

        const db = result.database
        if (!db) {
          setError('Database not found')
          setLoading(false)
          return
        }

        setDbName((db.name as string) || '')

        if (Array.isArray(db.schema_json)) {
          const schemaTables: SchemaTable[] = db.schema_json.map((t: { name: string; columns: { name: string; type: string }[] }) => ({
            name: t.name,
            columns: t.columns || [],
          }))
          setSchema(schemaTables)
        }

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
      <div className="flex items-center justify-center h-screen bg-background">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-amber-600" />
          <p className="text-sm text-muted-foreground">Loading database...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-screen bg-background">
        <div className="text-center">
          <p className="text-muted-foreground mb-2">{error}</p>
          <a href="/dashboard/studio" className="text-amber-600 hover:underline text-sm">
            Create a new database instead
          </a>
        </div>
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
