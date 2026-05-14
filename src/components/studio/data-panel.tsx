'use client'

import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Table2, Download, Copy, FileJson, FileSpreadsheet } from 'lucide-react'
import { toast } from 'sonner'

interface DataPanelProps {
  data: Record<string, Record<string, unknown>[]> | null
}

export function DataPanel({ data }: DataPanelProps) {
  if (!data || Object.keys(data).length === 0) {
    return (
      <Card className="h-full flex items-center justify-center">
        <div className="text-center text-muted-foreground p-8">
          <Table2 className="h-12 w-12 mx-auto mb-4 opacity-50" />
          <p className="text-lg font-medium">No data generated yet</p>
          <p className="text-sm">Start a conversation to generate synthetic data.</p>
        </div>
      </Card>
    )
  }

  const tableNames = Object.keys(data)

  return (
    <Card className="h-full flex flex-col">
      {/* Toolbar */}
      <div className="flex items-center justify-between p-3 border-b">
        <div className="flex items-center gap-2">
          <Badge variant="secondary">{tableNames.length} tables</Badge>
          <span className="text-sm text-muted-foreground">
            {Object.values(data).reduce((sum, rows) => sum + rows.length, 0)} total rows
          </span>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" className="gap-1" onClick={() => {
            navigator.clipboard.writeText(JSON.stringify(data, null, 2))
            toast.success('Copied as JSON')
          }}>
            <Copy className="h-3.5 w-3.5" />
            Copy
          </Button>
          <Button variant="ghost" size="sm" className="gap-1">
            <FileJson className="h-3.5 w-3.5" />
            JSON
          </Button>
          <Button variant="ghost" size="sm" className="gap-1">
            <FileSpreadsheet className="h-3.5 w-3.5" />
            CSV
          </Button>
          <Button variant="ghost" size="sm" className="gap-1">
            <Download className="h-3.5 w-3.5" />
            Export
          </Button>
        </div>
      </div>

      {/* Tables */}
      <div className="flex-1 overflow-auto p-4">
        <Tabs defaultValue={tableNames[0]}>
          <TabsList className="mb-4 flex-wrap h-auto">
            {tableNames.map(name => (
              <TabsTrigger key={name} value={name} className="gap-1.5">
                <Table2 className="h-3.5 w-3.5" />
                {name}
                <Badge variant="secondary" className="text-xs px-1.5 py-0">
                  {data[name].length}
                </Badge>
              </TabsTrigger>
            ))}
          </TabsList>

          {tableNames.map(name => (
            <TabsContent key={name} value={name}>
              <DataTableView name={name} rows={data[name]} />
            </TabsContent>
          ))}
        </Tabs>
      </div>
    </Card>
  )
}

function DataTableView({ name, rows }: { name: string; rows: Record<string, unknown>[] }) {
  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">No rows in this table.</p>
  }

  const columns = Object.keys(rows[0])

  return (
    <div className="border rounded-lg overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-10 text-xs">#</TableHead>
            {columns.map(col => (
              <TableHead key={col} className="text-xs font-mono">{col}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row, i) => (
            <TableRow key={i}>
              <TableCell className="text-xs text-muted-foreground">{i + 1}</TableCell>
              {columns.map(col => (
                <TableCell key={col} className="text-xs">
                  {row[col] === null ? (
                    <span className="text-muted-foreground italic">null</span>
                  ) : typeof row[col] === 'object' ? (
                    <span className="text-muted-foreground">{JSON.stringify(row[col])}</span>
                  ) : (
                    String(row[col])
                  )}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
