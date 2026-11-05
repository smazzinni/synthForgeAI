import { describe, expect, it } from 'vitest'
import { sampleCsv, sampleJson, sampleSheets, sampleSql, sampleXml, uploadKind } from '../upload-sample'

describe('uploadKind', () => {
  it('maps extensions case-insensitively', () => {
    expect(uploadKind('a.SQL')).toBe('sql')
    expect(uploadKind('a.dump')).toBe('sql')
    expect(uploadKind('a.csv')).toBe('csv')
    expect(uploadKind('a.TSV')).toBe('csv')
    expect(uploadKind('a.json')).toBe('json')
    expect(uploadKind('a.xml')).toBe('xml')
    expect(uploadKind('a.XLSX')).toBe('excel')
  })
  it('rejects others', () => {
    for (const f of ['a.parquet', 'a.db', 'a.sqlite', 'a.bson', 'a.xls', 'a', 'a.csv.exe']) expect(uploadKind(f)).toBeNull()
  })
})

describe('sampleCsv', () => {
  it('handles quotes, escaped quotes and newlines in quotes', () => {
    const r = sampleCsv('id,name,note\n1,"Smith, J","say ""hi"""\n2,Bob,"line1\nline2"\n', { complete: true })
    expect(r.rows).toBe(2)
    expect(r.content).toBe('id,name,note\n1,"Smith, J","say ""hi"""\n2,Bob,"line1\nline2"')
  })
  it('detects semicolon and tab delimiters', () => {
    expect(sampleCsv('a;b\n1;2', { complete: true }).content).toBe('a,b\n1,2')
    expect(sampleCsv('a\tb\n1\t2', { complete: true }).content).toBe('a,b\n1,2')
  })
  it('caps at 25 rows with notes', () => {
    const text = 'id\n' + Array.from({ length: 1234 }, (_, i) => i).join('\n')
    const c = sampleCsv(text, { complete: true })
    expect(c.content.split('\n')).toHaveLength(26)
    expect(c.rows).toBe(1234)
    expect(c.note).toBe('first 25 of 1,234 rows')
    const p = sampleCsv(text, { complete: false })
    expect(p.note).toBe('first 25 rows of a larger file')
  })
})

describe('sampleJson', () => {
  it('caps arrays of objects', () => {
    const r = sampleJson(JSON.stringify(Array.from({ length: 40 }, (_, i) => ({ i }))))
    expect(JSON.parse(r.content)).toHaveLength(25)
    expect(r.rows).toBe(40)
  })
  it('treats object of arrays as tables', () => {
    const r = sampleJson(JSON.stringify({ a: Array.from({ length: 30 }, (_, i) => ({ i })), b: [{ x: 1 }] }))
    const o = JSON.parse(r.content)
    expect(o.a).toHaveLength(25)
    expect(o.b).toHaveLength(1)
  })
  it('truncates other JSON and flags partial files', () => {
    expect(sampleJson(JSON.stringify({ s: 'x'.repeat(50000) })).content.length).toBe(20000)
    const p = sampleJson('[{"a":' + 'x'.repeat(30000))
    expect(p.note).toBe('partial file')
    expect(p.content.length).toBe(20000)
  })
})

describe('sampleSql', () => {
  it('returns small files whole', () => {
    expect(sampleSql('CREATE TABLE t (id int);').content).toBe('CREATE TABLE t (id int);')
  })
  it('keeps schema and caps inserts for big files', () => {
    const inserts = Array.from({ length: 3000 }, (_, i) => `INSERT INTO t VALUES (${i}, 'a;b');`).join('\n')
    const sql = `CREATE TABLE t (\n id int\n);\nCREATE TABLE u (id int);\nALTER TABLE u\n ADD CONSTRAINT fk FOREIGN KEY (id) REFERENCES t(id);\n${inserts}`
    expect(sql.length).toBeGreaterThan(60000)
    const r = sampleSql(sql)
    expect(r.content).toContain('CREATE TABLE t')
    expect(r.content).toContain('CREATE TABLE u')
    expect(r.content).toContain('FOREIGN KEY')
    expect(r.content.match(/INSERT INTO/g)).toHaveLength(20)
    expect(r.note).toBe('schema + first 20 INSERTs')
  })
})

describe('sampleXml', () => {
  it('caps at 20000 chars', () => {
    expect(sampleXml('x'.repeat(30000)).content).toHaveLength(20000)
  })
})

describe('sampleSheets', () => {
  it('caps sheets and rows, formats dates', () => {
    const rows = [['id', 'when', 'n'], ...Array.from({ length: 40 }, (_, i) => [i, new Date('2024-01-02T03:04:05Z'), null])]
    const r = sampleSheets(Array.from({ length: 12 }, (_, i) => ({ name: `S${i}`, rows })))
    expect(r.content.match(/### Sheet:/g)).toHaveLength(10)
    expect(r.content).toContain('0,2024-01-02T03:04:05.000Z,')
    expect(r.content.split('\n\n')[0].split('\n')).toHaveLength(27)
  })
})
