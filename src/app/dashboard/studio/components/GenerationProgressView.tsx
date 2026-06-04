"use client";

import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import {
  AlertTriangle,
  CheckCircle2,
  Database,
  Loader2,
  Sparkles,
  Table2,
  Zap,
} from "lucide-react";

export interface GenerationProgressModel {
  isGenerating: boolean;
  currentTable: string;
  rowsInserted: number;
  totalInserted: number;
  targetRows: number;
  tablesGenerated: number;
  statusMessages: string[];
}

function humanizeStatusLine(raw: string): string {
  let s = raw.replace(/\[/g, "").replace(/\]/g, "").trim();
  const m = s.match(/Streaming records into\s+(\S+)\s*[—-]\s*(\d+)/i);
  if (m) {
    return `Writing rows into ${m[1]} · ${Number(m[2]).toLocaleString()} so far`;
  }
  if (s.includes("rows inserted") && s.match(/^(\S+)\s*[—-]/)) {
    return s.replace(/\s*[—-]\s*/g, " · ");
  }
  return s;
}

function statusLineStyle(msg: string): "success" | "error" | "live" | "muted" {
  if (msg.startsWith("Error") || msg.includes("Error:")) return "error";
  if (msg.startsWith("Generation complete")) return "success";
  if (
    msg.toLowerCase().includes("streaming") ||
    msg.toLowerCase().includes("generating")
  )
    return "live";
  if (/rows?\s+inserted/i.test(msg)) return "success";
  return "muted";
}

interface GenerationProgressViewProps {
  gp: GenerationProgressModel;
  /** Right-rail: optional finished line while not generating */
  doneLine?: string | null;
  doneIsError?: boolean;
  variant?: "card" | "compact";
}

export function GenerationProgressView({
  gp,
  doneLine,
  doneIsError,
  variant = "card",
}: GenerationProgressViewProps) {
  const compact = variant === "compact";
  const pct =
    gp.targetRows > 0
      ? Math.min(100, Math.round((gp.totalInserted / gp.targetRows) * 100))
      : gp.isGenerating
        ? 6
        : gp.totalInserted > 0
          ? 100
          : 0;

  const showDone = !gp.isGenerating && doneLine;
  const live = gp.isGenerating;

  return (
    <div
      className={cn(
        "rounded-2xl border shadow-sm overflow-hidden",
        compact ? "border-border/80 bg-muted/25" : "border-emerald-500/20",
        !compact &&
          (doneIsError
            ? "border-destructive/30 bg-gradient-to-br from-destructive/[0.07] via-background to-background"
            : "bg-gradient-to-br from-emerald-500/[0.09] via-background to-violet-500/[0.04]"),
      )}
    >
      <div className={cn(compact ? "p-2.5 space-y-2" : "p-4 space-y-3")}>
        <div className="flex items-start gap-3">
          <div
            className={cn(
              "rounded-xl flex items-center justify-center shrink-0",
              compact ? "h-8 w-8" : "h-10 w-10",
              live
                ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                : doneIsError
                  ? "bg-destructive/10 text-destructive"
                  : "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
            )}
          >
            {live ? (
              <Loader2
                className={cn("animate-spin", compact ? "h-4 w-4" : "h-5 w-5")}
                aria-hidden
              />
            ) : doneIsError ? (
              <AlertTriangle
                className={compact ? "h-4 w-4" : "h-5 w-5"}
                aria-hidden
              />
            ) : (
              <CheckCircle2
                className={compact ? "h-4 w-4" : "h-5 w-5"}
                aria-hidden
              />
            )}
          </div>

          <div className="flex-1 min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={cn(
                  "font-semibold tracking-tight text-foreground",
                  compact ? "text-[11px]" : "text-sm",
                )}
              >
                {live ? "Building your dataset" : "Dataset ready"}
              </span>
              {live && (
                <Badge
                  variant="outline"
                  className={cn(
                    "gap-1 border-emerald-500/35 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200 font-medium",
                    compact ? "text-[9px] px-1.5 py-0 h-5" : "text-[10px] px-2",
                  )}
                >
                  <Zap className="h-3 w-3" aria-hidden />
                  Live
                </Badge>
              )}
              {!live && doneLine && !doneIsError && (
                <Badge
                  variant="outline"
                  className={cn(
                    "border-emerald-500/35 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200",
                    compact ? "text-[9px]" : "text-[10px]",
                  )}
                >
                  Done
                </Badge>
              )}
            </div>

            <p
              className={cn(
                "text-muted-foreground leading-snug",
                compact ? "text-[10px]" : "text-xs",
              )}
            >
              {live
                ? gp.currentTable
                  ? `Streaming synthetic rows into table “${gp.currentTable}”. Safe to keep working elsewhere in the app.`
                  : "Connecting to the generator and preparing tables…"
                : doneIsError
                  ? "Something went wrong during generation."
                  : "Your tables and row counts are updated on the Data tab."}
            </p>
          </div>
        </div>

        {live && (
          <>
            <div className="flex items-end justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0 flex-wrap">
                {gp.currentTable ? (
                  <span
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-lg bg-background/80 border border-border/80 font-mono text-emerald-700 dark:text-emerald-300",
                      compact ? "text-[10px] px-2 py-0.5" : "text-xs px-2.5 py-1",
                    )}
                  >
                    <Table2 className="h-3 w-3 shrink-0 opacity-80" aria-hidden />
                    {gp.currentTable}
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                    <Database className="h-3.5 w-3.5" aria-hidden />
                    Preparing…
                  </span>
                )}
              </div>
              <span
                className={cn(
                  "tabular-nums font-semibold text-emerald-700 dark:text-emerald-300 shrink-0",
                  compact ? "text-xs" : "text-sm",
                )}
              >
                {pct}%
              </span>
            </div>

            <div
              className={cn(
                "w-full rounded-full bg-muted/80 overflow-hidden ring-1 ring-border/40",
                compact ? "h-1.5" : "h-2.5",
              )}
            >
              <div
                className="h-full rounded-full bg-gradient-to-r from-emerald-500 via-teal-500 to-cyan-500 transition-[width] duration-500 ease-out shadow-[0_0_12px_rgba(16,185,129,0.35)]"
                style={{ width: `${pct}%` }}
              />
            </div>

            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 text-muted-foreground">
              <span
                className={cn("tabular-nums", compact ? "text-[10px]" : "text-xs")}
              >
                <span className="font-medium text-foreground">
                  {gp.totalInserted.toLocaleString()}
                </span>
                {gp.targetRows > 0 ? (
                  <>
                    <span className="mx-1 opacity-60">/</span>
                    <span>~{gp.targetRows.toLocaleString()} target rows</span>
                  </>
                ) : (
                  <span className="ml-1 opacity-80">rows written</span>
                )}
              </span>
              {gp.tablesGenerated > 0 && (
                <span className={cn("tabular-nums", compact ? "text-[10px]" : "text-xs")}>
                  <span className="font-medium text-foreground">
                    {gp.tablesGenerated}
                  </span>
                  <span className="opacity-80"> tables finished</span>
                </span>
              )}
            </div>
          </>
        )}

        {showDone && doneLine && (
          <p
            className={cn(
              "rounded-lg px-3 py-2 font-medium leading-snug",
              compact ? "text-[11px]" : "text-sm",
              doneIsError
                ? "bg-destructive/10 text-destructive border border-destructive/20"
                : "bg-emerald-500/10 text-emerald-900 dark:text-emerald-100 border border-emerald-500/20",
            )}
          >
            {doneIsError ? doneLine : `Success · ${doneLine}`}
          </p>
        )}

        {gp.statusMessages.length > 0 && (live || compact) && (
          <div
            className={cn(
              "rounded-xl border border-border/60 bg-background/60 backdrop-blur-sm",
              compact ? "px-2 py-1.5" : "px-3 py-2",
            )}
          >
            <p
              className={cn(
                "font-medium text-muted-foreground mb-1.5 flex items-center gap-1.5",
                compact ? "text-[9px]" : "text-[10px]",
              )}
            >
              <Sparkles className="h-3 w-3 text-amber-500 shrink-0" aria-hidden />
              Activity
            </p>
            <ul
              className={cn(
                "space-y-1 max-h-28 overflow-y-auto pr-1",
                compact ? "text-[9px]" : "text-[10px]",
              )}
            >
              {gp.statusMessages.slice(-6).map((msg, i) => {
                const kind = statusLineStyle(msg);
                const text = humanizeStatusLine(msg);
                return (
                  <li
                    key={`${i}-${text.slice(0, 24)}`}
                    className="flex items-start gap-2 leading-snug"
                  >
                    <span className="mt-0.5 shrink-0">
                      {kind === "success" && (
                        <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                      )}
                      {kind === "error" && (
                        <AlertTriangle className="h-3 w-3 text-destructive" />
                      )}
                      {kind === "live" && (
                        <span className="flex h-3 w-3 items-center justify-center">
                          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                        </span>
                      )}
                      {kind === "muted" && (
                        <span className="block h-3 w-3 rounded-full bg-muted-foreground/25 mt-0.5" />
                      )}
                    </span>
                    <span
                      className={cn(
                        "min-w-0 break-words",
                        kind === "success" &&
                          "text-emerald-700 dark:text-emerald-300 font-medium",
                        kind === "error" && "text-destructive font-medium",
                        kind === "live" && "text-foreground/90",
                        kind === "muted" && "text-muted-foreground",
                      )}
                    >
                      {text}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {!live && !showDone && gp.tablesGenerated > 0 && (
          <div
            className={cn(
              "flex items-center gap-2 text-muted-foreground border-t border-border/50 pt-2",
              compact ? "text-[9px]" : "text-xs",
            )}
          >
            <Database className="h-3.5 w-3.5 shrink-0 opacity-70" />
            <span className="tabular-nums">
              <span className="font-semibold text-foreground">
                {gp.tablesGenerated}
              </span>{" "}
              tables ·{" "}
              <span className="font-semibold text-foreground">
                {gp.totalInserted.toLocaleString()}
              </span>{" "}
              rows
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
