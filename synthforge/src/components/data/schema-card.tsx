'use client'

import React from 'react'
import { Table2, Key, Link2 } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'

interface SchemaCardProps {
  tableName: string
  columns: Record<string, string>
}

export const SchemaCard = React.memo(function SchemaCard({ tableName, columns }: SchemaCardProps) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <Table2 className="h-4 w-4 text-amber-700" />
          {tableName}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ScrollArea className="max-h-48">
          <div className="space-y-1">
            {Object.entries(columns).map(([colName, colType]) => (
              <div key={colName} className="flex items-center justify-between text-xs py-1.5 border-b last:border-0 hover:bg-muted/30 px-1 rounded">
                <div className="flex items-center gap-2">
                  {colName.toLowerCase() === 'id' && <Key className="h-3 w-3 text-amber-600" />}
                  {colName.toLowerCase().endsWith('_id') && <Link2 className="h-3 w-3 text-sky-500" />}
                  <span className="font-mono font-medium">{colName}</span>
                </div>
                <Badge variant="secondary" className="text-[10px] font-mono">{colType}</Badge>
              </div>
            ))}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  )
})
