import { isDestructiveSQL, stripSqlComments } from '@/lib/ai-agents'

/**
 * True when the SQL can modify/delete data or privileges and the user must
 * explicitly confirm before it runs against their live database.
 */
export function needsConfirmation(sql: string): boolean {
  const stripped = stripSqlComments(sql).trim()
  if (isDestructiveSQL(stripped)) return true
  const noLiterals = stripped.replace(/'(?:[^']|'')*'/g, "''")
    // FK actions in DDL (ON DELETE CASCADE / ON UPDATE SET NULL) are not data changes.
    .replace(/\bON\s+(DELETE|UPDATE)\b/gi, 'ON_FK_ACTION')
  if (/\b(DROP|TRUNCATE|ALTER|DELETE|GRANT|REVOKE)\b/i.test(noLiterals)) return true
  return noLiterals
    .split(';')
    .some(s => /\bUPDATE\b[\s\S]*?\bSET\b/i.test(s) && !/\bWHERE\b/i.test(s))
}
