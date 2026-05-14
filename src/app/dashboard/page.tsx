'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useAuth } from '@/hooks/use-auth'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Database,
  BarChart3,
  MessageSquare,
  FlaskConical,
  Plus,
  ArrowRight,
  Key,
  Loader2,
  Zap,
} from 'lucide-react'

interface DatabaseItem {
  id: string
  name: string
  db_type: string
  status: string
  row_count: number
  quality_score: number | null
  schema_json: { name: string; columns: { name: string; type: string }[] }[]
  created_at?: string
}

export default function DashboardPage() {
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

  const stats = [
    { label: 'Total Databases', value: databases.length, icon: Database, color: 'text-amber-600', bgColor: 'bg-amber-100 dark:bg-amber-900/30' },
    { label: 'Total Rows', value: databases.reduce((sum, db) => sum + (db.row_count || 0), 0).toLocaleString(), icon: BarChart3, color: 'text-emerald-600', bgColor: 'bg-emerald-100 dark:bg-emerald-900/30' },
    { label: 'Avg Quality', value: databases.length > 0 ? `${Math.round(databases.filter(db => db.quality_score).reduce((sum, db) => sum + (db.quality_score || 0), 0) / Math.max(databases.filter(db => db.quality_score).length, 1) * 100)}%` : 'N/A', icon: Zap, color: 'text-sky-600', bgColor: 'bg-sky-100 dark:bg-sky-900/30' },
    { label: 'Ready Databases', value: databases.filter(db => db.status === 'ready').length, icon: MessageSquare, color: 'text-violet-600', bgColor: 'bg-violet-100 dark:bg-violet-900/30' },
  ]

  const userName = user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'User'

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-8">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">Dashboard</h1>
          <p className="text-muted-foreground mt-1">Welcome back, {userName}! Here&apos;s an overview of your synthetic data.</p>
        </div>
        <Button asChild className="mt-4 md:mt-0 bg-gradient-to-r from-amber-600 to-red-600 hover:from-amber-700 hover:to-red-700 text-white">
          <Link href="/dashboard/studio">
            <Plus className="mr-2 h-4 w-4" />
            New Database
          </Link>
        </Button>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {stats.map((stat) => (
          <Card key={stat.label}>
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <div className={`h-12 w-12 rounded-xl ${stat.bgColor} flex items-center justify-center`}>
                  <stat.icon className={`h-6 w-6 ${stat.color}`} />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">{stat.label}</p>
                  <p className="text-2xl font-bold">{stat.value}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <Link href="/dashboard/studio" className="block">
          <Card className="hover:shadow-md transition-shadow cursor-pointer group">
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-amber-500 to-red-600 flex items-center justify-center">
                  <FlaskConical className="h-6 w-6 text-white" />
                </div>
                <div className="flex-1">
                  <p className="font-semibold">AI Studio</p>
                  <p className="text-sm text-muted-foreground">Generate data with AI</p>
                </div>
                <ArrowRight className="h-5 w-5 text-muted-foreground group-hover:text-foreground transition-colors" />
              </div>
            </CardContent>
          </Card>
        </Link>
        <Link href="/dashboard/workspaces" className="block">
          <Card className="hover:shadow-md transition-shadow cursor-pointer group">
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center">
                  <Database className="h-6 w-6 text-white" />
                </div>
                <div className="flex-1">
                  <p className="font-semibold">My Databases</p>
                  <p className="text-sm text-muted-foreground">View your databases</p>
                </div>
                <ArrowRight className="h-5 w-5 text-muted-foreground group-hover:text-foreground transition-colors" />
              </div>
            </CardContent>
          </Card>
        </Link>
        <Link href="/dashboard/api-keys" className="block">
          <Card className="hover:shadow-md transition-shadow cursor-pointer group">
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-sky-500 to-cyan-600 flex items-center justify-center">
                  <Key className="h-6 w-6 text-white" />
                </div>
                <div className="flex-1">
                  <p className="font-semibold">API Access</p>
                  <p className="text-sm text-muted-foreground">Integrate with your apps</p>
                </div>
                <ArrowRight className="h-5 w-5 text-muted-foreground group-hover:text-foreground transition-colors" />
              </div>
            </CardContent>
          </Card>
        </Link>
      </div>

      {/* Recent Databases */}
      <div>
        <h2 className="text-xl font-semibold mb-4">Recent Databases</h2>
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
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {databases.slice(0, 6).map((db) => (
              <Card key={db.id} className="hover:shadow-md transition-shadow group">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg">{db.name}</CardTitle>
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
                      {db.status === 'generating' && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
                      {db.status}
                    </Badge>
                  </div>
                  <CardDescription>
                    {db.db_type} &middot; {(db.row_count || 0).toLocaleString()} rows
                    {db.quality_score ? ` \u00B7 ${Math.round(db.quality_score * 100)}% quality` : ''}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center justify-between">
                    <div className="flex gap-1.5">
                      {Array.isArray(db.schema_json) && db.schema_json.slice(0, 3).map((table) => (
                        <Badge key={table.name} variant="outline" className="text-xs">
                          {table.name}
                        </Badge>
                      ))}
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
    </div>
  )
}
