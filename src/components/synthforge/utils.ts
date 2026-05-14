// ─── Utility Functions ──────────────────────────────────

import { IRREGULAR_PLURALS } from './constants'

export function resolveFkReference(fkColName: string, allTableNames: Set<string>): string | null {
  const base = fkColName.replace(/_id$/, '')
  if (IRREGULAR_PLURALS[base] && allTableNames.has(IRREGULAR_PLURALS[base])) return IRREGULAR_PLURALS[base]
  const simplePlural = base + 's'
  if (allTableNames.has(simplePlural)) return simplePlural
  if (allTableNames.has(base)) return base
  if (base.endsWith('y') && !['a','e','i','o','u'].includes(base[base.length - 2])) {
    const iesForm = base.slice(0, -1) + 'ies'
    if (allTableNames.has(iesForm)) return iesForm
  }
  for (const name of allTableNames) {
    if (name.toLowerCase() === simplePlural.toLowerCase()) return name
    if (name.toLowerCase() === base.toLowerCase()) return name
  }
  return null
}

export async function copyToClipboard(text: string): Promise<void> {
  await navigator.clipboard.writeText(text)
}
