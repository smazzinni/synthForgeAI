/**
 * Dynamic Row Count Calculation
 * Converts time-based parameters (days, weeks, months, years) to realistic row counts
 * for synthetic data generation based on business use cases.
 */

export interface RowCountConfig {
  timeUnit: 'days' | 'weeks' | 'months' | 'years'
  timeValue: number
  frequency?: 'daily' | 'weekly' | 'monthly' | 'yearly' | 'hourly' | 'real-time'
  businessContext?: 'transactions' | 'user_activity' | 'events' | 'logs' | 'audit_trail' | 'analytics'
}

export interface RowCalculationResult {
  estimatedRows: number
  timeSpanDays: number
  frequency: string
  explanation: string
}

/**
 * Calculate row count based on time period and frequency
 * Examples:
 * - 30 days of daily transactions: 30 rows
 * - 12 months of hourly events: 12 * 30 * 24 = 8,640 rows
 * - 2 years of user signups (weekly): 2 * 52 = 104 rows
 */
export function calculateDynamicRowCount(
  tableType: string,
  config: RowCountConfig
): RowCalculationResult {
  const timeSpanDays = convertToDays(config.timeUnit, config.timeValue)
  const frequency = config.frequency || inferFrequency(tableType, config)

  let rowsPerDay = getRowsPerDayByFrequency(frequency)

  // Adjust based on business context
  if (config.businessContext) {
    const contextMultiplier = getContextMultiplier(config.businessContext)
    rowsPerDay *= contextMultiplier
  }

  const estimatedRows = Math.max(1, Math.ceil(rowsPerDay * timeSpanDays))

  return {
    estimatedRows,
    timeSpanDays,
    frequency,
    explanation: `${estimatedRows} rows over ${config.timeValue} ${config.timeUnit} (${timeSpanDays} days) with ${frequency} frequency`,
  }
}

/**
 * Convert time unit to days
 */
function convertToDays(unit: string, value: number): number {
  const conversions: Record<string, number> = {
    days: 1,
    weeks: 7,
    months: 30,
    years: 365,
  }
  return (conversions[unit] || 1) * value
}

/**
 * Get default frequency based on table type
 */
function inferFrequency(
  tableType: string,
  config: RowCountConfig
): string {
  const lower = tableType.toLowerCase()

  // Transactions and events
  if (lower.includes('transaction') || lower.includes('event') || lower.includes('order')) {
    return config.timeValue <= 7 ? 'daily' : config.timeValue <= 90 ? 'daily' : 'weekly'
  }

  // User activity
  if (lower.includes('user') || lower.includes('activity') || lower.includes('session')) {
    return 'daily'
  }

  // Logs and audit trails
  if (lower.includes('log') || lower.includes('audit') || lower.includes('trace')) {
    return 'hourly'
  }

  // Analytics and reports
  if (lower.includes('analytics') || lower.includes('report') || lower.includes('metrics')) {
    return 'daily'
  }

  // Default
  return 'daily'
}

/**
 * Calculate rows per day based on frequency
 */
function getRowsPerDayByFrequency(frequency: string): number {
  const frequencies: Record<string, number> = {
    'real-time': 100, // assume 100 events per day
    'hourly': 24, // 1 per hour
    'daily': 1, // 1 per day
    'weekly': 0.14, // ~1 per week
    'monthly': 0.033, // ~1 per month
    'yearly': 0.0027, // ~1 per year
  }
  return frequencies[frequency] || 1
}

/**
 * Get multiplier based on business context
 */
function getContextMultiplier(context: string): number {
  const multipliers: Record<string, number> = {
    'transactions': 2, // Multiple per day on average
    'user_activity': 3, // Users generate multiple activities
    'events': 5, // Events happen frequently
    'logs': 10, // Logs are verbose
    'audit_trail': 1, // Audit trails are deliberate
    'analytics': 0.5, // Aggregated data
  }
  return multipliers[context] || 1
}

/**
 * Suggest row counts for different tables in a schema
 * Returns a Record<table_name, row_count> for use with BEGIN_GENERATION signal
 */
export function suggestRowCountsForSchema(
  schema: Array<{ name: string; columns: Array<{ name: string; type: string }> }>,
  config: RowCountConfig
): Record<string, number> {
  const rowCounts: Record<string, number> = {}

  for (const table of schema) {
    const result = calculateDynamicRowCount(table.name, config)
    // Apply relationships multipliers for child tables
    let finalCount = result.estimatedRows

    if (isChildTable(table.name)) {
      // Child tables get more rows (e.g., orders has more rows than customers)
      finalCount = Math.ceil(finalCount * 3)
    }

    if (isLargeVolumeTable(table.name)) {
      // Some tables naturally have more data
      finalCount = Math.ceil(finalCount * 5)
    }

    rowCounts[table.name] = Math.max(1, finalCount)
  }

  return rowCounts
}

/**
 * Check if a table is typically a child table (has more rows than parent)
 */
function isChildTable(tableName: string): boolean {
  const patterns = [
    'line_item',
    'detail',
    'item',
    'order_item',
    'transaction_detail',
    'comment',
    'rating',
    'review',
    'log_entry',
    'activity_log',
  ]
  const lower = tableName.toLowerCase()
  return patterns.some((p) => lower.includes(p))
}

/**
 * Check if a table naturally has high volume
 */
function isLargeVolumeTable(tableName: string): boolean {
  const patterns = [
    'event',
    'log',
    'trace',
    'metric',
    'analytics',
    'click',
    'pageview',
    'impression',
  ]
  const lower = tableName.toLowerCase()
  return patterns.some((p) => lower.includes(p))
}

/**
 * Parse user input like "30 days" or "6 months" into RowCountConfig
 * Supports formats:
 * - "30 days"
 * - "6 months"
 * - "2 years"
 * - "52 weeks"
 * - "daily transactions for 30 days"
 * - "hourly events for 6 months"
 */
export function parseTimeBasedInput(input: string): RowCountConfig | null {
  const trimmed = input.trim().toLowerCase()

  // Pattern: "N days/weeks/months/years"
  const basicMatch = trimmed.match(/(\d+)\s*(days?|weeks?|months?|years?)/i)
  if (basicMatch) {
    const value = parseInt(basicMatch[1], 10)
    const unitMap: Record<string, 'days' | 'weeks' | 'months' | 'years'> = {
      day: 'days',
      days: 'days',
      week: 'weeks',
      weeks: 'weeks',
      month: 'months',
      months: 'months',
      year: 'years',
      years: 'years',
    }
    const timeUnit = unitMap[basicMatch[2]] || 'days'

    // Check for frequency modifier
    const frequencyMatch = trimmed.match(
      /(real-time|hourly|daily|weekly|monthly|yearly)\s+(transactions?|events?|logs?)/i
    )

    return {
      timeValue: value,
      timeUnit,
      frequency: frequencyMatch
        ? (frequencyMatch[1] as any)
        : undefined,
      businessContext: frequencyMatch
        ? (frequencyMatch[2] as any)
        : undefined,
    }
  }

  // Pattern: "daily/hourly/weekly X for Y days/months"
  const advancedMatch = trimmed.match(
    /(daily|hourly|weekly|monthly)\s+(transactions?|events?|logs?|user\s+activities?)\s+for\s+(\d+)\s+(days?|weeks?|months?|years?)/i
  )
  if (advancedMatch) {
    const value = parseInt(advancedMatch[3], 10)
    const unitMap: Record<string, 'days' | 'weeks' | 'months' | 'years'> = {
      day: 'days',
      days: 'days',
      week: 'weeks',
      weeks: 'weeks',
      month: 'months',
      months: 'months',
      year: 'years',
      years: 'years',
    }
    const timeUnit = unitMap[advancedMatch[4]] || 'days'

    return {
      timeValue: value,
      timeUnit,
      frequency: advancedMatch[1] as any,
      businessContext: advancedMatch[2].replace(/\s+/g, '_') as any,
    }
  }

  return null
}

/**
 * Generate human-readable suggestions for row counts
 */
export function generateRowCountSuggestions(context: string): string[] {
  const suggestions = [
    '📅 Last 30 days of daily transactions',
    '📊 Last 3 months of hourly events',
    '📈 Last 12 months of daily analytics',
    '⏰ Last 7 days of real-time data',
    '🗓️ Last 2 years of monthly reports',
    '🎯 Last 1 week with high-frequency events',
    '📋 Last 90 days with multiple daily activities',
  ]

  if (context.toLowerCase().includes('event')) {
    return [
      '⚡ Last 7 days of hourly events (168 records)',
      '⚡ Last 30 days of daily events (30 records)',
      '⚡ Last 6 months of events (180 records)',
    ]
  }

  if (context.toLowerCase().includes('transaction')) {
    return [
      '💳 Last 30 days of transactions (500-1000 records)',
      '💳 Last 3 months of transactions (1500-3000 records)',
      '💳 Last year of transactions (5000-10000 records)',
    ]
  }

  if (context.toLowerCase().includes('log')) {
    return [
      '📝 Last 7 days of hourly logs (168 records)',
      '📝 Last 30 days of logs (1000+ records)',
      '📝 Last 90 days of logs (3000+ records)',
    ]
  }

  return suggestions
}
