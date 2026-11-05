import type { InteractiveOptions } from '@/lib/ai-agents'

/** Index of the choice whose label contains "recommended", or -1. */
export function recommendedIndex(q: InteractiveOptions): number {
  return q.choices.findIndex(c => /recommended/i.test(c.label))
}

/** Accepts old saved shapes (single object / null) and returns an array or null. */
export function normalizeInteractiveOptions(v: unknown): InteractiveOptions[] | null {
  if (!v) return null
  const arr = Array.isArray(v) ? v : [v]
  return arr.length > 0 ? (arr as InteractiveOptions[]) : null
}

/** answers[i] is the list of labels (or the single custom text) for question i. */
export function formatAnswers(questions: Pick<InteractiveOptions, 'question'>[], answers: string[][]): string {
  const lines = questions.map(
    (q, i) => `${i + 1}. ${q.question} — ${(answers[i] ?? []).join(', ')}`,
  )
  return `Here are my answers:\n${lines.join('\n')}`
}
