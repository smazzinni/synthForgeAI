# Visualization Agent (viz-agent)

## Purpose and Scope

The Visualization Agent recommends appropriate charts, graphs, and visualizations based on data characteristics and analysis results. It provides data structures and configurations needed to render visualizations.

**Responsibilities:**
- Recommend chart types based on data characteristics
- Provide chart configurations (axes, colors, labels)
- Suggest dashboard layouts for multi-chart views
- Generate data structures optimized for visualization libraries
- Consider accessibility and readability in visualization design

## Input/Output Formats

### Input
```json
{
  "messages": [
    { "role": "system", "content": "You are the SynthForge AI Visualization Agent..." },
    { "role": "user", "content": "Create a salary distribution chart for the employees data" }
  ],
  "temperature": 0.7,
  "maxTokens": 8192
}
```

### Output
```json
{
  "action": "generate",
  "agentName": "viz-agent",
  "explanation": "I recommend a histogram for salary distribution with a box plot overlay...",
  "reasoningSteps": [
    { "type": "execution", "label": "Visualization Design", "description": "Selecting chart type", "status": "completed", "output": "Histogram + Box Plot for continuous distribution" }
  ]
}
```

## Example Interactions

**User:** "Show me sales trends over time"
**Agent:** Recommends a line chart with monthly aggregations, trend line, and confidence interval.

**User:** "Compare department budgets"
**Agent:** Recommends a horizontal bar chart with gradient coloring by budget size.

## Error Handling Behavior

- If data doesn't support the requested visualization, suggests alternatives
- Falls back to simple table display if visualization generation fails
- Error messages are user-friendly without technical details

## Dependencies

- **AI Model:** z-ai-web-dev-sdk (DeepSeek API)
- **Data Context:** Analysis results from data-analysis-agent
- **Related Agents:** data-analysis-agent (provides computed statistics)

## Constraints

- **Max Tokens:** 8192 per request
- **Timeout:** 120 seconds
- **Supported Chart Types:** Bar, line, pie, scatter, heatmap, histogram, box plot, radar
- **Libraries:** Recharts-compatible configurations
