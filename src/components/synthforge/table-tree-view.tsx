'use client'

import React, { useState } from 'react'
import { ChevronRight, ChevronDown, FolderTree, Table2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'

export const TableTreeView = React.memo(function TableTreeView({
  tableNames,
  tableRowCounts,
  selectedTable,
  onSelectTable
}: {
  tableNames: string[]
  tableRowCounts: Record<string, number>
  selectedTable: string | null
  onSelectTable: (name: string) => void
}) {
  const [expanded, setExpanded] = useState(true)

  return (
    <div className="border rounded-lg bg-card">
      <button
        className="flex items-center gap-2 w-full p-2 hover:bg-muted/50 transition-colors text-left"
        onClick={() => setExpanded(!expanded)}
      >
        {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        <FolderTree className="h-3.5 w-3.5 text-amber-700" />
        <span className="text-xs font-semibold">Tables</span>
        <Badge variant="secondary" className="text-[10px] ml-auto">{tableNames.length}</Badge>
      </button>
      {expanded && (
        <div className="border-t">
          {tableNames.length === 0 ? (
            <p className="text-[10px] text-muted-foreground p-2 text-center">No tables yet</p>
          ) : (
            tableNames.map(name => (
              <button
                key={name}
                className={`flex items-center gap-2 w-full px-3 py-1.5 text-xs hover:bg-muted/50 transition-colors text-left ${
                  selectedTable === name ? 'bg-amber-50 text-amber-900 border-l-2 border-amber-600' : ''
                }`}
                onClick={() => onSelectTable(name)}
              >
                <Table2 className="h-3 w-3 text-amber-700 shrink-0" />
                <span className="truncate flex-1">{name}</span>
                {tableRowCounts[name] !== undefined && (
                  <Badge variant="secondary" className="text-[9px] px-1 py-0 h-3.5">{tableRowCounts[name]}</Badge>
                )}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
})
