import React, { useEffect, useRef, useState } from 'react'

export default function ShowMoreText({
  content,
  isStreaming,
}: {
  content: string
  isStreaming?: boolean
}) {
  const [expanded, setExpanded] = useState(false)
  const contentRef = useRef<HTMLDivElement>(null)
  const [isOverflowing, setIsOverflowing] = useState(false)

  useEffect(() => {
    if (contentRef.current) {
      setIsOverflowing(contentRef.current.scrollHeight > 400)
    }
  }, [content])

  const parts = content.split(/(\*\*[^*]+\*\*|\`[^`]+\`|\n)/g)
  const rendered = parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={i}>{part.slice(2, -2)}</strong>
    }
    if (part.startsWith('`') && part.endsWith('`')) {
      return (
        <code key={i} className="bg-muted px-1 py-0.5 rounded text-xs font-mono">
          {part.slice(1, -1)}
        </code>
      )
    }
    if (part === '\n') return <br key={i} />
    return <span key={i}>{part}</span>
  })

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
