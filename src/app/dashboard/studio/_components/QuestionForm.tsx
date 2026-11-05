'use client'

import { useState } from 'react'
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
      className="mt-2 space-y-3 rounded-lg border border-amber-300/60 bg-amber-50/40 dark:bg-amber-950/20 p-3"
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
            <legend className="text-xs font-medium">
              {i + 1}. {q.question}
              {q.multi && <span className="ml-1 text-muted-foreground font-normal">(select all that apply)</span>}
            </legend>
            <div className="flex flex-col sm:flex-row sm:flex-wrap gap-1.5">
              {q.choices.map(choice => {
                const on = !custom[i]?.trim() && (readOnly ? shown : selected[i]).includes(choice.label)
                return (
                  <button
                    key={choice.value}
                    type="button"
                    aria-pressed={on}
                    onClick={() => {
                      setCustom(prev => prev.map((c, qi) => (qi === i ? '' : c)))
                      toggle(i, choice.label)
                    }}
                    className={`min-h-9 px-3 py-1.5 text-xs text-left rounded-md border transition-colors disabled:cursor-default ${
                      on
                        ? 'border-amber-500 bg-amber-200 dark:bg-amber-900/60 font-medium'
                        : 'border-border bg-background hover:bg-muted disabled:opacity-60'
                    }`}
                  >
                    {choice.label}
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
