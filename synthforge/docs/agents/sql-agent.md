# SQL Agent

## Purpose and Scope

The SQL Generation Agent generates optimized SQL queries based on user requests and available schema. It handles query generation, optimization, and explanation.

**Responsibilities:**
- Generate SQL queries from natural language descriptions
- Optimize existing SQL queries for performance
- Consider indexes, joins, and query execution plans
- Provide explanations of generated SQL
- Support SELECT, INSERT, UPDATE, DELETE, and DDL statements

## Input/Output Formats

### Input
```json
{
  "messages": [
    { "role": "system", "content": "You are the SynthForge AI SQL Generation Agent..." },
    { "role": "user", "content": "Get all users who placed more than 5 orders last month" }
  ],
  "temperature": 0.7,
  "maxTokens": 8192
}
```

### Output
```json
{
  "action": "generate",
  "agentName": "sql-agent",
  "explanation": "This query finds users with more than 5 orders in the last month using a JOIN with GROUP BY and HAVING...",
  "sqlCode": "SELECT u.id, u.name, u.email, COUNT(o.id) as order_count FROM users u JOIN orders o ON u.id = o.user_id WHERE o.order_date >= DATE('now', '-1 month') GROUP BY u.id, u.name, u.email HAVING COUNT(o.id) > 5 ORDER BY order_count DESC;",
  "reasoningSteps": [
    { "type": "execution", "label": "SQL Generation", "description": "Generating optimized query", "status": "completed", "output": "JOIN with GROUP BY + HAVING clause" }
  ]
}
```

## Example Interactions

**User:** "Show me the top 10 products by revenue"
**Agent:** Returns a SQL query with JOIN, aggregation, and ORDER BY with LIMIT.

**User:** "Optimize this slow query: SELECT * FROM orders WHERE..."
**Agent:** Returns an optimized version with proper indexing suggestions and query plan analysis.

## Error Handling Behavior

- Invalid SQL is caught and a user-friendly error is returned
- If the schema doesn't support the requested query, suggests alternatives
- Timeout errors return a 503 with suggestions to simplify the request
- SQL injection patterns are detected and rejected

## Dependencies

- **AI Model:** z-ai-web-dev-sdk (DeepSeek API)
- **Schema Context:** Available database schema provided in the system prompt
- **Related Agents:** quality-agent (validates SQL correctness)

## Constraints

- **Max Tokens:** 8192 per request
- **Timeout:** 120 seconds
- **Supported Dialects:** Standard SQL (SQLite-compatible)
- **sqlOnly Mode:** When `sqlOnly: true` flag is set, returns only SQL without full data generation
