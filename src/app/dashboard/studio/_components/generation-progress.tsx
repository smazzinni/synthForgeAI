'use client'

import { Loader2, CheckCircle2 } from 'lucide-react'
import type { GenerationProgress } from '../_lib/types'

// ─── GenerationProgress ───
// In-chat streaming-generation indicator. Renders a progress bar (driven by
// totalInserted/targetRows), the currently-streaming table, the per-table
// status messages, and a final summary when generation completes.
//
// Pure presentational component — just takes a `GenerationProgress` object.

export interface GenerationProgressProps {
  progress: GenerationProgress
}

export function GenerationProgress({ progress }: GenerationProgressProps) {
  const gp = progress
  const progressPercent = gp.targetRows > 0 ? Math.min(100, Math.round((gp.totalInserted / gp.targetRows) * 100)) : 0

  return (
    <div className="space-y-2">
      {/* Progress bar */}
      <div className="flex items-center gap-2">
        {gp.isGenerating && <Loader2 className="h-3.5 w-3.5 animate-spin text-emerald-500 shrink-0" />}
        {!gp.isGenerating && gp.totalInserted > 0 && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />}
        <div className="flex-1">
          <div className="flex items-center justify-between mb-0.5">
            <span className="text-[10px] font-medium text-foreground">
              {gp.isGenerating ? 'Generating...' : 'Complete'}
            </span>
            <span className="text-[9px] text-muted-foreground">{progressPercent}%</span>
          </div>
          <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${gp.isGenerating ? 'bg-emerald-500' : 'bg-emerald-600'}`}
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>
      </div>

      {/* Current table */}
      {gp.currentTable && gp.isGenerating && (
        <div className="flex items-center gap-1.5 text-[9px]">
          <div className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
          <span className="text-muted-foreground">Streaming into</span>
          <span className="font-mono font-semibold text-emerald-600 dark:text-emerald-400">[{gp.currentTable}]</span>
          <span className="text-muted-foreground">—</span>
          <span className="font-mono">{gp.totalInserted.toLocaleString()}</span>
          <span className="text-muted-foreground">/ {gp.targetRows.toLocaleString()} rows</span>
        </div>
      )}

      {/* Status messages */}
      {gp.statusMessages.length > 0 && (
        <div className="space-y-0.5 pl-1">
          {gp.statusMessages.slice(-5).map((msg, i) => (
            <div key={i} className="text-[9px] flex items-center gap-1">
              {msg.startsWith('[') && msg.includes('rows inserted') ? (
                <span className="text-emerald-600 dark:text-emerald-400 font-medium">{msg}</span>
              ) : msg.startsWith('Error') ? (
                <span className="text-destructive font-medium">{msg}</span>
              ) : msg.startsWith('Generation complete') ? (
                <span className="text-emerald-600 dark:text-emerald-400 font-semibold">{msg}</span>
              ) : (
                <span className="text-muted-foreground">{msg}</span>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Summary when complete */}
      {!gp.isGenerating && gp.tablesGenerated > 0 && (
        <div className="flex items-center gap-2 text-[9px] text-muted-foreground pt-0.5 border-t border-border/50">
          <span>{gp.tablesGenerated} tables</span>
          <span>·</span>
          <span>{gp.totalInserted.toLocaleString()} rows</span>
        </div>
      )}
    </div>
  )
}
