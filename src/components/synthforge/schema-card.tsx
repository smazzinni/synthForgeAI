'use client'

import React, { useState } from 'react'
import { Table2, Key, Link2, Hash, Shield, ChevronDown, ChevronRight } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { Button } from '@/components/ui/button'

export interface SchemaCardProps {
  tableName: string
  columns: Record<string, string>
  relationships?: string[]
  rowCount?: number
  indexes?: string[]
  constraints?: Record<string, string>
}

export const SchemaCard = React.memo(function SchemaCard({ tableName, columns, relationships, rowCount, indexes, constraints }: SchemaCardProps) {
  const hasRelationships = relationships && relationships.length > 0
  const hasConstraints = constraints && Object.keys(constraints).length > 0
  const hasIndexes = indexes && indexes.length > 0

  const [showAllColumns, setShowAllColumns] = useState(false)
  const columnEntries = Object.entries(columns)
  const COLUMN_LIMIT = 10
  const visibleColumns = showAllColumns ? columnEntries : columnEntries.slice(0, COLUMN_LIMIT)
  const hasMoreColumns = columnEntries.length > COLUMN_LIMIT

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <Table2 className="h-4 w-4 text-amber-700" />
          {tableName}
          {rowCount !== undefined && (
            <Badge variant="secondary" className="text-[10px] ml-auto">{rowCount} rows</Badge>
          )}
          {columnEntries.length > COLUMN_LIMIT && (
            <Badge variant="outline" className="text-[10px]">{columnEntries.length} cols</Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ScrollArea className="max-h-64">
          <div className="space-y-3">
            {/* Columns section */}
            <div className="space-y-1">
              {visibleColumns.map(([colName, colType]) => (
                <div key={colName} className="flex items-center justify-between text-xs py-1.5 border-b last:border-0 hover:bg-muted/30 px-1 rounded">
                  <div className="flex items-center gap-2">
                    {colName.toLowerCase() === 'id' && <Key className="h-3 w-3 text-amber-600" />}
                    {colName.toLowerCase().endsWith('_id') && <Link2 className="h-3 w-3 text-sky-500" />}
                    <span className="font-mono font-medium">{colName}</span>
                  </div>
                  <Badge variant="secondary" className="text-[10px] font-mono">{colType}</Badge>
                </div>
              ))}
              {hasMoreColumns && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full text-xs text-muted-foreground hover:text-foreground h-6"
                  onClick={() => setShowAllColumns(!showAllColumns)}
                >
                  {showAllColumns ? (
                    <><ChevronRight className="h-3 w-3 mr-1" /> Show less</>
                  ) : (
                    <><ChevronDown className="h-3 w-3 mr-1" /> Show {columnEntries.length - COLUMN_LIMIT} more columns</>
                  )}
                </Button>
              )}
            </div>

            {/* Relationships section */}
            {hasRelationships && (
              <>
                <Separator />
                <div className="space-y-1">
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                    <Link2 className="h-3 w-3" /> Relationships
                  </p>
                  {relationships.map((rel, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs py-1 px-1 rounded hover:bg-sky-50/50">
                      <Link2 className="h-3 w-3 text-sky-500 shrink-0" />
                      <span className="font-mono text-sky-700">{rel}</span>
                    </div>
                  ))}
                </div>
              </>
            )}

            {/* Constraints section */}
            {hasConstraints && (
              <>
                <Separator />
                <div className="space-y-1">
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                    <Shield className="h-3 w-3" /> Constraints
                  </p>
                  {Object.entries(constraints).map(([name, definition]) => (
                    <div key={name} className="flex items-center justify-between text-xs py-1 px-1 rounded hover:bg-red-50/50">
                      <span className="font-mono font-medium text-red-700">{name}</span>
                      <Badge variant="secondary" className="text-[10px] font-mono max-w-[200px] truncate">{definition}</Badge>
                    </div>
                  ))}
                </div>
              </>
            )}

            {/* Indexes section */}
            {hasIndexes && (
              <>
                <Separator />
                <div className="space-y-1">
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                    <Hash className="h-3 w-3" /> Indexes
                  </p>
                  {indexes.map((idx, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs py-1 px-1 rounded hover:bg-amber-50/50">
                      <Hash className="h-3 w-3 text-amber-500 shrink-0" />
                      <span className="font-mono text-amber-700">{idx}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  )
})
