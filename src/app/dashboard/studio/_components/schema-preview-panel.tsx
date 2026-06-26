'use client'

import { useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { ChevronDown, Database, Table2, Columns } from 'lucide-react'
import type { SchemaTable } from '../_lib/types'

// ─── SchemaPreviewPanel ───
// Collapsible at-a-glance summary of the generated schema. Shows the total
// table/column/row counts (always visible in the trigger) and, when expanded,
// a column-type breakdown plus a clickable list of tables that selects the
// clicked table in the Data tab.
//
// Pure presentational component: the parent passes `schema`, `data`,
// `selectedTable`, and an `onSelectTable` callback. The collapsed/expanded
// state is local UI state.

export interface SchemaPreviewPanelProps {
  schema: SchemaTable[]
  data: Record<string, unknown[]>
  selectedTable: string
  /** Called when a table chip is clicked — the parent is responsible for
   *  switching the active tab + resetting pagination/search. */
  onSelectTable: (tableName: string) => void
}

// ─── Schema-wide stats (computed once per render) ───
// Normalizes column types (strips length like `varchar(255)` → `varchar`) so
// the breakdown reads "3 varchar" rather than "2 varchar(255), 1 varchar(100)".
function computeSchemaStats(schema: SchemaTable[], data: Record<string, unknown[]>) {
  const tableCount = schema.length
  let columnCount = 0
  let rowCount = 0
  const typeBreakdown = new Map<string, number>()
  for (const table of schema) {
    columnCount += table.columns.length
    for (const col of table.columns) {
      const normalized = col.type.toLowerCase().replace(/\(.*\)/g, '').trim() || col.type
      typeBreakdown.set(normalized, (typeBreakdown.get(normalized) || 0) + 1)
    }
  }
  for (const rows of Object.values(data)) {
    rowCount += Array.isArray(rows) ? rows.length : 0
  }
  return { tableCount, columnCount, rowCount, typeBreakdown }
}

export function SchemaPreviewPanel({
  schema,
  data,
  selectedTable,
  onSelectTable,
}: SchemaPreviewPanelProps) {
  // Collapsed/expanded state is purely local UI state (defaults open so the
  // user immediately sees table/column/row totals once data is generated).
  const [open, setOpen] = useState(true)

  const stats = computeSchemaStats(schema, data)

  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      className="border-b bg-gradient-to-r from-amber-50/60 to-red-50/40 dark:from-amber-950/20 dark:to-red-950/10 shrink-0"
    >
      <CollapsibleTrigger asChild>
        <button
          type="button"
          className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-amber-100/50 dark:hover:bg-amber-950/30 transition-colors text-left"
        >
          <div className="h-5 w-5 rounded-md bg-gradient-to-br from-amber-500 to-red-600 flex items-center justify-center shrink-0">
            <Database className="h-2.5 w-2.5 text-white" />
          </div>
          <span className="text-[11px] font-semibold text-foreground">Schema</span>
          {/* Totals summary — always visible so the user sees counts even
              when the panel is collapsed. */}
          <div className="flex items-center gap-1 ml-1">
            <Badge variant="outline" className="text-[9px] gap-0.5 h-4 px-1 border-amber-300 dark:border-amber-700 text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30">
              <Table2 className="h-2 w-2" />
              {stats.tableCount} tables
            </Badge>
            <Badge variant="outline" className="text-[9px] gap-0.5 h-4 px-1 border-amber-300 dark:border-amber-700 text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30">
              <Columns className="h-2 w-2" />
              {stats.columnCount} cols
            </Badge>
            <Badge variant="outline" className="text-[9px] gap-0.5 h-4 px-1 border-amber-300 dark:border-amber-700 text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30">
              <Database className="h-2 w-2" />
              {stats.rowCount.toLocaleString()} rows
            </Badge>
          </div>
          <ChevronDown className={`h-3 w-3 ml-auto text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="px-3 pb-2 pt-0.5">
          {/* Column-type breakdown — e.g. "3 uuid, 2 varchar, 1 timestamp" */}
          {stats.typeBreakdown.size > 0 && (
            <div className="flex items-center gap-1 flex-wrap mb-1.5">
              <span className="text-[9px] text-muted-foreground uppercase tracking-wider">Types:</span>
              {[...stats.typeBreakdown.entries()]
                .sort((a, b) => b[1] - a[1])
                .slice(0, 8)
                .map(([type, count]) => (
                  <Badge key={type} variant="secondary" className="text-[8px] font-mono px-1 py-0 h-3.5 bg-amber-100/80 dark:bg-amber-900/30 text-amber-800 dark:text-amber-300">
                    {count} {type}
                  </Badge>
                ))}
            </div>
          )}
          <Separator className="mb-1.5 bg-amber-200/50 dark:bg-amber-800/30" />
          {/* Compact scrollable list of tables — clickable to select in Data tab */}
          <div className="max-h-32 overflow-y-auto pr-1 space-y-0.5
                          [&::-webkit-scrollbar]:w-1.5
                          [&::-webkit-scrollbar-thumb]:rounded-full
                          [&::-webkit-scrollbar-thumb]:bg-amber-300/60
                          dark:[&::-webkit-scrollbar-thumb]:bg-amber-700/50">
            {schema.map((table) => {
              const rows = data[table.name]
              const rowCount = Array.isArray(rows) ? rows.length : 0
              const isActive = selectedTable === table.name
              return (
                <button
                  key={table.name}
                  type="button"
                  onClick={() => onSelectTable(table.name)}
                  className={`w-full flex items-center gap-1.5 px-1.5 py-1 rounded text-[10px] transition-colors group ${
                    isActive
                      ? 'bg-amber-100 dark:bg-amber-900/40 text-amber-900 dark:text-amber-200'
                      : 'hover:bg-amber-50 dark:hover:bg-amber-950/30 text-foreground/80'
                  }`}
                  title={`${table.name} — ${table.columns.length} columns, ${rowCount} rows`}
                >
                  <Table2 className={`h-2.5 w-2.5 shrink-0 ${isActive ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground'}`} />
                  <span className="font-mono font-medium truncate flex-1 text-left">{table.name}</span>
                  <Badge variant="outline" className="text-[8px] px-1 py-0 h-3.5 gap-0.5 border-amber-300/60 dark:border-amber-700/50 text-muted-foreground shrink-0">
                    <Columns className="h-2 w-2" />
                    {table.columns.length}
                  </Badge>
                  <Badge variant="outline" className="text-[8px] px-1 py-0 h-3.5 min-w-[20px] text-center shrink-0 border-amber-300/60 dark:border-amber-700/50 text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30">
                    {rowCount}
                  </Badge>
                </button>
              )
            })}
          </div>
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}
