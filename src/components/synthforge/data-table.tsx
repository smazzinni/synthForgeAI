'use client'

import React, { useState } from 'react'
import { Table2, Download, Copy, Code2, FileJson, FileText, Database, RotateCcw, ArrowDown } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'

export const DataTable = React.memo(function DataTable({
  tableName,
  allRows,
  schemaObj,
  onRegenerate,
  isLoading,
  onExportTable,
  onCopyTable,
  initialPageSize
}: {
  tableName: string
  allRows: Record<string, unknown>[]
  schemaObj: Record<string, { columns: Record<string, string>; relationships?: string[] }>
  onRegenerate: (name: string) => void
  isLoading: boolean
  onExportTable: (name: string, rows: Record<string, unknown>[], format: string) => void
  onCopyTable: (name: string, rows: Record<string, unknown>[]) => void
  initialPageSize?: number
}) {
  const [page, setPage] = useState(0)
  const [visibleCount, setVisibleCount] = useState(initialPageSize ?? 50)
  const pageSize = 20
  const visibleRows = allRows.slice(0, visibleCount)
  const hasMore = visibleCount < allRows.length
  const totalPages = Math.ceil(visibleRows.length / pageSize)
  const startIdx = page * pageSize
  const pageRows = visibleRows.slice(startIdx, startIdx + pageSize)
  const tableSchema = schemaObj[tableName]

  const getColumnType = (colName: string): string => {
    if (tableSchema?.columns?.[colName]) return tableSchema.columns[colName]
    if (colName === 'id') return 'PK'
    if (colName.endsWith('_id')) return 'FK'
    return ''
  }

  const columnTypeColor = (colType: string): string => {
    if (!colType) return ''
    if (colType === 'PK' || colType.includes('SERIAL') || colType.includes('PRIMARY')) return 'bg-amber-100 text-amber-800'
    if (colType === 'FK' || colType.includes('REFERENCES') || colType.includes('INTEGER')) return 'bg-sky-100 text-sky-800'
    if (colType.includes('VARCHAR') || colType.includes('TEXT')) return 'bg-emerald-100 text-emerald-800'
    if (colType.includes('DECIMAL') || colType.includes('FLOAT') || colType.includes('NUMERIC')) return 'bg-purple-100 text-purple-800'
    if (colType.includes('TIMESTAMP') || colType.includes('DATE')) return 'bg-orange-100 text-orange-800'
    if (colType.includes('BOOLEAN') || colType.includes('BOOL')) return 'bg-pink-100 text-pink-800'
    return 'bg-gray-100 text-gray-800'
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Table2 className="h-4 w-4 text-amber-700" />
            {tableName}
          </CardTitle>
          <div className="flex items-center gap-1.5">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0 hover:bg-amber-50"
                    onClick={() => onCopyTable(tableName, allRows)}
                    aria-label={`Copy ${tableName} data`}
                  >
                    <Copy className="h-3 w-3 text-muted-foreground" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Copy table data</TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="h-6 w-6 p-0 hover:bg-amber-50" aria-label={`Export ${tableName}`}>
                  <Download className="h-3 w-3 text-amber-700" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuItem onClick={() => onExportTable(tableName, allRows, 'json')}>
                  <FileJson className="h-3.5 w-3.5 mr-2" /> Export as JSON
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onExportTable(tableName, allRows, 'csv')}>
                  <FileText className="h-3.5 w-3.5 mr-2" /> Export as CSV
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => onExportTable(tableName, allRows, 'sql-insert')}>
                  <Code2 className="h-3.5 w-3.5 mr-2" /> SQL INSERT
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onExportTable(tableName, allRows, 'sql-full')}>
                  <Database className="h-3.5 w-3.5 mr-2" /> Full SQL dump
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0 hover:bg-amber-50"
                    onClick={() => onRegenerate(tableName)}
                    disabled={isLoading}
                    aria-label={`Regenerate ${tableName}`}
                  >
                    <RotateCcw className="h-3 w-3 text-amber-700" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Regenerate {tableName}</TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <Badge variant="secondary" className="text-xs">{allRows.length} rows</Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {pageRows.length > 0 ? (
          <ScrollArea className="max-h-80">
            <table className="w-full text-xs" role="table">
              <thead>
                <tr className="border-b bg-muted/30 sticky top-0">
                  {Object.keys(pageRows[0]).map(key => {
                    const colType = getColumnType(key)
                    return (
                      <th key={key} className="text-left py-1.5 px-2 whitespace-nowrap" scope="col">
                        <div className="flex items-center gap-1">
                          <span className="font-medium text-muted-foreground">{key}</span>
                          {colType && (
                            <Badge className={`text-[8px] px-1 py-0 h-3.5 font-mono ${columnTypeColor(colType)}`}>
                              {colType === 'PK' ? 'PK' : colType === 'FK' ? 'FK' : colType.split('(')[0]}
                            </Badge>
                          )}
                        </div>
                      </th>
                    )
                  })}
                </tr>
              </thead>
              <tbody>
                {pageRows.map((row, i) => (
                  <tr key={i} className="border-b last:border-0 hover:bg-amber-50/30 transition-colors">
                    {Object.entries(row).map(([key, val], j) => {
                      const colType = getColumnType(key)
                      const isPK = colType === 'PK' || key === 'id'
                      const isFK = colType === 'FK' || key.endsWith('_id')
                      return (
                        <td key={j} className={`py-1.5 px-2 whitespace-nowrap max-w-[200px] truncate ${isPK ? 'font-mono font-semibold text-amber-700' : isFK ? 'font-mono text-sky-700' : ''}`}>
                          {val === null ? <span className="text-muted-foreground italic">null</span> : String(val)}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
            {totalPages > 1 && (
              <div className="flex items-center justify-between mt-3 pt-2 border-t">
                <p className="text-xs text-muted-foreground">Page {page + 1} of {totalPages}</p>
                <div className="flex gap-1">
                  <Button variant="outline" size="sm" className="h-6 text-xs" disabled={page === 0} onClick={() => setPage(p => p - 1)} aria-label="Previous page">
                    Prev
                  </Button>
                  <Button variant="outline" size="sm" className="h-6 text-xs" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)} aria-label="Next page">
                    Next
                  </Button>
                </div>
              </div>
            )}
          </ScrollArea>
        ) : (
          <p className="text-xs text-muted-foreground">No data rows</p>
        )}
        {hasMore && (
          <div className="flex justify-center pt-2">
            <Button
              variant="outline"
              size="sm"
              className="text-xs"
              onClick={() => setVisibleCount(prev => prev + 50)}
            >
              <ArrowDown className="h-3 w-3 mr-1" />
              Load More ({allRows.length - visibleCount} remaining)
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
})
