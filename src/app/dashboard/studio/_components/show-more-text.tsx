'use client'

import { useState, useRef, useEffect } from 'react'
import { MarkdownTable, hasMarkdownTable, parseMarkdownTable } from './markdown-table'

// ─── ShowMoreText ───
// Renders long text with a "Show more" / "Show less" toggle when it
// overflows the default max-height. Supports basic markdown: **bold**,
// `inline code`, lists (- item, * item, 1. item), headings (#, ##, ###),
// fenced code blocks (```), AND GitHub-flavored markdown tables
// (| col | col |) which are rendered as scrollable HTML tables.
//
// BUGFIX (BUG-49): added a ResizeObserver so the overflow check re-runs
// when the container is resized (e.g. when the user drags the chat
// panel wider/narrower), not just when the content changes.

export function ShowMoreText({ content, isStreaming }: { content: string; isStreaming?: boolean }) {
  const [expanded, setExpanded] = useState(false)
  const contentRef = useRef<HTMLDivElement>(null)
  const [isOverflowing, setIsOverflowing] = useState(false)

  useEffect(() => {
    const el = contentRef.current
    if (!el) return

    const check = () => {
      setIsOverflowing(el.scrollHeight > 400)
    }
    check()

    // Re-check on container resize
    const ro = new ResizeObserver(() => check())
    ro.observe(el)
    return () => ro.disconnect()
  }, [content])

  // Format the text with markdown-like rendering
  const rendered = renderMarkdown(content)

  return (
    <div>
      <div
        ref={contentRef}
        className={`text-sm leading-relaxed whitespace-pre-wrap ${!expanded && isOverflowing ? 'max-h-[400px] overflow-y-auto' : ''}`}
        style={{ overflowWrap: 'break-word', wordBreak: 'break-word' }}
      >
        {rendered}
      </div>
      {isOverflowing && !isStreaming && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="mt-1 text-[10px] text-amber-600 dark:text-amber-400 hover:underline font-medium"
        >
          {expanded ? 'Show less' : 'Show more'}
        </button>
      )}
    </div>
  )
}

// ─── Minimal markdown renderer ───
// Supports: # / ## / ### headings, **bold**, `code`, - / * / 1. lists,
// ```fenced code blocks```, GitHub-flavored markdown tables
// (| col | col |), and blank-line paragraph breaks.
// Returns a React fragment.
function renderMarkdown(content: string): React.ReactNode {
  const lines = content.split('\n')
  const out: React.ReactNode[] = []
  let i = 0
  let key = 0

  while (i < lines.length) {
    const line = lines[i]

    // ─── Markdown table detection ───
    // A markdown table starts with a header row (containing |), followed
    // by a separator row (|---|---|). Detect the start and consume all
    // consecutive table rows.
    if (line.includes('|') && i + 1 < lines.length) {
      const nextLine = lines[i + 1].trim()
      // Separator row check: |---|---:|:--:|--:|
      if (/^\|?[\s:|-]+\|?$/.test(nextLine) && nextLine.includes('-')) {
        // Collect all consecutive lines that look like table rows
        const tableLines: string[] = [line]
        let j = i + 1
        while (j < lines.length && lines[j].includes('|') && lines[j].trim().length > 0) {
          tableLines.push(lines[j])
          j++
        }
        const tableText = tableLines.join('\n')
        const parsed = parseMarkdownTable(tableText)
        if (parsed) {
          out.push(<MarkdownTable key={key++} markdown={tableText} />)
          i = j
          continue
        }
      }
    }

    // Fenced code block
    const fenceMatch = line.match(/^```(\w*)$/)
    if (fenceMatch) {
      const lang = fenceMatch[1] || 'text'
      const codeLines: string[] = []
      i++
      while (i < lines.length && !lines[i].startsWith('```')) {
        codeLines.push(lines[i])
        i++
      }
      i++ // skip closing ```
      out.push(
        <pre key={key++} className="my-1.5 p-2 rounded-md bg-muted/80 dark:bg-muted/30 text-[10px] leading-relaxed font-mono overflow-x-auto border border-border/50">
          <div className="text-[8px] uppercase opacity-60 mb-1">{lang}</div>
          <code>{codeLines.join('\n')}</code>
        </pre>,
      )
      continue
    }

    // Heading
    const headingMatch = line.match(/^(#{1,3})\s+(.*)$/)
    if (headingMatch) {
      const level = headingMatch[1].length
      const text = renderInline(headingMatch[2])
      const cls = level === 1 ? 'text-sm font-bold mt-2 mb-1' : level === 2 ? 'text-xs font-semibold mt-1.5 mb-0.5' : 'text-xs font-medium mt-1 mb-0.5'
      out.push(<div key={key++} className={cls}>{text}</div>)
      i++
      continue
    }

    // Unordered list item
    const ulMatch = line.match(/^\s*[-*]\s+(.*)$/)
    if (ulMatch) {
      const items: React.ReactNode[] = []
      while (i < lines.length) {
        const m = lines[i].match(/^\s*[-*]\s+(.*)$/)
        if (!m) break
        items.push(<li key={items.length} className="ml-4 list-disc">{renderInline(m[1])}</li>)
        i++
      }
      out.push(<ul key={key++} className="my-1 space-y-0.5">{items}</ul>)
      continue
    }

    // Ordered list item
    const olMatch = line.match(/^\s*\d+\.\s+(.*)$/)
    if (olMatch) {
      const items: React.ReactNode[] = []
      while (i < lines.length) {
        const m = lines[i].match(/^\s*\d+\.\s+(.*)$/)
        if (!m) break
        items.push(<li key={items.length} className="ml-4 list-decimal">{renderInline(m[1])}</li>)
        i++
      }
      out.push(<ol key={key++} className="my-1 space-y-0.5">{items}</ol>)
      continue
    }

    // Blank line → paragraph break
    if (line.trim() === '') {
      out.push(<div key={key++} className="h-1.5" />)
      i++
      continue
    }

    // Regular paragraph
    out.push(<span key={key++}>{renderInline(line)}</span>)
    i++
  }

  return <>{out}</>
}

// Render inline markdown: **bold** and `code`
function renderInline(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g)
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={i}>{part.slice(2, -2)}</strong>
    }
    if (part.startsWith('`') && part.endsWith('`')) {
      return <code key={i} className="bg-muted px-1 py-0.5 rounded text-xs font-mono">{part.slice(1, -1)}</code>
    }
    return <span key={i}>{part}</span>
  })
}
