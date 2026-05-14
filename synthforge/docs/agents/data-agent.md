# Data Agent

## Purpose and Scope

The Data Generation Agent generates realistic synthetic data based on provided schema definitions. It creates data that maintains referential integrity, respects constraints, and uses realistic distributions.

**Responsibilities:**
- Generate synthetic data rows for specified tables
- Maintain referential integrity across related tables
- Respect data type constraints and check constraints
- Use realistic distributions (not just sequential values)
- Generate at least 5-10 rows per table by default

## Input/Output Formats

### Input
```json
{
  "messages": [
    { "role": "system", "content": "You are the SynthForge AI Data Generation Agent..." },
    { "role": "user", "content": "Generate 25 rows for users and orders tables. Schema: {users: {...}, orders: {...}}" }
  ],
  "temperature": 0.7,
  "maxTokens": 8192
}
```

### Output
```json
{
  "action": "generate",
  "agentName": "data-agent",
  "explanation": "I've generated synthetic data for the following tables...",
  "tables": {
    "users": [
      { "id": 1, "name": "Jane Smith", "email": "jane.smith@example.com" }
    ],
    "orders": [
      { "id": 1, "user_id": 1, "total_amount": 45.99, "status": "completed" }
    ]
  },
  "sqlCode": "INSERT INTO users ...; INSERT INTO orders ...;",
  "reasoningSteps": [
    { "type": "data_strategy", "label": "Data Strategy", "description": "Planning data generation", "status": "completed", "output": "25 users, 50 orders" }
  ]
}
```

## Example Interactions

**User:** "Generate 50 users and 100 orders for an e-commerce database"
**Agent:** Returns 50 user records with realistic names, emails, and addresses, plus 100 order records referencing valid user IDs.

**User:** "Add 20 more patients to the hospital database"
**Agent:** Returns 20 additional patient records with realistic medical data.

## Error Handling Behavior

- Falls back to local template-based generation if AI API is unavailable
- Validates FK references before returning data
- Never includes real PII — all data is synthetic
- Logs errors to structured logger without exposing API keys

## Dependencies

- **AI Model:** z-ai-web-dev-sdk (DeepSeek API)
- **Database:** Prisma ORM (SQLite) for reading schema and storing generated data
- **Related Agents:** schema-agent (provides schema), quality-agent (validates output)
- **Functions:** `generateFakeValue()` for local fallback generation

## Constraints

- **Max Tokens:** 8192 per request
- **Timeout:** 120 seconds
- **Min Rows:** 5-10 per table (configurable)
- **Max Rows:** No hard limit, but response size bounded by token limit
- **Data Realism Rules:** Uses realistic email domains, phone formats, names, and distributions
