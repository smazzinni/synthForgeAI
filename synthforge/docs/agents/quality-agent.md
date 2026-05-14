# Quality Agent

## Purpose and Scope

The Quality Agent reviews generated data for quality issues and fixes problems automatically. It acts as the validation layer in the multi-agent pipeline.

**Responsibilities:**
- Detect null values in important (NOT NULL) fields
- Check for duplicate IDs and unique constraint violations
- Identify orphan foreign keys that don't reference existing records
- Verify data type consistency
- Detect anomalies and distribution issues
- Auto-fix detected issues and regenerate corrected data

## Input/Output Formats

### Input
```json
{
  "messages": [
    { "role": "system", "content": "You are the SynthForge AI Quality Agent..." },
    { "role": "user", "content": "Validate this data for quality: {users: [...], orders: [...]}" }
  ],
  "temperature": 0.7,
  "maxTokens": 8192
}
```

### Output
```json
{
  "action": "generate",
  "agentName": "quality-agent",
  "explanation": "Quality check completed. Found 2 issues and fixed them...",
  "tables": {
    "users": [ /* corrected data */ ]
  },
  "reasoningSteps": [
    { "type": "validation", "label": "Validation", "description": "Checking referential integrity", "status": "completed", "output": "Fixed 2 orphan FK references" }
  ]
}
```

## Example Interactions

**Input:** Data with duplicate user IDs and orphan order.user_id values
**Output:** Corrected data with unique IDs and valid FK references, plus explanation of fixes

**Input:** Clean data with no issues
**Output:** Data returned unchanged with "All quality checks passed" explanation

## Error Handling Behavior

- If quality check itself fails, returns the original data unchanged with a warning
- Non-fatal quality issues are logged but don't block the pipeline
- Fatal issues (duplicate PKs, broken FKs) are always auto-fixed
- Error details are logged to the structured logger

## Dependencies

- **AI Model:** z-ai-web-dev-sdk (DeepSeek API)
- **Internal Functions:** `detectPII()`, `scoreDataQuality()` from `@/lib/ai`
- **Related Agents:** schema-agent (provides schema context), data-agent (provides data to validate)

## Constraints

- **Max Tokens:** 8192 per request
- **Timeout:** 120 seconds
- **Quality Dimensions:** completeness, uniqueness, distribution, referential integrity
- **Scoring Scale:** 0-100 overall, per-dimension breakdown
