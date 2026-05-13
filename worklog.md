---
Task ID: 1
Agent: Main Agent
Task: Fix 502 Bad Gateway and implement dynamic AI-generated questions

Work Log:
- Verified dev server is running and returning HTTP 200 (502 was already fixed in previous session)
- Confirmed handleDragOver/handleDragLeave/handleDrop are properly defined (lines 518-533 in synthforge-app.tsx)
- Confirmed favicon exists at public/favicon.ico
- Identified core issue: hardcoded questions and options in ai.ts system prompts
- Rewrote PLAN_AGENT_SYSTEM prompt: removed hardcoded "10/25/50/100/500 rows" options, replaced with dynamic domain-research-driven question generation instructions
- Rewrote AUTO_MODE_SYSTEM prompt: same transformation, added contextual volume examples, removed static option lists
- Rewrote DISCOVERY_AGENT_PROMPT: same transformation with domain-specific volume/module/constraint guidance
- Updated FEATURE_TRACKING.md: added A-22 (Dynamic AI-Generated Questions), updated counts and metrics
- Updated README.md: added Dynamic AI-Generated Questions as key differentiator, updated architecture diagram

Stage Summary:
- 502 Bad Gateway: Already fixed (server returns 200)
- Dynamic AI Questions: Implemented in src/lib/ai.ts across 3 system prompts
- Documentation: Updated README.md and FEATURE_TRACKING.md
- Build: Verified successful with `npx next build`
