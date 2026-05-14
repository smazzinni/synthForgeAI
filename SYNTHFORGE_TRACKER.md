# SynthForge AI — Project Tracker

> Last updated: 2026-05-13

---

## 🎯 Todo List

### High Priority
- [x] E2E validation of all API endpoints
- [x] Test chat streaming with real AI responses
- [ ] Verify referential integrity in generated data
- [ ] Test file upload (SQL, CSV, JSON, XML)
- [x] Verify multi-format export functionality

### Medium Priority
- [x] Add scrollbar to Data section for overflow
- [x] Implement "Ask AI" → SQL generation into SQL textbox
- [ ] Add schema input via paste or file upload in Schema tab
- [ ] Dashboard chatbox sticky/fixed positioning
- [x] Chain-of-reasoning display improvements in chat

### Low Priority
- [ ] Create Skill Markdown files in /docs/agents/
- [ ] Add keyboard shortcuts for common actions
- [ ] Improve mobile responsiveness
- [ ] Add dark mode toggle

---

## ✅ Features

### Core
| Status | Feature | Description |
|--------|---------|-------------|
| ✅ | AI Chat with Streaming | Real-time streaming responses with abort support |
| ✅ | Multi-Agent Pipeline | Schema, Data, and Quality agents working in sequence |
| ✅ | Schema Design | AI-powered database schema generation |
| ✅ | Data Generation | Realistic synthetic data with referential integrity |
| ✅ | Frontend Retry with Backoff | Exponential backoff retry for all API calls (1s, 2s, 4s, max 8s) |
| ✅ | Single-Table Data View | Data section shows ONLY the selected table with placeholder when none selected |

### AI & Agents
| Status | Feature | Description |
|--------|---------|-------------|
| ✅ | PII Detection | Automatic detection of personally identifiable information |
| ✅ | Quality Scoring | Automated data quality assessment with quality/PII badges in chat |
| ✅ | Chain-of-Reasoning Display | Detailed reasoning step visualization |
| ✅ | Ask AI → SQL | Natural language to SQL generation |

### Data & Export
| Status | Feature | Description |
|--------|---------|-------------|
| ✅ | Multi-format Export | JSON, CSV, SQL INSERT, Full SQL dump |
| ✅ | File Upload | SQL, CSV, JSON, XML file parsing with drag & drop |
| ✅ | Hierarchical Tree-View | Database/table tree navigation sidebar with column expansion |
| ✅ | Auto-Select First Table | Automatically selects first table when data is generated |

### Visualization
| Status | Feature | Description |
|--------|---------|-------------|
| ✅ | SQL Playground | Interactive SQL editor with AI assistance |
| ✅ | Schema Visualization | ER diagrams with drag-and-drop + minimap |
| ✅ | Agent Pipeline Visualization | Step-by-step agent execution progress |
| ✅ | Auto-scroll Chat | Smart scroll-to-bottom with manual override |
| ✅ | Quality Report Dialog | Full quality report with auto-fix support |
| ✅ | Graph Explorer | Dependency graph with topological sort, cutpoints, BFS reachability |

### Upcoming
| Status | Feature | Description |
|--------|---------|-------------|
| 📋 | Schema Upload via Paste | Paste schema directly into the interface |
| 📋 | Data Anonymization | Automatic PII sanitization |
| 📋 | Custom Agent Instructions | Per-workspace agent customization |
| 📋 | Batch Generation | Generate multiple datasets at once |
| 📋 | API Access | REST API for programmatic data generation |

---

## 🐛 Bug Tracker

### Fixed
| ID | Bug | Fix | Date |
|----|-----|-----|------|
| BUG-001 | 502 Bad Gateway on POST /api/chat | Fixed streaming pipeline, added error handling | 2026-05-12 |
| BUG-002 | Infinite loop in use-database.ts line 29 | Removed useSyncExternalStore with unstable getSnapshot | 2026-05-12 |
| BUG-003 | Maximum Update Depth in SynthForgeApp | Added comparison guards to useEffect hooks | 2026-05-13 |
| BUG-004 | Chat input loses focus on onChange | Added key="chat-input" for stable rendering | 2026-05-13 |
| BUG-005 | Duplicate "Thinking" display | Changed status badge to "Processing" to avoid duplicate | 2026-05-13 |
| BUG-006 | SQL textarea focus/UI issues | Added key="sql-editor" and sqlInputRef | 2026-05-13 |
| BUG-007 | controller.desiredSize check in ai.ts | Fixed `!controller.desiredSize === null` → `controller.desiredSize === null` | 2026-05-13 |
| BUG-008 | Schema Templates section | Removed template section from entire application | 2026-05-13 |
| BUG-009 | setView('dashboard') during render causing infinite re-render | Used StudioRedirect component with useEffect for safe redirect | 2026-05-13 |
| BUG-010 | Quality Report dialog never rendered | Moved QualityReportPanel into Studio view return | 2026-05-13 |
| BUG-011 | Agent steps not clearing between messages | Added setAgentSteps([]) at start of sendMessage | 2026-05-13 |
| BUG-012 | qualityScore/piiCheck null in streaming responses | Added 'metadata' SSE event type with PII/quality data from server | 2026-05-13 |
| BUG-013 | topologicalSort calls buildDependencyGraph in loop | Fixed to use destructured revAdj from initial call | 2026-05-13 |
| BUG-014 | Stream controller.enqueue crash on closed stream | Added safeEnqueue helper with try/catch for multi-step enqueue calls | 2026-05-13 |
| BUG-017 | Persistent 502 Bad Gateway on all pages | Root cause: streaming controller crash + missing allowedDevOrigins. Added safeEnqueue for ALL controller.enqueue calls in chatCompletionStream(), added allowedDevOrigins in next.config.ts for preview domains | 2026-05-13 |
| BUG-018 | Data section shows ALL tables instead of selected | Changed DataWorkspace to render only the selectedTableName table. Added placeholder "Select a table to view data" when none selected | 2026-05-13 |
| BUG-019 | selectedTableName never reset on database switch | Added setSelectedTableName(null) in openDatabase(). Added useEffect to auto-select first table and clear stale selections | 2026-05-13 |
| BUG-020 | No retry on frontend fetch failures | Added fetchWithRetry() with exponential backoff (1s, 2s, 4s, max 8s) for all API calls | 2026-05-13 |

### Active / Monitoring
| ID | Bug | Status | Notes |
|----|-----|--------|-------|
| BUG-015 | FK false-positive in quality check | Known | user_id in users table flagged as orphan FK |
| BUG-016 | SVG wheel events passive by default | Monitoring | e.preventDefault() on wheel may not prevent page scroll in React |

---

## 📊 Progress Summary

- **Features Implemented**: 17 / 20 (85%)
- **Bugs Fixed**: 18
- **Bugs Active**: 2
- **High Priority Todos**: 3 remaining
- **Medium Priority Todos**: 2 remaining
- **Low Priority Todos**: 4 remaining

---

## 🔍 502 Bad Gateway — Root Cause Analysis

### Problem
Application returned 502 Bad Gateway on GET / and GET /favicon.ico.

### Root Cause
1. **Primary**: The `chatCompletionStream()` function in `src/lib/ai.ts` used bare `controller.enqueue()` calls throughout the streaming pipeline. When the client disconnected (proxy timeout, network issues), the controller was already closed, and subsequent writes threw `"Invalid state: Controller is already closed"`. This error propagated and crashed the response handler, causing the reverse proxy (Caddy) to receive no upstream response → 502.

2. **Secondary**: Missing `allowedDevOrigins` in `next.config.ts` caused cross-origin warnings for preview domain requests (`*.space-z.ai`, `*.space.chatglm.site`), which could contribute to request failures.

3. **Tertiary**: No frontend retry mechanism — any network hiccup resulted in immediate error display with no recovery.

### Solution
1. Added `safeEnqueue()` helper in `chatCompletionStream()` that checks `controller.desiredSize !== null` before writing and wraps all operations in try/catch. Replaced ALL bare `controller.enqueue()` calls.
2. Added `try/catch` around `controller.close()` to prevent crash when already closed.
3. Added `allowedDevOrigins: ['.space-z.ai', '.space.chatglm.site', 'localhost']` in `next.config.ts`.
4. Added `fetchWithRetry()` utility with exponential backoff (1s → 2s → 4s, max 8s) for all frontend API calls.
5. Improved error messages to be user-friendly ("Unable to reach the server" instead of "Failed to load workspaces").

### Verification Steps
- [x] `bun run lint` passes with zero errors
- [x] `next build` succeeds with all routes compiled
- [x] All API endpoints return HTTP 200 (/, /api/workspaces, /api/databases, /api/datasets)
- [x] No "Controller is already closed" errors in server logs
- [x] Frontend shows user-friendly error messages on network failure
