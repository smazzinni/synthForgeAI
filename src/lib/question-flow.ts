/**
 * Sequential Question Handler
 * Manages multi-step question flows where questions are shown one at a time,
 * user responses are collected, and then all answers are sent back to the AI
 */

export interface Question {
  id: string
  text: string
  type: 'single_choice' | 'multi_choice' | 'text_input' | 'number_input' | 'date_input'
  options?: Array<{ label: string; value: string }>
  required?: boolean
  skipOption?: boolean
  customAnswerAllowed?: boolean
  note?: string
}

export interface QuestionFlow {
  id: string
  title: string
  description?: string
  questions: Question[]
  currentQuestionIndex: number
  answers: Record<string, string | string[] | null>
  isComplete: boolean
}

/**
 * Helper: Extract a complete JSON object or array from a string starting at a given position.
 * Uses bracket counting to handle nested objects and arrays.
 */
function extractJsonObject(content: string, startIndex: number): string | null {
  let depth = 0
  let inString = false
  let escape = false
  const len = content.length

  for (let i = startIndex; i < len; i++) {
    const ch = content[i]

    if (escape) {
      escape = false
      continue
    }

    if (ch === '\\' && inString) {
      escape = true
      continue
    }

    if (ch === '"') {
      inString = !inString
      continue
    }

    if (inString) continue

    if (ch === '{' || ch === '[') {
      depth++
    } else if (ch === '}' || ch === ']') {
      depth--
      if (depth === 0) {
        return content.substring(startIndex, i + 1)
      }
    }
  }

  if (depth <= 0) {
    return content.substring(startIndex)
  }
  return null
}

/**
 * Find a balanced JSON object in `content` that contains `marker` (used for questionnaire blocks).
 */
function findJsonBlockWithMarker(
  content: string,
  marker: string
): { jsonStr: string; startIndex: number } | null {
  let pos = 0
  while (true) {
    const markerIdx = content.indexOf(marker, pos)
    if (markerIdx === -1) break

    let braceIdx = content.lastIndexOf('{', markerIdx)
    while (braceIdx !== -1) {
      const jsonStr = extractJsonObject(content, braceIdx)
      if (jsonStr && jsonStr.includes(marker)) {
        try {
          JSON.parse(jsonStr)
          return { jsonStr, startIndex: braceIdx }
        } catch {
          // try an earlier '{'
        }
      }
      braceIdx = content.lastIndexOf('{', braceIdx - 1)
    }
    pos = markerIdx + marker.length
  }
  return null
}

function mapRawQuestionsArray(raw: unknown[]): Question[] {
  const allowed: Question['type'][] = [
    'single_choice',
    'multi_choice',
    'text_input',
    'number_input',
    'date_input',
  ]

  return raw
    .map((q: unknown, qIdx: number) => {
      const o = q as Record<string, unknown>
      const t = String(o.type || 'single_choice')
      const type = (allowed.includes(t as Question['type'])
        ? (t as Question['type'])
        : 'single_choice') as Question['type']

      return {
        id: String(o.id || `q_${qIdx}`),
        text: String(o.Question || o.question || o.text || ''),
        type,
        options: Array.isArray(o.Options || o.options || o.choices)
          ? ((o.Options || o.options || o.choices) as unknown[]).map(
              normalizeChoice,
            )
          : undefined,
        required: o.required !== false,
        skipOption: Boolean(o.skipOption || o.Skip),
        customAnswerAllowed: Boolean(o.customAnswerAllowed || o.CustomAnswer),
        note: o.note || o.Note ? String(o.Note || o.note) : undefined,
      }
    })
    .filter((q) => q.text.length > 0)
}

/**
 * Prefer a single wizard intake object: type "questionnaire".
 */
function tryParseQuestionnaireFromContent(
  content: string
): { questions: Question[]; flowTitle?: string } | null {
  const fenceRegex = /```(?:json)?\s*\n?([\s\S]*?)```/gi
  let match: RegExpExecArray | null
  while ((match = fenceRegex.exec(content)) !== null) {
    const inner = match[1].trim()
    if (!inner.startsWith('{')) continue
    try {
      const parsed = JSON.parse(inner) as Record<string, unknown>
      if (parsed?.type === 'questionnaire' && Array.isArray(parsed.questions)) {
        const questions = mapRawQuestionsArray(parsed.questions)
        if (questions.length > 0) {
          return {
            questions,
            flowTitle: (parsed.title || parsed.flowTitle) as string | undefined,
          }
        }
      }
    } catch {
      // try next fence
    }
  }

  for (const marker of ['"type":"questionnaire"', '"type": "questionnaire"']) {
    const block = findJsonBlockWithMarker(content, marker)
    if (!block) continue
    try {
      const parsed = JSON.parse(block.jsonStr) as Record<string, unknown>
      if (parsed?.type === 'questionnaire' && Array.isArray(parsed.questions)) {
        const questions = mapRawQuestionsArray(parsed.questions)
        if (questions.length > 0) {
          return {
            questions,
            flowTitle: (parsed.title || parsed.flowTitle) as string | undefined,
          }
        }
      }
    } catch {
      // continue
    }
  }

  return null
}

/**
 * Normalize a single choice entry into {label, value}.
 */
function normalizeChoice(c: unknown): { label: string; value: string } {
  if (typeof c === 'string') {
    return { label: c, value: c }
  }
  if (typeof c === 'number' || typeof c === 'boolean') {
    return { label: String(c), value: String(c) }
  }
  if (c && typeof c === 'object') {
    const obj = c as Record<string, unknown>
    const label = String(obj.Label || obj.label || obj.value || obj.Value || obj.text || obj.Text || '')
    const value = String(obj.Value || obj.value || obj.Label || obj.label || obj.text || obj.Text || '')
    return { label, value }
  }
  return { label: '', value: '' }
}

/**
 * Parse questions from AI response
 * Can parse multiple question formats:
 * - {"Question": "...", "Options": [...]}
 * - {"type": "options", "question": "...", "choices": [...]}
 * - Array of question objects
 */
export function parseQuestionsFromResponse(
  content: string
): { questions: Question[]; flowTitle?: string } | null {
  const fromQuestionnaire = tryParseQuestionnaireFromContent(content)
  if (fromQuestionnaire && fromQuestionnaire.questions.length > 0) {
    return fromQuestionnaire
  }

  let pos = 0
  while (pos < content.length) {
    const braceIdx = content.indexOf('{', pos)
    const bracketIdx = content.indexOf('[', pos)

    let idx = -1
    if (braceIdx !== -1 && bracketIdx !== -1) {
      idx = Math.min(braceIdx, bracketIdx)
    } else if (braceIdx !== -1) {
      idx = braceIdx
    } else if (bracketIdx !== -1) {
      idx = bracketIdx
    }

    if (idx === -1) break

    const jsonStr = extractJsonObject(content, idx)
    if (jsonStr) {
      try {
        const parsed = JSON.parse(jsonStr)

        // Check if it's a question flow object
        if (parsed?.questions && Array.isArray(parsed.questions)) {
          const questions = mapRawQuestionsArray(parsed.questions)

          return {
            questions,
            flowTitle: parsed.title || parsed.flowTitle,
          }
        }

        // Check if it's a single question
        if (parsed?.Question || parsed?.question) {
          const questions = mapRawQuestionsArray([parsed])
          if (questions.length > 0) return { questions }
        }

        // Check if it's an array of questions
        if (Array.isArray(parsed) && parsed.length > 0 && (parsed[0]?.Question || parsed[0]?.question)) {
          const questions = mapRawQuestionsArray(parsed)
          return { questions }
        }
      } catch {
        // ignore
      }
      pos = idx + jsonStr.length
    } else {
      pos = idx + 1
    }
  }

  return null
}

/**
 * Initialize a new question flow
 */
export function initializeQuestionFlow(
  questions: Question[],
  title: string = 'Questions'
): QuestionFlow {
  return {
    id: `flow_${Date.now()}`,
    title,
    questions,
    currentQuestionIndex: 0,
    answers: {},
    isComplete: false,
  }
}

/**
 * Get the current question
 */
export function getCurrentQuestion(flow: QuestionFlow): Question | null {
  if (flow.currentQuestionIndex >= flow.questions.length) return null
  return flow.questions[flow.currentQuestionIndex]
}

/**
 * Record an answer and move to next question
 */
export function recordAnswerAndAdvance(
  flow: QuestionFlow,
  answer: string | string[] | null
): QuestionFlow {
  const currentQuestion = getCurrentQuestion(flow)
  if (!currentQuestion) return flow

  // Store the answer
  const newAnswers = { ...flow.answers, [currentQuestion.id]: answer }

  // Move to next question or mark as complete
  const nextIndex = flow.currentQuestionIndex + 1
  const isComplete = nextIndex >= flow.questions.length

  return {
    ...flow,
    answers: newAnswers,
    currentQuestionIndex: isComplete ? flow.questions.length : nextIndex,
    isComplete,
  }
}

/**
 * Format completed answers as a structured message for the AI
 */
export function formatAnswersForAI(flow: QuestionFlow): string {
  const lines: string[] = [`Answers to "${flow.title}":`]

  for (const question of flow.questions) {
    const answer = flow.answers[question.id]
    const answerText = Array.isArray(answer) ? answer.join(', ') : answer || '(Skipped)'
    lines.push(`- ${question.text}: ${answerText}`)
  }

  lines.push('')
  lines.push('Please proceed with the next steps based on these responses.')

  return lines.join('\n')
}

/**
 * Create a JSON representation of Q&A for structured AI processing
 */
export function createQAJSON(flow: QuestionFlow): Record<string, unknown> {
  const qa: Record<string, string | string[] | null> = {}

  for (const question of flow.questions) {
    qa[question.id] = flow.answers[question.id] ?? null
  }

  return {
    flow_id: flow.id,
    flow_title: flow.title,
    questions_answered: flow.questions.length,
    answers: qa,
    timestamp: new Date().toISOString(),
  }
}
