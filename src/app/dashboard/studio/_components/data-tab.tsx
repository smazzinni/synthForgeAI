'use client'

import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { Input } from '@/components/ui/input'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Table2,
  Layers,
  Plus,
  Trash2,
  Copy,
  Download,
  Search,
  X,
  ArrowRight,
  KeyRound,
  Link2,
  RotateCcw,
  MousePointerClick,
  FileJson,
  FileSpreadsheet,
  FileText,
  Database,
  ChevronDown,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { SchemaTable } from '../_lib/types'
import {
  getDataColumnKind,
  humanizeColumnName,
  columnPlainEnglishHint,
} from '../_lib/utils'

// ─── DataTab ───
// "Data" tab in the studio's right panel. Renders a table-selector sidebar
// (with row-count badges), a data grid with PK/FK-tinted column headers,
// inline cell editing, row multi-select, per-table search filter, "Load more"
// pagination, an at-a-glance Table Info card, and an export dropdown.
//
// Pure presentational component: all state (selectedTable, visibleRows,
// selectedRows, editingCell, dataSearchQuery, …) and business logic (cell
// edits, row deletes, exports) remain in the parent studio page. The parent
// passes the current state values, the React setters (so this component can
// drive them), plus action callbacks for everything that mutates schema/data.

// React's setState dispatch type (matches the type of `setVisibleRows` etc).
type SetState<T> = (value: T | ((prev: T) => T)) => void

export interface DataTabProps {
  // ─── Schema + data ───
  schema: SchemaTable[]
  data: Record<string, unknown[]>
  selectedTable: string

  // ─── Pre-computed view model (kept in parent to centralize derivation) ───
  currentTableData: unknown[]
  currentTableColumns: string[]
  currentTableSchema?: SchemaTable
  headerColumns: string[]
  displayedRows: unknown[]
  filteredTableData: unknown[]
  hasMoreRows: boolean

  // ─── Controlled UI state (parent owns; this component drives it) ───
  dataSearchQuery: string
  visibleRows: number
  selectedRows: Set<number>
  editingCell: { row: number; col: string } | null
  editingCellValue: string

  // ─── Setters ───
  setDataSearchQuery: SetState<string>
  setVisibleRows: SetState<number>
  setSelectedRows: SetState<Set<number>>
  setEditingCell: SetState<{ row: number; col: string } | null>
  setEditingCellValue: SetState<string>

  // ─── Mode ───
  isLiveDbMode: boolean

  // ─── Action callbacks ───
  onSelectTable: (name: string) => void
  onViewInExplorer: () => void
  onAddTableClick: () => void
  onAddColumnClick: () => void
  onAddRow: () => void
  onDeleteSelectedRows: () => void
  onCellEdit: (row: number, col: string, value: string) => void
  onCopyToClipboard: (text: string) => void
  /** Live-DB only — refresh schema from the external database. */
  onRefreshSchema?: () => void
  onExportJSON: (data: unknown, filename: string) => void
  onExportCSV: (data: Record<string, unknown>[], filename: string) => void
  onExportSQL: (schema: SchemaTable[], data: Record<string, unknown[]>, filename: string) => void
}

export function DataTab({
  schema,
  data,
  selectedTable,
  currentTableData,
  currentTableColumns,
  currentTableSchema,
  headerColumns,
  displayedRows,
  filteredTableData,
  hasMoreRows,
  dataSearchQuery,
  visibleRows,
  selectedRows,
  editingCell,
  editingCellValue,
  setDataSearchQuery,
  setVisibleRows,
  setSelectedRows,
  setEditingCell,
  setEditingCellValue,
  isLiveDbMode,
  onSelectTable,
  onViewInExplorer,
  onAddTableClick,
  onAddColumnClick,
  onAddRow,
  onDeleteSelectedRows,
  onCellEdit,
  onCopyToClipboard,
  onRefreshSchema,
  onExportJSON,
  onExportCSV,
  onExportSQL,
}: DataTabProps) {
  return (
    <div className="flex h-full">
      {/* Table selector sidebar */}
      <div className="w-44 border-r bg-muted/30 flex flex-col shrink-0">
        <div className="px-2 py-1.5 border-b flex items-center justify-between">
          <div className="flex items-center gap-1 text-muted-foreground">
            <Layers className="h-3 w-3" />
            <span className="text-[10px] font-semibold uppercase tracking-wider">Tables</span>
          </div>
          <div className="flex items-center gap-0.5">
            {isLiveDbMode && (
              <Button
                variant="ghost"
                size="sm"
                className="h-4 w-4 p-0"
                onClick={onRefreshSchema}
                title="Refresh schema from live DB"
              >
                <RotateCcw className="h-2.5 w-2.5" />
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              className="h-4 w-4 p-0"
              onClick={onAddTableClick}
              title="Add Table"
            >
              <Plus className="h-2.5 w-2.5" />
            </Button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-1 space-y-0.5 max-h-96">
          {Object.entries(data).map(([tableName, rows]) => {
            const rowCount = Array.isArray(rows) ? rows.length : 0
            const isActive = selectedTable === tableName
            return (
              <button
                key={tableName}
                onClick={() => onSelectTable(tableName)}
                className={`w-full text-left px-2 py-1 rounded text-[11px] font-medium transition-colors flex items-center gap-1.5 group ${
                  isActive
                    ? 'bg-accent text-accent-foreground'
                    : 'text-muted-foreground hover:bg-accent/50 hover:text-accent-foreground'
                }`}
                title={`${tableName} — ${rowCount} row${rowCount === 1 ? '' : 's'}`}
              >
                <Table2 className={`h-2.5 w-2.5 shrink-0 ${isActive ? 'text-amber-600 dark:text-amber-400' : ''}`} />
                <span className="truncate">{tableName}</span>
                {/* Row count badge — amber-tinted so it reads as a row
                    count at a glance (matches the example "users (10)"). */}
                <Badge
                  variant="outline"
                  className={`ml-auto text-[8px] px-1 py-0 min-w-[20px] text-center h-3.5 shrink-0 transition-colors ${
                    isActive
                      ? 'border-amber-400 dark:border-amber-600 bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-300'
                      : 'border-amber-300/60 dark:border-amber-700/40 bg-amber-50 dark:bg-amber-950/20 text-amber-700 dark:text-amber-400 group-hover:bg-amber-100 dark:group-hover:bg-amber-900/40'
                  }`}
                >
                  {rowCount}
                </Badge>
              </button>
            )
          })}
        </div>
      </div>

      {/* Data grid */}
      <div className="flex-1 flex flex-col min-w-0">
        {!selectedTable ? (
          // ─── Empty state 1: no table selected ───
          <div className="flex-1 flex items-center justify-center p-4">
            <div className="text-center max-w-sm">
              <div className="mx-auto mb-3 h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                <Database className="h-5 w-5 text-primary" />
              </div>
              <p className="text-sm font-medium text-foreground">Pick a table on the left</p>
              <p className="mt-1 text-[11px] text-muted-foreground">
                Tables you generate or import will appear in the sidebar. Column headers are tinted so you can spot relationships at a glance:
              </p>
              <div className="mt-3 flex items-center justify-center gap-1.5 text-[10px]">
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded border border-primary/40 bg-primary/10 text-primary">
                  <KeyRound className="h-2.5 w-2.5" />PK
                </span>
                <span className="text-muted-foreground">primary key</span>
                <span className="mx-0.5 text-muted-foreground/50">·</span>
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded border border-sky-500/40 bg-sky-500/10 text-sky-600 dark:text-sky-400">
                  <Link2 className="h-2.5 w-2.5" />FK
                </span>
                <span className="text-muted-foreground">foreign key</span>
              </div>
            </div>
          </div>
        ) : headerColumns.length === 0 ? (
          // ─── Empty state 2: table selected but no columns yet ───
          <div className="flex-1 flex items-center justify-center p-4">
            <div className="text-center max-w-sm">
              <div className="mx-auto mb-3 h-10 w-10 rounded-full bg-muted flex items-center justify-center">
                <Table2 className="h-5 w-5 text-muted-foreground" />
              </div>
              <p className="text-sm font-medium text-foreground">No columns in this table yet</p>
              <p className="mt-1 text-[11px] text-muted-foreground mb-3">
                Add a column to start building out the schema for &ldquo;{selectedTable}&rdquo;.
              </p>
              <Button variant="outline" size="sm" className="h-7 text-[11px] gap-1" onClick={onAddColumnClick}>
                <Plus className="h-3 w-3" />Add Column
              </Button>
            </div>
          </div>
        ) : (
          // ─── Table selected with columns (may have 0 rows) ───
          <>
            <div className="px-2.5 py-1.5 border-b flex items-center justify-between shrink-0 gap-2">
              <div className="flex items-center gap-1.5 min-w-0">
                <Table2 className="h-3.5 w-3.5 text-amber-600 shrink-0" />
                <div className="flex flex-col min-w-0 leading-tight">
                  <span className="text-xs font-semibold truncate">{selectedTable}</span>
                  <Badge variant="outline" className="text-[9px] px-1 py-0 h-3.5 w-fit">
                    {currentTableData.length} row{currentTableData.length === 1 ? '' : 's'}
                  </Badge>
                </div>
              </div>
              <div className="flex items-center gap-0.5 shrink-0">
                <Button variant="ghost" size="sm" className="h-5 text-[9px] gap-0.5 px-1" onClick={onAddRow} title="Add Row">
                  <Plus className="h-2.5 w-2.5" />Row
                </Button>
                <Button variant="ghost" size="sm" className="h-5 text-[9px] gap-0.5 px-1" onClick={onAddColumnClick} title="Add Column">
                  <Plus className="h-2.5 w-2.5" />Col
                </Button>
                {selectedRows.size > 0 && (
                  <Button variant="ghost" size="sm" className="h-5 text-[9px] gap-0.5 px-1 text-destructive hover:text-destructive" onClick={onDeleteSelectedRows} title="Delete Selected Rows">
                    <Trash2 className="h-2.5 w-2.5" />Del
                  </Button>
                )}
                <Button variant="ghost" size="sm" className="h-5 w-5 p-0" onClick={() => onCopyToClipboard(JSON.stringify(currentTableData, null, 2))} title="Copy as JSON">
                  <Copy className="h-2.5 w-2.5" />
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="sm" className="h-5 w-5 p-0" title="Download table">
                      <Download className="h-2.5 w-2.5" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="text-xs">
                    <DropdownMenuItem onClick={() => onExportJSON(currentTableData, `${selectedTable}.json`)}>
                      <FileJson className="mr-2 h-3 w-3" />
                      JSON (.json)
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => onExportCSV(currentTableData as Record<string, unknown>[], `${selectedTable}.csv`)}>
                      <FileSpreadsheet className="mr-2 h-3 w-3" />
                      CSV (.csv)
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => {
                      const singleSchema = schema.find(s => s.name === selectedTable)
                      const singleData = selectedTable ? { [selectedTable]: data[selectedTable] || [] } : {}
                      onExportSQL(singleSchema ? [singleSchema] : [], singleData, `${selectedTable}.sql`)
                    }}>
                      <FileText className="mr-2 h-3 w-3" />
                      SQL Dump (.sql)
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
                <span className="hidden sm:inline-flex items-center gap-1 text-[9px] text-muted-foreground/80 border border-border rounded px-1.5 py-0.5 bg-muted/30 ml-1" title="Double-click any cell to edit it in place">
                  <MousePointerClick className="h-2.5 w-2.5" />
                  Double-click a cell to edit
                </span>
              </div>
            </div>

            {/* ─── Table Info card + row search ───
                Compact at-a-glance summary of the selected table
                (column count, row count, type breakdown) plus a
                "View in Explorer" shortcut, and a search box that
                filters rows within this table by any cell value. */}
            <div className="px-2.5 py-1.5 border-b bg-muted/20 shrink-0 flex items-center gap-2 flex-wrap">
              <Card className="px-2 py-1 shadow-none border-amber-200/60 dark:border-amber-800/40 bg-amber-50/40 dark:bg-amber-950/20">
                <CardContent className="p-0 flex items-center gap-2">
                  <Table2 className="h-3 w-3 text-amber-600 dark:text-amber-400 shrink-0" />
                  <span className="text-[11px] font-bold text-foreground truncate max-w-[120px]">{selectedTable}</span>
                  <Separator orientation="vertical" className="h-3.5 bg-amber-300/50 dark:bg-amber-700/40" />
                  <span className="text-[9px] text-muted-foreground">
                    <span className="font-semibold text-foreground">{currentTableSchema?.columns.length || headerColumns.length}</span> cols
                  </span>
                  <span className="text-[9px] text-muted-foreground">
                    <span className="font-semibold text-foreground">{currentTableData.length.toLocaleString()}</span> rows
                  </span>
                  {currentTableSchema && currentTableSchema.columns.length > 0 && (
                    <>
                      <Separator orientation="vertical" className="h-3.5 bg-amber-300/50 dark:bg-amber-700/40" />
                      <div className="flex items-center gap-0.5 flex-wrap max-w-[280px]">
                        {(() => {
                          const counts = new Map<string, number>()
                          for (const c of currentTableSchema.columns) {
                            const norm = c.type.toLowerCase().replace(/\(.*\)/g, '').trim() || c.type
                            counts.set(norm, (counts.get(norm) || 0) + 1)
                          }
                          return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([t, n]) => (
                            <Badge key={t} variant="outline" className="text-[8px] font-mono px-1 py-0 h-3 border-amber-300/60 dark:border-amber-700/40 text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30">
                              {n} {t}
                            </Badge>
                          ))
                        })()}
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>
              <Button
                variant="ghost"
                size="sm"
                className="h-5 text-[9px] gap-0.5 px-1.5 text-amber-700 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/30 ml-auto"
                onClick={onViewInExplorer}
                title="View this table in the Explorer tab"
              >
                <ArrowRight className="h-2.5 w-2.5" />
                View in Explorer
              </Button>
              <div className="relative w-40">
                <Search className="absolute left-1.5 top-1/2 -translate-y-1/2 h-2.5 w-2.5 text-muted-foreground pointer-events-none" />
                <Input
                  value={dataSearchQuery}
                  onChange={(e) => { setDataSearchQuery(e.target.value); setVisibleRows(20) }}
                  placeholder="Filter rows…"
                  className="h-5 text-[10px] pl-6 pr-5"
                />
                {dataSearchQuery && (
                  <button
                    onClick={() => setDataSearchQuery('')}
                    className="absolute right-1 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    title="Clear filter"
                  >
                    <X className="h-2.5 w-2.5" />
                  </button>
                )}
              </div>
            </div>

            <div className="flex-1 overflow-auto max-h-[500px]">
              <table className="w-full text-[11px] border-collapse">
                <thead className="sticky top-0 z-10 bg-background">
                  <tr className="border-b">
                    <th className="text-left py-1.5 px-1 font-medium text-muted-foreground bg-muted/50 border-r border-b border-border w-6">
                      <input
                        type="checkbox"
                        className="h-3 w-3"
                        checked={selectedRows.size === displayedRows.length && displayedRows.length > 0}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedRows(new Set(displayedRows.map((_, i) => i)))
                          } else {
                            setSelectedRows(new Set())
                          }
                        }}
                      />
                    </th>
                    <th className="text-left py-1.5 px-2 font-medium text-muted-foreground bg-muted/50 border-r border-b border-border w-8">#</th>
                    {headerColumns.map((col) => {
                      const kind = getDataColumnKind(col)
                      const colType = currentTableSchema?.columns.find(c => c.name === col)?.type
                      const hint = columnPlainEnglishHint(col)
                      return (
                        <th
                          key={col}
                          className={cn(
                            'text-left align-top py-1.5 px-2 font-medium whitespace-nowrap border-r last:border-r-0 min-w-[104px]',
                            kind === 'pk' && 'bg-primary/10 border-b-2 border-b-primary',
                            kind === 'fk' && 'bg-sky-500/10 dark:bg-sky-950/35 border-b-2 border-b-sky-500/55',
                            kind === 'regular' && 'bg-muted/40 border-b border-border',
                          )}
                        >
                          <div className="flex flex-col gap-0.5">
                            <div className="flex items-center gap-1">
                              {kind === 'pk' && (
                                <Badge variant="outline" className="text-[7px] px-1 py-0 h-3.5 gap-0.5 border-primary/40 bg-primary/10 text-primary shrink-0">
                                  <KeyRound className="h-2 w-2" />PK
                                </Badge>
                              )}
                              {kind === 'fk' && (
                                <Badge variant="outline" className="text-[7px] px-1 py-0 h-3.5 gap-0.5 border-sky-500/40 bg-sky-500/10 text-sky-600 dark:text-sky-400 shrink-0">
                                  <Link2 className="h-2 w-2" />FK
                                </Badge>
                              )}
                              <span className="text-[11px] font-semibold text-foreground">{humanizeColumnName(col)}</span>
                            </div>
                            <div className="flex items-center gap-1">
                              <span className="font-mono text-[9px] text-muted-foreground">{col}</span>
                              {colType && (
                                <Badge variant="outline" className="text-[7px] px-0.5 py-0 h-3 font-mono">
                                  {colType}
                                </Badge>
                              )}
                            </div>
                            {hint && (
                              <p className="text-[8px] text-muted-foreground/80 leading-tight">{hint}</p>
                            )}
                          </div>
                        </th>
                      )
                    })}
                  </tr>
                </thead>
                <tbody>
                  {displayedRows.length === 0 ? (
                    // ─── Empty state 3: table selected, columns exist, no rows ───
                    <tr>
                      <td colSpan={headerColumns.length + 2} className="py-6 text-center text-xs text-muted-foreground italic">
                        {dataSearchQuery
                          ? <>No rows match <span className="font-semibold not-italic text-foreground">&ldquo;{dataSearchQuery}&rdquo;</span>. <button onClick={() => setDataSearchQuery('')} className="text-amber-600 dark:text-amber-400 underline not-italic">Clear filter</button></>
                          : <>No rows yet. Click <span className="font-semibold not-italic text-foreground">Row</span> above to add one.</>}
                      </td>
                    </tr>
                  ) : (
                    displayedRows.map((row, i) => (
                      <tr key={i} className={cn(
                        'border-b transition-colors',
                        // Zebra striping — alternate rows get a subtle
                        // muted background so wide tables are easier to
                        // scan. Selected rows override with amber tint.
                        i % 2 === 1 ? 'bg-muted/30' : 'bg-background',
                        'hover:bg-amber-50/60 dark:hover:bg-amber-950/20',
                        selectedRows.has(i) && 'bg-amber-50 dark:bg-amber-950/30',
                      )}>
                        <td className="py-1 px-1 border-r bg-muted/20">
                          <input
                            type="checkbox"
                            className="h-3 w-3"
                            checked={selectedRows.has(i)}
                            onChange={(e) => {
                              setSelectedRows(prev => {
                                const next = new Set(prev)
                                if (e.target.checked) next.add(i)
                                else next.delete(i)
                                return next
                              })
                            }}
                          />
                        </td>
                        <td className="py-1 px-2 text-muted-foreground font-mono text-[9px] border-r bg-muted/20">
                          {i + 1}
                        </td>
                        {currentTableColumns.map((colName) => {
                          const val = (row as Record<string, unknown>)[colName]
                          const kind = getDataColumnKind(colName)
                          return (
                            <td
                              key={colName}
                              className={cn(
                                'py-1 px-2 font-mono text-[10px] whitespace-nowrap max-w-[180px] truncate border-r last:border-r-0',
                                kind === 'pk' && 'bg-primary/[0.07]',
                                kind === 'fk' && 'bg-sky-500/[0.08] dark:bg-sky-950/25',
                              )}
                              onDoubleClick={() => {
                                setEditingCell({ row: i, col: colName })
                                setEditingCellValue(val === null ? '' : String(val))
                              }}
                            >
                              {editingCell?.row === i && editingCell?.col === colName ? (
                                <input
                                  type="text"
                                  className="w-full h-5 text-[10px] font-mono px-1 border border-amber-400 rounded bg-background focus:outline-none"
                                  value={editingCellValue}
                                  autoFocus
                                  onChange={(e) => setEditingCellValue(e.target.value)}
                                  onBlur={() => onCellEdit(i, colName, editingCellValue)}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') onCellEdit(i, colName, editingCellValue)
                                    if (e.key === 'Escape') setEditingCell(null)
                                  }}
                                />
                              ) : val === null ? (
                                <span className="text-muted-foreground italic">NULL</span>
                              ) : typeof val === 'boolean' ? (
                                <Badge variant={val ? 'default' : 'secondary'} className="text-[8px] px-1 py-0">
                                  {String(val)}
                                </Badge>
                              ) : typeof val === 'number' ? (
                                <span className="text-blue-600 dark:text-blue-400">{String(val)}</span>
                              ) : (
                                String(val ?? '')
                              )}
                            </td>
                          )
                        })}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            {/* ─── Data grid footer ───
                Always-visible "Rows: X of Y" counter so the user
                knows how many rows are shown vs. the total (after
                any search filter is applied). When more rows are
                available below the visibleRows cap, also shows a
                "Load more" button on the right. */}
            <div className="px-2.5 py-1.5 border-t bg-muted/30 shrink-0 flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground min-w-0">
                <span className="shrink-0">
                  Rows: <span className="font-semibold text-foreground">{displayedRows.length.toLocaleString()}</span>
                  {' '}of{' '}
                  <span className="font-semibold text-foreground">{filteredTableData.length.toLocaleString()}</span>
                </span>
                {dataSearchQuery && currentTableData.length !== filteredTableData.length && (
                  <Badge variant="outline" className="text-[8px] px-1 py-0 h-3.5 gap-0.5 border-amber-300/60 dark:border-amber-700/40 text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 shrink-0">
                    <Search className="h-2 w-2" />
                    filtered from {currentTableData.length.toLocaleString()}
                  </Badge>
                )}
              </div>
              {hasMoreRows && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-[10px] h-6 shrink-0"
                  onClick={() => setVisibleRows(prev => prev + 20)}
                >
                  Load more ({filteredTableData.length - visibleRows} remaining)
                  <ChevronDown className="ml-1 h-2.5 w-2.5" />
                </Button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
