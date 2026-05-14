# Orchestrator (auto-agent)

## Purpose and Scope

The Orchestrator is the main agent that coordinates all specialized sub-agents. It determines which agents to invoke, in what order, and how to combine their outputs. It operates in "auto" mode by default and handles the full data generation pipeline.

**Responsibilities:**
- Analyze user intent and determine required agent pipeline
- Route requests to appropriate specialized agents
- Coordinate multi-step agent execution
- Accumulate context from each agent step
- Combine outputs into a cohesive final response
- Handle the standard pipeline: schema → data → quality

## Input/Output Formats

### Input
```json
{
  "messages": [
    { "role": "system", "content": "You are SynthForge AI, a combined Schema Architect and Data Generation Agent..." },
    { "role": "user", "content": "Generate an e-commerce database with users, products, and orders" }
  ],
  "temperature": 0.7,
  "maxTokens": 8192
}
```

### Output (Simple - Single Step)
```json
{
  "action": "generate",
  "agentName": "auto-agent",
  "explanation": "I've designed and generated data for an e-commerce platform...",
  "tables": { "users": [...], "products": [...], "orders": [...] },
  "sqlCode": "CREATE TABLE ...; INSERT INTO ...;",
  "reasoningSteps": [...]
}
```

### Output (Complex - Multi-Step)
```json
{
  "action": "multi_step",
  "agentName": "orchestrator",
  "explanation": "I'll break this down into steps...",
  "steps": [
    { "agent": "schema-agent", "task": "Design schema", "status": "pending" },
    { "agent": "data-agent", "task": "Generate data", "status": "pending" },
    { "agent": "quality-agent", "task": "Validate quality", "status": "pending" }
  ],
  "reasoningSteps": [...]
}
```

## Agent Routing Logic

| Request Pattern | Agents Invoked |
|---|---|
| Simple data generation | auto-agent (direct) |
| SQL query request | sql-agent + quality-agent |
| Data analysis | data-analysis-agent + viz-agent |
| Schema optimization | schema-analysis-agent |
| Complex pipeline | schema-agent → data-agent → quality-agent |
| Chart/dashboard | data-agent → data-analysis-agent → viz-agent |

## Example Interactions

**User:** "Generate 50 users with orders"
**Agent:** Directly generates data in a single step using auto-agent mode.

**User:** "Create a salary distribution chart"
**Agent:** Multi-step: data-agent generates salary data → data-analysis-agent computes statistics → viz-agent recommends chart.

## Error Handling Behavior

- If a sub-agent step fails, the pipeline continues with remaining steps
- Failed steps are marked as "failed" with error output
- The final response includes all step statuses
- User-facing errors never include internal details or API keys
- Timeout errors return a 503 with suggestions to simplify the request
- Input validation catches: empty messages, too-long messages (>10000 chars), ambiguous short queries

## Dependencies

- **AI Model:** z-ai-web-dev-sdk (DeepSeek API)
- **All Sub-Agents:** schema-agent, data-agent, quality-agent, sql-agent, data-analysis-agent, viz-agent, schema-analysis-agent
- **Database:** Prisma ORM (SQLite) for persisting conversations and data
- **Functions:** `parseAgentResponse()`, `estimateCost()`, `detectPII()`, `scoreDataQuality()` from `@/lib/ai`

## Constraints

- **Max Tokens:** 8192 per request (per agent step)
- **Timeout:** 120 seconds per agent step
- **Max Steps:** No hard limit, but typically 2-4 steps
- **Context Accumulation:** Each step receives up to 3000 chars of previous context
- **Input Validation:** Messages sanitized, max 10000 chars, min 3 chars
- **Ambiguity Threshold:** Queries with <5 words trigger clarification response
