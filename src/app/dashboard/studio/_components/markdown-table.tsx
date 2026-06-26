'use client'

import { useMemo } from 'react'

// ─── MarkdownTable ───
// Parses GitHub-flavored markdown tables (| col | col |) and renders them
// as proper HTML tables with both vertical and horizontal scrollbars.
//
// Supports:
//   - Header row + separator row (|---|---|)
//   - Alignment syntax (|:--|:--:|--:| → left/center/right)
//   - Cells containing spaces, special chars, UUIDs, timestamps
//   - Horizontal scroll when columns exceed container width
//   - Vertical scroll when rows exceed max height (default 320px)
//   - Sticky header row
//
// The parser is defensive: malformed tables (missing separator, uneven
// column counts) are rendered as best-effort rather than crashing.

export function MarkdownTable({
  markdown,
  maxHeight = 320,
  title,
}: {
  markdown: string
  maxHeight?: number
  title?: string
}) {
  const parsed = useMemo(() => parseMarkdownTable(markdown), [markdown])

  if (!parsed) return null

  const { headers, aligns, rows } = parsed

  return (
    <div className="my-2 rounded-md border border-sky-300 dark:border-sky-800 bg-background/50 overflow-hidden">
      {title && (
        <div className="px-2 py-1 border-b border-sky-300/50 dark:border-sky-800/50 bg-sky-50/50 dark:bg-sky-950/30">
          <span className="text-[9px] font-semibold uppercase tracking-wide text-sky-700 dark:text-sky-400">
            {title} · {rows.length} row{rows.length !== 1 ? 's' : ''}
          </span>
        </div>
      )}
      <div className="overflow-auto" style={{ maxHeight }}>
        <table className="w-full text-[10px] font-mono border-collapse">
          <thead className="sticky top-0 z-10">
            <tr className="bg-sky-100 dark:bg-sky-950/70">
              <th className="px-2 py-1 text-left font-semibold text-sky-800 dark:text-sky-300 border-b border-sky-300 dark:border-sky-800 whitespace-nowrap">
                #
              </th>
              {headers.map((header, i) => (
                <th
                  key={i}
                  className="px-2 py-1 font-semibold text-sky-800 dark:text-sky-300 border-b border-sky-300 dark:border-sky-800 whitespace-nowrap"
                  style={{ textAlign: aligns[i] || 'left' }}
                >
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr
                key={i}
                className="border-b border-border/30 hover:bg-sky-50/50 dark:hover:bg-sky-950/20"
              >
                <td className="px-2 py-1 text-muted-foreground whitespace-nowrap border-r border-border/20">
                  {i + 1}
                </td                >
                {headers.map((_, j) => (
                  <td
                    key={j}
                    className="px-2 py-1 whitespace-nowrap border-r border-border/10"
                    style={{ textAlign: aligns[j] || 'left' }}
                  >
                    {renderCell(row[j])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length > 100 && (
        <div className="px-2 py-1 text-[8px] text-muted-foreground bg-muted/30 border-t">
          Showing first 100 of {rows.length} rows
        </div>
      )}
    </div>
  )
}

// ─── Render a single cell value ───
function renderCell(value: string | undefined): React.ReactNode {
  if (value === undefined || value === null || value === '') {
    return <span className="text-muted-foreground italic">NULL</span>
  }
  const v = value.trim()
  // Booleans
  if (v === 'true' || v === 'TRUE' || v === 't') {
    return <span className="text-emerald-600 dark:text-emerald-400 font-medium">{v}</span>
  }
  if (v === 'false' || v === 'FALSE' || v === 'f') {
    return <span className="text-rose-600 dark:text-rose-400 font-medium">{v}</span>
  }
  // Numbers
  if (/^-?\d+(\.\d+)?$/.test(v)) {
    return <span className="text-blue-600 dark:text-blue-400">{v}</span>
  }
  // NULL keyword
  if (v.toUpperCase() === 'NULL') {
    return <span className="text-muted-foreground italic">NULL</span>
  }
  // Timestamps (ISO 8601 or similar)
  if (/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/.test(v)) {
    return <span className="text-violet-600 dark:text-violet-400">{v}</span>
  }
  // UUIDs
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)) {
    return <span className="text-amber-600 dark:text-amber-400 text-[9px]">{v}</span>
  }
  // Emails
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) {
    return <span className="text-sky-600 dark:text-sky-400">{v}</span>
  }
  return <span>{v}</span>
}

// ─── Parse a markdown table string ───
// Returns null if the input isn't a valid markdown table.
export function parseMarkdownTable(input: string): {
  headers: string[]
  aligns: Array<'left' | 'center' | 'right' | undefined>
  rows: string[][]
} | null {
  if (!input || typeof input !== 'string') return null

  // Split into lines, trim, and keep only lines that look like table rows
  // (must contain at least one `|`).
  const lines = input
    .split('\n')
    .map(l => l.trim())
    .filter(l => l.includes('|') && l.trim().length > 0)

  if (lines.length < 2) return null // need at least header + separator

  // The separator row is the second line and must match |---|---:| etc.
  const separatorLine = lines[1]
  if (!/^\|?[\s:|-]+\|?$/.test(separatorLine) || !separatorLine.includes('-')) {
    return null
  }

  const headers = splitRow(lines[0])
  const aligns = parseAlignments(separatorLine, headers.length)

  // All remaining lines are data rows
  const rows: string[][] = []
  for (let i = 2; i < lines.length; i++) {
    const row = splitRow(lines[i])
    // Pad/truncate to match header column count
    while (row.length < headers.length) row.push('')
    row.length = headers.length
    rows.push(row)
  }

  if (headers.length === 0 || rows.length === 0) return null

  return { headers, aligns, rows }
}

// Split a table row into cells, respecting escaped pipes (\|)
function splitRow(line: string): string[] {
  // Remove leading/trailing pipes
  let s = line.trim()
  if (s.startsWith('|')) s = s.slice(1)
  if (s.endsWith('|') && !s.endsWith('\\|')) s = s.slice(0, -1)

  // Split on unescaped pipes
  const cells: string[] = []
  let current = ''
  let i = 0
  while (i < s.length) {
    if (s[i] === '\\' && s[i + 1] === '|') {
      current += '|'
      i += 2
      continue
    }
    if (s[i] === '|') {
      cells.push(current.trim())
      current = ''
      i++
      continue
    }
    current += s[i]
    i++
  }
  cells.push(current.trim())
  return cells
}

// Parse alignment from a separator row like |:--|:--:|--:|
function parseAlignments(separator: string, count: number): Array<'left' | 'center' | 'right' | undefined> {
  const cells = splitRow(separator)
  const aligns: Array<'left' | 'center' | 'right' | undefined> = []
  for (let i = 0; i < count; i++) {
    const cell = (cells[i] || '').trim()
    const left = cell.startsWith(':')
    const right = cell.endsWith(':')
    if (left && right) aligns.push('center')
    else if (right) aligns.push('right')
    else if (left) aligns.push('left')
    else aligns.push(undefined)
  }
  return aligns
}

// ─── Detect if a string contains a markdown table ───
export function hasMarkdownTable(input: string): boolean {
  if (!input || typeof input !== 'string') return false
  const lines = input.split('\n').map(l => l.trim()).filter(l => l.includes('|'))
  if (lines.length < 2) return false
  const separator = lines[1]
  return /^\|?[\s:|-]+\|?$/.test(separator) && separator.includes('-')
}
