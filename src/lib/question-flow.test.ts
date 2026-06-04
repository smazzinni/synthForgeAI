import { describe, expect, it } from 'vitest'
import { parseQuestionsFromResponse } from './question-flow'

describe('parseQuestionsFromResponse', () => {
  it('parses type questionnaire from fenced JSON', () => {
    const content = `Here is your setup.

\`\`\`json
{
  "type": "questionnaire",
  "title": "Shape your database",
  "questions": [
    {
      "id": "a",
      "question": "Q1?",
      "type": "single_choice",
      "customAnswerAllowed": true,
      "choices": [
        { "label": "One", "value": "1" },
        { "label": "Two", "value": "2" },
        { "label": "Three", "value": "3" },
        { "label": "Four", "value": "4" }
      ]
    },
    {
      "id": "b",
      "question": "More?",
      "type": "text_input",
      "required": false,
      "skipOption": true
    }
  ]
}
\`\`\`
`
    const result = parseQuestionsFromResponse(content)
    expect(result).not.toBeNull()
    expect(result!.flowTitle).toBe('Shape your database')
    expect(result!.questions).toHaveLength(2)
    expect(result!.questions[0].text).toBe('Q1?')
    expect(result!.questions[0].options).toHaveLength(4)
    expect(result!.questions[0].customAnswerAllowed).toBe(true)
    expect(result!.questions[1].type).toBe('text_input')
    expect(result!.questions[1].required).toBe(false)
    expect(result!.questions[1].skipOption).toBe(true)
  })

  it('parses inline questionnaire JSON', () => {
    const content = `Intro
{"type":"questionnaire","title":"T","questions":[{"id":"x","question":"Pick","type":"single_choice","choices":[{"label":"A","value":"a"},{"label":"B","value":"b"},{"label":"C","value":"c"},{"label":"D","value":"d"}]}]}
`
    const result = parseQuestionsFromResponse(content)
    expect(result?.questions).toHaveLength(1)
    expect(result?.questions[0].options?.length).toBe(4)
  })
})
