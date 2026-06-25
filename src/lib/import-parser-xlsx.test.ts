import { describe, expect, it } from 'vitest'
import * as XLSX from 'xlsx'
import { parseXlsxBuffer } from './import-parser-xlsx'

function buildWorkbookBuffer(
  sheets: Record<string, Record<string, unknown>[]>,
): ArrayBuffer {
  const workbook = XLSX.utils.book_new()
  for (const [name, rows] of Object.entries(sheets)) {
    const ws = XLSX.utils.json_to_sheet(rows)
    XLSX.utils.book_append_sheet(workbook, ws, name)
  }
  const out = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' })
  const bytes = out instanceof Uint8Array ? out : new Uint8Array(out as ArrayBuffer)
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
}

describe('parseXlsxBuffer', () => {
  it('parses each worksheet as a table', () => {
    const buffer = buildWorkbookBuffer({
      students: [
        { id: '1', name: 'Ada' },
        { id: '2', name: 'Grace' },
      ],
      teachers: [{ id: '10', name: 'Alan' }],
    })

    const result = parseXlsxBuffer(buffer, 'school.xlsx')
    expect(result.dataJson.students).toHaveLength(2)
    expect(result.dataJson.teachers).toHaveLength(1)
    expect(result.schemaJson.map((t) => t.name).sort()).toEqual([
      'students',
      'teachers',
    ])
    expect(result.suggestedName).toBe('school')
  })
})
