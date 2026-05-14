'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useAuth } from '@/hooks/use-auth'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { FolderOpen, Plus, Loader2, ArrowRight } from 'lucide-react'

interface DatabaseItem {
  id: string
  name: string
  db_type: string
  status: string
  row_count: number
  quality_score: number | null
}

export default function WorkspacesPage() {
  const { user } = useAuth()
  const [databases, setDatabases] = useState<DatabaseItem[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function loadData() {
      try {
        const res = await fetch('/api/databases')
        const data = await res.json()
        setDatabases(data.databases || [])
      } catch {
        setDatabases([])
      } finally {
        setLoading(false)
      }
    }
    loadData()
  }, [])

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-8">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">My Projects</h1>
          <p className="text-muted-foreground mt-1">Manage your databases and projects</p>
        </div>
        <Button asChild className="mt-4 md:mt-0 bg-gradient-to-r from-amber-600 to-red-600 hover:from-amber-700 hover:to-red-700 text-white">
          <Link href="/dashboard/studio">
            <Plus className="mr-2 h-4 w-4" />
            New Database
          </Link>
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-amber-600" />
        </div>
      ) : databases.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <FolderOpen className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">No projects yet</h3>
            <p className="text-muted-foreground mb-4">Create your first synthetic database using AI Studio</p>
            <Button asChild className="bg-gradient-to-r from-amber-600 to-red-600 hover:from-amber-700 hover:to-red-700 text-white">
              <Link href="/dashboard/studio">
                <Plus className="mr-2 h-4 w-4" />
                Create Database
              </Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {databases.map((db) => (
            <Card key={db.id} className="hover:shadow-md transition-shadow group">
              <CardContent className="pt-6">
                <div className="flex items-center gap-4">
                  <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-amber-500 to-red-600 flex items-center justify-center text-white">
                    <FolderOpen className="h-5 w-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{db.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {db.db_type} &middot; {(db.row_count || 0).toLocaleString()} rows
                    </p>
                  </div>
                  <Button variant="ghost" size="sm" asChild>
                    <Link href={`/dashboard/studio/${db.id}`}>
                      Open <ArrowRight className="ml-1 h-3 w-3" />
                    </Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
