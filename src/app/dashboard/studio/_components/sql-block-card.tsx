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
  RotateCcw,
} from 'lucide-react'
import { isDestructiveSQL } from '@/lib/ai-agents'

// ─── SqlBlockCard ───
// Renders a single SQL block returned by the AI in live-DB mode.
// Shows the SQL, a Destructive badge if applicable, Copy/Open-in-editor/Run
// buttons, the result message, and (for SELECT) the returned rows.
//
// When a block fails, shows a Retry button + an error-recovery hint so
// the user (or the autonomous agent loop) can re-run with adjustments.

import type { SqlBlockResult } from '../_lib/types'
export type { SqlBlockResult }

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

  const failed = result && !result.ok
  const hint = failed ? getErrorHint(result!.message) : null

  return (
    <div className={`mt-2 rounded-md border overflow-hidden ${
      failed
        ? 'border-rose-400 dark:border-rose-800 bg-rose-50/50 dark:bg-rose-950/30'
        : 'border-sky-300 dark:border-sky-800 bg-sky-50/50 dark:bg-sky-950/30'
    }`}>
      <div className={`px-2 py-1 border-b flex items-center justify-between ${
        failed ? 'border-rose-300/50 dark:border-rose-800/50' : 'border-sky-300/50 dark:border-sky-800/50'
      }`}>
        <div className="flex items-center gap-1.5">
          <Code2 className={`h-3 w-3 ${failed ? 'text-rose-600 dark:text-rose-400' : 'text-sky-600 dark:text-sky-400'}`} />
          <span className={`text-[9px] font-semibold uppercase tracking-wide ${
            failed ? 'text-rose-700 dark:text-rose-400' : 'text-sky-700 dark:text-sky-400'
          }`}>
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
      <div className={`px-2 py-1.5 border-t flex items-center gap-1.5 flex-wrap ${
        failed ? 'border-rose-300/50 dark:border-rose-800/50' : 'border-sky-300/50 dark:border-sky-800/50'
      }`}>
        <Button
          size="sm"
          className={`h-6 text-[10px] text-white ${
            failed
              ? 'bg-gradient-to-r from-rose-600 to-red-700 hover:from-rose-700 hover:to-red-800'
              : 'bg-gradient-to-r from-sky-600 to-indigo-600 hover:from-sky-700 hover:to-indigo-700'
          }`}
          disabled={executing}
          onClick={onExecute}
        >
          {executing ? (
            <>
              <Loader2 className="h-3 w-3 mr-1 animate-spin" />
              Executing...
            </>
          ) : failed ? (
            <>
              <RotateCcw className="h-3 w-3 mr-1" />
              Retry
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
      {/* Error recovery hint */}
      {failed && hint && (
        <div className="px-2 py-1.5 border-t border-rose-300/50 dark:border-rose-800/50 bg-rose-50/30 dark:bg-rose-950/20">
          <p className="text-[9px] text-rose-700 dark:text-rose-400">
            <strong>Recovery hint:</strong> {hint}
          </p>
        </div>
      )}
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

// ─── Error recovery hints ───
// Map common SQL errors to actionable hints that help the user (or the
// autonomous agent) understand how to fix the problem.
function getErrorHint(errorMessage: string): string | null {
  const m = errorMessage.toLowerCase()

  if (m.includes('already exists') || m.includes('42p07')) {
    return 'The table already exists. Use `CREATE TABLE IF NOT EXISTS` to skip if it exists, or `DROP TABLE IF EXISTS <name>` first to recreate it.'
  }
  if (m.includes('does not exist') && (m.includes('relation') || m.includes('table'))) {
    return 'The table doesn\'t exist. Run `SELECT table_name FROM information_schema.tables WHERE table_schema NOT IN (\'pg_catalog\',\'information_schema\')` to see available tables.'
  }
  if (m.includes('column') && m.includes('does not exist')) {
    return 'A column doesn\'t exist. Run `SELECT column_name FROM information_schema.columns WHERE table_name=\'<your_table>\'` to see the actual columns.'
  }
  if (m.includes('foreign key constraint') || m.includes('violates foreign key')) {
    return 'Foreign key constraint violation. Insert the parent row first, or use `INSERT ... ON CONFLICT DO NOTHING` to skip duplicates.'
  }
  if (m.includes('unique constraint') || m.includes('duplicate key')) {
    return 'Unique constraint violation. Use `INSERT ... ON CONFLICT (column) DO NOTHING` to skip duplicates, or `ON CONFLICT DO UPDATE` to merge.'
  }
  if (m.includes('value too long') || m.includes('22001')) {
    return 'Value too long for the column type. Increase the VARCHAR length in the schema or truncate the value.'
  }
  if (m.includes('syntax error') || m.includes('42601')) {
    return 'SQL syntax error. Check dialect-specific syntax (Postgres vs MySQL) and that all identifiers are properly quoted.'
  }
  if (m.includes('permission denied') || m.includes('42501')) {
    return 'Permission denied. The database user doesn\'t have privileges for this operation. Contact the DB admin.'
  }
  if (m.includes('connection') && (m.includes('refused') || m.includes('timeout'))) {
    return 'Database connection issue. The external DB may be unreachable or paused. Check the connection status.'
  }
  if (m.includes('not null constraint') || m.includes('23502')) {
    return 'NOT NULL constraint violation. Provide a value for the required column, or use a DEFAULT in the schema.'
  }
  if (m.includes('invalid input syntax') || m.includes('22p02')) {
    return 'Invalid input syntax for the column type. Check that values match the column type (e.g. UUIDs must be valid UUID format).'
  }
  return null
}

