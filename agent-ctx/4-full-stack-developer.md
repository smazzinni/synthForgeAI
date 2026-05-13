---
Task ID: 4
Agent: full-stack-developer
Task: Fix SynthForge AI application and implement blueprint features

Work Log:
- Read all existing source files (page.tsx, ai.ts, chat route, upload route, prisma schema, .env, db.ts, databases route, next.config.ts)
- Fixed 502 Bad Gateway by updating DATABASE_URL in both .env and .next/standalone/.env from relative path `file:./db/custom.db` to absolute path `file:/home/z/my-project/db/custom.db`
- Enhanced AI orchestrator (ai.ts) with:
  - Streaming support: Added `chatCompletionStream` function returning ReadableStream with SSE events (content, reasoning, done, error)
  - PII Detection: Added `detectPII` function scanning for emails, phones, SSNs, credit cards, IP addresses with smart filtering for synthetic data
  - Schema Inference: Added `inferSchemaFromData` function analyzing data to detect column types, primary/foreign keys, constraints, relationships
  - Data Quality Scoring: Added `scoreDataQuality` function evaluating completeness, uniqueness, distribution, referential integrity (0-100)
  - XML Schema Extraction: Added `extractSchemaFromXML` function for parsing XML files
- Enhanced Chat API route with:
  - Streaming SSE support when `stream: true` in request body
  - PII detection and quality scoring on generated data
  - Schema version tracking in responses
  - GET endpoint now supports databaseId parameter for loading last conversation
- Enhanced Upload API route with:
  - XML file parsing support
  - Schema inference from uploaded data
  - PII check on uploaded data
  - Multi-file upload support with cross-file relationship detection
  - Inferred schema with detected constraints and relationships in response
- Enhanced Page.tsx UI features:
  - Data Quality Score badge (green/yellow/red) on assistant messages
  - PII Shield indicator badge (green for safe, red for PII found)
  - Schema Version badge (Schema vN) in Studio header showing evolution tracking
  - Regenerate button on data table cards for quick re-generation
  - Conversation history loading when opening a database
  - Added Shield, RotateCcw, Gauge, GitBranch icons
  - Added QualityScore and PIICheck interfaces to Message type
  - Fixed framer-motion type issue with `as const` on transition type
  - Added XML file type to file upload accept attribute
- Verified build succeeds with `npx next build`
- Verified production server starts and serves pages correctly
- Ran `bun run lint` - all checks pass

Stage Summary:
- All blueprint features implemented and working
- 502 Bad Gateway fix: DATABASE_URL now uses absolute path
- Build compiles successfully
- All existing functionality preserved (backward compatible)
- New features degrade gracefully when AI unavailable (local fallback)
