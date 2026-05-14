# Schema Agent

## Purpose and Scope

The Schema Agent designs database schemas based on user requirements. It identifies entities, relationships, constraints, and indexes to create well-normalized relational database schemas.

**Responsibilities:**
- Understand user intent and application requirements
- Detect business domains and infer appropriate data models
- Design complete relational database schemas with proper normalization
- Identify entities, relationships, constraints, and indexes
- Generate structured schema plans for downstream agents

## Input/Output Formats

### Input
```json
{
  "messages": [
    { "role": "system", "content": "You are the SynthForge AI Schema Agent..." },
    { "role": "user", "content": "Design a schema for an e-commerce platform" }
  ],
  "temperature": 0.7,
  "maxTokens": 8192
}
```

### Output
```json
{
  "action": "generate",
  "agentName": "schema-agent",
  "explanation": "I've designed a schema for an e-commerce platform...",
  "schemaPlan": {
    "users": { "columns": { "id": "SERIAL PRIMARY KEY", "email": "VARCHAR(255) UNIQUE" }, "relationships": [], "indexes": [] },
    "orders": { "columns": { "id": "SERIAL PRIMARY KEY", "user_id": "INTEGER REFERENCES users(id)" }, "relationships": ["users"], "indexes": ["user_id"] }
  },
  "sqlCode": "CREATE TABLE users (...); CREATE TABLE orders (...);",
  "reasoningSteps": [
    { "type": "intent", "label": "Intent Analysis", "description": "Analyzing request", "status": "completed", "output": "E-commerce platform schema" }
  ]
}
```

## Example Interactions

**User:** "Create a hospital management database"
**Agent:** Returns a schema with patients, doctors, appointments, prescriptions, and medical_records tables with proper FK relationships.

**User:** "I need a schema for a SaaS billing system"
**Agent:** Returns a schema with users, subscriptions, plans, invoices, and usage_logs tables.

## Error Handling Behavior

- If the user request is ambiguous, returns a `clarify` action with selectable options
- If schema generation fails, falls back to local template-based generation
- Never exposes internal errors or API details to the user
- Logs errors to the structured logger without sensitive information

## Dependencies

- **AI Model:** z-ai-web-dev-sdk (DeepSeek API)
- **Database:** Prisma ORM (SQLite) for persisting schemas
- **Related Agents:** data-agent (consumes schema output), quality-agent (validates output)

## Constraints

- **Max Tokens:** 8192 per request
- **Timeout:** 120 seconds
- **Supported Formats:** JSON schema output with SQL DDL
- **Rate Limits:** Subject to AI API rate limits
- **Normalization Level:** 3NF by default
