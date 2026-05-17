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
 * Parse agent status from AI response content.
 * The AI may embed JSON blocks like:
 * {"type":"agent_status","agent":"Schema Architect","status":"designing","progress":30}
 */
export interface AgentStatus {
  agent: string
  status: string
  progress: number
}

export function parseAgentStatus(content: string): AgentStatus | null {
  const match = content.match(/\{"type":"agent_status","agent":"([^"]+)","status":"([^"]+)","progress":(\d+)\}/)
  if (!match) return null
  return {
    agent: match[1],
    status: match[2],
    progress: parseInt(match[3], 10),
  }
}

/**
 * Parse interactive options from AI response.
 * The AI may embed JSON blocks like:
 * {"type":"options","question":"What industry?","choices":[{"label":"E-commerce","value":"ecommerce"},{"label":"Healthcare","value":"healthcare"}],"multi":false}
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
  const match = content.match(/\{"type":"options","question":"([^"]+)","choices":\[(.*?)\],"multi":(true|false)\}/)
  if (!match) return null
  try {
    const choices: OptionChoice[] = []
    const choiceRegex = /\{"label":"([^"]+)","value":"([^"]+)"\}/g
    let choiceMatch
    while ((choiceMatch = choiceRegex.exec(match[2])) !== null) {
      choices.push({ label: choiceMatch[1], value: choiceMatch[2] })
    }
    return {
      question: match[1],
      choices,
      multi: match[3] === 'true',
    }
  } catch {
    return null
  }
}

/**
 * Remove agent_status and options JSON blocks from display text.
 * Handles nested JSON structures (e.g., choices array in options).
 * Also removes any leftover code fences that only contain agent commands.
 */
export function cleanDisplayText(content: string): string {
  let cleaned = content

  // Remove agent_status blocks (flat JSON, no nesting)
  cleaned = cleaned.replace(/\{"type"\s*:\s*"agent_status"\s*,[^}]+\}\s*/g, '')

  // Remove options blocks (may contain nested choices array)
  // Use a more robust pattern that matches the full structure including nested objects
  cleaned = cleaned.replace(/\{"type"\s*:\s*"options"\s*,[\s\S]*?"multi"\s*:\s*(?:true|false)\}\s*/g, '')

  // Remove any standalone JSON-like blocks that look like agent commands
  cleaned = cleaned.replace(/\{"type"\s*:\s*"(?:agent_status|options|follow_up|recommendation)"[^}]*\}\s*/g, '')

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
