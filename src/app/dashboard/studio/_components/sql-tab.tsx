'use client'

import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Loader2,
  Code2,
  Wand2,
  Play,
  History,
  Save,
  Plus,
  Copy,
  Download,
  Trash2,
  X,
} from 'lucide-react'
import { toast } from 'sonner'
import { exportAsCSV, exportAsJSON } from '../_lib/utils'
import type { SavedQuery } from '../_lib/types'

// ─── SqlTab ───
// "SQL" tab in the studio's right panel. Renders a SQL editor textarea with
// AI-Generate / Schema-DDL quick buttons, a toolbar (Run / Copy / Download /
// History / Saved-queries dropdowns), and an inline results table with CSV +
// JSON export buttons.
//
// Pure presentational component: all state (sqlEditor, sqlResults, sqlExecuting,
// queryHistory, savedQueries, databaseName) and business logic (executeSQL,
// generateSchemaSQL, generateAIQL, copyToClipboard, saveCurrentQuery) live in
// the parent studio page. The parent passes the current values, the React
// setters, plus action callbacks for everything that mutates state.

// React's setState dispatch type (matches the type of `setQueryHistory` etc).
type SetState<T> = (value: T | ((prev: T) => T)) => void

export interface SqlResults {
  rows: Record<string, unknown>[]
  columns: string[]
  executionTime: number
}

export interface SqlTabProps {
  // ─── Controlled SQL editor state ───
  sqlEditor: string
  setSqlEditor: SetState<string>

  // ─── Results + execution flag ───
  sqlResults: SqlResults | null
  setSqlResults: SetState<SqlResults | null>
  sqlExecuting: boolean

  // ─── Query history + saved queries (persisted to localStorage by parent) ───
  queryHistory: string[]
  setQueryHistory: SetState<string[]>
  savedQueries: SavedQuery[]
  setSavedQueries: SetState<SavedQuery[]>

  // ─── Context ───
  databaseName: string

  // ─── Action callbacks ───
  /** Kick off SQL execution (parent handles routing to live/synthetic DB). */
  onExecute: (sql: string, skipConfirm?: boolean) => void
  /** Generate CREATE TABLE SQL from the current schema. Returns the SQL text. */
  onGenerateSchemaSQL: () => string
  /** AI-assisted SQL generation prompt — fills the chat input. */
  onAIGenerate: () => void
  /** Copy arbitrary text to the clipboard (with a toast). */
  onCopy: (text: string) => void
  /** Save the current SQL editor content as a named query (prompts for name). */
  onSaveCurrentQuery: () => void
}

export function SqlTab({
  sqlEditor,
  setSqlEditor,
  sqlResults,
  setSqlResults,
  sqlExecuting,
  queryHistory,
  setQueryHistory,
  savedQueries,
  setSavedQueries,
  databaseName,
  onExecute,
  onGenerateSchemaSQL,
  onAIGenerate,
  onCopy,
  onSaveCurrentQuery,
}: SqlTabProps) {
  return (
    <div className="flex flex-col h-full">
      {/* SQL Editor */}
      <div className="flex-1 flex flex-col min-h-0">
        <div className="px-3 py-1.5 border-b flex items-center justify-between shrink-0 bg-muted/30">
          <span className="text-[10px] font-medium text-muted-foreground">SQL Editor</span>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              className="h-5 text-[9px] gap-0.5 px-1.5"
              onClick={onAIGenerate}
              title="Ask AI to generate SQL"
            >
              <Wand2 className="h-2.5 w-2.5" />
              AI Generate
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-5 text-[9px] gap-0.5 px-1.5"
              onClick={() => setSqlEditor(onGenerateSchemaSQL())}
            >
              <Code2 className="h-2.5 w-2.5" />
              Schema
            </Button>
          </div>
        </div>
        <div className="flex-1 relative">
          <textarea
            value={sqlEditor}
            onChange={(e) => setSqlEditor(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                e.preventDefault()
                onExecute(sqlEditor)
              }
            }}
            placeholder="-- Write SQL here... (Ctrl+Enter to execute)&#10;SELECT * FROM users LIMIT 10;"
            className="w-full h-full p-3 text-[12px] font-mono bg-background resize-none focus:outline-none leading-relaxed"
            spellCheck={false}
          />
        </div>
      </div>

      {/* SQL toolbar */}
      <div className="px-3 py-1.5 border-t flex items-center gap-1.5 bg-muted/30 shrink-0">
        <Button
          variant="default"
          size="sm"
          className="h-6 text-[10px] gap-1 bg-gradient-to-r from-amber-600 to-red-600 hover:from-amber-700 hover:to-red-700 text-white"
          onClick={() => onExecute(sqlEditor)}
          disabled={sqlExecuting || !sqlEditor.trim()}
        >
          {sqlExecuting ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : <Play className="h-2.5 w-2.5" />}
          Run
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="h-6 text-[10px] gap-1"
          onClick={() => onCopy(sqlEditor || onGenerateSchemaSQL())}
        >
          <Copy className="h-2.5 w-2.5" />
          Copy
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="h-6 text-[10px] gap-1"
          onClick={() => {
            const content = sqlEditor || onGenerateSchemaSQL()
            const blob = new Blob([content], { type: 'text/sql' })
            const url = URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = url
            a.download = `${databaseName || 'schema'}.sql`
            a.click()
            URL.revokeObjectURL(url)
          }}
        >
          <Download className="h-2.5 w-2.5" />
          Download
        </Button>

        <div className="flex-1" />

        {/* Query history dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="h-6 text-[10px] gap-0.5">
              <History className="h-2.5 w-2.5" />
              History ({queryHistory.length})
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-80">
            {queryHistory.length === 0 ? (
              <DropdownMenuItem disabled>No queries yet</DropdownMenuItem>
            ) : (
              <>
                {queryHistory.map((q, i) => (
                  <DropdownMenuItem key={i} onClick={() => setSqlEditor(q)}>
                    <code className="text-[10px] truncate max-w-[260px] flex-1">{q}</code>
                  </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive"
                  onClick={() => {
                    setQueryHistory([])
                    toast.success('Query history cleared')
                  }}
                >
                  <Trash2 className="h-3 w-3 mr-2" />
                  Clear History
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Saved queries */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 text-[10px] gap-0.5"
            >
              <Save className="h-2.5 w-2.5" />
              Saved ({savedQueries.length})
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-80">
            <DropdownMenuItem
              disabled={!sqlEditor.trim()}
              onClick={onSaveCurrentQuery}
            >
              <Plus className="h-3 w-3 mr-2" />
              Save Current Query
              <kbd className="ml-auto px-1.5 py-0.5 text-[9px] font-mono rounded border bg-muted text-muted-foreground">⌘⇧S</kbd>
            </DropdownMenuItem>
            {savedQueries.length > 0 && <DropdownMenuSeparator />}
            {savedQueries.length === 0 ? (
              <DropdownMenuItem disabled>No saved queries yet</DropdownMenuItem>
            ) : (
              savedQueries.map((sq, i) => (
                <div key={i} className="group flex items-center px-2 py-1.5 hover:bg-accent rounded-sm cursor-pointer" onClick={() => setSqlEditor(sq.sql)}>
                  <span className="text-[10px] font-medium mr-2 truncate max-w-[100px]">{sq.name}</span>
                  <code className="text-[9px] text-muted-foreground truncate flex-1 max-w-[140px]">{sq.sql}</code>
                  <button
                    className="ml-1 opacity-0 group-hover:opacity-100 text-destructive hover:text-destructive/80 transition-opacity shrink-0"
                    onClick={(e) => {
                      e.stopPropagation()
                      setSavedQueries(prev => prev.filter((_, idx) => idx !== i))
                      toast.success(`Deleted "${sq.name}"`)
                    }}
                    title="Delete saved query"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* SQL Results */}
      {sqlResults && (
        <div className="border-t max-h-64 overflow-auto shrink-0">
          <div className="px-3 py-1 border-b bg-muted/30 flex items-center justify-between sticky top-0 z-10">
            <span className="text-[10px] font-medium text-muted-foreground">
              Results ({sqlResults.rows.length} rows · {sqlResults.executionTime}ms)
            </span>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                className="h-5 text-[9px] gap-0.5 px-1"
                onClick={() => exportAsCSV(sqlResults.rows, 'query_results.csv')}
              >
                <Download className="h-2.5 w-2.5" />
                CSV
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-5 text-[9px] gap-0.5 px-1"
                onClick={() => exportAsJSON(sqlResults.rows, 'query_results.json')}
              >
                <Download className="h-2.5 w-2.5" />
                JSON
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-5 w-5 p-0"
                onClick={() => setSqlResults(null)}
              >
                <X className="h-2.5 w-2.5" />
              </Button>
            </div>
          </div>
          <table className="w-full text-[11px] border-collapse">
            <thead className="sticky top-[33px] z-10 bg-background">
              <tr className="border-b">
                {sqlResults.columns.map((col) => (
                  <th key={col} className="text-left py-1 px-2 font-medium text-muted-foreground bg-muted/50 whitespace-nowrap">
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sqlResults.rows.slice(0, 100).map((row, i) => (
                <tr key={i} className="border-b hover:bg-muted/30">
                  {sqlResults.columns.map((col) => (
                    <td key={col} className="py-1 px-2 font-mono text-[10px] whitespace-nowrap max-w-[200px] truncate">
                      {row[col] === null ? <span className="italic text-muted-foreground">NULL</span> : String(row[col] ?? '')}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
