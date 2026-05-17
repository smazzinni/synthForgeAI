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
  // Try simple regex first (single-line, fast path)
  const simpleMatch = content.match(/\{"type"\s*:\s*"agent_status"\s*,\s*"agent"\s*:\s*"([^"]+)"\s*,\s*"status"\s*:\s*"([^"]+)"\s*,\s*"progress"\s*:\s*(\d+)\s*\}/)
  if (simpleMatch) {
    return {
      agent: simpleMatch[1],
      status: simpleMatch[2],
      progress: parseInt(simpleMatch[3], 10),
    }
  }

  // Fallback: find {"type":"agent_status" and extract the full JSON object using bracket counting
  const marker = '{"type":"agent_status"'
  const markerLoose = '{"type": "agent_status"'
  let idx = content.indexOf(marker)
  if (idx === -1) idx = content.indexOf(markerLoose)
  if (idx === -1) return null

  const jsonStr = extractJsonObject(content, idx)
  if (!jsonStr) return null

  try {
    const parsed = JSON.parse(jsonStr)
    if (parsed?.type === 'agent_status' && parsed.agent && parsed.status) {
      return {
        agent: String(parsed.agent),
        status: String(parsed.status),
        progress: Number(parsed.progress) || 0,
      }
    }
  } catch {
    // Not parseable
  }

  return null
}

/**
 * Parse ALL interactive options blocks from AI response content.
 * Returns an array of InteractiveOptions found in the content.
 */
export function parseAllInteractiveOptions(content: string): InteractiveOptions[] {
  const results: InteractiveOptions[] = []

  // Find all occurrences of {"type":"options" and extract each one
  const markerStrict = '{"type":"options"'
  const markerLoose = '{"type": "options"'

  let searchFrom = 0
  while (searchFrom < content.length) {
    let idx = content.indexOf(markerStrict, searchFrom)
    if (idx === -1) idx = content.indexOf(markerLoose, searchFrom)
    if (idx === -1) break

    const jsonStr = extractJsonObject(content, idx)
    if (jsonStr) {
      try {
        const parsed = JSON.parse(jsonStr)
        if (parsed?.type === 'options' && Array.isArray(parsed.choices)) {
          results.push({
            question: String(parsed.question || ''),
            choices: parsed.choices.map((c: { label?: string; value?: string }) => ({
              label: String(c.label || c.value || ''),
              value: String(c.value || c.label || ''),
            })),
            multi: Boolean(parsed.multi),
          })
        }
      } catch {
        // Not parseable, skip
      }
      searchFrom = idx + jsonStr.length
    } else {
      searchFrom = idx + markerStrict.length
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

export function parseInteractiveOptions(content: string): InteractiveOptions | null {
  const all = parseAllInteractiveOptions(content)
  return all.length > 0 ? all[all.length - 1] : null
}

/**
 * Remove ALL agent_status and options JSON blocks from display text.
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

  // Remove follow_up and recommendation blocks
  const followUpMarker = '{"type":"follow_up"'
  const followUpMarkerLoose = '{"type": "follow_up"'
  cleaned = removeJsonBlocks(cleaned, followUpMarker, followUpMarkerLoose)

  const recMarker = '{"type":"recommendation"'
  const recMarkerLoose = '{"type": "recommendation"'
  cleaned = removeJsonBlocks(cleaned, recMarker, recMarkerLoose)

  // Remove any standalone JSON-like lines that look like agent commands (single-line fallback)
  cleaned = cleaned.replace(/^\s*\{"type"\s*:\s*"(?:agent_status|options|follow_up|recommendation)"[^}]*\}\s*$/gm, '')

  // Remove empty code fences left after JSON extraction
  cleaned = cleaned.replace(/```\s*\n?\s*```/g, '')

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
 * Check if a SQL statement is destructive (DELETE, DROP, TRUNCATE, mass UPDATE)
 */
export function isDestructiveSQL(sql: string): boolean {
  const normalized = sql.trim().toUpperCase()
  return (
    normalized.startsWith('DELETE') ||
    normalized.startsWith('DROP') ||
    normalized.startsWith('TRUNCATE') ||
    (normalized.startsWith('UPDATE') && !normalized.includes('WHERE'))
  )
}

/**
 * Get agent definition by name (fuzzy match)
 */
export function getAgentByName(name: string): AgentDef | null {
  const normalized = name.toLowerCase().replace(/\s+/g, '_')
  for (const agent of AGENT_LIST) {
    if (agent.id === normalized || agent.name.toLowerCase() === name.toLowerCase()) {
      return agent
    }
  }
  return AI_AGENTS.orchestrator
}
