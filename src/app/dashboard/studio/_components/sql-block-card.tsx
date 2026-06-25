'use client'

import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Code2,
  Copy,
  Play,
  Loader2,
  CheckCircle2,
  AlertTriangle,
} from 'lucide-react'
import { isDestructiveSQL } from '@/lib/ai-agents'

// ─── SqlBlockCard ───
// Renders a single SQL block returned by the AI in live-DB mode.
// Shows the SQL, a Destructive badge if applicable, Copy/Open-in-editor/Run
// buttons, the result message, and (for SELECT) the returned rows.

export interface SqlBlockResult {
  ok: boolean
  message: string
  rowCount?: number
  affectedRows?: number
  rows?: Record<string, unknown>[]
  columns?: string[]
}

export function SqlBlockCard({
  sql,
  dialect,
  executing,
  result,
  onCopy,
  onOpenInEditor,
  onExecute,
}: {
  sql: string
  dialect?: 'postgres' | 'mysql'
  executing?: boolean
  result?: SqlBlockResult | null
  onCopy: () => void
  onOpenInEditor: () => void
  onExecute: () => void
}) {
  const destructive = isDestructiveSQL(sql)
  // Detect read-only queries (auto-executed by the studio) so we can show
  // an "Auto-run" badge and the user understands the rows appeared without
  // them clicking anything.
  const stripped = sql.replace(/--.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '').trim()
  const firstVerb = stripped.split(/\s+/)[0]?.toUpperCase() || ''
  const isReadOnly =
    firstVerb === 'SELECT' ||
    firstVerb === 'WITH' ||
    firstVerb === 'SHOW' ||
    firstVerb === 'DESCRIBE' ||
    firstVerb === 'EXPLAIN'

  return (
    <div className="mt-2 rounded-md border border-sky-300 dark:border-sky-800 bg-sky-50/50 dark:bg-sky-950/30 overflow-hidden">
      <div className="px-2 py-1 border-b border-sky-300/50 dark:border-sky-800/50 flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Code2 className="h-3 w-3 text-sky-600 dark:text-sky-400" />
          <span className="text-[9px] font-semibold uppercase tracking-wide text-sky-700 dark:text-sky-400">
            SQL · {dialect || 'postgres'}
          </span>
          {destructive ? (
            <Badge variant="outline" className="text-[8px] h-3.5 px-1 border-rose-400 text-rose-700 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40">
              <AlertTriangle className="h-2 w-2 mr-0.5" />
              Destructive
            </Badge>
          ) : isReadOnly ? (
            <Badge variant="outline" className="text-[8px] h-3.5 px-1 border-emerald-400 text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40">
              <CheckCircle2 className="h-2 w-2 mr-0.5" />
              Auto-run
            </Badge>
          ) : null}
        </div>
        <div className="flex items-center gap-0.5">
          <Button
            variant="ghost"
            size="sm"
            className="h-5 px-1.5 text-[9px]"
            onClick={onCopy}
            title="Copy SQL"
          >
            <Copy className="h-2.5 w-2.5" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-5 px-1.5 text-[9px]"
            onClick={onOpenInEditor}
            title="Open in SQL editor"
          >
            <Code2 className="h-2.5 w-2.5" />
          </Button>
        </div>
      </div>
      <pre className="p-2 text-[10px] leading-relaxed font-mono overflow-x-auto max-h-[180px] overflow-y-auto bg-background/50">
        <code>{sql}</code>
      </pre>
      <div className="px-2 py-1.5 border-t border-sky-300/50 dark:border-sky-800/50 flex items-center gap-1.5">
        <Button
          size="sm"
          className="h-6 text-[10px] bg-gradient-to-r from-sky-600 to-indigo-600 hover:from-sky-700 hover:to-indigo-700 text-white"
          disabled={executing}
          onClick={onExecute}
        >
          {executing ? (
            <>
              <Loader2 className="h-3 w-3 mr-1 animate-spin" />
              Executing...
            </>
          ) : (
            <>
              <Play className="h-3 w-3 mr-1" />
              Run on live DB
            </>
          )}
        </Button>
        {result && (
          <span className={`text-[9px] font-medium ${result.ok ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
            {result.ok ? <CheckCircle2 className="inline h-2.5 w-2.5 mr-0.5" /> : <AlertTriangle className="inline h-2.5 w-2.5 mr-0.5" />}
            {result.message}
          </span>
        )}
      </div>
      {/* Show returned rows for SELECT queries */}
      {result?.ok && result.rows && result.rows.length > 0 && (
        <div className="border-t border-sky-300/50 dark:border-sky-800/50 max-h-[200px] overflow-auto">
          <table className="w-full text-[9px] font-mono">
            <thead className="sticky top-0 bg-sky-100 dark:bg-sky-950/60">
              <tr>
                {(result.columns || Object.keys(result.rows[0])).map(col => (
                  <th key={col} className="px-1.5 py-1 text-left font-semibold text-sky-800 dark:text-sky-300 whitespace-nowrap">
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {result.rows.slice(0, 20).map((row, i) => (
                <tr key={i} className="border-t border-sky-200/50 dark:border-sky-800/30">
                  {(result.columns || Object.keys(row)).map(col => (
                    <td key={col} className="px-1.5 py-0.5 whitespace-nowrap">
                      {row[col] === null || row[col] === undefined
                        ? <span className="text-muted-foreground italic">NULL</span>
                        : String(row[col]).slice(0, 80)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {result.rows.length > 20 && (
            <div className="px-2 py-1 text-[8px] text-muted-foreground bg-sky-50/50 dark:bg-sky-950/30">
              + {result.rows.length - 20} more row(s)
            </div>
          )}
        </div>
      )}
    </div>
  )
}
