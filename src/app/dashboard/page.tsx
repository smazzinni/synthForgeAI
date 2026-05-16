'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useAuth } from '@/hooks/use-auth'
import { apiGet, invalidateCache } from '@/lib/api-client'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import {
  Database,
  BarChart3,
  MessageSquare,
  FlaskConical,
  Plus,
  ArrowRight,
  Loader2,
  Zap,
  Sparkles,
  Send,
  Trash2,
  Clock,
  TrendingUp,
  Activity,
} from 'lucide-react'
import { toast } from 'sonner'
import { apiDelete } from '@/lib/api-client'

interface DatabaseItem {
  id: string
  name: string
  db_type: string
  status: string
  row_count: number
  quality_score: number | null
  schema_json: { name: string; columns: { name: string; type: string }[] }[]
  created_at?: string
  updated_at?: string
}

// Mini sparkline component
function MiniSparkline({ data, color = '#f59e0b' }: { data: number[]; color?: string }) {
  const width = 60
  const height = 24
  const max = Math.max(...data, 1)
  const min = Math.min(...data, 0)
  const range = max - min || 1

  const points = data.map((val, i) => {
    const x = (i / (data.length - 1)) * width
    const y = height - ((val - min) / range) * (height - 4) - 2
    return `${x},${y}`
  }).join(' ')

  return (
    <svg width={width} height={height} className="inline-block">
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export default function DashboardPage() {
  const router = useRouter()
  const { user } = useAuth()
  const [databases, setDatabases] = useState<DatabaseItem[]>([])
  const [loading, setLoading] = useState(true)
  const [studioInput, setStudioInput] = useState('')
  const [deleting, setDeleting] = useState<string | null>(null)

  const loadData = useCallback(async () => {
    try {
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
    loadData()
  }, [loadData])

  const handleStudioSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!studioInput.trim()) return
    router.push(`/dashboard/studio?q=${encodeURIComponent(studioInput.trim())}`)
  }

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Delete "${name}"? This cannot be undone.`)) return
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

  const totalRows = databases.reduce((sum, db) => sum + (db.row_count || 0), 0)
  const avgQuality = databases.length > 0
    ? Math.round(databases.filter(db => db.quality_score).reduce((sum, db) => sum + (db.quality_score || 0), 0) / Math.max(databases.filter(db => db.quality_score).length, 1) * 100)
    : 0
  const readyCount = databases.filter(db => db.status === 'ready').length

  // Sparkline data (simulated from db stats)
  const rowsSparkline = databases.slice(0, 7).map(db => db.row_count || 0)
  const qualitySparkline = databases.slice(0, 7).map(db => Math.round((db.quality_score || 0) * 100))

  const stats = [
    {
      label: 'Total Databases',
      value: databases.length,
      icon: Database,
      color: 'text-amber-600',
      bgColor: 'bg-amber-100 dark:bg-amber-900/30',
      sparkline: rowsSparkline.length > 1 ? <MiniSparkline data={databases.slice(0, 7).map((_, i) => i + 1)} color="#f59e0b" /> : null,
    },
    {
      label: 'Total Rows',
      value: totalRows.toLocaleString(),
      icon: BarChart3,
      color: 'text-emerald-600',
      bgColor: 'bg-emerald-100 dark:bg-emerald-900/30',
      sparkline: rowsSparkline.length > 1 ? <MiniSparkline data={rowsSparkline} color="#10b981" /> : null,
    },
    {
      label: 'Avg Quality',
      value: databases.length > 0 ? `${avgQuality}%` : 'N/A',
      icon: TrendingUp,
      color: 'text-sky-600',
      bgColor: 'bg-sky-100 dark:bg-sky-900/30',
      sparkline: qualitySparkline.length > 1 ? <MiniSparkline data={qualitySparkline} color="#0ea5e9" /> : null,
    },
    {
      label: 'Ready Databases',
      value: readyCount,
      icon: Activity,
      color: 'text-violet-600',
      bgColor: 'bg-violet-100 dark:bg-violet-900/30',
      sparkline: null,
    },
  ]

  const userName = user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'User'

  // Quick-start templates
  const templates = [
    { name: 'E-Commerce', desc: 'Users, products, orders, reviews', query: 'Generate an e-commerce database with users, products, orders, and reviews' },
    { name: 'Healthcare', desc: 'Patients, doctors, appointments', query: 'Generate a healthcare database with patients, doctors, appointments, and medical records' },
    { name: 'SaaS App', desc: 'Tenants, subscriptions, billing', query: 'Generate a SaaS multi-tenant database with organizations, users, subscriptions, and billing' },
    { name: 'Social Media', desc: 'Users, posts, comments, likes', query: 'Generate a social media database with users, posts, comments, likes, and followers' },
  ]

  // Recent activity
  const recentActivity = databases.slice(0, 5).map(db => ({
    id: db.id,
    name: db.name,
    status: db.status,
    rows: db.row_count,
    time: db.updated_at || db.created_at,
  }))

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto min-h-screen">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-6">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">Dashboard</h1>
          <p className="text-muted-foreground mt-1">Welcome back, {userName}!</p>
        </div>
      </div>

      {/* AI Studio Quick Input */}
      <Card className="mb-6 border-2 border-dashed border-amber-300 dark:border-amber-800 bg-gradient-to-br from-amber-50/50 to-red-50/50 dark:from-amber-950/20 dark:to-red-950/20">
        <CardContent className="pt-6">
          <div className="flex items-center gap-3 mb-3">
            <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-amber-500 to-red-600 flex items-center justify-center">
              <Sparkles className="h-4.5 w-4.5 text-white" />
            </div>
            <div>
              <h2 className="font-semibold text-lg">AI Studio</h2>
              <p className="text-xs text-muted-foreground">Describe the database you need and AI will generate it</p>
            </div>
          </div>
          <form onSubmit={handleStudioSubmit} className="flex gap-2">
            <Input
              value={studioInput}
              onChange={(e) => setStudioInput(e.target.value)}
              placeholder="e.g., Generate an e-commerce database with users, orders, and products..."
              className="flex-1 h-10 bg-background"
            />
            <Button
              type="submit"
              disabled={!studioInput.trim()}
              className="bg-gradient-to-r from-amber-600 to-red-600 hover:from-amber-700 hover:to-red-700 text-white h-10 px-6"
            >
              <Send className="h-4 w-4 mr-2" />
              Generate
            </Button>
          </form>
          <div className="flex flex-wrap gap-1.5 mt-3">
            {['E-commerce DB', 'Hospital management', 'Social media app', 'SaaS billing'].map((suggestion) => (
              <button
                key={suggestion}
                onClick={() => setStudioInput(suggestion)}
                className="text-[11px] px-2.5 py-1 rounded-full border bg-background hover:bg-accent transition-colors"
              >
                {suggestion}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        {stats.map((stat) => (
          <Card key={stat.label} className="hover:shadow-md transition-shadow">
            <CardContent className="pt-4 pb-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`h-10 w-10 rounded-xl ${stat.bgColor} flex items-center justify-center`}>
                    <stat.icon className={`h-5 w-5 ${stat.color}`} />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">{stat.label}</p>
                    <p className="text-xl font-bold">{stat.value}</p>
                  </div>
                </div>
                {stat.sparkline && (
                  <div className="ml-2 opacity-70">
                    {stat.sparkline}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        {/* Quick-start Templates */}
        <div className="lg:col-span-1">
          <h2 className="text-lg font-semibold mb-3">Quick-Start Templates</h2>
          <div className="space-y-2">
            {templates.map((template) => (
              <Card
                key={template.name}
                className="hover:shadow-md transition-all cursor-pointer group"
                onClick={() => router.push(`/dashboard/studio?q=${encodeURIComponent(template.query)}`)}
              >
                <CardContent className="py-3 px-4">
                  <div className="flex items-center gap-3">
                    <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-amber-100 to-red-100 dark:from-amber-900/30 dark:to-red-900/30 flex items-center justify-center shrink-0">
                      <FlaskConical className="h-4 w-4 text-amber-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold">{template.name}</p>
                      <p className="text-[11px] text-muted-foreground">{template.desc}</p>
                    </div>
                    <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors shrink-0" />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        {/* Recent Databases */}
        <div className="lg:col-span-2">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold">Recent Databases</h2>
            {databases.length > 0 && (
              <Link href="/dashboard/databases" className="text-sm text-amber-600 hover:underline">
                View all
              </Link>
            )}
          </div>
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-amber-600" />
            </div>
          ) : databases.length === 0 ? (
            <Card>
              <CardContent className="py-10 text-center">
                <Database className="h-12 w-12 text-muted-foreground/30 mx-auto mb-3" />
                <h3 className="text-lg font-semibold mb-1">No databases yet</h3>
                <p className="text-sm text-muted-foreground mb-4">Create your first synthetic database using AI Studio</p>
                <Button asChild className="bg-gradient-to-r from-amber-600 to-red-600 hover:from-amber-700 hover:to-red-700 text-white">
                  <Link href="/dashboard/studio">
                    <Plus className="mr-2 h-4 w-4" />
                    Create Database
                  </Link>
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {databases.slice(0, 6).map((db) => (
                <Card key={db.id} className="hover:shadow-md transition-shadow group">
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-base">{db.name}</CardTitle>
                      <div className="flex items-center gap-1">
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
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity text-destructive hover:text-destructive"
                          onClick={(e) => { e.preventDefault(); handleDelete(db.id, db.name) }}
                          disabled={deleting === db.id}
                        >
                          {deleting === db.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                        </Button>
                      </div>
                    </div>
                    <CardDescription>
                      {db.db_type} &middot; {(db.row_count || 0).toLocaleString()} rows
                      {db.quality_score ? ` · ${Math.round(db.quality_score * 100)}% quality` : ''}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <div className="flex items-center justify-between">
                      <div className="flex gap-1.5">
                        {Array.isArray(db.schema_json) && db.schema_json.slice(0, 3).map((table) => (
                          <Badge key={table.name} variant="outline" className="text-[10px]">
                            {table.name}
                          </Badge>
                        ))}
                        {Array.isArray(db.schema_json) && db.schema_json.length > 3 && (
                          <Badge variant="outline" className="text-[10px]">
                            +{db.schema_json.length - 3}
                          </Badge>
                        )}
                      </div>
                      <Button variant="ghost" size="sm" asChild className="text-xs">
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

      {/* Recent Activity Feed */}
      {recentActivity.length > 0 && (
        <div className="mb-6">
          <h2 className="text-lg font-semibold mb-3">Recent Activity</h2>
          <Card>
            <CardContent className="pt-4 pb-2">
              <div className="space-y-2">
                {recentActivity.map((activity) => (
                  <div key={activity.id} className="flex items-center gap-3 py-1.5">
                    <div className="h-7 w-7 rounded-lg bg-muted flex items-center justify-center shrink-0">
                      <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{activity.name}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {activity.rows} rows · {activity.status}
                        {activity.time && ` · ${new Date(activity.time).toLocaleDateString()}`}
                      </p>
                    </div>
                    <Badge variant={activity.status === 'ready' ? 'default' : 'secondary'} className="text-[9px]">
                      {activity.status}
                    </Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}
