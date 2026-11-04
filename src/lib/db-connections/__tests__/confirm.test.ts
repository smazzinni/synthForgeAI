import { describe, it, expect } from 'vitest'
import { needsConfirmation } from '../confirm'

describe('needsConfirmation', () => {
  it('allows safe statements', () => {
    expect(needsConfirmation('SELECT * FROM t')).toBe(false)
    expect(needsConfirmation("INSERT INTO t (a) VALUES (1)")).toBe(false)
    expect(needsConfirmation('UPDATE t SET a = 1 WHERE id = 2')).toBe(false)
  })
  it('flags destructive statements', () => {
    expect(needsConfirmation('DELETE FROM t WHERE id = 1')).toBe(true)
    expect(needsConfirmation('DROP TABLE t')).toBe(true)
    expect(needsConfirmation('TRUNCATE t')).toBe(true)
    expect(needsConfirmation('ALTER TABLE t ADD COLUMN c int')).toBe(true)
    expect(needsConfirmation('GRANT SELECT ON t TO u')).toBe(true)
    expect(needsConfirmation('UPDATE t SET a = 1')).toBe(true)
  })
  it('ignores keywords in string literals', () => {
    expect(needsConfirmation("INSERT INTO t (a) VALUES ('drop table x')")).toBe(false)
  })
  it('checks every statement', () => {
    expect(needsConfirmation('SELECT 1; DROP TABLE x')).toBe(true)
  })
})

describe('needsConfirmation — FK clauses', () => {
  it('does not flag ON DELETE CASCADE in CREATE TABLE', () => {
    expect(needsConfirmation('CREATE TABLE o (id int, u int REFERENCES users(id) ON DELETE CASCADE ON UPDATE SET NULL)')).toBe(false)
  })
})
