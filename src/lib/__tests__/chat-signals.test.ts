import { describe, expect, it } from 'vitest'
import {
  cleanDisplayText,
  convertToolMarkup,
  holdBackToolMarkup,
  parseAgentStatus,
  parseAllInteractiveOptions,
} from '../ai-agents'

// Real output captured from the DeepSeek API (fullwidth bars are part of it).
const LEAKED = [
  '<｜｜DSML｜｜ calls>',
  '<｜｜DSML｜｜ invoke name="agent_status" agent="Schema Architect" status="researching domain" progress="10">',
  '</｜｜DSML｜｜ parameter>',
  '</｜｜DSML｜｜ invoke>',
  '</｜｜DSML｜｜ calls>',
  '',
  'For a hospital I would model patients and doctors.',
].join('\n')

describe('convertToolMarkup', () => {
  it('turns leaked tool-call markup into a JSON signal and keeps the prose', () => {
    const out = convertToolMarkup(LEAKED)
    expect(out).not.toMatch(/DSML/)
    expect(parseAgentStatus(out)).toEqual({ agent: 'Schema Architect', status: 'researching domain', progress: 10 })
    expect(cleanDisplayText(out)).toBe('For a hospital I would model patients and doctors.')
  })

  it('handles self-closing invokes and <parameter> children', () => {
    const selfClosing = 'Hi\n<｜DSML｜invoke name="agent_status" agent="Quality Analyst" status="checking" progress="75" />\nDone'
    expect(parseAgentStatus(convertToolMarkup(selfClosing))?.agent).toBe('Quality Analyst')

    const params = [
      '<｜DSML｜function_calls>',
      '<｜DSML｜invoke name="options">',
      '<｜DSML｜parameter name="question" string="true">Which locale?</｜DSML｜parameter>',
      '<｜DSML｜parameter name="choices">[{"label":"US (recommended)"},{"label":"EU"}]</｜DSML｜parameter>',
      '</｜DSML｜invoke>',
      '</｜DSML｜function_calls>',
    ].join('\n')
    const q = parseAllInteractiveOptions(convertToolMarkup(params))
    expect(q).toHaveLength(1)
    expect(q[0].question).toBe('Which locale?')
    expect(q[0].choices.map(c => c.label)).toEqual(['US (recommended)', 'EU'])
  })

  it('drops unknown invokes and leaves normal text untouched', () => {
    expect(convertToolMarkup('plain text with a < b and <b>html</b>')).toBe('plain text with a < b and <b>html</b>')
    const unknown = 'A\n<｜DSML｜invoke name="run_sql" query="DROP TABLE x" />\nB'
    expect(convertToolMarkup(unknown)).toBe('A\n\nB')
  })
})

describe('holdBackToolMarkup (streaming)', () => {
  it('holds an unfinished tool-call block and releases it once closed', () => {
    const partial = 'Intro\n<｜｜DSML｜｜ calls>\n<｜｜DSML｜｜ invoke name="agent_status" agent="Schema'
    expect(holdBackToolMarkup(partial)).toBe('Intro\n')
    expect(holdBackToolMarkup(LEAKED)).toBe(LEAKED)
  })

  it('holds a tag that is still being written', () => {
    expect(holdBackToolMarkup('Hello <｜｜DS')).toBe('Hello ')
    expect(holdBackToolMarkup('a < b is true and more text follows here')).toBe('a < b is true and more text follows here'.slice(0, 2))
  })
})

describe('parseAllInteractiveOptions — richer questions', () => {
  it('reads header, descriptions and the recommended flag', () => {
    const text = [
      'Two quick questions:',
      '{"type":"options","header":"Modules","question":"Which areas?","multi":true,"choices":[{"label":"Clinical core (recommended)","description":"Patients, doctors"},{"label":"Billing","description":"Invoices"}]}',
      '{"type":"options","header":"Scale","question":"How much data?","choices":[{"label":"50 rows","recommended":true},{"label":"1,000 rows"},{"label":"1,000 rows"}]}',
    ].join('\n')
    const q = parseAllInteractiveOptions(text)
    expect(q).toHaveLength(2)
    expect(q[0]).toMatchObject({ header: 'Modules', multi: true })
    expect(q[0].choices[0]).toMatchObject({ label: 'Clinical core (recommended)', description: 'Patients, doctors' })
    expect(q[1].choices.map(c => c.label)).toEqual(['50 rows (recommended)', '1,000 rows'])
    expect(cleanDisplayText(text)).toBe('Two quick questions:')
  })

  it('accepts plain string choices', () => {
    const q = parseAllInteractiveOptions('{"type":"options","question":"Locale?","choices":["US","EU"]}')
    expect(q[0].choices).toEqual([{ label: 'US', value: 'US' }, { label: 'EU', value: 'EU' }])
  })
})
