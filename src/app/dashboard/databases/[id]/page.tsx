'use client'

import { useState, useEffect, useMemo } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
} from '@/components/ui/collapsible'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  ArrowLeft,
  Table as TableIcon,
  Database,
  TrendingUp,
  Award,
  Download,
  Trash2,
  ExternalLink,
  ChevronDown,
  ChevronRight,
  Code2,
  CheckCircle2,
  Loader2,
  FileJson,
  FileText,
  FileCode,
  AlertCircle,
  Eye,
} from 'lucide-react'
import { toast } from 'sonner'
import { downloadExport, type ExportFormat } from '../../export-download'
import { apiGet, apiDelete, invalidateCache } from '@/lib/api-client'

interface SchemaColumn {
  name: string
  type: string
}
interface SchemaTable {
  name: string
  columns: SchemaColumn[]
}

interface DatabaseDetail {
  id: string
  name: string
  db_type: string
  status: string
  row_count: number
  quality_score: number | null
  schema_json?: SchemaTable[]
  data_json?: Record<string, unknown[]>
  created_at?: string
}


// ─── Helpers ────────────────────────────────────────────────────────────────

function getTypeColor(type: string): { dot: string; text: string; bg: string } {
  const t = (type || '').toLowerCase()
  if (t.includes('uuid')) {
    return { dot: 'bg-violet-500', text: 'text-violet-700 dark:text-violet-400', bg: 'bg-violet-100 dark:bg-violet-950/40' }
  }
  if (t.includes('varchar') || t.includes('text') || t.includes('char') || t.includes('string')) {
    return { dot: 'bg-amber-500', text: 'text-amber-700 dark:text-amber-400', bg: 'bg-amber-100 dark:bg-amber-950/40' }
  }
  if (t.includes('timestamp') || t.includes('date') || t.includes('time')) {
    return { dot: 'bg-emerald-500', text: 'text-emerald-700 dark:text-emerald-400', bg: 'bg-emerald-100 dark:bg-emerald-950/40' }
  }
  if (t.includes('int') || t.includes('numeric') || t.includes('decimal') || t.includes('float') || t.includes('double') || t.includes('serial')) {
    return { dot: 'bg-rose-500', text: 'text-rose-700 dark:text-rose-400', bg: 'bg-rose-100 dark:bg-rose-950/40' }
  }
  if (t.includes('bool')) {
    return { dot: 'bg-pink-500', text: 'text-pink-700 dark:text-pink-400', bg: 'bg-pink-100 dark:bg-pink-950/40' }
  }
  if (t.includes('json')) {
    return { dot: 'bg-orange-500', text: 'text-orange-700 dark:text-orange-400', bg: 'bg-orange-100 dark:bg-orange-950/40' }
  }
  if (t.includes('enum')) {
    return { dot: 'bg-teal-500', text: 'text-teal-700 dark:text-teal-400', bg: 'bg-teal-100 dark:bg-teal-950/40' }
  }
  return { dot: 'bg-zinc-400', text: 'text-zinc-700 dark:text-zinc-400', bg: 'bg-zinc-100 dark:bg-zinc-800/40' }
}

function formatDate(iso?: string): string {
  if (!iso) return '—'
  try {
    const d = new Date(iso)
    if (isNaN(d.getTime())) return '—'
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  } catch {
    return '—'
  }
}

function getDbTypeBadge(dbType: string) {
  const t = (dbType || '').toLowerCase()
  const isPg = t === 'postgres' || t === 'postgresql'
  const isMysql = t === 'mysql'
  const label = isPg ? 'PostgreSQL' : isMysql ? 'MySQL' : (dbType || 'Unknown')
  return (
    <Badge variant="outline" className="text-[10px] font-mono">
      {label}
    </Badge>
  )
}

function getStatusBadge(status: string) {
  const s = (status || '').toLowerCase()
  if (s === 'ready' || s === 'completed') {
    return (
      <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 text-[10px] uppercase tracking-wide">
        <CheckCircle2 className="h-3 w-3 mr-1" />
        Ready
      </Badge>
    )
  }
  if (s === 'generating' || s === 'processing' || s === 'draft') {
    return (
      <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 text-[10px] uppercase tracking-wide">
        <Loader2 className="h-3 w-3 mr-1 animate-spin" />
        Generating
      </Badge>
    )
  }
  if (s === 'failed' || s === 'error') {
    return (
      <Badge variant="destructive" className="text-[10px] uppercase tracking-wide">
        Failed
      </Badge>
    )
  }
  return (
    <Badge variant="outline" className="text-[10px] uppercase tracking-wide">
      {s || 'Unknown'}
    </Badge>
  )
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function CircularProgress({ value, size = 140, stroke = 12 }: { value: number; size?: number; stroke?: number }) {
  const [animatedValue, setAnimatedValue] = useState(0)
  const radius = (size - stroke) / 2
  const circumference = 2 * Math.PI * radius
  const offset = circumference - (animatedValue / 100) * circumference

  useEffect(() => {
    const t = setTimeout(() => setAnimatedValue(value), 150)
    return () => clearTimeout(t)
  }, [value])

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="transform -rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={stroke}
          className="text-muted/30"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="url(#circularGradient)"
          strokeWidth={stroke}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          className="transition-all duration-1000 ease-out"
        />
        <defs>
          <linearGradient id="circularGradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#d97706" />
            <stop offset="100%" stopColor="#dc2626" />
          </linearGradient>
        </defs>
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-3xl font-bold tracking-tight">{Math.round(animatedValue)}%</span>
        <span className="text-[10px] text-muted-foreground uppercase tracking-wider mt-0.5">Quality</span>
      </div>
    </div>
  )
}

function MetricBar({ label, value }: { label: string; value: number }) {
  const [animated, setAnimated] = useState(0)
  useEffect(() => {
    const t = setTimeout(() => setAnimated(value), 150)
    return () => clearTimeout(t)
  }, [value])

  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-sm font-medium">{label}</span>
        <span className="text-sm font-semibold text-muted-foreground">{Math.round(value)}%</span>
      </div>
      <div className="h-2 rounded-full bg-muted overflow-hidden">
        <div
          className="h-full rounded-full bg-gradient-to-r from-amber-500 to-red-500 transition-all duration-1000 ease-out"
          style={{ width: `${animated}%` }}
        />
      </div>
    </div>
  )
}

function RowDistributionBar({ name, count, max, delay }: { name: string; count: number; max: number; delay: number }) {
  const [width, setWidth] = useState(0)
  const pct = max > 0 ? (count / max) * 100 : 0
  useEffect(() => {
    const t = setTimeout(() => setWidth(pct), delay + 150)
    return () => clearTimeout(t)
  }, [pct, delay])

  return (
    <div>
      <div className="flex items-center justify-between mb-1 gap-2">
        <span className="text-xs font-mono font-medium truncate min-w-0">{name}</span>
        <span className="text-xs font-semibold text-muted-foreground shrink-0">{count.toLocaleString()}</span>
      </div>
      <div className="h-2.5 rounded-full bg-muted overflow-hidden">
        <div
          className="h-full rounded-full bg-gradient-to-r from-amber-500 to-red-500 transition-all duration-700 ease-out"
          style={{ width: `${width}%` }}
        />
      </div>
    </div>
  )
}

function SchemaTableBlock({
  table,
  expanded,
  onToggle,
}: {
  table: SchemaTable
  expanded: boolean
  onToggle: () => void
}) {
  const columns = table.columns || []
  return (
    <Collapsible open={expanded} onOpenChange={onToggle}>
      <div className="rounded-lg border bg-muted/30 overflow-hidden">
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="w-full flex items-center justify-between gap-2 p-3 hover:bg-muted/50 transition-colors text-left"
          >
            <div className="flex items-center gap-2 min-w-0">
              {expanded ? (
                <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
              ) : (
                <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
              )}
              <span className="font-mono font-bold text-sm truncate">{table.name}</span>
              <Badge variant="outline" className="text-[10px] shrink-0">{columns.length} cols</Badge>
            </div>
            <Code2 className="h-4 w-4 text-muted-foreground shrink-0" />
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="border-t bg-zinc-950 p-3 overflow-x-auto">
            <pre className="text-xs font-mono leading-relaxed">
              <span className="text-amber-400">CREATE TABLE</span>{' '}
              <span className="text-emerald-400">{table.name}</span>{' '}
              <span className="text-zinc-500">{'('}</span>
              {'\n'}
              {columns.map((col, idx) => {
                const color = getTypeColor(col.type)
                const isLast = idx === columns.length - 1
                return (
                  <span key={col.name}>
                    {'  '}
                    <span className="text-zinc-100">{col.name}</span>{' '}
                    <span className={color.text}>{col.type}</span>
                    {!isLast && <span className="text-zinc-500">,</span>}
                    {'\n'}
                  </span>
                )
              })}
              <span className="text-zinc-500">{');'}</span>
            </pre>
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  )
}

// ─── Main page ───────────────────────────────────────────────────────────────

export default function DatabaseDetailPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const id = params?.id ?? ''

  const [db, setDb] = useState<DatabaseDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [expandedTables, setExpandedTables] = useState<Set<string>>(new Set())

  useEffect(() => {
    if (!id) return
    let cancelled = false
    async function load() {
      try {
        const result = await apiGet<{ database: DatabaseDetail | null }>(
          `/api/databases?id=${id}`,
          { cacheTtl: 5000, timeout: 10000 }
        )
        if (cancelled) return
        if (!result.database) {
          setError('Database not found')
        } else {
          setDb(result.database)
        }
      } catch (err) {
        if (cancelled) return
        console.error('[DatabaseDetail] Error loading:', err)
        setError('Failed to load database')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [id])

  // ─── Derived stats ───
  const stats = useMemo(() => {
    if (!db) return { tables: 0, rows: 0, avgRows: 0, quality: 0 }
    const tables = Array.isArray(db.schema_json) ? db.schema_json.length : 0
    const rows = db.row_count || 0
    const avgRows = tables > 0 ? Math.round(rows / tables) : 0
    const quality =
      db.quality_score !== null && db.quality_score !== undefined
        ? Math.round(db.quality_score * 100)
        : 0
    return { tables, rows, avgRows, quality }
  }, [db])

  // ─── Row distribution: count per table from data_json ───
  const rowDistribution = useMemo(() => {
    if (!db || !Array.isArray(db.schema_json) || !db.data_json) return []
    return db.schema_json
      .map((t) => ({
        name: t.name,
        count: Array.isArray(db.data_json?.[t.name]) ? db.data_json[t.name].length : 0,
      }))
      .sort((a, b) => b.count - a.count)
  }, [db])

  const maxRowCount = rowDistribution.length > 0 ? Math.max(...rowDistribution.map((r) => r.count), 1) : 1

  // ─── Column type distribution ───
  const typeDistribution = useMemo(() => {
    if (!db || !Array.isArray(db.schema_json)) return []
    const counts: Record<string, number> = {}
    for (const table of db.schema_json) {
      for (const col of table.columns || []) {
        const type = (col.type || 'unknown').toLowerCase()
        // Normalize (e.g., varchar(255) → varchar)
        const normalized = type.replace(/\(.*\)/g, '').trim() || 'unknown'
        counts[normalized] = (counts[normalized] || 0) + 1
      }
    }
    return Object.entries(counts)
      .map(([type, count]) => ({ type, count }))
      .sort((a, b) => b.count - a.count)
  }, [db])

  // ─── Data preview: first 3 rows of first table ───
  const dataPreview = useMemo(() => {
    if (!db || !Array.isArray(db.schema_json) || !db.data_json) return null
    if (db.schema_json.length === 0) return null
    const firstTable = db.schema_json[0]
    const rows = db.data_json[firstTable.name]
    if (!Array.isArray(rows) || rows.length === 0) return null
    return {
      tableName: firstTable.name,
      columns: firstTable.columns || [],
      rows: rows.slice(0, 3),
      totalRows: rows.length,
    }
  }, [db])

  // ─── Quality metrics (mock breakdown) ───
  const qualityMetrics = useMemo(
    () => [
      { label: 'Completeness', value: 95 },
      { label: 'Referential Integrity', value: 100 },
      { label: 'Data Type Accuracy', value: 92 },
      { label: 'Uniqueness', value: 88 },
    ],
    []
  )

  const overallQuality = stats.quality > 0
    ? stats.quality
    : Math.round(qualityMetrics.reduce((s, m) => s + m.value, 0) / qualityMetrics.length)

  // ─── Handlers ───
  const toggleTable = (name: string) => {
    setExpandedTables((prev) => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })
  }

  const handleDelete = async () => {
    if (!db) return
    if (!confirm(`Are you sure you want to delete "${db.name}"? This action cannot be undone.`)) return
    setDeleting(true)
    try {
      await apiDelete(`/api/databases?id=${db.id}`)
      invalidateCache('/api/databases')
      toast.success(`Database "${db.name}" deleted`)
      router.push('/dashboard/databases')
    } catch {
      toast.error('Failed to delete database')
      setDeleting(false)
    }
  }

  const handleExport = async (format: ExportFormat) => {
    if (!db) return
    setExporting(true)
    try {
      await downloadExport({ databaseId: db.id }, format, db.name)
    } finally {
      setExporting(false)
    }
  }

  // ─── Loading state ───
  if (loading) {
    return (
      <div className="p-4 md:p-8 max-w-7xl mx-auto">
        <div className="flex items-center justify-center py-24">
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-amber-600" />
            <p className="text-sm text-muted-foreground">Loading database...</p>
          </div>
        </div>
      </div>
    )
  }

  // ─── Error state ───
  if (error || !db) {
    return (
      <div className="p-4 md:p-8 max-w-7xl mx-auto">
        <Card>
          <CardContent className="py-16 text-center">
            <div className="h-16 w-16 rounded-2xl bg-rose-100 dark:bg-rose-950/40 flex items-center justify-center text-rose-600 dark:text-rose-400 mx-auto mb-4">
              <AlertCircle className="h-8 w-8" />
            </div>
            <h3 className="text-xl font-semibold mb-2">{error || 'Database not found'}</h3>
            <p className="text-sm text-muted-foreground mb-6 max-w-md mx-auto">
              The database you&apos;re looking for may have been deleted or you don&apos;t have access to it.
            </p>
            <Button asChild className="bg-gradient-to-r from-amber-600 to-red-600 hover:from-amber-700 hover:to-red-700 text-white">
              <Link href="/dashboard/databases">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to Databases
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  const hasSchema = Array.isArray(db.schema_json) && db.schema_json.length > 0

  const statCards = [
    {
      label: 'Total Tables',
      value: stats.tables.toLocaleString(),
      icon: TableIcon,
      gradient: 'from-amber-500 to-orange-600',
    },
    {
      label: 'Total Rows',
      value: stats.rows.toLocaleString(),
      icon: Database,
      gradient: 'from-red-500 to-rose-600',
    },
    {
      label: 'Avg Rows / Table',
      value: stats.avgRows.toLocaleString(),
      icon: TrendingUp,
      gradient: 'from-emerald-500 to-teal-600',
    },
    {
      label: 'Quality Score',
      value: stats.quality > 0 ? `${stats.quality}%` : '—',
      icon: Award,
      gradient: 'from-violet-500 to-purple-600',
    },
  ]

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col gap-4 mb-6">
        <div>
          <Button asChild variant="ghost" size="sm" className="h-8 px-2 text-muted-foreground hover:text-foreground">
            <Link href="/dashboard/databases">
              <ArrowLeft className="mr-1 h-4 w-4" />
              Back to Databases
            </Link>
          </Button>
        </div>

        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
          <div className="flex items-start gap-3 min-w-0">
            <div className="h-12 w-12 md:h-14 md:w-14 rounded-2xl bg-gradient-to-br from-amber-500 to-red-600 flex items-center justify-center text-white shrink-0 shadow-lg">
              <Database className="h-6 w-6 md:h-7 md:w-7" />
            </div>
            <div className="min-w-0">
              <h1 className="text-2xl md:text-4xl font-bold tracking-tight bg-gradient-to-r from-amber-600 to-red-600 bg-clip-text text-transparent break-words">
                {db.name}
              </h1>
              <div className="flex items-center flex-wrap gap-2 mt-2">
                {getDbTypeBadge(db.db_type)}
                {getStatusBadge(db.status)}
                {db.quality_score !== null && db.quality_score !== undefined && (
                  <Badge variant="outline" className="text-[10px] gap-1 bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400 border-0">
                    <Award className="h-3 w-3" />
                    {stats.quality}%
                  </Badge>
                )}
                <span className="text-xs text-muted-foreground">
                  Created {formatDate(db.created_at)}
                </span>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2 flex-wrap">
            <Button asChild className="bg-gradient-to-r from-amber-600 to-red-600 hover:from-amber-700 hover:to-red-700 text-white">
              <Link href={`/dashboard/studio/${db.id}`}>
                <ExternalLink className="mr-2 h-4 w-4" />
                Open in Studio
              </Link>
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" disabled={exporting}>
                  {exporting ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Download className="mr-2 h-4 w-4" />
                  )}
                  Export
                  <ChevronDown className="ml-1.5 h-3.5 w-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>Export format</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => handleExport('json')}>
                  <FileJson className="mr-2 h-4 w-4 text-amber-600" />
                  Export as JSON
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleExport('csv')}>
                  <FileText className="mr-2 h-4 w-4 text-emerald-600" />
                  Export as CSV
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleExport('sql')}>
                  <FileCode className="mr-2 h-4 w-4 text-rose-600" />
                  Export as SQL
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleExport('xlsx')}>
                  <FileCode className="mr-2 h-4 w-4 text-rose-600" />
                  Export as Excel
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button
              variant="outline"
              className="text-destructive hover:text-destructive hover:bg-destructive/10 border-destructive/30"
              onClick={handleDelete}
              disabled={deleting}
            >
              {deleting ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="mr-2 h-4 w-4" />
              )}
              Delete
            </Button>
          </div>
        </div>
      </div>

      {/* Stats Cards Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4 mb-6">
        {statCards.map((stat) => {
          const Icon = stat.icon
          return (
            <Card key={stat.label} className="overflow-hidden hover:shadow-md transition-shadow">
              <CardContent className="p-4 md:p-5">
                <div className="flex items-center gap-3">
                  <div className={`h-10 w-10 md:h-11 md:w-11 rounded-xl bg-gradient-to-br ${stat.gradient} flex items-center justify-center text-white shrink-0 shadow-md`}>
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground truncate">{stat.label}</p>
                    <p className="text-xl md:text-2xl font-bold tracking-tight">{stat.value}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* Empty state — no schema yet */}
      {!hasSchema ? (
        <Card>
          <CardContent className="py-16 text-center">
            <div className="h-20 w-20 rounded-2xl bg-gradient-to-br from-amber-500 to-red-600 flex items-center justify-center text-white mx-auto mb-5 shadow-lg">
              <Database className="h-10 w-10" />
            </div>
            <h3 className="text-xl font-semibold mb-2">No data generated yet</h3>
            <p className="text-sm text-muted-foreground mb-6 max-w-md mx-auto">
              This database hasn&apos;t been generated yet. Open it in Studio to start designing your schema and generating realistic data.
            </p>
            <Button asChild className="bg-gradient-to-r from-amber-600 to-red-600 hover:from-amber-700 hover:to-red-700 text-white">
              <Link href={`/dashboard/studio/${db.id}`}>
                <ExternalLink className="mr-2 h-4 w-4" />
                Open in Studio
              </Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6">
          {/* Main column */}
          <div className="lg:col-span-2 flex flex-col gap-4 md:gap-6">
            {/* Table Overview */}
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2">
                  <TableIcon className="h-5 w-5 text-amber-600" />
                  <CardTitle className="text-lg">Tables in this Database</CardTitle>
                  <Badge variant="secondary" className="ml-auto text-xs">{db.schema_json!.length}</Badge>
                </div>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                {db.schema_json!.map((table) => {
                  const rowCount = db.data_json?.[table.name]?.length ?? 0
                  const colCount = table.columns?.length ?? 0
                  return (
                    <Card
                      key={table.name}
                      className="border-border/70 hover:border-amber-400/60 hover:shadow-md transition-all py-0"
                    >
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between gap-3 flex-wrap">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-mono font-bold text-base break-all">{table.name}</span>
                              <Badge variant="outline" className="text-[10px]">
                                {rowCount.toLocaleString()} rows
                              </Badge>
                              <Badge variant="outline" className="text-[10px]">
                                {colCount} cols
                              </Badge>
                            </div>
                            <div className="flex flex-wrap gap-1 mt-2">
                              {(table.columns || []).slice(0, 5).map((col) => {
                                const color = getTypeColor(col.type)
                                return (
                                  <span
                                    key={col.name}
                                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-mono ${color.bg} ${color.text}`}
                                  >
                                    <span className={`h-1.5 w-1.5 rounded-full ${color.dot}`} />
                                    {col.name}
                                  </span>
                                )
                              })}
                              {colCount > 5 && (
                                <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] bg-muted text-muted-foreground">
                                  +{colCount - 5} more
                                </span>
                              )}
                            </div>
                          </div>
                          <Button
                            asChild
                            size="sm"
                            variant="ghost"
                            className="h-8 text-amber-700 dark:text-amber-400 hover:text-amber-800 dark:hover:text-amber-300 hover:bg-amber-50 dark:hover:bg-amber-950/30 shrink-0"
                          >
                            <Link href={`/dashboard/studio/${db.id}?table=${encodeURIComponent(table.name)}`}>
                              <Eye className="mr-1 h-3.5 w-3.5" />
                              View Data
                            </Link>
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  )
                })}
              </CardContent>
            </Card>

            {/* Schema Preview */}
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2">
                  <Code2 className="h-5 w-5 text-amber-600" />
                  <CardTitle className="text-lg">Schema Preview</CardTitle>
                  <span className="ml-auto text-xs text-muted-foreground">Click to expand</span>
                </div>
              </CardHeader>
              <CardContent className="flex flex-col gap-2">
                {db.schema_json!.map((table) => (
                  <SchemaTableBlock
                    key={table.name}
                    table={table}
                    expanded={expandedTables.has(table.name)}
                    onToggle={() => toggleTable(table.name)}
                  />
                ))}
              </CardContent>
            </Card>

            {/* Data Preview */}
            {dataPreview && (
              <Card>
                <CardHeader className="pb-3">
                  <div className="flex items-center gap-2">
                    <Eye className="h-5 w-5 text-amber-600" />
                    <CardTitle className="text-lg">Data Preview</CardTitle>
                    <Badge variant="outline" className="ml-auto text-[10px] font-mono">
                      {dataPreview.tableName}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-xs text-muted-foreground mb-3">
                    Showing first {Math.min(3, dataPreview.rows.length)} of {dataPreview.totalRows.toLocaleString()} rows
                  </p>
                  <div className="rounded-lg border overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/60 border-b">
                        <tr>
                          {dataPreview.columns.map((col) => (
                            <th key={col.name} className="text-left py-2 px-3 font-medium text-xs whitespace-nowrap">
                              <div className="flex items-center gap-1.5">
                                <span className="text-foreground">{col.name}</span>
                                <span className="text-[10px] font-mono text-muted-foreground">{col.type}</span>
                              </div>
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {dataPreview.rows.map((row, idx) => (
                          <tr key={idx} className="border-b last:border-0 hover:bg-muted/30">
                            {dataPreview.columns.map((col) => {
                              const val = (row as Record<string, unknown>)?.[col.name]
                              let display: React.ReactNode
                              if (val === null || val === undefined) {
                                display = <span className="text-muted-foreground italic">NULL</span>
                              } else if (typeof val === 'object') {
                                const s = JSON.stringify(val)
                                display = (
                                  <span className="font-mono text-xs">
                                    {s.length > 40 ? `${s.slice(0, 40)}…` : s}
                                  </span>
                                )
                              } else {
                                const s = String(val)
                                display = s.length > 60 ? `${s.slice(0, 60)}…` : s
                              }
                              return (
                                <td
                                  key={col.name}
                                  className="py-2 px-3 whitespace-nowrap max-w-[200px] overflow-hidden text-ellipsis"
                                >
                                  {display}
                                </td>
                              )
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <Button asChild variant="outline" size="sm" className="mt-3">
                    <Link href={`/dashboard/studio/${db.id}?table=${encodeURIComponent(dataPreview.tableName)}`}>
                      <ExternalLink className="mr-2 h-3.5 w-3.5" />
                      View full data in Studio
                    </Link>
                  </Button>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Sidebar */}
          <div className="flex flex-col gap-4 md:gap-6">
            {/* Row Distribution Chart */}
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2">
                  <TrendingUp className="h-5 w-5 text-amber-600" />
                  <CardTitle className="text-lg">Row Distribution</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                {rowDistribution.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-6">
                    No row data available.
                    <br />
                    <span className="text-xs">Generate data in Studio to see distribution.</span>
                  </p>
                ) : (
                  <div className="flex flex-col gap-3 max-h-96 overflow-y-auto pr-1">
                    {rowDistribution.map((row, idx) => (
                      <RowDistributionBar
                        key={row.name}
                        name={row.name}
                        count={row.count}
                        max={maxRowCount}
                        delay={idx * 60}
                      />
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Column Type Distribution */}
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2">
                  <TableIcon className="h-5 w-5 text-amber-600" />
                  <CardTitle className="text-lg">Column Types</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                {typeDistribution.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">No columns available</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {typeDistribution.map(({ type, count }) => {
                      const color = getTypeColor(type)
                      return (
                        <span
                          key={type}
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-mono ${color.bg} ${color.text}`}
                        >
                          <span className={`h-2 w-2 rounded-full ${color.dot}`} />
                          <span className="font-semibold">{type}</span>
                          <span className="opacity-70">{count}</span>
                        </span>
                      )
                    })}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Quality Metrics */}
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2">
                  <Award className="h-5 w-5 text-amber-600" />
                  <CardTitle className="text-lg">Quality Metrics</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="flex flex-col items-center gap-4">
                <CircularProgress value={overallQuality} />
                <Separator />
                <div className="w-full flex flex-col gap-3">
                  {qualityMetrics.map((metric) => (
                    <MetricBar key={metric.label} label={metric.label} value={metric.value} />
                  ))}
                </div>
                <p className="text-[10px] text-muted-foreground text-center">
                  Breakdown metrics are simulated for preview purposes.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </div>
  )
}
