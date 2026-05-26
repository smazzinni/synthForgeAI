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
 * Find and extract a JSON object from content that contains a specific marker.
 * Searches backwards from the marker to find the enclosing '{'.
 */
function findJsonBlockWithMarker(content: string, marker: string): { jsonStr: string; startIndex: number } | null {
  let pos = 0
  while (true) {
    const markerIdx = content.indexOf(marker, pos)
    if (markerIdx === -1) break

    // Search backwards for '{'
    let braceIdx = content.lastIndexOf('{', markerIdx)
    while (braceIdx !== -1) {
      const jsonStr = extractJsonObject(content, braceIdx)
      if (jsonStr) {
        if (jsonStr.includes(marker)) {
          return { jsonStr, startIndex: braceIdx }
        }
      }
      braceIdx = content.lastIndexOf('{', braceIdx - 1)
    }
    pos = markerIdx + marker.length
  }
  return null
}

/**
 * Find all JSON blocks containing a specific marker.
 */
function findAllJsonBlocksWithMarker(content: string, marker: string): Array<{ jsonStr: string; startIndex: number }> {
  const results: Array<{ jsonStr: string; startIndex: number }> = []
  let pos = 0
  const seenStarts = new Set<number>()

  while (true) {
    const markerIdx = content.indexOf(marker, pos)
    if (markerIdx === -1) break

    // Search backwards for '{'
    let braceIdx = content.lastIndexOf('{', markerIdx)
    while (braceIdx !== -1) {
      if (!seenStarts.has(braceIdx)) {
        const jsonStr = extractJsonObject(content, braceIdx)
        if (jsonStr) {
          if (jsonStr.includes(marker)) {
            results.push({ jsonStr, startIndex: braceIdx })
            seenStarts.add(braceIdx)
            break
          }
        }
      }
      braceIdx = content.lastIndexOf('{', braceIdx - 1)
    }
    pos = markerIdx + marker.length
  }
  return results
}

/**
 * Remove all JSON blocks containing a marker from content.
 */
function removeJsonBlocksWithMarker(content: string, marker: string): string {
  let result = content
  let safety = 0

  while (safety < 100) {
    const block = findJsonBlockWithMarker(result, marker)
    if (!block) break

    result = result.substring(0, block.startIndex) + result.substring(block.startIndex + block.jsonStr.length)
    safety++
  }

  return result
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
  const result = findJsonBlockWithMarker(content, '"agent_status"')
  if (!result) return null

  try {
    const parsed = JSON.parse(result.jsonStr)
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
 * Normalize a single choice entry into {label, value}.
 * Handles plain strings, objects with various key names, etc.
 */
function normalizeChoice(c: unknown): { label: string; value: string } {
  if (typeof c === 'string') {
    return { label: c, value: c }
  }
  if (typeof c === 'number' || typeof c === 'boolean') {
    return { label: String(c), value: String(c) }
  }
  if (c && typeof c === 'object') {
    const obj = c as Record<string, unknown>
    const label = String(obj.Label || obj.label || obj.value || obj.Value || obj.text || obj.Text || '')
    const value = String(obj.Value || obj.value || obj.Label || obj.label || obj.text || obj.Text || '')
    return { label, value }
  }
  return { label: '', value: '' }
}

/**
 * Parse ALL interactive options blocks from AI response content.
 * Returns an array of InteractiveOptions found in the content.
 */
export function parseAllInteractiveOptions(content: string): InteractiveOptions[] {
  const results: InteractiveOptions[] = []

  const blocks = findAllJsonBlocksWithMarker(content, '"options"')
  for (const block of blocks) {
    try {
      const parsed = JSON.parse(block.jsonStr)
      if (parsed?.type === 'options' && Array.isArray(parsed.choices)) {
        results.push({
          question: String(parsed.question || ''),
          choices: parsed.choices.map(normalizeChoice),
          multi: Boolean(parsed.multi),
          skip: Boolean(parsed.skip),
          customAnswer: Boolean(parsed.customAnswer),
          note: parsed.note ? String(parsed.note) : undefined,
        })
      }
    } catch {
      // Not parseable, skip
    }
  }

  // Also detect question-style JSON blocks using keys like "Question" / "Options"
  const questionMarkers = ['"Question"', '"question"']
  for (const qm of questionMarkers) {
    const blocks = findAllJsonBlocksWithMarker(content, qm)
    for (const block of blocks) {
      try {
        const parsed = JSON.parse(block.jsonStr)
        const q = parsed.Question || parsed.question || null
        const opts = parsed.Options || parsed.options || parsed.Choices || parsed.choices || null
        if (q && Array.isArray(opts)) {
          // Avoid duplicates if we already parsed this brace
          if (!results.some(r => r.question === String(q))) {
            results.push({
              question: String(q),
              choices: opts.map(normalizeChoice),
              multi: Boolean(parsed.multi || parsed.Multi),
              skip: Boolean(parsed.Skip || parsed.skip),
              customAnswer: Boolean(parsed.CustomAnswer || parsed.customAnswer),
              note: parsed.Note || parsed.note ? String(parsed.Note || parsed.note) : undefined,
            })
          }
        }
      } catch {
        // ignore
      }
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
  skip?: boolean
  customAnswer?: boolean
  note?: string
}

export function parseInteractiveOptions(content: string): InteractiveOptions | null {
  const all = parseAllInteractiveOptions(content)
  return all.length > 0 ? all[all.length - 1] : null
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
  const result = findJsonBlockWithMarker(content, '"BEGIN_GENERATION"')
  if (!result) return null

  try {
    const parsed = JSON.parse(result.jsonStr)
    if (typeof parsed?.action === 'string' && String(parsed.action).toUpperCase() === 'BEGIN_GENERATION' && Array.isArray(parsed.schema)) {
      return {
        action: 'BEGIN_GENERATION',
        schema: parsed.schema,
        rowCounts: parsed.rowCounts || {},
        instructions: parsed.instructions || undefined,
        // Accept both camelCase and snake_case since the AI may use either
        databaseName: parsed.databaseName || parsed.database_name || undefined,
      }
    }
  } catch {
    // Not parseable
  }

  return null
}

export interface AgentControlAction {
  action: 'RESTORE_SNAPSHOT' | 'CREATE_SNAPSHOT' | 'LIST_SNAPSHOTS' | 'GET_SNAPSHOT'
  databaseId?: string
  snapshotId?: string
  name?: string
  reason?: string
}

export function parseAgentControlAction(content: string): AgentControlAction | null {
  const actions: AgentControlAction['action'][] = ['RESTORE_SNAPSHOT', 'CREATE_SNAPSHOT', 'LIST_SNAPSHOTS', 'GET_SNAPSHOT']

  for (const action of actions) {
    const result = findJsonBlockWithMarker(content, `"${action}"`)
    if (!result) continue

    try {
      const parsed = JSON.parse(result.jsonStr)
      const rawAction = typeof parsed?.action === 'string' ? String(parsed.action).trim().toUpperCase() : ''
      if (rawAction === action) {
        return {
          action,
          databaseId: parsed.databaseId || parsed.database_id,
          snapshotId: parsed.snapshotId || parsed.snapshot_id,
          name: parsed.name,
          reason: parsed.reason,
        }
      }
    } catch {
      continue
    }
  }

  return null
}

/**
 * Remove ALL agent_status, options, and BEGIN_GENERATION JSON blocks from display text.
 * Handles multiline JSON, nested objects, and various format variations.
 */
export function cleanDisplayText(content: string): string {
  let cleaned = content

  const markersToRemove = [
    '"agent_status"',
    '"options"',
    '"follow_up"',
    '"recommendation"',
    '"BEGIN_GENERATION"',
    '"RESTORE_SNAPSHOT"',
    '"CREATE_SNAPSHOT"',
    '"LIST_SNAPSHOTS"',
    '"GET_SNAPSHOT"',
    '"Question"',
    '"question"'
  ]

  for (const marker of markersToRemove) {
    cleaned = removeJsonBlocksWithMarker(cleaned, marker)
  }

  // Remove any standalone JSON-like lines that look like agent commands (single-line fallback)
  cleaned = cleaned.replace(/^\s*\{"(?:type"\s*:\s*"(?:agent_status|options|follow_up|recommendation)"|action"\s*:\s*"(?:BEGIN_GENERATION|RESTORE_SNAPSHOT|CREATE_SNAPSHOT|LIST_SNAPSHOTS|GET_SNAPSHOT)")[^}]*\}\s*$/gm, '')

  // Remove empty code fences left after JSON extraction
  cleaned = cleaned.replace(/```\s*\n?\s*```/g, '')

  // Remove orphaned code fences with only whitespace or JSON commands
  cleaned = cleaned.replace(/```(?:json)?\s*\n?\s*\{"type"\s*:\s*"(?:agent_status|options)"[\s\S]*?\n?\s*```/g, '')

  return cleaned.trim()
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

/**
 * Helper function to generate row count suggestion options for interactive questions.
 * Returns pre-configured options for different time-based data generation strategies.
 */
export function getRowCountSuggestionOptions(): Array<{ label: string; value: string; description?: string }> {
  return [
    { label: '⚡ Last 7 days of hourly events (168 records)', value: '7d_hourly', description: 'For high-frequency events' },
    { label: '📊 Last 30 days of daily transactions (30 records)', value: '30d_daily', description: 'For standard business operations' },
    { label: '📈 Last 90 days of daily events (90 records)', value: '90d_daily', description: 'For quarterly analysis' },
    { label: '🗓️ Last 6 months of weekly data (26 records)', value: '6m_weekly', description: 'For monthly/weekly patterns' },
    { label: '📅 Last 12 months of monthly data (12 records)', value: '12m_monthly', description: 'For annual trends' },
    { label: '🎯 Last 2 years of daily data (730 records)', value: '2y_daily', description: 'For comprehensive history' },
    { label: '⏰ Custom time period', value: 'custom', description: 'Specify your own period' },
  ]
}

/**
 * Helper function to provide row count calculation explanation for different business contexts.
 * Shows how row counts are calculated based on the business context and time period.
 */
export function explainRowCountCalculation(context: string, timePeriod: string): string {
  const explanations: Record<string, string> = {
    transactions:
      'Transactional data: Calculated based on average transactions per day multiplied by the time period. Child tables (line_items, payments) get 3-5x multiplier.',
    user_activity:
      'User activity: Based on active users and their daily interactions. Higher multiplier for tables like sessions, actions, logins.',
    events:
      'Real-time events: High-frequency data. Multiplied by events per hour × 24 hours. Tables like events and metrics get 5-10x multiplier.',
    logs:
      'System logs: Very high volume. Hourly logs multiplied by 24 × days. Audit trails and activity logs get 10-50x multiplier.',
    analytics:
      'Analytics/Reports: Aggregated data. Lower multiplier since data is summarized. Daily/weekly/monthly snapshots.',
    mixed:
      'Mixed data: Combines above patterns. Each table type uses its appropriate calculation.',
  }
  return (
    explanations[context.toLowerCase()] ||
    'Row counts are calculated based on your time period and business context to generate realistic data volumes.'
  )
}

/**
 * Calculate suggested row counts for each table in a schema based on time period
 * Returns an object with table names and their calculated row counts
 */
export function calculateSuggestedRowCounts(
  schema: Array<{ name: string }>,
  timePeriod: string,
  context?: string
): Record<string, number> {
  const rowCounts: Record<string, number> = {}

  // Base calculation from time period
  const baseCounts: Record<string, number> = {
    '7d_hourly': 7 * 24, // 168
    '30d_daily': 30,
    '90d_daily': 90,
    '6m_weekly': 26,
    '12m_monthly': 12,
    '2y_daily': 730,
  }

  const baseCount = baseCounts[timePeriod] || 30

  for (const table of schema) {
    const lower = table.name.toLowerCase()

    // Detect table type and apply multiplier
    let multiplier = 1

    // Parent tables (users, customers, products)
    if (lower.includes('user') || lower.includes('customer') || lower.includes('product') || lower.includes('account')) {
      multiplier = 1
    }
    // Child tables (orders, items, comments)
    else if (
      lower.includes('order') ||
      lower.includes('item') ||
      lower.includes('line_item') ||
      lower.includes('comment') ||
      lower.includes('review')
    ) {
      multiplier = 3
    }
    // High-volume tables (events, logs, metrics)
    else if (lower.includes('event') || lower.includes('log') || lower.includes('metric') || lower.includes('analytics')) {
      multiplier = 5
    }
    // Transaction detail tables
    else if (lower.includes('transaction') || lower.includes('payment') || lower.includes('invoice')) {
      multiplier = 2
    }

    rowCounts[table.name] = Math.max(1, baseCount * multiplier)
  }

  return rowCounts
}
