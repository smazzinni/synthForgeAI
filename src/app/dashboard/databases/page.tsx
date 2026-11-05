'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { Separator } from '@/components/ui/separator'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Database,
  Search,
  Plus,
  Trash2,
  ArrowRight,
  Loader2,
  Table,
  TrendingUp,
  CheckCircle2,
  Download,
  LayoutGrid,
  List,
  MoreVertical,
  FileJson,
  FileText,
  FileCode,
  Sparkles,
  X,
} from 'lucide-react'
import { toast } from 'sonner'
import { downloadExport, type ExportFormat } from '../export-download'
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

type StatusFilter = 'all' | 'ready' | 'generating' | 'failed'
type TypeFilter = 'all' | 'postgresql' | 'mysql'
type SortBy = 'name-asc' | 'name-desc' | 'newest' | 'oldest' | 'most-rows' | 'highest-quality'
type ViewMode = 'grid' | 'list'

const STATUS_FILTERS: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'ready', label: 'Ready' },
  { value: 'generating', label: 'Generating' },
  { value: 'failed', label: 'Failed' },
]

const TYPE_FILTERS: { value: TypeFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'postgresql', label: 'PostgreSQL' },
  { value: 'mysql', label: 'MySQL' },
]

const SORT_OPTIONS: { value: SortBy; label: string }[] = [
  { value: 'name-asc', label: 'Name (A-Z)' },
  { value: 'name-desc', label: 'Name (Z-A)' },
  { value: 'newest', label: 'Newest First' },
  { value: 'oldest', label: 'Oldest First' },
  { value: 'most-rows', label: 'Most Rows' },
  { value: 'highest-quality', label: 'Highest Quality' },
]

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

function getTableCount(db: DatabaseItem): number {
  return Array.isArray(db.schema_json) ? db.schema_json.length : 0
}

function getTablePreview(db: DatabaseItem): string[] {
  if (!Array.isArray(db.schema_json)) return []
  return db.schema_json.slice(0, 3).map(t => t.name)
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

function getQualityBadge(quality: number | null) {
  if (quality === null || quality === undefined) return null
  const pct = Math.round(quality * 100)
  const colorClass =
    pct >= 90
      ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
      : pct >= 70
      ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
      : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
  return (
    <Badge variant="outline" className={`text-[10px] gap-1 ${colorClass} border-0`}>
      <TrendingUp className="h-3 w-3" />
      {pct}%
    </Badge>
  )
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

export default function MyDatabasesPage() {
  const [databases, setDatabases] = useState<DatabaseItem[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [deleting, setDeleting] = useState<string | null>(null)
  const [exportingId, setExportingId] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all')
  const [sortBy, setSortBy] = useState<SortBy>('newest')
  const [viewMode, setViewMode] = useState<ViewMode>('grid')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  const loadDatabases = useCallback(async () => {
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

  // While any database is still generating (e.g. a run that continues after
  // the tab was closed), refresh quietly so status and row counts update.
  const hasGenerating = databases.some(db => db.status === 'generating')
  useEffect(() => {
    if (!hasGenerating) return
    const t = setInterval(async () => {
      try {
        invalidateCache('/api/databases')
        const data = await apiGet<{ databases: DatabaseItem[] }>('/api/databases', { cacheTtl: 0, timeout: 10000 })
        setDatabases(data.databases || [])
      } catch {
        // keep the current list; the next tick retries
      }
    }, 5000)
    return () => clearInterval(t)
  }, [hasGenerating])

  useEffect(() => {
    loadDatabases()
  }, [loadDatabases])

  // ─── Derived stats ───
  const stats = useMemo(() => {
    const total = databases.length
    const totalRows = databases.reduce((sum, db) => sum + (db.row_count || 0), 0)
    const qualityScores = databases
      .map(db => db.quality_score)
      .filter((q): q is number => q !== null && q !== undefined)
    const avgQuality =
      qualityScores.length > 0
        ? qualityScores.reduce((s, q) => s + q, 0) / qualityScores.length
        : 0
    const readyCount = databases.filter(
      db => (db.status || '').toLowerCase() === 'ready' || (db.status || '').toLowerCase() === 'completed'
    ).length
    return { total, totalRows, avgQuality, readyCount }
  }, [databases])

  // ─── Filtered + sorted list ───
  const filteredDatabases = useMemo(() => {
    const q = searchQuery.toLowerCase().trim()
    let result = databases.filter(db => {
      if (q) {
        const matchesSearch =
          db.name.toLowerCase().includes(q) ||
          db.db_type.toLowerCase().includes(q)
        if (!matchesSearch) return false
      }
      if (statusFilter !== 'all') {
        const s = (db.status || '').toLowerCase()
        if (statusFilter === 'ready' && s !== 'ready' && s !== 'completed') return false
        if (statusFilter === 'generating' && s !== 'generating' && s !== 'processing' && s !== 'draft') return false
        if (statusFilter === 'failed' && s !== 'failed' && s !== 'error') return false
      }
      if (typeFilter !== 'all') {
        const t = (db.db_type || '').toLowerCase()
        if (typeFilter === 'postgresql' && t !== 'postgres' && t !== 'postgresql') return false
        if (typeFilter === 'mysql' && t !== 'mysql') return false
      }
      return true
    })

    result = [...result].sort((a, b) => {
      switch (sortBy) {
        case 'name-asc':
          return a.name.localeCompare(b.name)
        case 'name-desc':
          return b.name.localeCompare(a.name)
        case 'newest': {
          const ta = a.created_at ? new Date(a.created_at).getTime() : 0
          const tb = b.created_at ? new Date(b.created_at).getTime() : 0
          return tb - ta
        }
        case 'oldest': {
          const ta = a.created_at ? new Date(a.created_at).getTime() : 0
          const tb = b.created_at ? new Date(b.created_at).getTime() : 0
          return ta - tb
        }
        case 'most-rows':
          return (b.row_count || 0) - (a.row_count || 0)
        case 'highest-quality':
          return (b.quality_score || 0) - (a.quality_score || 0)
        default:
          return 0
      }
    })

    return result
  }, [databases, searchQuery, statusFilter, typeFilter, sortBy])

  // ─── Selection helpers ───
  const allVisibleIds = useMemo(() => filteredDatabases.map(d => d.id), [filteredDatabases])
  const allSelected = allVisibleIds.length > 0 && allVisibleIds.every(id => selectedIds.has(id))
  const someSelected = allVisibleIds.some(id => selectedIds.has(id))

  const toggleSelectAll = () => {
    if (allSelected) {
      setSelectedIds(prev => {
        const next = new Set(prev)
        allVisibleIds.forEach(id => next.delete(id))
        return next
      })
    } else {
      setSelectedIds(prev => {
        const next = new Set(prev)
        allVisibleIds.forEach(id => next.add(id))
        return next
      })
    }
  }

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const clearSelection = () => setSelectedIds(new Set())

  // ─── Delete handlers ───
  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Are you sure you want to delete "${name}"? This action cannot be undone.`)) return
    setDeleting(id)
    try {
      await apiDelete(`/api/databases?id=${id}`)
      setDatabases(prev => prev.filter(db => db.id !== id))
      setSelectedIds(prev => {
        const next = new Set(prev)
        next.delete(id)
        return next
      })
      invalidateCache('/api/databases')
      toast.success(`Database "${name}" deleted`)
    } catch {
      toast.error('Failed to delete database')
    } finally {
      setDeleting(null)
    }
  }

  const handleBulkDelete = async () => {
    const ids = Array.from(selectedIds)
    if (ids.length === 0) return
    if (!confirm(`Are you sure you want to delete ${ids.length} database(s)? This action cannot be undone.`)) return
    setDeleting('bulk')
    let successCount = 0
    let failCount = 0
    await Promise.all(
      ids.map(async id => {
        try {
          await apiDelete(`/api/databases?id=${id}`)
          successCount++
        } catch {
          failCount++
        }
      })
    )
    setDatabases(prev => prev.filter(db => !selectedIds.has(db.id)))
    invalidateCache('/api/databases')
    setSelectedIds(new Set())
    setDeleting(null)
    if (successCount > 0) toast.success(`${successCount} database(s) deleted`)
    if (failCount > 0) toast.error(`${failCount} database(s) failed to delete`)
  }

  // ─── Export handlers ───
  const handleExport = async (db: DatabaseItem, format: ExportFormat) => {
    setExportingId(db.id)
    try {
      await downloadExport({ databaseId: db.id }, format, db.name)
    } finally {
      setExportingId(null)
    }
  }

  const handleBulkExport = async (format: ExportFormat) => {
    const ids = Array.from(selectedIds)
    if (ids.length === 0) return
    setExportingId('bulk')
    let successCount = 0
    const dbsToExport = databases.filter(db => selectedIds.has(db.id))
    for (const db of dbsToExport) {
      try {
        if (await downloadExport({ databaseId: db.id }, format, db.name, { silent: true })) successCount++
        // Small delay between downloads to avoid browser blocking
        await new Promise(r => setTimeout(r, 300))
      } catch {
        // ignore individual failure
      }
    }
    setExportingId(null)
    if (successCount > 0) {
      toast.success(`Exported ${successCount} database(s) as ${format.toUpperCase()}`)
    } else {
      toast.error('Failed to export databases')
    }
  }

  // ─── Stat card config ───
  const statCards = [
    {
      label: 'Total Databases',
      value: stats.total.toLocaleString(),
      icon: Database,
      gradient: 'from-amber-500 to-red-600',
    },
    {
      label: 'Total Rows',
      value: stats.totalRows.toLocaleString(),
      icon: Table,
      gradient: 'from-orange-500 to-amber-600',
    },
    {
      label: 'Avg Quality',
      value: stats.total > 0 ? `${Math.round(stats.avgQuality * 100)}%` : '—',
      icon: TrendingUp,
      gradient: 'from-rose-500 to-orange-600',
    },
    {
      label: 'Ready Databases',
      value: stats.readyCount.toLocaleString(),
      icon: CheckCircle2,
      gradient: 'from-emerald-500 to-teal-600',
    },
  ]

  const showEmptyState = !loading && databases.length === 0
  const showNoResults = !loading && databases.length > 0 && filteredDatabases.length === 0

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-6 gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold break-words">My Databases</h1>
          <p className="text-muted-foreground mt-1 text-sm">View and manage all your synthetic databases</p>
        </div>
        <Button asChild className="bg-gradient-to-r from-amber-600 to-red-600 hover:from-amber-700 hover:to-red-700 text-white">
          <Link href="/dashboard/studio">
            <Plus className="mr-2 h-4 w-4" />
            New Database
          </Link>
        </Button>
      </div>

      {/* Stats Summary Row */}
      {!loading && databases.length > 0 && (
        <div className="grid grid-cols-1 min-[360px]:grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4 mb-6">
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
                      <p className="text-xs text-muted-foreground leading-tight">{stat.label}</p>
                      <p className="text-xl md:text-2xl font-bold tracking-tight">{stat.value}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {/* Loading state */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-amber-600" />
        </div>
      ) : showEmptyState ? (
        /* Empty state */
        <Card>
          <CardContent className="py-16 text-center">
            <div className="h-20 w-20 rounded-2xl bg-gradient-to-br from-amber-500 to-red-600 flex items-center justify-center text-white mx-auto mb-5 shadow-lg">
              <Database className="h-10 w-10" />
            </div>
            <h3 className="text-xl font-semibold mb-2">No databases yet</h3>
            <p className="text-sm text-muted-foreground mb-6 max-w-md mx-auto">
              Start by creating your first synthetic database using AI Studio. Describe what you need in plain English, and our multi-agent system will design the schema and generate realistic data for you.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
              <Button asChild className="bg-gradient-to-r from-amber-600 to-red-600 hover:from-amber-700 hover:to-red-700 text-white">
                <Link href="/dashboard/studio">
                  <Plus className="mr-2 h-4 w-4" />
                  Create Database
                </Link>
              </Button>
              <Button asChild variant="outline">
                <Link href="/dashboard">
                  <Sparkles className="mr-2 h-4 w-4" />
                  Browse Templates
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Filter toolbar */}
          <div className="flex flex-col gap-3 mb-4">
            {/* Row 1: Search + sort + view toggle */}
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search databases..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
              <div className="flex items-center gap-3 [&>button]:flex-1 sm:[&>button]:flex-none">
                <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortBy)}>
                  <SelectTrigger className="w-full sm:w-[180px]">
                    <SelectValue placeholder="Sort by" />
                  </SelectTrigger>
                  <SelectContent>
                    {SORT_OPTIONS.map(opt => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div className="flex items-center rounded-lg border bg-muted p-[3px]">
                  <Button
                    variant="ghost"
                    size="sm"
                    className={`h-8 px-2 ${viewMode === 'grid' ? 'bg-background shadow-sm' : 'text-muted-foreground'}`}
                    onClick={() => setViewMode('grid')}
                    aria-label="Grid view"
                  >
                    <LayoutGrid className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className={`h-8 px-2 ${viewMode === 'list' ? 'bg-background shadow-sm' : 'text-muted-foreground'}`}
                    onClick={() => setViewMode('list')}
                    aria-label="List view"
                  >
                    <List className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>

            {/* Row 2: Status filter + Type filter */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-muted-foreground mr-1">Status:</span>
              <div className="inline-flex h-8 items-center justify-center rounded-lg bg-muted p-[3px]">
                {STATUS_FILTERS.map(f => (
                  <button
                    key={f.value}
                    onClick={() => setStatusFilter(f.value)}
                    className={`h-7 px-3 rounded-md text-xs font-medium transition-colors ${
                      statusFilter === f.value
                        ? 'bg-background text-foreground shadow-sm'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
              <Separator orientation="vertical" className="h-6 mx-1" />
              <span className="text-xs text-muted-foreground mr-1">Type:</span>
              <div className="inline-flex h-8 items-center justify-center rounded-lg bg-muted p-[3px]">
                {TYPE_FILTERS.map(f => (
                  <button
                    key={f.value}
                    onClick={() => setTypeFilter(f.value)}
                    className={`h-7 px-3 rounded-md text-xs font-medium transition-colors ${
                      typeFilter === f.value
                        ? 'bg-background text-foreground shadow-sm'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Bulk action bar */}
          {selectedIds.size > 0 && (
            <div className="sticky top-4 z-30 mb-4 flex flex-wrap items-center gap-3 rounded-lg border border-amber-300/60 dark:border-amber-700/40 bg-amber-50 dark:bg-amber-950/30 p-3 shadow-md backdrop-blur">
              <Checkbox
                checked={allSelected}
                onCheckedChange={toggleSelectAll}
                aria-label="Select all"
              />
              <span className="text-sm font-medium">
                {selectedIds.size} selected
              </span>
              <Separator orientation="vertical" className="h-5" />
              <div className="flex flex-wrap items-center gap-2">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm" disabled={exportingId === 'bulk'}>
                      {exportingId === 'bulk' ? (
                        <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Download className="mr-2 h-3.5 w-3.5" />
                      )}
                      Export Selected
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start">
                    <DropdownMenuLabel>Export format</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => handleBulkExport('json')}>
                      <FileJson className="mr-2 h-4 w-4 text-amber-600" />
                      Export as JSON
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handleBulkExport('csv')}>
                      <FileText className="mr-2 h-4 w-4 text-emerald-600" />
                      Export as CSV
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handleBulkExport('sql')}>
                      <FileCode className="mr-2 h-4 w-4 text-rose-600" />
                      Export as SQL
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handleBulkExport('xlsx')}>
                      <FileCode className="mr-2 h-4 w-4 text-rose-600" />
                      Export as Excel
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
                <Button
                  variant="outline"
                  size="sm"
                  className="text-destructive hover:text-destructive hover:bg-destructive/10 border-destructive/30"
                  onClick={handleBulkDelete}
                  disabled={deleting === 'bulk'}
                >
                  {deleting === 'bulk' ? (
                    <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Trash2 className="mr-2 h-3.5 w-3.5" />
                  )}
                  Delete Selected
                </Button>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="ml-auto h-7 px-2"
                onClick={clearSelection}
              >
                <X className="h-3.5 w-3.5" />
                Clear
              </Button>
            </div>
          )}

          {/* No results state */}
          {showNoResults ? (
            <Card>
              <CardContent className="py-12 text-center">
                <Search className="h-12 w-12 text-muted-foreground/30 mx-auto mb-3" />
                <h3 className="text-lg font-semibold mb-1">No results found</h3>
                <p className="text-sm text-muted-foreground mb-4">Try adjusting your search or filters</p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setSearchQuery('')
                    setStatusFilter('all')
                    setTypeFilter('all')
                  }}
                >
                  Clear all filters
                </Button>
              </CardContent>
            </Card>
          ) : viewMode === 'grid' ? (
            /* Grid View */
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredDatabases.map((db) => {
                const isSelected = selectedIds.has(db.id)
                const tableCount = getTableCount(db)
                const tablePreview = getTablePreview(db)
                return (
                  <Card
                    key={db.id}
                    className={`group relative hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200 ${
                      isSelected ? 'ring-2 ring-amber-500 shadow-md' : ''
                    }`}
                  >
                    <CardContent className="pt-5 pb-4">
                      {/* Top row: checkbox + icon + name */}
                      <div className="flex items-start gap-3">
                        <div className="pt-0.5">
                          <Checkbox
                            checked={isSelected}
                            onCheckedChange={() => toggleSelect(db.id)}
                            aria-label={`Select ${db.name}`}
                          />
                        </div>
                        <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-amber-500 to-red-600 flex items-center justify-center text-white shrink-0 shadow-md">
                          <Database className="h-5 w-5" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <Link
                            href={`/dashboard/databases/${db.id}`}
                            className="font-semibold text-base truncate block hover:text-amber-700 dark:hover:text-amber-400 transition-colors"
                            title="View database details"
                          >
                            {db.name}
                          </Link>
                          <div className="flex items-center flex-wrap gap-1.5 mt-1">
                            {getDbTypeBadge(db.db_type)}
                            {getStatusBadge(db.status)}
                          </div>
                        </div>
                      </div>

                      {/* Stats row */}
                      <div className="grid grid-cols-3 gap-2 mt-4 mb-3">
                        <div className="rounded-lg bg-muted/60 px-2.5 py-2 text-center">
                          <div className="flex items-center justify-center text-amber-600 dark:text-amber-400 mb-0.5">
                            <Table className="h-3.5 w-3.5" />
                          </div>
                          <p className="text-sm font-semibold">{tableCount}</p>
                          <p className="text-[10px] text-muted-foreground">tables</p>
                        </div>
                        <div className="rounded-lg bg-muted/60 px-2.5 py-2 text-center">
                          <div className="flex items-center justify-center text-rose-600 dark:text-rose-400 mb-0.5">
                            <Database className="h-3.5 w-3.5" />
                          </div>
                          <p className="text-sm font-semibold">{(db.row_count || 0).toLocaleString()}</p>
                          <p className="text-[10px] text-muted-foreground">rows</p>
                        </div>
                        <div className="rounded-lg bg-muted/60 px-2.5 py-2 text-center">
                          <div className="flex items-center justify-center text-emerald-600 dark:text-emerald-400 mb-0.5">
                            <TrendingUp className="h-3.5 w-3.5" />
                          </div>
                          <p className="text-sm font-semibold">
                            {db.quality_score !== null && db.quality_score !== undefined
                              ? `${Math.round(db.quality_score * 100)}%`
                              : '—'}
                          </p>
                          <p className="text-[10px] text-muted-foreground">quality</p>
                        </div>
                      </div>

                      {/* Table name preview */}
                      {tablePreview.length > 0 && (
                        <div className="flex flex-wrap gap-1 mb-3">
                          {tablePreview.map(t => (
                            <span
                              key={t}
                              className="inline-flex items-center px-2 py-0.5 rounded-md bg-muted text-[10px] font-mono text-muted-foreground"
                            >
                              {t}
                            </span>
                          ))}
                          {tableCount > 3 && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-muted text-[10px] text-muted-foreground">
                              +{tableCount - 3} more
                            </span>
                          )}
                        </div>
                      )}

                      {/* Created date */}
                      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground mb-3">
                        <span>Created:</span>
                        <span className="font-medium">{formatDate(db.created_at)}</span>
                      </div>

                      <Separator className="mb-3" />

                      {/* Actions */}
                      <div className="flex items-center gap-2">
                        <Button asChild size="sm" className="flex-1 bg-gradient-to-r from-amber-600 to-red-600 hover:from-amber-700 hover:to-red-700 text-white h-8">
                          <Link href={`/dashboard/studio/${db.id}`}>
                            Open
                            <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
                          </Link>
                        </Button>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-8 px-2.5"
                              disabled={exportingId === db.id}
                            >
                              {exportingId === db.id ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <Download className="h-3.5 w-3.5" />
                              )}
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuLabel>Export</DropdownMenuLabel>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={() => handleExport(db, 'json')}>
                              <FileJson className="mr-2 h-4 w-4 text-amber-600" />
                              Export as JSON
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleExport(db, 'csv')}>
                              <FileText className="mr-2 h-4 w-4 text-emerald-600" />
                              Export as CSV
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleExport(db, 'sql')}>
                              <FileCode className="mr-2 h-4 w-4 text-rose-600" />
                              Export as SQL
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleExport(db, 'xlsx')}>
                              <FileCode className="mr-2 h-4 w-4 text-rose-600" />
                              Export as Excel
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 px-2.5 text-destructive hover:text-destructive hover:bg-destructive/10 opacity-0 group-hover:opacity-100 transition-opacity"
                          onClick={() => handleDelete(db.id, db.name)}
                          disabled={deleting === db.id}
                        >
                          {deleting === db.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Trash2 className="h-3.5 w-3.5" />
                          )}
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          ) : (
            /* List View */
            <Card>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="border-b bg-muted/40">
                      <tr className="text-left">
                        <th className="py-3 px-3 w-10">
                          <Checkbox
                            checked={allSelected}
                            onCheckedChange={toggleSelectAll}
                            aria-label="Select all"
                          />
                        </th>
                        <th className="py-3 px-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Name</th>
                        <th className="py-3 px-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide hidden md:table-cell">Type</th>
                        <th className="py-3 px-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide text-center">Tables</th>
                        <th className="py-3 px-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide text-center hidden sm:table-cell">Rows</th>
                        <th className="py-3 px-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide text-center hidden sm:table-cell">Quality</th>
                        <th className="py-3 px-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Status</th>
                        <th className="py-3 px-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide hidden lg:table-cell">Created</th>
                        <th className="py-3 px-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredDatabases.map((db) => {
                        const isSelected = selectedIds.has(db.id)
                        const tableCount = getTableCount(db)
                        return (
                          <tr
                            key={db.id}
                            className={`border-b last:border-0 hover:bg-muted/40 transition-colors ${
                              isSelected ? 'bg-amber-50/50 dark:bg-amber-950/20' : ''
                            }`}
                          >
                            <td className="py-3 px-3 align-middle">
                              <Checkbox
                                checked={isSelected}
                                onCheckedChange={() => toggleSelect(db.id)}
                                aria-label={`Select ${db.name}`}
                              />
                            </td>
                            <td className="py-3 px-3 align-middle">
                              <div className="flex items-center gap-2.5 min-w-0">
                                <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-amber-500 to-red-600 flex items-center justify-center text-white shrink-0">
                                  <Database className="h-4 w-4" />
                                </div>
                                <div className="min-w-0">
                                  <Link
                                    href={`/dashboard/databases/${db.id}`}
                                    className="font-medium text-sm truncate block hover:text-amber-700 dark:hover:text-amber-400 transition-colors"
                                    title="View database details"
                                  >
                                    {db.name}
                                  </Link>
                                  <p className="text-[11px] text-muted-foreground md:hidden">
                                    {(db.row_count || 0).toLocaleString()} rows · {tableCount} tables
                                  </p>
                                </div>
                              </div>
                            </td>
                            <td className="py-3 px-3 align-middle hidden md:table-cell">
                              {getDbTypeBadge(db.db_type)}
                            </td>
                            <td className="py-3 px-3 align-middle text-center text-sm">
                              {tableCount}
                            </td>
                            <td className="py-3 px-3 align-middle text-center text-sm hidden sm:table-cell">
                              {(db.row_count || 0).toLocaleString()}
                            </td>
                            <td className="py-3 px-3 align-middle text-center hidden sm:table-cell">
                              {getQualityBadge(db.quality_score) || <span className="text-muted-foreground text-sm">—</span>}
                            </td>
                            <td className="py-3 px-3 align-middle">
                              {getStatusBadge(db.status)}
                            </td>
                            <td className="py-3 px-3 align-middle text-sm text-muted-foreground hidden lg:table-cell">
                              {formatDate(db.created_at)}
                            </td>
                            <td className="py-3 px-3 align-middle">
                              <div className="flex items-center justify-end gap-1.5">
                                <Button asChild variant="ghost" size="sm" className="h-8 text-amber-700 dark:text-amber-400 hover:text-amber-800 dark:hover:text-amber-300 hover:bg-amber-50 dark:hover:bg-amber-950/30">
                                  <Link href={`/dashboard/studio/${db.id}`}>
                                    Open
                                    <ArrowRight className="ml-1 h-3 w-3" />
                                  </Link>
                                </Button>
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="h-8 w-8 p-0"
                                      disabled={exportingId === db.id}
                                    >
                                      {exportingId === db.id ? (
                                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                      ) : (
                                        <MoreVertical className="h-3.5 w-3.5" />
                                      )}
                                    </Button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="end" className="min-w-[180px]">
                                    <DropdownMenuLabel>Actions</DropdownMenuLabel>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem onClick={() => handleExport(db, 'json')}>
                                      <FileJson className="mr-2 h-4 w-4 text-amber-600" />
                                      Export as JSON
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => handleExport(db, 'csv')}>
                                      <FileText className="mr-2 h-4 w-4 text-emerald-600" />
                                      Export as CSV
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => handleExport(db, 'sql')}>
                                      <FileCode className="mr-2 h-4 w-4 text-rose-600" />
                                      Export as SQL
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => handleExport(db, 'xlsx')}>
                                      <FileCode className="mr-2 h-4 w-4 text-rose-600" />
                                      Export as Excel
                                    </DropdownMenuItem>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem
                                      className="text-destructive focus:text-destructive"
                                      onClick={() => handleDelete(db.id, db.name)}
                                      disabled={deleting === db.id}
                                    >
                                      <Trash2 className="mr-2 h-4 w-4" />
                                      Delete database
                                    </DropdownMenuItem>
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Result count footer */}
          {filteredDatabases.length > 0 && (
            <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground">
              <p>
                Showing <span className="font-medium text-foreground">{filteredDatabases.length}</span> of{' '}
                <span className="font-medium text-foreground">{databases.length}</span> databases
              </p>
              {selectedIds.size > 0 && (
                <p>
                  <span className="font-medium text-amber-700 dark:text-amber-400">{selectedIds.size}</span> selected
                </p>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}
