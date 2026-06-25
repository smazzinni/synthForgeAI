import { describe, expect, it } from 'vitest'
import {
  mergeTableUpdates,
  parseCsvImport,
  parseJsonImport,
  parseSqlImport,
} from './import-parser'

describe('parseJsonImport', () => {
  it('parses { tables: { ... } }', () => {
    const content = JSON.stringify({
      tables: {
        students: [{ id: '1', name: 'Ada' }],
      },
    })
    const result = parseJsonImport(content, 'school.json')
    expect(result.dataJson.students).toHaveLength(1)
    expect(result.schemaJson[0].name).toBe('students')
  })

  it('parses top-level table map without tables wrapper', () => {
    const content = JSON.stringify({
      students: [{ id: '1', name: 'Ada' }],
      teachers: [{ id: '2', name: 'Grace' }],
    })
    const result = parseJsonImport(content, 'school.json')
    expect(Object.keys(result.dataJson)).toEqual(['students', 'teachers'])
  })

  it('parses a single array as one table', () => {
    const content = JSON.stringify([{ id: '1', name: 'Ada' }])
    const result = parseJsonImport(content, 'students.json')
    expect(result.dataJson.students).toHaveLength(1)
  })
})

describe('parseSqlImport', () => {
  it('parses CREATE TABLE and INSERT statements', () => {
    const sql = `
CREATE TABLE students (
  id uuid,
  name varchar(255)
);

INSERT INTO students (id, name) VALUES ('11111111-1111-1111-1111-111111111111', 'Ada');
`
    const result = parseSqlImport(sql, 'school.sql')
    expect(result.dataJson.students).toHaveLength(1)
    expect(result.schemaJson[0].columns.map((c) => c.name)).toEqual([
      'id',
      'name',
    ])
  })
})

describe('parseCsvImport', () => {
  it('parses header and rows', () => {
    const csv = 'id,name\n1,Ada\n2,Grace\n'
    const result = parseCsvImport(csv, 'students.csv')
    expect(result.dataJson.students).toHaveLength(2)
    expect(result.dataJson.students[0].name).toBe('Ada')
  })
})

describe('mergeTableUpdates', () => {
  it('merges partial AI updates into existing tables', () => {
    const existing = {
      students: [{ id: '1' }],
      teachers: [{ id: '2' }],
    }
    const fromAI = {
      books: [{ id: '3', title: 'Math' }],
    }
    const merged = mergeTableUpdates(existing, fromAI)
    expect(merged.students).toHaveLength(1)
    expect(merged.teachers).toHaveLength(1)
    expect(merged.books).toHaveLength(1)
  })

  it('replaces all tables when AI returns a full snapshot', () => {
    const existing = { students: [{ id: '1' }] }
    const fromAI = {
      students: [{ id: '1' }, { id: '2' }],
      teachers: [],
    }
    const merged = mergeTableUpdates(existing, fromAI)
    expect(merged).toEqual(fromAI)
  })
})
