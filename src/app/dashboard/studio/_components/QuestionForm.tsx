'use client'

import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { InteractiveOptions } from '@/lib/ai-agents'
import { recommendedIndex } from '../_lib/answers'

interface Props {
  messageId: string
  questions: InteractiveOptions[]
  /** Answers already submitted (labels per question), if any. */
  submitted?: string[][] | null
  /** True once a later user message exists. */
  locked: boolean
  onSubmit: (answers: string[][]) => void
}

export function QuestionForm({ messageId, questions, submitted, locked, onSubmit }: Props) {
  const [selected, setSelected] = useState<string[][]>(() =>
    questions.map(q => {
      const r = recommendedIndex(q)
      return r >= 0 ? [q.choices[r].label] : []
    }),
  )
  const [custom, setCustom] = useState<string[]>(() => questions.map(() => ''))
  const readOnly = locked || !!submitted
  const formRef = useRef<HTMLFormElement>(null)

  // The form mounts after the reply finishes streaming, below the fold —
  // bring a fresh, unanswered form into view so the choices aren't missed.
  useEffect(() => {
    if (readOnly) return
    const el = formRef.current
    if (!el) return
    const t = setTimeout(() => el.scrollIntoView({ block: 'end', behavior: 'smooth' }), 50)
    return () => clearTimeout(t)
    // Only on mount: later re-renders must not yank the scroll position.
  }, [])

  const answerFor = (i: number): string[] => {
    const c = custom[i]?.trim()
    return c ? [c] : selected[i] ?? []
  }
  const answered = questions.filter((_, i) => answerFor(i).length > 0).length

  const toggle = (i: number, label: string) =>
    setSelected(prev =>
      prev.map((s, qi) => {
        if (qi !== i) return s
        if (!questions[i].multi) return [label]
        return s.includes(label) ? s.filter(l => l !== label) : [...s, label]
      }),
    )

  const useRecommended = () =>
    onSubmit(
      questions.map((q, i) => {
        const a = answerFor(i)
        if (a.length > 0) return a
        const r = recommendedIndex(q)
        return [q.choices[r >= 0 ? r : 0]?.label ?? '']
      }),
    )

  return (
    <form
      ref={formRef}
      className="mt-2 space-y-3 scroll-mb-4 rounded-lg border border-amber-300/60 bg-amber-50/40 dark:bg-amber-950/20 p-3"
      aria-label="Questions from the assistant"
      onSubmit={e => {
        e.preventDefault()
        if (!readOnly && answered === questions.length) onSubmit(questions.map((_, i) => answerFor(i)))
      }}
    >
      {questions.map((q, i) => {
        const shown = readOnly ? (submitted?.[i] ?? []) : answerFor(i)
        const inputId = `${messageId}-other-${i}`
        return (
          <fieldset key={i} className="space-y-1.5" disabled={readOnly}>
            <legend className="text-xs font-medium leading-relaxed">
              {q.header && (
                <span className="mr-1.5 inline-block rounded bg-amber-200/80 dark:bg-amber-900/60 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide align-middle">
                  {q.header}
                </span>
              )}
              {questions.length > 1 && `${i + 1}. `}
              {q.question}
              {q.multi && <span className="ml-1 text-muted-foreground font-normal">(select all that apply)</span>}
            </legend>
            <div className="flex flex-col sm:flex-row sm:flex-wrap gap-1.5">
              {q.choices.map(choice => {
                const on = !custom[i]?.trim() && (readOnly ? shown : selected[i]).includes(choice.label)
                const isRecommended = /\(?\brecommended\b\)?/i.test(choice.label)
                const text = choice.label.replace(/\s*[—–-]?\s*\(?\brecommended\b\)?\s*/i, ' ').trim() || choice.label
                return (
                  <button
                    key={choice.value + choice.label}
                    type="button"
                    role={q.multi ? 'checkbox' : 'radio'}
                    aria-checked={on}
                    title={choice.description || undefined}
                    onClick={() => {
                      setCustom(prev => prev.map((c, qi) => (qi === i ? '' : c)))
                      toggle(i, choice.label)
                    }}
                    className={`min-h-9 px-3 py-1.5 text-xs text-left rounded-md border transition-colors disabled:cursor-default sm:max-w-[18rem] ${
                      on
                        ? 'border-amber-500 bg-amber-200 dark:bg-amber-900/60'
                        : 'border-border bg-background hover:bg-muted disabled:opacity-60'
                    }`}
                  >
                    <span className="font-medium">{text}</span>
                    {isRecommended && (
                      <span className="ml-1.5 inline-block rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-200 px-1.5 text-[10px] font-semibold align-middle">
                        Recommended
                      </span>
                    )}
                    {choice.description && (
                      <span className="mt-0.5 block text-[11px] leading-snug text-muted-foreground">{choice.description}</span>
                    )}
                  </button>
                )
              })}
            </div>
            {readOnly ? (
              custom[i]?.trim() || (submitted && shown.length > 0 && !q.choices.some(c => shown.includes(c.label))) ? (
                <p className="text-xs text-muted-foreground">Other: {shown.join(', ')}</p>
              ) : null
            ) : (
              <div className="flex items-center gap-2">
                <label htmlFor={inputId} className="text-xs text-muted-foreground shrink-0">
                  Other…
                </label>
                <Input
                  id={inputId}
                  value={custom[i]}
                  onChange={e => setCustom(prev => prev.map((c, qi) => (qi === i ? e.target.value : c)))}
                  placeholder="Type your own answer"
                  className="h-9 text-xs flex-1"
                />
              </div>
            )}
          </fieldset>
        )
      })}
      {readOnly ? (
        <p className="text-xs text-muted-foreground">{submitted ? 'Answers sent.' : 'Answered.'}</p>
      ) : (
        <div className="flex flex-col sm:flex-row sm:items-center gap-2">
          <Button type="submit" size="sm" className="h-9 text-xs" disabled={answered < questions.length}>
            Send answers
          </Button>
          <Button type="button" size="sm" variant="secondary" className="h-9 text-xs" onClick={useRecommended}>
            Use recommended
          </Button>
          <span className="text-xs text-muted-foreground" aria-live="polite">
            {answered} of {questions.length} answered
          </span>
        </div>
      )}
    </form>
  )
}
