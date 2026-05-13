'use client'

import React from 'react'
import { FileJson, FileText, Copy, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { Message } from './types'

export function QuickActions({ msg, allTables, onExportData, onCopyAllData, onSendMessage, isLoading }: {
  msg: Message
  allTables: Record<string, Record<string, unknown>[]>
  onExportData: (tables: Record<string, Record<string, unknown>[]>, format: string) => void
  onCopyAllData: (tables: Record<string, Record<string, unknown>[]>, format: string) => void
  onSendMessage: (message: string) => void
  isLoading: boolean
}) {
  if (msg.role !== 'assistant' || Object.keys(allTables).length === 0) return null

  return (
    <div className="flex flex-wrap gap-1.5 mt-3 pt-2 border-t border-border/50">
      <Button
        variant="outline"
        size="sm"
        className="h-6 text-[11px] gap-1 hover:bg-amber-50 hover:border-amber-300"
        onClick={() => onExportData(allTables, 'json')}
        aria-label="Export as JSON"
      >
        <FileJson className="h-3 w-3" /> Export JSON
      </Button>
      <Button
        variant="outline"
        size="sm"
        className="h-6 text-[11px] gap-1 hover:bg-amber-50 hover:border-amber-300"
        onClick={() => onExportData(allTables, 'csv')}
        aria-label="Export as CSV"
      >
        <FileText className="h-3 w-3" /> Export CSV
      </Button>
      <Button
        variant="outline"
        size="sm"
        className="h-6 text-[11px] gap-1 hover:bg-amber-50 hover:border-amber-300"
        onClick={() => onCopyAllData(allTables, 'json')}
        aria-label="Copy data to clipboard"
      >
        <Copy className="h-3 w-3" /> Copy
      </Button>
      <Button
        variant="outline"
        size="sm"
        className="h-6 text-[11px] gap-1 hover:bg-amber-50 hover:border-amber-300"
        onClick={() => onSendMessage('Add more rows to each table')}
        disabled={isLoading}
        aria-label="Add more data"
      >
        <Plus className="h-3 w-3" /> Add More
      </Button>
    </div>
  )
}
