# SynthForge AI

**A production-grade, AI-powered synthetic data generation platform**

SynthForge AI generates privacy-safe, relationally intact synthetic test data through an intelligent multi-agent pipeline. Describe what you need in natural language, and the system orchestrates specialized AI agents to discover requirements, design schemas, generate realistic data, validate integrity, and score quality — all in real time with streaming feedback.

---

## Table of Contents

- [Overview](#overview)
- [Tech Stack](#tech-stack)
- [Architecture](#architecture)
- [Features](#features)
- [Getting Started](#getting-started)
- [Configuration](#configuration)
- [API Reference](#api-reference)
- [Agent System](#agent-system)
- [Database Schema](#database-schema)
- [Project Structure](#project-structure)
- [Contributing](#contributing)
- [License](#license)

---

## Overview

SynthForge AI addresses the critical need for realistic synthetic test data in software development and testing. Traditional approaches — either using production data (privacy risk) or manually crafted fixtures (time-consuming, unrealistic) — fall short for modern development teams.

Key differentiators:

- **Three-Phase TDM Pipeline**: Discovery → Schema Mapping → Output Generation ensures data matches real requirements
- **Multi-Agent Orchestration**: Specialized agents handle distinct concerns (discovery, schema, generation, validation, quality)
- **Preview-First Generation**: Always preview sample rows before full dataset generation
- **Streaming AI Feedback**: Real-time reasoning steps and agent pipeline progress during generation
- **Built-in Quality Assurance**: Automatic PII detection, referential integrity validation, and quality scoring
- **Zero Config AI**: Powered by z-ai-web-dev-sdk — no API keys to manage

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Framework** | Next.js 16 with App Router |
| **Language** | TypeScript 5 (strict) |
| **Frontend** | React 19 + TailwindCSS 4 + shadcn/ui + Framer Motion |
| **Backend** | Next.js API Routes (serverless functions) |
| **AI** | z-ai-web-dev-sdk (OpenAI-compatible API) with multi-agent orchestration |
| **State** | React hooks + Zustand + @tanstack/react-query |
| **Database** | SQLite via Prisma ORM (`file:./db/custom.db`) |
| **Styling** | TailwindCSS 4 + shadcn/ui components + CSS animations |
| **Build** | Turbopack (dev) + Next.js production build |
| **Package Manager** | Bun |

---

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                        SynthForge AI                         │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌────────────────────────────────────────────────────────┐  │
│  │                    FRONTEND (React 19)                  │  │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────────────────┐ │  │
│  │  │  Landing  │  │Dashboard │  │     AI Chat Studio   │ │  │
│  │  │   Page    │  │  View    │  │  ┌────┐ ┌─────────┐  │ │  │
│  │  └──────────┘  └──────────┘  │  │Chat│ │ Schema  │  │ │  │
│  │                              │  │Panel│ │ Preview │  │ │  │
│  │                              │  └────┘ └─────────┘  │ │  │
│  │                              └──────────────────────┘ │  │
│  └────────────────────────────────────────────────────────┘  │
│                              │                               │
│                    ┌─────────▼─────────┐                     │
│                    │   Next.js API     │                     │
│                    │   Routes (REST)   │                     │
│                    └─────────┬─────────┘                     │
│                              │                               │
│  ┌────────────────────────────────────────────────────────┐  │
│  │              AGENT ORCHESTRATION LAYER                  │  │
│  │                                                         │  │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐ │  │
│  │  │  Discovery   │  │    Schema    │  │     Data     │ │  │
│  │  │    Agent     │  │    Agent     │  │   Gen Agent  │ │  │
│  │  │  (Phase 1)   │  │  (Phase 2)   │  │  (Phase 3)   │ │  │
│  │  └──────────────┘  └──────────────┘  └──────────────┘ │  │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐ │  │
│  │  │  Validation  │  │   Quality    │  │  Orchestrator│ │  │
│  │  │    Agent     │  │    Agent     │  │  (Router)    │ │  │
│  │  │  (Phase 2-3) │  │  (Phase 3)   │  │              │ │  │
│  │  └──────────────┘  └──────────────┘  └──────────────┘ │  │
│  │                                                         │  │
│  │  ┌─────────────┐  ┌──────────────┐  ┌───────────────┐ │  │
│  │  │   Skills    │  │  Heartbeat   │  │  Message Bus  │ │  │
│  │  │  Registry   │  │   Monitor    │  │  (Pub/Sub)    │ │  │
│  │  └─────────────┘  └──────────────┘  └───────────────┘ │  │
│  └────────────────────────────────────────────────────────┘  │
│                              │                               │
│                    ┌─────────▼─────────┐                     │
│                    │  z-ai-web-dev-sdk │                     │
│                    │  (AI Completions)  │                     │
│                    └─────────┬─────────┘                     │
│                              │                               │
│  ┌────────────────────────────────────────────────────────┐  │
│  │                  DATA LAYER (Prisma)                    │  │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐            │  │
│  │  │Workspace │  │ Project  │  │ Database │            │  │
│  │  └──────────┘  └──────────┘  └──────────┘            │  │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐            │  │
│  │  │Conversation│ │ Message  │  │AgentStep │            │  │
│  │  └──────────┘  └──────────┘  └──────────┘            │  │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐            │  │
│  │  │ Dataset  │  │SchemaVer │  │FileUpload│            │  │
│  │  └──────────┘  └──────────┘  └──────────┘            │  │
│  └────────────────────────────────────────────────────────┘  │
│                                                              │
│  Storage: SQLite (file:./db/custom.db)                       │
└──────────────────────────────────────────────────────────────┘
```

### Three-Phase TDM Pipeline

```
┌─────────────────────────────────────────────────────────────┐
│                    PHASE 1: DISCOVERY                        │
│  Discovery Agent → Interactive Interview → Requirements      │
│  ┌───────────────────────────────────────────────────────┐   │
│  │ 1. Domain Detection (ITSM, Healthcare, E-commerce...) │   │
│  │ 2. Volume Clarification (10, 25, 50, 100, 500 rows)  │   │
│  │ 3. Module Selection (domain-specific options)          │   │
│  │ 4. Constraint Gathering (PII, formats, compliance)     │   │
│  └───────────────────────────────────────────────────────┘   │
│                            │                                  │
│                    Confirmed Requirements                     │
│                            ▼                                  │
│                PHASE 2: SCHEMA MAPPING                        │
│  Schema Agent → Entity Extraction → Relationship Mapping     │
│  ┌───────────────────────────────────────────────────────┐   │
│  │ 1. Entity Extraction (tables, columns, types)          │   │
│  │ 2. Relationship Mapping (FKs, cardinality)             │   │
│  │ 3. Constraint Planning (NOT NULL, UNIQUE, CHECK)       │   │
│  │ 4. Schema Validation (referential integrity)           │   │
│  └───────────────────────────────────────────────────────┘   │
│                            │                                  │
│                    Validated Schema                           │
│                            ▼                                  │
│              PHASE 3: OUTPUT GENERATION                       │
│  Data Agent → Preview → Approval → Full Generation           │
│  ┌───────────────────────────────────────────────────────┐   │
│  │ 1. Preview Generation (3-5 sample rows per table)      │   │
│  │ 2. User Approval / Modification                        │   │
│  │ 3. Full Dataset Generation (all rows)                  │   │
│  │ 4. Quality Scoring & PII Detection                     │   │
│  │ 5. Auto-fix (if quality issues detected)               │   │
│  └───────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

---

## Features

### Core Platform

- **Landing Page** — Hero section, animated gradient background, feature cards, statistics, CTA buttons
- **Dashboard View** — Workspace/project management, database listing, quick actions
- **AI Chat Studio** — Real-time streaming chat with SSE, multi-turn conversation history, agent mode selector
- **Schema Visualization** — ER diagrams (SVG), table tree view, graph analysis (topological sort, cutpoints, reachability, constraint closure)
- **Data Table View** — Sortable, filterable data display per table with copy/export actions
- **File Upload** — Drag & drop + click upload for SQL, CSV, JSON, XML files with automatic content extraction

### AI & Agent System

- **Multi-Agent Orchestration** — 6 specialized agents with 17 declared skills
- **Discovery Agent** (Phase 1) — Interactive interviews with selectable clarification options
- **Schema Agent** (Phase 2) — Entity extraction, relationship mapping, constraint planning
- **Data Generation Agent** (Phase 3) — Preview-first approach, then full generation
- **Validation Agent** — Referential integrity, business logic, data realism checks
- **Quality Agent** — Quality scoring, auto-fix, PII detection
- **Orchestrator** — Task routing, pipeline lifecycle management, retry logic
- **Skills Registry** — Each agent declares skills with input/output schemas, categories, and priorities
- **Heartbeat Monitor** — Periodic health checks, stale agent detection, status change events
- **Message Bus** — Pub/sub inter-agent communication, shared state, pipeline state management

### Data & Export

- **Export Formats** — JSON, CSV, SQL (INSERT statements), SQL (full DDL+DML)
- **Quality Reports** — PII detection with findings, data quality scoring with breakdown, auto-fix capabilities
- **Reasoning Steps** — Live display of AI reasoning during generation (intent, domain detection, constraint planning, etc.)
- **Agent Pipeline Display** — Real-time agent step progress shown in chat during "AI Thinking..."
- **Clarification Options** — Selectable options in chat for volume, modules, constraints

---

## Getting Started

### Prerequisites

- [Bun](https://bun.sh/) runtime (v1.0+)
- Node.js 18+ (for Next.js compatibility)

### Installation

```bash
# Clone the repository
git clone <repository-url>
cd my-project

# Install dependencies
bun install

# Set up the database
bun run db:push

# Start the development server
bun run dev
```

The application will be available at `http://localhost:3000`.

### Database Setup

The project uses SQLite via Prisma. The database file is stored at `db/custom.db`.

```bash
# Push schema changes to the database
bun run db:push

# Generate Prisma Client (usually auto-run with db:push)
bun run db:generate

# Reset the database (WARNING: deletes all data)
bun run db:reset
```

### Production Build

```bash
# Build for production
bun run build

# Start production server
bun run start
```

---

## Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_URL` | `file:./db/custom.db` | SQLite database file path |

### Agent Configuration

Agent behavior can be configured through the orchestrator's `PipelineConfig`:

| Parameter | Default | Description |
|-----------|---------|-------------|
| `maxConcurrency` | 3 | Maximum concurrent agents |
| `stepTimeoutMs` | 90000 | Timeout per agent step (ms) |
| `retryOnFailure` | true | Retry failed steps |
| `maxRetries` | 1 | Maximum retries per step |
| `useHeartbeat` | true | Enable heartbeat monitoring |
| `useMessageBus` | true | Enable message bus events |

### Heartbeat Configuration

| Parameter | Default | Description |
|-----------|---------|-------------|
| `intervalMs` | 15000 | Heartbeat interval (ms) |
| `missedThreshold` | 2 | Missed beats before suspect |
| `offlineTimeoutMs` | 60000 | Time before marking offline |
| `autoCheck` | true | Automatic stale agent checks |
| `autoCheckIntervalMs` | 10000 | Auto-check interval (ms) |

---

## API Reference

### Workspaces

```
GET  /api/workspaces              — List all workspaces
POST /api/workspaces              — Create a new workspace
     Body: { name, slug, agentInstructions? }
```

### Projects

```
GET  /api/projects?workspaceId=X  — List projects for workspace
POST /api/projects                — Create a new project
     Body: { name, description?, workspaceId }
```

### Databases

```
GET    /api/databases             — List all databases
POST   /api/databases             — Create a new database
       Body: { name, dbType?, schemaJson?, projectId }
DELETE /api/databases?id=X        — Delete a database
```

### Chat (AI)

```
GET  /api/chat?databaseId=X      — Get latest conversation for database
POST /api/chat                    — Send message and get AI response
     Body: {
       message: string,
       conversationId?: string,
       databaseId?: string,
       workspaceId?: string,
       agentMode?: 'plan' | 'execute' | 'auto',
       stream?: boolean,
       rowCount?: number,
       files?: { name, content, type }[]
     }
     Response (non-streaming): { conversationId, message: { ... } }
     Response (streaming): SSE stream with event types:
       - reasoning  — Real-time reasoning step updates
       - content    — Accumulated response content
       - agent_step — Agent pipeline step progress
       - done       — Completion with token counts
       - error      — Error notification
```

### Agents

```
GET  /api/agents?view=status      — Agent registry status (default)
GET  /api/agents?view=skills      — Skills registry with definitions
GET  /api/agents?view=heartbeat   — Heartbeat status for all agents
GET  /api/agents?view=bus         — Message bus history and pipeline states
GET  /api/agents?view=system      — Full system diagnostics
POST /api/agents                  — Agent actions
     Body: {
       action: 'heartbeat' | 'route' | 'reset' | 'ping',
       agentId?: string,
       skillId?: string,
       priority?: number
     }
```

### Quality

```
GET  /api/quality?databaseId=X   — Get quality report for database
POST /api/quality                 — Run quality check
     Body: { databaseId, autoFix?: boolean }
```

### Generate

```
GET  /api/generate?databaseId=X  — Get generation status
POST /api/generate                — Trigger data generation
     Body: { databaseId, prompt, agentMode?, rowCount? }
```

### Datasets

```
GET  /api/datasets?databaseId=X  — List datasets for database
POST /api/datasets                — Create/save a dataset
     Body: { name, format?, databaseId, dataJson, schemaJson? }
```

---

## Agent System

### Agent Architecture

The SynthForge AI agent system follows patterns inspired by LangGraph, AutoGen, and CrewAI, implementing a skills-based registry with heartbeat monitoring and message bus communication.

#### Agent Registry

The `AgentRegistry` is a singleton that manages all agent descriptors. Each agent declares:

- **ID & Name** — Unique identifier and display name
- **Role** — Description of the agent's responsibility
- **Phase** — Which pipeline phase the agent operates in (1, 2, or 3)
- **Skills** — Array of `AgentSkill` objects with input/output schemas
- **Concurrency** — Maximum concurrent tasks
- **Metrics** — Tasks completed, failed, average execution time

```typescript
// Example: Accessing the registry
import { agentRegistry } from '@/lib/agent-registry'

const agents = agentRegistry.getAll()
const summary = agentRegistry.getSummary()
const bestAgent = agentRegistry.findBestForSkill('entity_extraction')
```

#### Registered Agents

| Agent | Phase | Skills | Max Concurrency |
|-------|-------|--------|-----------------|
| **Discovery Agent** | Phase 1 | domain_detection, interactive_interview, requirement_synthesis | 2 |
| **Schema Agent** | Phase 2 | entity_extraction, relationship_mapping, constraint_planning | 2 |
| **Data Generation Agent** | Phase 3 | preview_generation, full_generation, realistic_value_generation | 1 |
| **Validation Agent** | Phase 2-3 | referential_integrity_check, business_logic_validation, data_realism_check | 2 |
| **Quality Agent** | Phase 3 | quality_scoring, quality_autofix, pii_detection | 2 |
| **Orchestrator** | Phase 1 | task_routing, pipeline_orchestration | 3 |

#### Skills (17 total)

| Skill | Category | Agent | Est. Duration |
|-------|----------|-------|---------------|
| domain_detection | discovery | discovery-agent | 3s |
| interactive_interview | discovery | discovery-agent | 4s |
| requirement_synthesis | discovery | discovery-agent | 2s |
| entity_extraction | schema | schema-agent | 5s |
| relationship_mapping | schema | schema-agent | 4s |
| constraint_planning | schema | schema-agent | 3s |
| preview_generation | generation | data-agent | 8s |
| full_generation | generation | data-agent | 15s |
| realistic_value_generation | generation | data-agent | 2s |
| referential_integrity_check | validation | validation-agent | 3s |
| business_logic_validation | validation | validation-agent | 4s |
| data_realism_check | validation | validation-agent | 3s |
| quality_scoring | quality | quality-agent | 5s |
| quality_autofix | quality | quality-agent | 6s |
| pii_detection | pii | quality-agent | 2s |
| task_routing | orchestration | orchestrator | 0.5s |
| pipeline_orchestration | orchestration | orchestrator | 1s |

### Heartbeat Monitor

The `HeartbeatMonitor` implements Kubernetes-style liveness probes:

- Each agent sends periodic heartbeat signals (default: 15s interval)
- Missed heartbeats increment a counter per agent
- After N missed heartbeats (default: 2), the agent is marked suspect
- After the offline timeout (default: 60s), the agent is marked offline
- Status change events are emitted to registered handlers
- The orchestrator automatically routes tasks to healthy alternatives

```typescript
import { heartbeatMonitor } from '@/lib/agent-heartbeat'

// Check agent health
const status = heartbeatMonitor.getStatus()
const isAvailable = heartbeatMonitor.isAvailable('schema-agent')

// Start/stop monitoring
heartbeatMonitor.start()
heartbeatMonitor.stop()
```

### Message Bus

The `AgentBus` implements a publish/subscribe pattern for inter-agent communication:

- **Channels** — Named channels for topic-based messaging
- **Direct Messages** — Agent-to-agent messaging via `agent:<id>` channels
- **Shared State** — Key-value store with versioning and compare-and-swap
- **Pipeline State** — Specialized helpers for managing TDM pipeline state
- **Acknowledgments** — Messages can require acknowledgment from recipients
- **Message History** — Bounded history (1000 messages) with query support

```typescript
import { agentBus } from '@/lib/agent-bus'

// Subscribe to a channel
const unsubscribe = agentBus.subscribe('orchestrator', (msg) => {
  console.log('Received:', msg)
})

// Send a direct message
await agentBus.sendDirectMessage('orchestrator', 'schema-agent', 'task_assignment', {
  task: 'Design schema for e-commerce',
  sessionId: 'session-123'
})

// Pipeline state management
agentBus.initPipelineState('session-123', 'orchestrator')
agentBus.advancePipelinePhase('session-123', 2, 'schema-agent')
const state = agentBus.getPipelineState('session-123')
```

### Orchestrator

The `AgentOrchestrator` coordinates the full pipeline:

1. **Pipeline Planning** — Determines which agents to invoke based on `agentMode` and request complexity
2. **Step Execution** — Executes agent steps sequentially with context passing
3. **Health-Aware Routing** — Routes tasks to healthy agents, falls back to alternatives
4. **Retry Logic** — Configurable retry on failure with max retry count
5. **Metrics Collection** — Tracks task completion, failure rates, and execution times
6. **Pipeline Lifecycle** — Manages creation, execution, and cleanup of pipeline sessions

```typescript
import { agentOrchestrator } from '@/lib/agent-orchestrator'

// Execute a full pipeline
const result = await agentOrchestrator.executePipeline({
  sessionId: 'session-123',
  userMessage: 'Generate ITSM test data with 25 rows',
  agentMode: 'auto',
  isComplexRequest: true,
  onStepUpdate: (step, index) => {
    console.log(`Step ${index}: ${step.agentId} - ${step.status}`)
  }
})

// System diagnostics
const status = agentOrchestrator.getSystemStatus()
```

---

## Database Schema

### Entity Relationship Diagram

```
Workspace ─────────────────────────────────────────
    │                                              │
    ├── 1:N → Project                              │
    │            │                                  │
    │            ├── 1:N → Database                 │
    │            │          │                       │
    │            │          ├── 1:N → Conversation ←┘
    │            │          │         │
    │            │          │         ├── 1:N → Message
    │            │          │         └── 1:N → AgentStep
    │            │          │
    │            │          ├── 1:N → Dataset
    │            │          └── 1:N → SchemaVersion
    │            │
    │            └── (cascading deletes)
    │
    └── 1:N → ApiKey

FileUpload (standalone, optional databaseId reference)
AgentRegistryEntry (standalone, for runtime agent state)
```

### Models

| Model | Purpose | Key Fields |
|-------|---------|------------|
| **Workspace** | Top-level organization | name, slug, agentInstructions |
| **Project** | Group of related databases | name, description, workspaceId |
| **Database** | Schema + generated data container | name, dbType, schemaJson, dataJson |
| **Conversation** | Chat session tied to database | title, agentMode (plan/execute/auto) |
| **Message** | Individual chat message | role, content, tokensIn, tokensOut, cost, agentName, reasoningSteps, options, tablesJson |
| **AgentStep** | Pipeline step tracking | agentName, stepType, stepOrder, input, output, status |
| **Dataset** | Saved dataset snapshot | name, version, format, rowCount, dataJson, schemaJson, seed |
| **SchemaVersion** | Schema version history | version, schemaJson, description |
| **FileUpload** | Uploaded file metadata | filename, mimeType, content, fileType, extractedSchema |
| **ApiKey** | API key management | name, keyHash, keyPrefix, active |
| **AgentRegistryEntry** | Runtime agent state | agentId, name, role, phase, status, skills, maxConcurrency, tasksCompleted, tasksFailed, avgExecTimeMs, lastHeartbeat |

---

## Project Structure

```
src/
├── app/
│   ├── page.tsx                    # Main entry point
│   ├── layout.tsx                  # Root layout
│   ├── globals.css                 # Global styles
│   ├── api/
│   │   ├── route.ts                # Health check
│   │   ├── chat/route.ts           # Chat API (streaming + non-streaming)
│   │   ├── agents/route.ts         # Agent status, skills, heartbeat, bus
│   │   ├── workspaces/route.ts     # Workspace CRUD
│   │   ├── projects/route.ts       # Project CRUD
│   │   ├── databases/route.ts      # Database CRUD
│   │   ├── quality/route.ts        # Quality reports
│   │   ├── generate/route.ts       # Data generation
│   │   └── datasets/route.ts       # Dataset management
│   └── database/[id]/page.tsx      # Database detail page
├── components/
│   ├── synthforge-app.tsx          # Main application component
│   ├── error-boundary.tsx          # Error boundary wrapper
│   ├── explorer-panel.tsx          # Schema explorer sidebar
│   ├── ui/                         # shadcn/ui components (40+)
│   └── synthforge/                 # Feature components
│       ├── types.ts                # Shared types & animation variants
│       ├── chat-panel.tsx          # Chat message list
│       ├── chat-message-bubble.tsx # Individual message bubble
│       ├── chat-input-box.tsx      # Message input with file upload
│       ├── studio-view.tsx         # Studio layout (chat + data)
│       ├── data-table.tsx          # Sortable data table
│       ├── schema-card.tsx         # Schema overview card
│       ├── er-diagram.tsx          # SVG ER diagram renderer
│       ├── table-tree-view.tsx     # Tree view of tables/columns
│       ├── agent-badge.tsx         # Agent status badge
│       ├── agent-pipeline.tsx      # Pipeline step progress display
│       ├── agent-status-panel.tsx  # Agent health dashboard
│       ├── reasoning-timeline.tsx  # AI reasoning step display
│       ├── clarification-options.tsx # Selectable options in chat
│       ├── quality-badge.tsx       # Quality score badge
│       ├── quality-report-panel.tsx # Full quality report display
│       ├── pii-shield-badge.tsx    # PII detection badge
│       ├── quick-actions.tsx       # Quick action buttons
│       └── animated-dots.tsx       # Loading animation
├── lib/
│   ├── ai.ts                       # AI orchestration (prompts, streaming, parsing)
│   ├── agent-registry.ts           # Skills Registry with 6 agents, 17 skills
│   ├── agent-heartbeat.ts          # Heartbeat monitor with stale detection
│   ├── agent-bus.ts                # Message bus (pub/sub, shared state)
│   ├── agent-orchestrator.ts       # Pipeline planning, execution, routing
│   ├── db.ts                       # Prisma client instance
│   └── utils.ts                    # Utility functions
├── hooks/
│   ├── use-mobile.ts               # Mobile detection hook
│   └── use-toast.ts                # Toast notification hook
prisma/
└── schema.prisma                   # Database schema definition
```

---

## Contributing

### Development Setup

1. Fork and clone the repository
2. Install dependencies: `bun install`
3. Set up the database: `bun run db:push`
4. Start the dev server: `bun run dev`
5. Open `http://localhost:3000` in your browser

### Code Style

- **TypeScript** throughout with strict typing
- **ES6+** import/export syntax
- **shadcn/ui** components preferred over custom implementations
- Use `'use client'` for client-side components
- Use `'use server'` for server-only functions (though we prefer API routes)
- Follow existing naming conventions: `kebab-case` for files, `PascalCase` for components

### Linting

```bash
bun run lint
```

### Commit Guidelines

- Use conventional commit format: `feat:`, `fix:`, `docs:`, `chore:`, etc.
- Keep commits focused and atomic
- Write clear, descriptive commit messages

### Pull Request Process

1. Create a feature branch from `main`
2. Implement changes with appropriate tests
3. Ensure linting passes: `bun run lint`
4. Submit PR with a clear description of changes
5. Address review feedback

---

## License

Private — All rights reserved.
