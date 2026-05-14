'use client'

import React, { useCallback } from 'react'

// ─── SQL Syntax Highlighting ────────────────────────────
export function useSQLHighlight() {
  const highlightSQL = useCallback((sql: string): React.ReactNode => {
    if (!sql) return null
    const keywords = /\b(SELECT|FROM|WHERE|JOIN|LEFT JOIN|RIGHT JOIN|INNER JOIN|OUTER JOIN|FULL JOIN|CROSS JOIN|ON|AND|OR|NOT|IN|IS|NULL|LIKE|BETWEEN|EXISTS|DISTINCT|LIMIT|OFFSET|ORDER BY|GROUP BY|HAVING|AS|INSERT INTO|VALUES|UPDATE|SET|DELETE FROM|CREATE TABLE|ALTER TABLE|DROP TABLE|ADD|COLUMN|PRIMARY KEY|FOREIGN KEY|REFERENCES|CONSTRAINT|UNIQUE|CHECK|DEFAULT|INDEX|SERIAL|INTEGER|VARCHAR|TEXT|BOOLEAN|TIMESTAMP|DATE|DECIMAL|FLOAT|NUMERIC|CASCADE|RESTRICT|UNION|ALL|CASE|WHEN|THEN|ELSE|END|ASC|DESC|COUNT|SUM|AVG|MIN|MAX|ROUND|COALESCE|IF|IFNULL|CAST|INT|BIGINT|SMALLINT|CHAR|DOUBLE|REAL|BOOL|TRUE|FALSE)\b/gi
    const parts: React.ReactNode[] = []
    let lastIndex = 0
    let match
    const tempRegex = new RegExp(keywords.source, keywords.flags)
    while ((match = tempRegex.exec(sql)) !== null) {
      if (match.index > lastIndex) {
        parts.push(<span key={lastIndex} className="text-foreground">{sql.slice(lastIndex, match.index)}</span>)
      }
      const isType = ['SERIAL','INTEGER','VARCHAR','TEXT','BOOLEAN','TIMESTAMP','DATE','DECIMAL','FLOAT','NUMERIC','INT','BIGINT','SMALLINT','CHAR','DOUBLE','REAL','BOOL'].includes(match[0].toUpperCase())
      const isFunc = ['COUNT','SUM','AVG','MIN','MAX','ROUND','COALESCE','CAST'].includes(match[0].toUpperCase())
      const isConstant = ['TRUE','FALSE','NULL'].includes(match[0].toUpperCase())
      let colorClass = 'text-amber-700 font-semibold'
      if (isType) colorClass = 'text-emerald-700'
      if (isFunc) colorClass = 'text-sky-700'
      if (isConstant) colorClass = 'text-red-700'
      parts.push(<span key={match.index} className={colorClass}>{match[0]}</span>)
      lastIndex = match.index + match[0].length
    }
    if (lastIndex < sql.length) {
      parts.push(<span key={lastIndex} className="text-foreground">{sql.slice(lastIndex)}</span>)
    }
    return <>{parts}</>
  }, [])

  return { highlightSQL }
}

// ─── SQL Validation ──────────────────────────────────
export function useSQLValidation() {
  const validateSql = useCallback((sql: string, setSqlValidationError: (error: string) => void) => {
    if (!sql.trim()) {
      setSqlValidationError('')
      return
    }
    let parenCount = 0
    for (const char of sql) {
      if (char === '(') parenCount++
      if (char === ')') parenCount--
      if (parenCount < 0) {
        setSqlValidationError('Unbalanced parentheses: extra closing ")"')
        return
      }
    }
    if (parenCount > 0) {
      setSqlValidationError(`Unbalanced parentheses: missing ${parenCount} closing ")"`)
      return
    }
    const upperSql = sql.toUpperCase().trim()
    if (upperSql.endsWith('FROM') || upperSql.endsWith('SELECT') || upperSql.endsWith('WHERE') || upperSql.endsWith('JOIN') || upperSql.endsWith('ON')) {
      setSqlValidationError('Query appears incomplete (ends with a keyword)')
      return
    }
    setSqlValidationError('')
  }, [])

  return { validateSql }
}
