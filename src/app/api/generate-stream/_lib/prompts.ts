// ─── Streaming Database Generation API — prompt builders ───

import type { GenerationRequest, GenerationSchema } from './types'

/**
 * Build the main system prompt that asks the model to generate NDJSON
 * records for every table in the request schema, in order, using
 * `###TABLE:xxx###` markers between tables.
 */
export function buildGenerationPrompt(req: GenerationRequest): string {
  const tableDescriptions = req.schema
    .map(table => {
      const colDefs = table.columns.map(c => `  ${c.name}: ${c.type}`).join('\n')
      const rowCount = req.rowCounts[table.name] || 10
      return `Table: ${table.name} (${rowCount} rows)\n${colDefs}`
    })
    .join('\n\n')

  const totalRows = Object.values(req.rowCounts).reduce((sum, n) => sum + n, 0)
  const tableOrder = req.schema.map(s => s.name).join(' → ')

  return `You are a data generation engine. Generate realistic synthetic data for the following database schema.

DATABASE: ${req.databaseName || 'synthetic_db'}

SCHEMA (${req.schema.length} tables):
${tableDescriptions}

${req.instructions ? `ADDITIONAL INSTRUCTIONS:\n${req.instructions}\n` : ''}

═══════════════════════════════════════════════════════════
CRITICAL REQUIREMENTS — READ CAREFULLY:
═══════════════════════════════════════════════════════════
1. You MUST generate data for ALL ${req.schema.length} tables listed above. Do NOT stop after the first table.
2. Table generation order: ${tableOrder}
3. After completing one table's records, IMMEDIATELY output the next ###TABLE:xxx### marker and continue with that table's records.
4. Do NOT end your response until EVERY table has been generated.
5. Total tables to generate: ${req.schema.length}
6. Total records to generate: ${totalRows}
═══════════════════════════════════════════════════════════

OUTPUT FORMAT:
- Output ONLY raw NDJSON — one JSON object per line.
- No arrays. No wrapper keys like {"tables":...}. No markdown. No explanation. No code fences.
- Each line must be a complete, valid JSON record for the CURRENT table.
- Generate records for each table sequentially: first ALL records for the first table, then ALL for the next, etc.
- Before each table's records, output a single marker line: ###TABLE:table_name###
- After the last record of the final table, you may stop.

DATA QUALITY:
- Use realistic values (real-looking names, emails, addresses, phone numbers, cities, companies).
- Use proper data types (numbers for quantities, ISO 8601 dates for timestamps, UUIDs for IDs).
- Always include an "id" column as a UUID string for each record.
- Include timestamps (created_at, updated_at) as ISO 8601 strings.
- Make data internally consistent (e.g., order dates after customer registration).
- Maintain referential integrity between tables (foreign key values must reference existing primary keys).
- For localized data, use appropriate names, phone formats, currencies, and addresses.

Begin immediately. Do not confirm or summarize first. Generate ALL ${req.schema.length} tables in this single response.

Example output format (2-table example):
###TABLE:users###
{"id":"a1b2c3d4-5678-9012-abcd-ef1234567890","name":"Alice Johnson","email":"alice@example.com","created_at":"2024-01-15T10:30:00Z"}
{"id":"b2c3d4e5-6789-0123-bcde-f12345678901","name":"Bob Smith","email":"bob@example.com","created_at":"2024-01-16T14:22:00Z"}
###TABLE:orders###
{"id":"c3d4e5f6-7890-1234-cdef-123456789012","user_id":"a1b2c3d4-5678-9012-abcd-ef1234567890","total":99.99,"created_at":"2024-02-01T09:15:00Z"}

REMINDER: You MUST generate ALL ${req.schema.length} tables. Do NOT stop early.

Now generate the data. Start with ###TABLE:${req.schema[0]?.name || 'table1'}###`
}

/**
 * Build a focused continuation prompt for a single missing table. Used when
 * the main stream finished without producing any rows for one or more tables.
 */
export function buildContinuationPrompt(
  tableName: string,
  rowCount: number,
  columns: GenerationSchema['columns'],
): string {
  const colDefs = columns.map(c => `  ${c.name}: ${c.type}`).join('\n')
  return `Generate ${rowCount} realistic records for the "${tableName}" table.

COLUMNS:
${colDefs}

RULES:
- Output ONLY raw NDJSON — one JSON object per line.
- No arrays. No wrapper keys. No markdown. No explanation. No code fences.
- Start with a single marker line: ###TABLE:${tableName}###
- Each line after the marker must be a complete, valid JSON record.
- Use realistic values. Include UUIDs for IDs and ISO 8601 timestamps.
- Always include an "id" column as a UUID string for each record.
- Generate exactly ${rowCount} records — no more, no less.
- Do not output anything after the last record.

Begin now:`
}
