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
  Upload,
  FileText,
  FileJson,
  FileSpreadsheet,
  HardDrive,
  Server,
  ArrowUpFromLine,
  PlugZap,
  Table2,
  Info,
  ExternalLink,
  CircleDot,
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
  const [studioFocused, setStudioFocused] = useState(false)
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
      gradientBg: 'from-amber-50 to-orange-50 dark:from-amber-950/20 dark:to-orange-950/10',
      sparkline: rowsSparkline.length > 1 ? <MiniSparkline data={databases.slice(0, 7).map((_, i) => i + 1)} color="#f59e0b" /> : null,
      change: '+12%',
      changePositive: true,
      progressValue: Math.min(databases.length * 10, 100),
      progressColor: 'bg-amber-500',
    },
    {
      label: 'Total Rows',
      value: totalRows.toLocaleString(),
      icon: BarChart3,
      color: 'text-emerald-600',
      bgColor: 'bg-emerald-100 dark:bg-emerald-900/30',
      gradientBg: 'from-emerald-50 to-teal-50 dark:from-emerald-950/20 dark:to-teal-950/10',
      sparkline: rowsSparkline.length > 1 ? <MiniSparkline data={rowsSparkline} color="#10b981" /> : null,
      change: '+8%',
      changePositive: true,
      progressValue: Math.min(Math.round(totalRows / 10), 100),
      progressColor: 'bg-emerald-500',
    },
    {
      label: 'Avg Quality',
      value: databases.length > 0 ? `${avgQuality}%` : 'N/A',
      icon: TrendingUp,
      color: 'text-sky-600',
      bgColor: 'bg-sky-100 dark:bg-sky-900/30',
      gradientBg: 'from-sky-50 to-cyan-50 dark:from-sky-950/20 dark:to-cyan-950/10',
      sparkline: qualitySparkline.length > 1 ? <MiniSparkline data={qualitySparkline} color="#0ea5e9" /> : null,
      change: '+5%',
      changePositive: true,
      progressValue: avgQuality,
      progressColor: 'bg-sky-500',
    },
    {
      label: 'Ready Databases',
      value: readyCount,
      icon: Activity,
      color: 'text-violet-600',
      bgColor: 'bg-violet-100 dark:bg-violet-900/30',
      gradientBg: 'from-violet-50 to-purple-50 dark:from-violet-950/20 dark:to-purple-950/10',
      sparkline: null,
      change: databases.length > 0 ? '-3%' : '0%',
      changePositive: databases.length > 0 ? false : true,
      progressValue: databases.length > 0 ? Math.round((readyCount / databases.length) * 100) : 0,
      progressColor: 'bg-violet-500',
    },
  ]

  const userName = user?.name || user?.email?.split('@')[0] || 'User'

  // Upload & Import state
  const [uploadDragOver, setUploadDragOver] = useState(false)
  const [uploadPreview, setUploadPreview] = useState<{
    fileName: string
    fileType: string
    schemaInfo: string
    content?: string
  } | null>(null)

  const handleFileUpload = async (file: File) => {
    const ext = file.name.split('.').pop()?.toLowerCase() || ''
    const supportedExts = ['sql', 'csv', 'xlsx', 'xls', 'json', 'xml', 'parquet', 'sqlite', 'db', 'dump', 'sql.gz', 'bson']
    if (!supportedExts.some(se => ext.endsWith(se))) {
      toast.error('Unsupported file format')
      return
    }
    const typeMap: Record<string, string> = {
      sql: 'SQL Schema', csv: 'CSV Data', xlsx: 'Excel Spreadsheet', xls: 'Excel Spreadsheet',
      json: 'JSON Data', xml: 'XML Data', parquet: 'Parquet Data', sqlite: 'SQLite Database',
      db: 'Database File', dump: 'SQL Dump', bson: 'MongoDB Export',
    }

    // Read file content for text-based formats (up to 100KB)
    const textExts = ['sql', 'csv', 'json', 'xml', 'dump']
    let content: string | undefined
    if (textExts.includes(ext) && file.size < 100 * 1024) {
      try {
        content = await file.text()
      } catch {
        // Binary or unreadable — skip content, just pass filename
      }
    }

    setUploadPreview({
      fileName: file.name,
      fileType: typeMap[ext] || 'Unknown',
      schemaInfo: `Detected ${typeMap[ext] || 'data'} file (${(file.size / 1024).toFixed(1)} KB)`,
      content,
    })
    toast.success(`File "${file.name}" ready for import`)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setUploadDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFileUpload(file)
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) handleFileUpload(file)
  }

  const sendToStudio = () => {
    if (!uploadPreview) return
    // Store the file content in sessionStorage so the studio can access it
    // (URL query params have a ~2KB practical limit, so we use sessionStorage
    // for the actual content and just pass a flag in the URL).
    if (uploadPreview.content) {
      try {
        sessionStorage.setItem('synthforge_upload_content', uploadPreview.content)
        sessionStorage.setItem('synthforge_upload_filename', uploadPreview.fileName)
        sessionStorage.setItem('synthforge_upload_type', uploadPreview.fileType)
      } catch {
        // sessionStorage might be full — fall back to just the filename prompt
      }
    }
    const prompt = uploadPreview.content
      ? `Import and generate data from this ${uploadPreview.fileType} file "${uploadPreview.fileName}". The file content is available in sessionStorage under 'synthforge_upload_content'. Read it, analyze the schema, and generate realistic synthetic data based on it.`
      : `Import and generate data from this ${uploadPreview.fileType} file: ${uploadPreview.fileName}`
    router.push(`/dashboard/studio?q=${encodeURIComponent(prompt)}`)
  }

  // Recent activity
  const recentActivity = databases.slice(0, 5).map(db => {
    const now = new Date()
    const time = db.updated_at || db.created_at ? new Date(db.updated_at || db.created_at!) : now
    const diffMs = now.getTime() - time.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)
    const diffDays = Math.floor(diffMs / 86400000)
    let relativeTime = 'just now'
    if (diffDays > 0) relativeTime = `${diffDays}d ago`
    else if (diffHours > 0) relativeTime = `${diffHours}h ago`
    else if (diffMins > 0) relativeTime = `${diffMins}m ago`
    return {
      id: db.id,
      name: db.name,
      status: db.status,
      rows: db.row_count,
      time: db.updated_at || db.created_at,
      relativeTime,
      activityType: db.status === 'ready' ? 'created' as const : 'updated' as const,
    }
  })

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto min-h-dvh">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-8">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-amber-500 to-red-600 flex items-center justify-center shadow-md">
              <Sparkles className="h-4 w-4 text-white" />
            </div>
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Dashboard</h1>
          </div>
          <p className="text-muted-foreground mt-1 text-sm">Welcome back, <span className="font-medium text-foreground">{userName}</span> — here&apos;s your synthetic data overview.</p>
        </div>
        <div className="hidden md:flex items-center gap-2 mt-4 md:mt-0">
          <Button asChild variant="outline" size="sm" className="h-8">
            <Link href="/dashboard/databases">
              <Database className="mr-1.5 h-3.5 w-3.5" />
              My Databases
            </Link>
          </Button>
          <Button asChild size="sm" className="h-8 bg-gradient-to-r from-amber-600 to-red-600 hover:from-amber-700 hover:to-red-700 text-white">
            <Link href="/dashboard/studio">
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              New Database
            </Link>
          </Button>
        </div>
      </div>

      {/* AI Studio Quick Input */}
      <Card className={`mb-6 border-2 border-dashed transition-all duration-300 bg-gradient-to-br from-amber-50/50 to-red-50/50 dark:from-amber-950/20 dark:to-red-950/20 ${studioFocused ? 'border-amber-500 shadow-[0_0_15px_rgba(245,158,11,0.3)]' : 'border-amber-300 dark:border-amber-800'}`}>
        <CardContent className="pt-6">
          <div className="flex items-center gap-3 mb-3">
            <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-amber-500 to-red-600 flex items-center justify-center">
              <Sparkles className="h-4.5 w-4.5 text-white" />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <h2 className="font-semibold text-lg">AI Studio</h2>
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] text-muted-foreground bg-muted/60 px-1.5 py-0.5 rounded">DeepSeek v4</span>
                  {studioFocused && (
                    <span className="relative flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500" />
                    </span>
                  )}
                </div>
              </div>
              <p className="text-xs text-muted-foreground">Describe the database you need and AI will generate it</p>
            </div>
          </div>
          <form onSubmit={handleStudioSubmit}>
            {/* Gradient border wrapper */}
            <div className={`rounded-lg p-[2px] bg-gradient-to-r transition-all duration-300 ${studioFocused ? 'from-amber-500 via-red-500 to-amber-500' : 'from-amber-300 via-red-300 to-amber-300 dark:from-amber-800 dark:via-red-800 dark:to-amber-800'}`}>
              <div className="flex gap-0 rounded-md bg-background">
                <Input
                  value={studioInput}
                  onChange={(e) => setStudioInput(e.target.value)}
                  onFocus={() => setStudioFocused(true)}
                  onBlur={() => setStudioFocused(false)}
                  placeholder="e.g., Generate an e-commerce database with users, orders, and products..."
                  className="flex-1 h-14 bg-transparent border-0 focus-visible:ring-0 focus-visible:ring-offset-0 text-base"
                />
                <Button
                  type="submit"
                  disabled={!studioInput.trim()}
                  className="h-14 px-8 text-base font-semibold bg-gradient-to-r from-amber-600 to-red-600 hover:from-amber-700 hover:to-red-700 text-white rounded-l-none disabled:opacity-50"
                >
                  <Send className="h-5 w-5 mr-2" />
                  Generate
                </Button>
              </div>
            </div>
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

      {/* Connect to a Live DB feature */}
      <div className="mb-6 relative">
        {/* Animated dashed border */}
        <div className="absolute -inset-[2px] rounded-xl border-2 border-dashed border-sky-400/50 dark:border-sky-600/50 animate-[spin_20s_linear_infinite] pointer-events-none" />
        <Card className="relative bg-gradient-to-br from-sky-50/50 to-indigo-50/50 dark:from-sky-950/20 dark:to-indigo-950/20 border-sky-300 dark:border-sky-800">
          <CardContent className="pt-6">
            <div className="flex items-start gap-4">
              {/* Two connected database icons with dotted line */}
              <div className="flex items-center gap-0 shrink-0">
                <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-sky-500 to-indigo-600 flex items-center justify-center">
                  <Database className="h-4.5 w-4.5 text-white" />
                </div>
                <div className="w-6 border-t-2 border-dashed border-sky-400 dark:border-sky-600 mx-0.5" />
                <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center">
                  <PlugZap className="h-4.5 w-4.5 text-white" />
                </div>
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="font-semibold text-lg">Connect to a Live Database</h2>
                <p className="text-xs text-muted-foreground mb-3">
                  Add your Postgres or MySQL credentials, then ask the AI chat to perform CRUD operations directly on your live data (edit, delete, drop, rewrite, etc.).
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button asChild size="sm" className="bg-gradient-to-r from-sky-600 to-indigo-600 hover:from-sky-700 hover:to-indigo-700 text-white shadow-md">
                    <Link href="/dashboard/connections">
                      <PlugZap className="mr-2 h-4 w-4" />
                      Manage Connections
                    </Link>
                  </Button>
                  <Button asChild size="sm" variant="outline" className="border-sky-300 dark:border-sky-700 text-sky-700 dark:text-sky-400 hover:bg-sky-50 dark:hover:bg-sky-950/30">
                    <Link href="/dashboard/studio">
                      <MessageSquare className="mr-2 h-4 w-4" />
                      Open AI Chat
                    </Link>
                  </Button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 min-[360px]:grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4 mb-8">
        {stats.map((stat) => (
          <Card key={stat.label} className={`relative overflow-hidden hover:shadow-lg transition-all duration-300 group bg-gradient-to-br ${stat.gradientBg}`}>
            <CardContent className="pt-5 pb-5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`h-11 w-11 rounded-xl ${stat.bgColor} flex items-center justify-center group-hover:scale-110 transition-transform`}>
                    <stat.icon className={`h-5 w-5 ${stat.color}`} />
                  </div>
                  <div>
                    <p className="text-[11px] text-muted-foreground uppercase tracking-wide font-medium">{stat.label}</p>
                    <p className="text-4xl font-bold tabular-nums">{stat.value}</p>
                  </div>
                </div>
                {stat.sparkline && (
                  <div className="ml-2 opacity-70">
                    {stat.sparkline}
                  </div>
                )}
              </div>
              {/* Progress bar + change indicator */}
              <div className="mt-3 flex items-center gap-2">
                <div className="flex-1 h-1.5 bg-muted/50 rounded-full overflow-hidden">
                  <div className={`h-full rounded-full ${stat.progressColor} transition-all duration-500`} style={{ width: `${Math.min(stat.progressValue, 100)}%` }} />
                </div>
                <span className={`text-[10px] font-semibold ${stat.changePositive ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500 dark:text-red-400'}`}>
                  {stat.change}
                </span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        {/* Upload & Import */}
        <div className="lg:col-span-1">
          <h2 className="text-lg font-semibold mb-3">Upload & Import</h2>
          <div className="space-y-2">
            <Card
              className={`border-2 border-dashed transition-all duration-200 ${uploadDragOver ? 'border-amber-500 bg-amber-50/50 dark:bg-amber-950/20 scale-[1.02]' : 'border-muted-foreground/25 hover:border-amber-400'}`}
              onDragOver={(e) => { e.preventDefault(); setUploadDragOver(true) }}
              onDragLeave={() => setUploadDragOver(false)}
              onDrop={handleDrop}
            >
              <CardContent className="py-4 px-4">
                <div className="flex flex-col items-center text-center gap-2">
                  <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-amber-100 to-red-100 dark:from-amber-900/30 dark:to-red-900/30 flex items-center justify-center shrink-0">
                    <Upload className="h-5 w-5 text-amber-600" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold">Drop files here</p>
                    <p className="text-[11px] text-muted-foreground">or click to browse</p>
                  </div>
                  <label className="cursor-pointer">
                    <input
                      type="file"
                      className="hidden"
                      accept=".sql,.csv,.xlsx,.xls,.json,.xml,.parquet,.sqlite,.db,.dump,.bson"
                      onChange={handleFileSelect}
                    />
                    <span className="text-[10px] px-3 py-1.5 rounded-md bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 font-medium hover:bg-amber-200 dark:hover:bg-amber-900/50 transition-colors">
                      Browse Files
                    </span>
                  </label>
                </div>
              </CardContent>
            </Card>

            {/* File type badges */}
            <div className="flex items-center gap-1.5 px-1">
              <div className="flex flex-wrap gap-1.5">
                {[
                  { icon: FileText, label: 'SQL' },
                  { icon: FileSpreadsheet, label: 'CSV' },
                  { icon: FileSpreadsheet, label: 'Excel' },
                  { icon: FileJson, label: 'JSON' },
                  { icon: FileText, label: 'XML' },
                  { icon: HardDrive, label: 'Parquet' },
                  { icon: Database, label: 'SQLite' },
                  { icon: Server, label: 'PgSQL' },
                  { icon: Server, label: 'MySQL' },
                  { icon: Database, label: 'Mongo' },
                ].map((ft) => (
                  <span key={ft.label} className="inline-flex items-center gap-1 text-[10px] px-2 py-1 rounded-md border bg-muted/50 text-muted-foreground hover:bg-muted transition-colors">
                    <ft.icon className="h-3 w-3" />
                    {ft.label}
                  </span>
                ))}
              </div>
              <div className="relative group/tooltip" title="SQL, CSV, Excel, JSON, XML, Parquet, SQLite, PostgreSQL, MySQL, MongoDB, and more">
                <Info className="h-3.5 w-3.5 text-muted-foreground/50 hover:text-muted-foreground cursor-help" />
              </div>
            </div>

            {/* Features list */}
            <Card className="border-0 bg-muted/30">
              <CardContent className="py-2 px-3">
                <div className="space-y-1">
                  {[
                    'Auto schema detection',
                    'AI-assisted schema mapping',
                    'Relationship inference',
                    'Data validation',
                    'Import previews',
                    'Incremental imports',
                  ].map((feat) => (
                    <div key={feat} className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                      <div className="h-1 w-1 rounded-full bg-amber-500 shrink-0" />
                      {feat}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Upload preview */}
            {uploadPreview && (
              <Card className="border-amber-300 dark:border-amber-700 bg-amber-50/50 dark:bg-amber-950/20">
                <CardContent className="py-2.5 px-3">
                  <div className="flex items-center gap-2 mb-2">
                    <FileText className="h-4 w-4 text-amber-600 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold truncate">{uploadPreview.fileName}</p>
                      <p className="text-[10px] text-muted-foreground">{uploadPreview.schemaInfo}</p>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    className="w-full h-7 text-[10px] bg-gradient-to-r from-amber-600 to-red-600 hover:from-amber-700 hover:to-red-700 text-white"
                    onClick={sendToStudio}
                  >
                    <ArrowUpFromLine className="h-3 w-3 mr-1" />
                    Send to AI Studio
                  </Button>
                </CardContent>
              </Card>
            )}
          </div>
        </div>

        {/* Recent Databases */}
        <div className="lg:col-span-2">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold">Recent Databases</h2>
            {databases.length > 0 && (
              <Link href="/dashboard/databases" className="text-sm text-amber-600 hover:underline font-medium flex items-center gap-1 group">
                View All
                <ArrowRight className="h-3.5 w-3.5 group-hover:translate-x-0.5 transition-transform" />
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
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {databases.slice(0, 6).map((db) => (
                <Card key={db.id} className="group relative hover:shadow-lg transition-all duration-300 overflow-hidden">
                  {/* Hover "Open" overlay */}
                  <Link href={`/dashboard/studio/${db.id}`} className="absolute inset-0 z-10 flex items-center justify-center bg-background/80 backdrop-blur-sm opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                    <span className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-gradient-to-r from-amber-600 to-red-600 text-white font-semibold text-sm shadow-lg">
                      <ExternalLink className="h-4 w-4" />
                      Open Database
                    </span>
                  </Link>
                  {/* Gradient accent bar */}
                  <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-amber-500 to-red-600 opacity-0 group-hover:opacity-100 transition-opacity" />
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-amber-500/10 to-red-600/10 dark:from-amber-500/15 dark:to-red-600/15 flex items-center justify-center shrink-0">
                          <Database className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                        </div>
                        <div className="min-w-0">
                          <CardTitle className="text-base truncate">{db.name}</CardTitle>
                          {/* Table name preview */}
                          {Array.isArray(db.schema_json) && db.schema_json.length > 0 && (
                            <p className="text-[10px] text-muted-foreground truncate mt-0.5">
                              {db.schema_json.slice(0, 2).map(t => t.name).join(', ')}
                              {db.schema_json.length > 2 && ` +${db.schema_json.length - 2} more`}
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <Badge
                          variant={db.status === 'ready' ? 'default' : db.status === 'generating' ? 'secondary' : 'outline'}
                          className={
                            db.status === 'ready'
                              ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 text-[9px]'
                              : db.status === 'generating'
                              ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 text-[9px]'
                              : 'text-[9px]'
                          }
                        >
                          {db.status === 'generating' && <Loader2 className="mr-1 h-2.5 w-2.5 animate-spin" />}
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
                    <CardDescription className="flex items-center gap-2 text-xs">
                      <span className="font-mono">{db.db_type}</span>
                      <span className="text-muted-foreground/50">·</span>
                      <span className="tabular-nums">{(db.row_count || 0).toLocaleString()} rows</span>
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="pt-0">
                    {/* Quality score as colored bar */}
                    {db.quality_score && (
                      <div className="mb-2">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-[10px] text-muted-foreground">Quality Score</span>
                          <span className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">{Math.round(db.quality_score * 100)}%</span>
                        </div>
                        <div className="h-1.5 bg-muted/50 rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all duration-500"
                            style={{
                              width: `${Math.round(db.quality_score * 100)}%`,
                              backgroundColor: db.quality_score >= 0.8 ? '#10b981' : db.quality_score >= 0.5 ? '#f59e0b' : '#ef4444',
                            }}
                          />
                        </div>
                      </div>
                    )}
                    {/* Table pills preview */}
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex gap-1.5 flex-wrap min-w-0">
                        {Array.isArray(db.schema_json) && db.schema_json.slice(0, 3).map((table) => (
                          <Badge key={table.name} variant="outline" className="text-[10px] font-mono px-1.5 py-0">
                            <Table2 className="mr-0.5 h-2.5 w-2.5 text-muted-foreground" />
                            {table.name}
                          </Badge>
                        ))}
                        {Array.isArray(db.schema_json) && db.schema_json.length > 3 && (
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                            +{db.schema_json.length - 3}
                          </Badge>
                        )}
                      </div>
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
          <div className="flex items-center gap-2 mb-3">
            <Activity className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-lg font-semibold">Recent Activity</h2>
          </div>
          <Card>
            <CardContent className="pt-4 pb-2">
              <div className="relative">
                {/* Vertical timeline line */}
                <div className="absolute left-[15px] top-2 bottom-2 w-px bg-border" />
                <div className="space-y-0">
                  {recentActivity.map((activity) => {
                    const dotColor = activity.activityType === 'created'
                      ? 'bg-emerald-500'
                      : activity.activityType === 'updated'
                      ? 'bg-amber-500'
                      : 'bg-red-500'
                    const iconBg = activity.activityType === 'created'
                      ? 'bg-emerald-100 dark:bg-emerald-900/30'
                      : 'bg-amber-100 dark:bg-amber-900/30'
                    const iconColor = activity.activityType === 'created'
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : 'text-amber-600 dark:text-amber-400'
                    return (
                      <div key={activity.id} className="flex items-center gap-3 py-2.5 px-2 rounded-lg hover:bg-muted/40 transition-colors relative">
                        {/* Timeline dot */}
                        <div className={`h-[10px] w-[10px] rounded-full ${dotColor} ring-2 ring-background shrink-0 z-10 ml-[10px]`} />
                        <div className="flex-1 min-w-0 ml-2">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-medium truncate">{activity.name}</p>
                            <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-muted/80 text-muted-foreground font-medium shrink-0">
                              {activity.relativeTime}
                            </span>
                          </div>
                          <p className="text-[11px] text-muted-foreground tabular-nums">
                            {activity.rows.toLocaleString()} rows · {activity.status}
                            {activity.time && ` · ${new Date(activity.time).toLocaleDateString()}`}
                          </p>
                        </div>
                        <Badge
                          variant={activity.status === 'ready' ? 'default' : 'secondary'}
                          className={`text-[9px] ${
                            activity.status === 'ready'
                              ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                              : ''
                          }`}
                        >
                          {activity.status}
                        </Badge>
                      </div>
                    )
                  })}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}
