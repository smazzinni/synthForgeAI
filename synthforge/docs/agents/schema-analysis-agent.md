# Schema Analysis Agent

## Purpose and Scope

The Schema Analysis Agent analyzes database schemas for normalization issues, missing indexes, potential performance bottlenecks, and design improvements.

**Responsibilities:**
- Evaluate schema normalization level (1NF, 2NF, 3NF, BCNF)
- Identify missing indexes for common query patterns
- Detect potential performance bottlenecks
- Suggest schema refactoring for better design
- Analyze relationship cardinality and constraint coverage

## Input/Output Formats

### Input
```json
{
  "messages": [
    { "role": "system", "content": "You are the SynthForge AI Schema Analysis Agent..." },
    { "role": "user", "content": "Analyze this schema for optimization opportunities: {users: {...}, orders: {...}}" }
  ],
  "temperature": 0.7,
  "maxTokens": 8192
}
```

### Output
```json
{
  "action": "generate",
  "agentName": "schema-analysis-agent",
  "explanation": "Schema analysis results:\n- Normalization: 2NF (3rd normal form violation in orders table)\n- Missing indexes: orders.user_id, orders.created_at\n- Suggested: Split orders.order_notes into separate table",
  "reasoningSteps": [
    { "type": "execution", "label": "Schema Analysis", "description": "Evaluating normalization and performance", "status": "completed", "output": "2NF with 2 missing indexes" }
  ]
}
```

## Example Interactions

**User:** "Optimize this database schema"
**Agent:** Returns detailed analysis with normalization level, missing indexes, and refactoring suggestions.

**User:** "Is my schema properly normalized?"
**Agent:** Returns a normalization audit with specific violations and fix recommendations.

## Error Handling Behavior

- If schema is too large for single analysis, focuses on most impactful tables
- Returns partial analysis if full analysis times out
- Never modifies the schema directly — only suggests changes

## Dependencies

- **AI Model:** z-ai-web-dev-sdk (DeepSeek API)
- **Schema Context:** Database schema provided in the prompt
- **Related Agents:** schema-agent (can act on refactoring suggestions)

## Constraints

- **Max Tokens:** 8192 per request
- **Timeout:** 120 seconds
- **Analysis Scope:** Normalization, indexing, relationships, constraints
- **Schema Size:** Limited by AI context window
