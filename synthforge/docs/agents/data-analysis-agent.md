# Data Analysis Agent

## Purpose and Scope

The Data Analysis Agent performs statistical analysis on data, computing aggregations, identifying trends, detecting anomalies, and generating insights.

**Responsibilities:**
- Compute descriptive statistics (mean, median, standard deviation)
- Identify trends and patterns in data
- Detect outliers and anomalies
- Perform aggregations and group-by analyses
- Generate data-driven insights and recommendations

## Input/Output Formats

### Input
```json
{
  "messages": [
    { "role": "system", "content": "You are the SynthForge AI Data Analysis Agent..." },
    { "role": "user", "content": "Analyze the salary distribution in the employees table" }
  ],
  "temperature": 0.7,
  "maxTokens": 8192
}
```

### Output
```json
{
  "action": "generate",
  "agentName": "data-analysis-agent",
  "explanation": "Salary distribution analysis:\n- Mean: $72,450\n- Median: $68,000\n- Std Dev: $18,200\n- Range: $32,000 - $145,000\n- Outliers: 3 employees above 2 standard deviations",
  "reasoningSteps": [
    { "type": "execution", "label": "Statistical Analysis", "description": "Computing salary statistics", "status": "completed", "output": "Mean $72,450, Median $68,000" }
  ]
}
```

## Example Interactions

**User:** "What's the average order value by month?"
**Agent:** Returns monthly aggregations with trends and seasonal patterns.

**User:** "Are there any anomalies in the transaction data?"
**Agent:** Returns outlier detection results with specific records flagged and potential explanations.

## Error Handling Behavior

- If data is insufficient for analysis, returns a clarification request
- Statistical computation errors fall back to simpler metrics
- Never exposes raw data in error messages
- Logs computation failures to structured logger

## Dependencies

- **AI Model:** z-ai-web-dev-sdk (DeepSeek API)
- **Data Context:** Available tables and their content provided in the prompt
- **Related Agents:** viz-agent (consumes analysis for visualization), quality-agent (validates data before analysis)

## Constraints

- **Max Tokens:** 8192 per request
- **Timeout:** 120 seconds
- **Statistical Methods:** Mean, median, mode, standard deviation, percentile, correlation
- **Data Size:** Analysis bounded by AI context window
