/**
 * AI Agent definitions and skills for SynthForge AI multi-agent pipeline.
 * Each agent has a name, color, icon, and specialized system prompt additions.
 */

export interface AgentDef {
  id: string
  name: string
  color: string
  bgColor: string
  textColor: string
  borderColor: string
  icon: string
  description: string
  systemPromptAddition: string
}

export const AI_AGENTS: Record<string, AgentDef> = {
  orchestrator: {
    id: 'orchestrator',
    name: 'Orchestrator',
    color: 'from-amber-500 to-red-600',
    bgColor: 'bg-amber-100 dark:bg-amber-900/30',
    textColor: 'text-amber-700 dark:text-amber-400',
    borderColor: 'border-amber-300 dark:border-amber-700',
    icon: 'Sparkles',
    description: 'Coordinates the multi-agent pipeline',
    systemPromptAddition: 'You are the Orchestrator agent. You coordinate between sub-agents and present a unified response to the user. You decide which specialist agent should handle each part of the request.',
  },
  schema_architect: {
    id: 'schema_architect',
    name: 'Schema Architect',
    color: 'from-violet-500 to-purple-600',
    bgColor: 'bg-violet-100 dark:bg-violet-900/30',
    textColor: 'text-violet-700 dark:text-violet-400',
    borderColor: 'border-violet-300 dark:border-violet-700',
    icon: 'GitBranch',
    description: 'Designs database schemas and relationships',
    systemPromptAddition: 'You are the Schema Architect agent. You specialize in designing database schemas with proper table relationships, foreign keys, constraints, and normalization. When designing schemas, consider the business domain carefully.',
  },
  data_generator: {
    id: 'data_generator',
    name: 'Data Generator',
    color: 'from-emerald-500 to-teal-600',
    bgColor: 'bg-emerald-100 dark:bg-emerald-900/30',
    textColor: 'text-emerald-700 dark:text-emerald-400',
    borderColor: 'border-emerald-300 dark:border-emerald-700',
    icon: 'Database',
    description: 'Creates realistic synthetic data rows',
    systemPromptAddition: 'You are the Data Generator agent. You specialize in creating realistic synthetic data. You ensure data is internally consistent, uses realistic names/addresses/emails, maintains referential integrity, and follows industry-specific patterns.',
  },
  quality_analyst: {
    id: 'quality_analyst',
    name: 'Quality Analyst',
    color: 'from-sky-500 to-blue-600',
    bgColor: 'bg-sky-100 dark:bg-sky-900/30',
    textColor: 'text-sky-700 dark:text-sky-400',
    borderColor: 'border-sky-300 dark:border-sky-700',
    icon: 'CheckCircle2',
    description: 'Validates data quality and consistency',
    systemPromptAddition: 'You are the Quality Analyst agent. You validate data quality, check for consistency, verify referential integrity, and ensure data realism. You flag any issues with the generated data.',
  },
  privacy_officer: {
    id: 'privacy_officer',
    name: 'Privacy Officer',
    color: 'from-rose-500 to-pink-600',
    bgColor: 'bg-rose-100 dark:bg-rose-900/30',
    textColor: 'text-rose-700 dark:text-rose-400',
    borderColor: 'border-rose-300 dark:border-rose-700',
    icon: 'Shield',
    description: 'Ensures privacy compliance',
    systemPromptAddition: 'You are the Privacy Officer agent. You ensure all generated data is privacy-compliant, contains no real PII, follows GDPR/CCPA guidelines, and uses proper anonymization techniques.',
  },
}

export const AGENT_LIST = Object.values(AI_AGENTS)

/**
 * Helper: Extract a complete JSON object from a string starting at a given position.
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

  // If we got here, brackets don't balance — return what we have
  if (depth <= 0) {
    return content.substring(startIndex)
  }
  return null
}

/**
 * Parse agent status from AI response content.
 * The AI may embed JSON blocks like:
 * {"type":"agent_status","agent":"Schema Architect","status":"designing","progress":30}
 * These may span multiple lines or have slight format variations.
 */
export interface AgentStatus {
  agent: string
  status: string
  progress: number
}

export function parseAgentStatus(content: string): AgentStatus | null {
  // Return the LAST valid agent_status object (the most recent progress).
  let last: AgentStatus | null = null
  for (const m of content.matchAll(/\{\s*"type"\s*:\s*"agent_status"/g)) {
    const jsonStr = extractJsonObject(content, m.index!)
    if (!jsonStr) continue
    try {
      const parsed = JSON.parse(jsonStr)
      if (parsed?.type === 'agent_status' && parsed.agent && parsed.status) {
        last = {
          agent: String(parsed.agent),
          status: String(parsed.status),
          progress: Number(parsed.progress) || 0,
        }
      }
    } catch {
      // Not parseable
    }
  }
  return last
}

/**
 * Parse ALL interactive options blocks from AI response content.
 * Returns an array of InteractiveOptions found in the content.
 */
export function parseAllInteractiveOptions(content: string): InteractiveOptions[] {
  const results: InteractiveOptions[] = []

  // Find all occurrences of {"type":"options" or {"options":{ and extract each one
  // The AI sometimes emits {"type":"options",...} and sometimes {"options":{...}}
  const markers = [
    '{"type":"options"',
    '{"type": "options"',
    '{"options":',
    '{"options": ',
  ]

  let searchFrom = 0
  while (searchFrom < content.length) {
    // Find the earliest marker from the current position
    let earliestIdx = -1
    let earliestMarker = ''
    for (const marker of markers) {
      const idx = content.indexOf(marker, searchFrom)
      if (idx !== -1 && (earliestIdx === -1 || idx < earliestIdx)) {
        earliestIdx = idx
        earliestMarker = marker
      }
    }
    if (earliestIdx === -1) break

    const jsonStr = extractJsonObject(content, earliestIdx)
    if (jsonStr) {
      try {
        const parsed = JSON.parse(jsonStr)
        // Handle both {"type":"options",...} and {"options":{...}} formats
        const opts = parsed?.type === 'options' ? parsed : (parsed?.options || null)
        if (opts && Array.isArray(opts.choices)) {
          results.push({
            question: String(opts.question || ''),
            choices: opts.choices.map((c: { label?: string; value?: string }) => ({
              label: String(c.label || c.value || ''),
              value: String(c.value || c.label || ''),
            })),
            multi: Boolean(opts.multi),
          })
        }
      } catch {
        // Not parseable, skip
      }
      searchFrom = earliestIdx + jsonStr.length
    } else {
      searchFrom = earliestIdx + earliestMarker.length
    }
  }

  return results
}

/**
 * Parse interactive options from AI response (returns the LAST one found).
 * The AI may embed JSON blocks like:
 * {"type":"options","question":"What industry?","choices":[{"label":"E-commerce","value":"ecommerce"},...],"multi":false}
 * These may span multiple lines.
 */
export interface OptionChoice {
  label: string
  value: string
}

export interface InteractiveOptions {
  question: string
  choices: OptionChoice[]
  multi: boolean
}

// ─── BEGIN_GENERATION signal types ───
export interface BeginGenerationSignal {
  action: 'BEGIN_GENERATION'
  schema: Array<{ name: string; columns: Array<{ name: string; type: string }> }>
  rowCounts: Record<string, number>
  instructions?: string
  databaseName?: string
}

/**
 * Parse BEGIN_GENERATION signal from AI response content.
 * The AI emits this when it has enough context and is ready to generate data.
 * Signal format: {"action":"BEGIN_GENERATION","schema":[...],"rowCounts":{...},"instructions":"..."}
 * This signal must be intercepted by the frontend and never shown to the user.
 */
export function parseBeginGeneration(content: string): BeginGenerationSignal | null {
  // Try strict marker first
  const markerStrict = '{"action":"BEGIN_GENERATION"'
  const markerLoose = '{"action": "BEGIN_GENERATION"'

  let idx = content.indexOf(markerStrict)
  const idxLoose = content.indexOf(markerLoose)
  if (idx === -1 || (idxLoose !== -1 && idxLoose < idx)) idx = idxLoose
  if (idx === -1) return null

  const jsonStr = extractJsonObject(content, idx)
  if (!jsonStr) return null

  try {
    const parsed = JSON.parse(jsonStr)
    if (parsed?.action === 'BEGIN_GENERATION' && Array.isArray(parsed.schema)) {
      return {
        action: 'BEGIN_GENERATION',
        schema: parsed.schema,
        rowCounts: parsed.rowCounts || {},
        instructions: parsed.instructions || undefined,
        databaseName: parsed.databaseName || parsed.database_name || undefined,
      }
    }
  } catch {
    // Not parseable
  }

  return null
}

/**
 * Remove ALL agent_status, options, and BEGIN_GENERATION JSON blocks from display text.
 * Handles multiline JSON, nested objects, and various format variations.
 */
export function cleanDisplayText(content: string): string {
  let cleaned = content

  // Remove agent_status blocks — find each one and remove it
  const agentStatusMarker = '{"type":"agent_status"'
  const agentStatusMarkerLoose = '{"type": "agent_status"'
  cleaned = removeJsonBlocks(cleaned, agentStatusMarker, agentStatusMarkerLoose)

  // Remove options blocks — find each one and remove it
  const optionsMarker = '{"type":"options"'
  const optionsMarkerLoose = '{"type": "options"'
  cleaned = removeJsonBlocks(cleaned, optionsMarker, optionsMarkerLoose)
  cleaned = removeJsonBlocks(cleaned, '{"options":{', '{"options": {')

  // Remove follow_up and recommendation blocks
  const followUpMarker = '{"type":"follow_up"'
  const followUpMarkerLoose = '{"type": "follow_up"'
  cleaned = removeJsonBlocks(cleaned, followUpMarker, followUpMarkerLoose)

  const recMarker = '{"type":"recommendation"'
  const recMarkerLoose = '{"type": "recommendation"'
  cleaned = removeJsonBlocks(cleaned, recMarker, recMarkerLoose)

  // Remove BEGIN_GENERATION signal blocks
  const beginGenMarker = '{"action":"BEGIN_GENERATION"'
  const beginGenMarkerLoose = '{"action": "BEGIN_GENERATION"'
  cleaned = removeJsonBlocks(cleaned, beginGenMarker, beginGenMarkerLoose)

  // Remove any standalone JSON-like lines that look like agent commands (single-line fallback)
  cleaned = cleaned.replace(/^\s*\{"(?:type"\s*:\s*"(?:agent_status|options|follow_up|recommendation)"|action"\s*:\s*"BEGIN_GENERATION")[^}]*\}\s*$/gm, '')

  // Remove empty code fences left after JSON extraction
  cleaned = cleaned.replace(/```(?:json)?\s*\n?\s*```/g, '')

  // Remove orphaned code fences with only whitespace or JSON commands
  cleaned = cleaned.replace(/```(?:json)?\s*\n?\s*\{"type"\s*:\s*"(?:agent_status|options)"[\s\S]*?\n?\s*```/g, '')

  return cleaned.trim()
}

/**
 * Remove all JSON blocks starting with a given marker from the content.
 */
function removeJsonBlocks(content: string, marker: string, markerLoose: string): string {
  let result = content
  let safety = 0

  while (safety < 100) {
    let idx = result.indexOf(marker)
    const idxLoose = result.indexOf(markerLoose)
    if (idx === -1 || (idxLoose !== -1 && idxLoose < idx)) idx = idxLoose
    if (idx === -1) break

    const jsonStr = extractJsonObject(result, idx)
    if (jsonStr) {
      result = result.substring(0, idx) + result.substring(idx + jsonStr.length)
    } else {
      // Can't extract, try removing a reasonable chunk
      const endGuess = result.indexOf('}', idx + marker.length + 200)
      if (endGuess !== -1) {
        result = result.substring(0, idx) + result.substring(endGuess + 1)
      } else {
        break
      }
    }
    safety++
  }

  return result
}

/**
 * Strip SQL line comments (`-- ...`) and block comments (`/* ... *\/`)
 * from a SQL string. Used so that destructive-statement detection and
 * statement-type classification work on SQL that the AI prefixes with
 * explanatory comments (which is the format the chat route's system
 * prompt instructs the AI to produce).
 *
 * The function preserves string literals — `--` inside a quoted string
 * is NOT treated as a comment.
 */
export function stripSqlComments(sql: string): string {
  let result = ''
  let i = 0
  let inSingle = false
  const len = sql.length

  while (i < len) {
    const ch = sql[i]
    const next = sql[i + 1]

    // Toggle string-literal state. Escape sequences inside strings are
    // handled by simply copying the next char.
    if (ch === "'" && !inSingle) {
      inSingle = true
      result += ch
      i++
      continue
    }
    if (ch === "'" && inSingle) {
      // Doubled single quote = escaped quote, NOT end of string
      if (next === "'") {
        result += "''"
        i += 2
        continue
      }
      inSingle = false
      result += ch
      i++
      continue
    }

    if (inSingle) {
      result += ch
      i++
      continue
    }

    // Line comment: `-- ...` until end of line
    if (ch === '-' && next === '-') {
      // Skip to end of line (or end of string)
      while (i < len && sql[i] !== '\n') i++
      // Preserve the newline so line numbers / statement splitting still work
      if (i < len) { result += '\n'; i++ }
      continue
    }

    // Block comment: `/* ... */`
    if (ch === '/' && next === '*') {
      i += 2
      while (i < len && !(sql[i] === '*' && sql[i + 1] === '/')) i++
      i += 2 // skip the closing `*/`
      if (i > len) i = len
      result += ' '
      continue
    }

    result += ch
    i++
  }

  return result
}

/**
 * Check if a SQL statement is destructive (DELETE, DROP, TRUNCATE, mass UPDATE).
 *
 * This function correctly handles:
 *   - SQL with leading comments (`-- DESTRUCTIVE: ...\nDROP TABLE x`)
 *   - Multi-statement SQL (`SELECT 1; DROP TABLE x;`)
 *   - `WHERE` keywords inside comments (no longer matches them)
 *
 * Comments and string literals are stripped before analysis so the
 * detection reflects the actual SQL semantics.
 */
export function isDestructiveSQL(sql: string): boolean {
  const noComments = stripSqlComments(sql)
  // Strip string literals so `WHERE` inside a string value doesn't fool us
  const noStrings = noComments.replace(/'[^']*'/g, "''")
  const statements = noStrings.split(';').map(s => s.trim()).filter(Boolean)

  return statements.some(stmt => {
    const upper = stmt.toUpperCase()
    return (
      upper.startsWith('DELETE') ||
      upper.startsWith('DROP') ||
      upper.startsWith('TRUNCATE') ||
      // Mass UPDATE (no WHERE clause) — destructive because it affects every row
      (upper.startsWith('UPDATE') && !upper.includes('WHERE'))
    )
  })
}

/**
 * Get agent definition by name (fuzzy match).
 *
 * BUGFIX (BUG-59): returns `null` for unknown agent names instead of
 * defaulting to the Orchestrator. This prevents typos emitted by the AI
 * from being silently masked — callers can now render a fallback icon
 * explicitly when the agent isn't recognized.
 */
export function getAgentByName(name: string): AgentDef | null {
  if (!name) return null
  const normalized = name.toLowerCase().replace(/\s+/g, '_')
  for (const agent of AGENT_LIST) {
    if (agent.id === normalized || agent.name.toLowerCase() === name.toLowerCase()) {
      return agent
    }
  }
  return null
}
