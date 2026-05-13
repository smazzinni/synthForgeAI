# Task 3 - full-stack-developer Agent Work Log

## Task: Rewrite AI agent system prompts and orchestration for TDM Agent Architecture

## Summary
Successfully rewrote the AI orchestration layer in `src/lib/ai.ts` to implement a 3-phase Test Data Management (TDM) Agent architecture.

## Changes Made

### 1. PLAN_AGENT_SYSTEM (Phase 1: Discovery)
- Completely rewritten to focus on research & consultation before schema design
- Implements 3-step protocol: Domain Analysis → Interactive Interview → Requirements Synthesis
- Mandatory interview asks about Volume (10-500+ rows), Modules (domain-specific), Constraints (PII, compliance, formats)
- Always includes "Custom Input" and "Skip" options per requirement spec
- Uses "discovery" action type for requirement gathering phase
- Domain hints kept as suggestions only, not schema templates

### 2. EXEC_AGENT_SYSTEM (Phase 2+3: Schema Mapping + Generation)
- Completely rewritten with two phases: Technical Schema Mapping + Preview-First Output Generation
- Phase 2 enforces: Relational Integrity, Business Logic Validation, Data Realism Planning
- Phase 3 uses Preview-First approach: 3-5 sample rows → user approval → full dataset
- Includes Few-Shot examples showing Good vs Bad schema design
- Uses "preview" action with previewTables for pre-approval display
- "generate" action used only after user approves the preview

### 3. AUTO_MODE_SYSTEM (3-Phase TDM Pipeline)
- Completely rewritten as a TDM Agent with strict 3-phase pipeline
- Phase 1: Intelligent Discovery with multi-choice interview (Volume, Modules, Constraints)
- Phase 2: Technical Schema Mapping (relational integrity, business logic, data realism)
- Phase 3: Preview-First Generation (3-5 rows → approval → full dataset)
- Added "NEVER generate mock data if the AI API is unavailable" rule
- Added ITSM/ServiceNow and CRM/Salesforce domain hints
- Few-Shot Good vs Bad examples inline in prompt
- Multi-step pipeline now uses 5 agents: discovery → schema → data → validation → quality
- 5 response formats: discovery, preview, generate, clarify, multi_step

### 4. DISCOVERY_AGENT_PROMPT (New)
- Specializes in Phase 1 discovery interviews for multi-step pipeline
- Strict protocol: Domain Analysis → Interactive Interview → Requirements Synthesis
- Must ask about Volume, Modules, and Constraints with multi-choice options
- Never designs schemas or generates data

### 5. VALIDATION_AGENT_PROMPT (New)
- Specializes in Phase 2 constraint validation for multi-step pipeline
- 5 validation categories: Referential Integrity, Business Logic, Constraint Compliance, Data Realism, Schema Completeness
- Can auto-fix issues and return corrected tables
- Detailed reasoningSteps for each validation category

### 6. getSubagentPrompt Function
- Updated to route discovery-agent → DISCOVERY_AGENT_PROMPT
- Updated to route validation-agent → VALIDATION_AGENT_PROMPT
- Existing routes (schema, data, quality) preserved

### 7. AgentResponse Interface
- Added 'preview' and 'discovery' action types
- Added previewTables field for preview data

### 8. parseAgentResponse Function
- Updated to extract previewTables from AI responses

## Verification
- Build passes: `npx next build` succeeds
- Lint passes: `bun run lint` succeeds with no errors
