'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Database, Plus, Loader2, ArrowRight, Search, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { apiGet, apiDelete, invalidateCache } from '@/lib/api-client'

interface DatabaseItem {
  id: string
  name: string
  db_type: string
  status: string
  row_count: number
  quality_score: number | null
  schema_json?: { name: string; columns: { name: string; type: string }[] }[]
  created_at?: string
}

export default function MyDatabasesPage() {
  const [databases, setDatabases] = useState<DatabaseItem[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [deleting, setDeleting] = useState<string | null>(null)

  const loadDatabases = useCallback(async () => {
    try {
      // Use deduplicated API client - prevents duplicate requests
      const data = await apiGet<{ databases: DatabaseItem[] }>('/api/databases', {
        cacheTtl: 5000,
        timeout: 10000,
      })
      setDatabases(data.databases || [])
    } catch {
      setDatabases([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadDatabases()
  }, [loadDatabases])

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Are you sure you want to delete "${name}"? This action cannot be undone.`)) return
    setDeleting(id)
    try {
      await apiDelete(`/api/databases?id=${id}`)
      setDatabases(prev => prev.filter(db => db.id !== id))
      invalidateCache('/api/databases')
      toast.success(`Database "${name}" deleted`)
    } catch {
      toast.error('Failed to delete database')
    } finally {
      setDeleting(null)
    }
  }

  const filteredDatabases = databases.filter(db =>
    db.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    db.db_type.toLowerCase().includes(searchQuery.toLowerCase())
  )

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-8">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">My Databases</h1>
          <p className="text-muted-foreground mt-1">View and manage all your synthetic databases</p>
        </div>
        <Button asChild className="mt-4 md:mt-0 bg-gradient-to-r from-amber-600 to-red-600 hover:from-amber-700 hover:to-red-700 text-white">
          <Link href="/dashboard/studio">
            <Plus className="mr-2 h-4 w-4" />
            New Database
          </Link>
        </Button>
      </div>

      {databases.length > 0 && (
        <div className="relative mb-6">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search databases..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-amber-600" />
        </div>
      ) : databases.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Database className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">No databases yet</h3>
            <p className="text-muted-foreground mb-4">Create your first synthetic database using AI Studio</p>
            <Button asChild className="bg-gradient-to-r from-amber-600 to-red-600 hover:from-amber-700 hover:to-red-700 text-white">
              <Link href="/dashboard/studio">
                <Plus className="mr-2 h-4 w-4" />
                Create Database
              </Link>
            </Button>
          </CardContent>
        </Card>
      ) : filteredDatabases.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Search className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">No results found</h3>
            <p className="text-muted-foreground">Try adjusting your search query</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredDatabases.map((db) => (
            <Card key={db.id} className="hover:shadow-md transition-shadow group">
              <CardContent className="pt-6">
                <div className="flex items-start gap-4">
                  <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-amber-500 to-red-600 flex items-center justify-center text-white shrink-0">
                    <Database className="h-5 w-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{db.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {db.db_type} &middot; {(db.row_count || 0).toLocaleString()} rows
                    </p>
                    <div className="flex items-center gap-2 mt-2">
                      <Badge
                        variant={db.status === 'ready' ? 'default' : db.status === 'generating' ? 'secondary' : 'outline'}
                        className={
                          db.status === 'ready'
                            ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                            : db.status === 'generating'
                            ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
                            : ''
                        }
                      >
                        {db.status}
                      </Badge>
                      {db.quality_score && (
                        <span className="text-xs text-muted-foreground">
                          {Math.round(db.quality_score * 100)}% quality
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-col gap-1">
                    <Button variant="ghost" size="sm" asChild>
                      <Link href={`/dashboard/studio/${db.id}`}>
                        Open <ArrowRight className="ml-1 h-3 w-3" />
                      </Link>
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:text-destructive"
                      onClick={() => handleDelete(db.id, db.name)}
                      disabled={deleting === db.id}
                    >
                      {deleting === db.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
