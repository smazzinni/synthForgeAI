# SynthForge AI

**A production-grade, AI-powered synthetic database and data generation platform**

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
- [Project Structure](#project-structure)
- [Database Schema (Supabase)](#database-schema-supabase)
- [Running in Development](#running-in-development)
- [Running in Production](#running-in-production)
- [Deployment](#deployment)
- [Troubleshooting](#troubleshooting)
- [Contributing](#contributing)
- [License](#license)

---

## Overview

SynthForge AI addresses the critical need for realistic synthetic test data in software development and testing. Traditional approaches — either using production data (privacy risk) or manually crafted fixtures (time-consuming, unrealistic) — fall short for modern development teams.

Key differentiators:

- **Three-Phase TDM Pipeline**: Discovery → Schema Mapping → Output Generation ensures data matches real requirements
- **Multi-Agent Orchestration**: 5 specialized agents (Orchestrator, Schema Architect, Data Generator, Quality Analyst, Privacy Officer) handle distinct concerns
- **DeepSeek Reasoner Integration**: Live streaming with Chain-of-Thought reasoning, so you see the AI thinking in real time
- **Preview-First Generation**: Always preview sample rows before full dataset generation
- **Streaming AI Feedback**: Real-time reasoning steps and agent pipeline progress during generation via SSE
- **Built-in Quality Assurance**: Automatic PII detection, referential integrity validation, and quality scoring
- **Dynamic AI-Generated Questions**: Questions and options are dynamically crafted by the AI based on domain research, not hardcoded templates. Volume options, module suggestions, and constraint questions are all contextual to the user's specific domain and use case
- **Interactive Option Buttons**: AI responses include clickable option chips for single-choice and multi-choice questions — no raw JSON shown to users
- **SQL Workspace**: Write and execute SQL queries against generated data with AI-assisted SQL generation
- **ER Diagram Visualization**: Auto-generated entity-relationship diagrams with zoom and pan
- **Supabase Authentication**: Full auth system with login, signup, password reset, and session management

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Framework** | Next.js 16 with App Router |
| **Language** | TypeScript 5 (strict) |
| **Frontend** | React 19 + TailwindCSS 4 + shadcn/ui + Framer Motion |
| **Backend** | Next.js API Routes (serverless functions) |
| **AI** | DeepSeek Reasoner API (streaming) + z-ai-web-dev-sdk |
| **Authentication** | Supabase Auth (email/password, session management) |
| **Database** | Supabase (PostgreSQL) for persistence + Prisma ORM (SQLite) |
| **State** | React hooks + Zustand + @tanstack/react-query |
| **Styling** | TailwindCSS 4 + shadcn/ui components (40+ components) |
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
│  │              AI ORCHESTRATION LAYER                     │  │
│  │                                                         │  │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐ │  │
│  │  │ Orchestrator │  │   Schema     │  │     Data     │ │  │
│  │  │   Agent      │  │  Architect   │  │  Generator   │ │  │
│  │  └──────────────┘  └──────────────┘  └──────────────┘ │  │
│  │  ┌──────────────┐  ┌──────────────┐                    │  │
│  │  │   Quality    │  │   Privacy    │                    │  │
│  │  │   Analyst    │  │   Officer    │                    │  │
│  │  └──────────────┘  └──────────────┘                    │  │
│  └────────────────────────────────────────────────────────┘  │
│                              │                               │
│                    ┌─────────▼─────────┐                     │
│                    │  DeepSeek Reasoner│                     │
│                    │  (Streaming API)   │                     │
│                    └─────────┬─────────┘                     │
│                              │                               │
│  ┌────────────────────────────────────────────────────────┐  │
│  │                 DATA LAYER (Supabase)                   │  │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐            │  │
│  │  │ profiles │  │synthetic_│  │conversat-│            │  │
│  │  │          │  │databases │  │  ions     │            │  │
│  │  └──────────┘  └──────────┘  └──────────┘            │  │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐            │  │
│  │  │ messages │  │ datasets │  │ api_keys │            │  │
│  │  └──────────┘  └──────────┘  └──────────┘            │  │
│  └────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────┘
```

### Three-Phase TDM Pipeline

```
┌─────────────────────────────────────────────────────────────┐
│                    PHASE 1: DISCOVERY                        │
│  Orchestrator → Interactive Interview → Requirements         │
│  ┌───────────────────────────────────────────────────────┐   │
│  │ 1. Domain Detection (ITSM, Healthcare, E-commerce...) │   │
│  │ 2. Volume Clarification (dynamic, domain-appropriate) │   │
│  │ 3. Module Selection (domain-specific options)         │   │
│  │ 4. Constraint Gathering (PII, formats, compliance)    │   │
│  └───────────────────────────────────────────────────────┘   │
│                            │                                 │
│                    Confirmed Requirements                    │
│                            ▼                                 │
│                PHASE 2: SCHEMA MAPPING                       │
│  Schema Architect → Entity Extraction → Relationship Mapping │
│  ┌───────────────────────────────────────────────────────┐   │
│  │ 1. Entity Extraction (tables, columns, types)         │   │
│  │ 2. Relationship Mapping (FKs, cardinality)            │   │
│  │ 3. Constraint Planning (NOT NULL, UNIQUE, CHECK)      │   │
│  │ 4. Schema Validation (referential integrity)          │   │
│  └───────────────────────────────────────────────────────┘   │
│                            │                                 │
│                    Validated Schema                          │
│                            ▼                                 │
│              PHASE 3: OUTPUT GENERATION                      │
│  Data Generator → Preview → Approval → Full Generation      │
│  ┌───────────────────────────────────────────────────────┐   │
│  │ 1. Preview Generation (3-5 sample rows per table)     │   │
│  │ 2. User Approval / Modification                       │   │
│  │ 3. Full Dataset Generation (all rows)                 │   │
│  │ 4. Quality Scoring & PII Detection                    │   │
│  │ 5. Auto-fix (if quality issues detected)              │   │
│  └───────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

---

## Features

### Core Platform

- **Landing Page** — Hero section, animated gradient background, feature cards, statistics, CTA buttons
- **Authentication** — Login, signup, password reset via Supabase Auth; session management with debounced token refresh
- **Dashboard View** — Workspace/project management, database listing, quick actions, sparkline charts, recent activity feed
- **AI Chat Studio** — Real-time streaming chat with SSE, multi-turn conversation history, agent mode selector, resizable panels (1/4 chat + 3/4 data)
- **Schema Visualization** — ER diagrams (SVG) with zoom/pan, table tree view with PK/FK badges and favorites
- **Data Table View** — Sortable, filterable data display per table with copy/export actions and load-more pagination
- **SQL Workspace** — Write SQL queries against generated data, query history, AI-assisted SQL generation, destructive SQL confirmation dialog
- **File Upload** — Drag-and-drop upload for SQL, CSV, JSON, XML files with automatic content extraction
- **Export System** — Export as JSON, CSV, SQL (INSERT statements), or SQL (full DDL+DML) via client-side generators or API

### AI and Agent System

- **Multi-Agent Orchestration** — 5 specialized agents with distinct colors, icons, and system prompts
- **Orchestrator** — Coordinates the multi-agent pipeline, decides which specialist handles each part
- **Schema Architect** — Designs database schemas with proper table relationships, foreign keys, constraints, and normalization
- **Data Generator** — Creates realistic synthetic data rows with proper referential integrity
- **Quality Analyst** — Validates data quality, checks for consistency, verifies referential integrity
- **Privacy Officer** — Ensures all generated data is privacy-compliant, contains no real PII, follows GDPR/CCPA guidelines
- **DeepSeek Reasoner Streaming** — Live Chain-of-Thought reasoning display during AI responses
- **Agent Status Bar** — Shows which agent is currently active with progress percentage
- **Interactive Option Buttons** — AI responses include clickable chips for single-choice and multi-choice questions; NO raw JSON displayed
- **Context-Aware Operations** — AI understands current database schema and data, can handle "add more rows", "modify schema", etc.
- **Destructive Action Confirmation** — AI asks for confirmation before executing DELETE, DROP, TRUNCATE, or mass UPDATE operations

### Data and Export

- **Export Formats** — JSON, CSV, SQL (INSERT statements), SQL (full DDL+DML)
- **Quality Reports** — PII detection with findings, data quality scoring with breakdown
- **Reasoning Steps** — Live display of AI reasoning during generation (intent, domain detection, constraint planning)
- **Clarification Options** — Dynamically generated by AI based on domain research, selectable option chips in chat

### Infrastructure

- **Health Check API** — `/api/health` with Supabase, AI service, and env var checks; failure analysis with recommendations
- **Rate Limiting** — Chat API rate limiter (20 requests/minute per client) with automatic cleanup
- **Request Deduplication** — `api-client.ts` prevents duplicate concurrent API calls with caching and abort support
- **Production Server Manager** — `start.js` with automatic restart on crash, health check monitoring, graceful shutdown
- **Custom HTTP Server** — `server.js` with connection tracking, slow request logging, generous timeouts for AI streaming

---

## Getting Started

### Prerequisites

- **Bun** runtime (v1.0+) — [Install Bun](https://bun.sh/)
- **Node.js** 18+ (for Next.js compatibility)
- **Supabase Account** — [Create a project](https://supabase.com/)
- **DeepSeek API Key** — [Get one here](https://platform.deepseek.com/)

### Installation

```bash
# Clone the repository
git clone <repository-url>
cd my-project

# Install dependencies
bun install

# Set up environment variables (see Configuration section below)
cp .env.example .env.local
# Edit .env.local with your credentials

# Start the development server
bun run dev
```

The application will be available at `http://localhost:3000`.

### First-Time Setup

1. **Configure Supabase**: Create a Supabase project and run the SQL migrations (see [Database Schema](#database-schema-supabase))
2. **Set environment variables**: Copy `.env.example` to `.env.local` and fill in your credentials
3. **Start the dev server**: Run `bun run dev`
4. **Create an account**: Visit `/signup` to register, or use the demo credentials
5. **Start generating**: Go to Dashboard → Studio and describe the data you need

---

## Configuration

### Environment Variables

Create a `.env.local` file in the project root with the following variables:

```env
# ─── Supabase Configuration ───────────────────────────────────────
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here
SUPABASE_SERVICE_KEY=your-service-role-key-here
SUPABASE_URL=https://your-project.supabase.co

# ─── DeepSeek AI Configuration ────────────────────────────────────
DEEPSEEK_API_KEY=your-deepseek-api-key-here
DEEPSEEK_API_URL=https://api.deepseek.com

# When NEXT_PUBLIC_AUTH_ENABLED=false, optional UUID for synthetic_databases.user_id on generate-stream (must exist in profiles if FK enforced)
SYNTHFORGE_DEV_USER_UUID=

# ─── Authentication ───────────────────────────────────────────────
NEXT_PUBLIC_AUTH_ENABLED=true

# ─── Database (Prisma/SQLite) ─────────────────────────────────────
DATABASE_URL=file:/home/z/my-project/db/custom.db
```

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | — | Your Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | — | Supabase anonymous/public key |
| `SUPABASE_SERVICE_KEY` | Yes | — | Supabase service role key (server-side only) |
| `SUPABASE_URL` | No | Same as `NEXT_PUBLIC_SUPABASE_URL` | Server-side Supabase URL override |
| `DEEPSEEK_API_KEY` | Yes | — | DeepSeek API key for AI chat |
| `DEEPSEEK_API_URL` | No | `https://api.deepseek.com` | DeepSeek API endpoint |
| `NEXT_PUBLIC_AUTH_ENABLED` | No | `false` | Enable/disable Supabase auth |
| `SYNTHFORGE_DEV_USER_UUID` | No | — | When auth is disabled, optional `profiles.id` used as `user_id` for streamed generation (avoids anonymous rows) |
| `DATABASE_URL` | No | `file:./db/custom.db` | SQLite database path (Prisma) |

### Agent Configuration

Agent behavior is configured through the AI system prompt in `src/app/api/chat/route.ts`. The following agents are defined:

| Agent | Color | Icon | Role |
|-------|-------|------|------|
| **Orchestrator** | Amber → Red | Sparkles | Coordinates the multi-agent pipeline |
| **Schema Architect** | Violet → Purple | GitBranch | Designs database schemas and relationships |
| **Data Generator** | Emerald → Teal | Database | Creates realistic synthetic data rows |
| **Quality Analyst** | Sky → Blue | CheckCircle2 | Validates data quality and consistency |
| **Privacy Officer** | Rose → Pink | Shield | Ensures privacy compliance |

### Rate Limiting

| Parameter | Default | Description |
|-----------|---------|-------------|
| `CHAT_RATE_LIMIT` | 20 | Max chat requests per window |
| `CHAT_RATE_WINDOW` | 60000 | Rate limit window in milliseconds |
| Payload size limit | 50000 | Max message payload size in bytes |

In-memory rate limiter maps are capped and periodically pruned (`src/lib/in-memory-rate-limit.ts`) so warm server instances do not grow keys without bound.

For streamed generation, apply `supabase/migrations/002_merge_generation_flush.sql` so incremental flushes merge `data_json` atomically in Postgres (avoids lost updates when multiple workers touch the same row).

---

## API Reference

### Authentication

```
POST /api/auth/login       — Sign in with email/password
     Body: { email, password }
POST /api/auth/register    — Register new account
     Body: { email, password, fullName }
POST /api/auth/logout      — Sign out current user
GET  /api/auth/session     — Get current session info
GET  /api/auth/user        — Get current user profile
```

### Chat (AI)

```
POST /api/chat              — Send message and get AI streaming response
     Body: {
       message: string,
       databaseId?: string,
       databaseName?: string,
       conversationId?: string,
       currentSchema?: Array<{ name: string; columns: Array<{ name: string; type: string }> }>,
       currentData?: Record<string, unknown[]>,
       history?: Array<{ role: string; content: string }>
     }
     Response: SSE stream with event types:
       - reasoning  — Chain-of-Thought reasoning step updates
       - content    — Accumulated response content
       - done       — Completion signal
       - finish     — Final response with usage stats
       - error      — Error notification
```

### Databases

```
GET    /api/databases             — List all databases
GET    /api/databases?id=X        — Get single database by ID
POST   /api/databases             — Create a new database
       Body: { name, db_type?, schema_json?, row_count?, quality_score?, status? }
PATCH  /api/databases             — Update a database
       Body: { id, name?, schema_json?, data_json?, row_count?, quality_score?, status? }
DELETE /api/databases?id=X        — Delete a database
```

### Conversations

```
GET  /api/conversations?databaseId=X  — List conversations for database
POST /api/conversations                — Create or append to conversation
     Body: { id?, databaseId?, title?, messages: Array<{ role, content, agentName? }> }
```

### SQL Execution

```
POST /api/sql/execute          — Run a single read-only SELECT (or WITH) against generated in-memory JSON
     Body: { sql, databaseId }
     Response: { rows?, columns?, executionTime?, rowCount?, error? }
```

### Export

```
GET  /api/export?databaseId=X&format=csv    — Export as CSV
GET  /api/export?databaseId=X&format=json   — Export as JSON
GET  /api/export?databaseId=X&format=sql    — Export as SQL
```

### Health Check

```
GET  /api/health              — System health check
     Response: {
       status: 'healthy' | 'degraded' | 'unhealthy',
       timestamp, version, uptime, memory,
       checks: { supabase, ai, envVars },
       failureAnalysis?: { recentFailures, recommendation }
     }
```

---

## Agent System

### How Agents Work

SynthForge AI uses a multi-agent architecture where each agent is defined in `src/lib/ai-agents.ts` with:

- **Unique ID and name** — Used for routing and display
- **Color gradient** — Visual identity in the chat UI
- **Icon** — Lucide icon for avatar
- **System prompt addition** — Specialized instructions appended to the base system prompt

The AI model (DeepSeek Reasoner) decides which agent is active based on the conversation context. Agent transitions are detected by parsing `{"type":"agent_status",...}` blocks in the response, and the UI updates the agent icon, color, and status bar accordingly.

### Interactive Options System

The AI embeds structured option blocks in responses that the frontend parses and renders as clickable buttons:

**Single-choice options:**
```
{"type":"options","question":"What industry?","choices":[{"label":"E-commerce","value":"ecommerce"},...],"multi":false}
```

**Multi-choice options:**
```
{"type":"options","question":"What features?","choices":[{"label":"Soft deletes","value":"soft_deletes"},...],"multi":true}
```

The `parseInteractiveOptions()` function extracts these from the response content, and `cleanDisplayText()` removes the raw JSON so users only see the formatted buttons.

### Response Parsing Pipeline

1. **SSE Stream** → AI response arrives as `reasoning` and `content` events
2. **Agent Status Parsing** → `parseAgentStatus()` detects agent transitions
3. **Options Parsing** → `parseInteractiveOptions()` extracts interactive option blocks
4. **JSON Data Extraction** → `parseAIResponse()` extracts table data from code blocks or raw JSON
5. **Display Text Cleaning** → `cleanDisplayText()` removes all structured blocks from the visible text
6. **UI Rendering** → Clean text + interactive buttons + data tables are rendered

---

## Project Structure

```
my-project/
├── .env                          # Base environment variables
├── .env.local                    # Local environment (gitignored, create from .env.example)
├── README.md                     # This file
├── package.json                  # Dependencies and scripts
├── next.config.ts                # Next.js configuration
├── server.js                     # Custom HTTP server (production)
├── start.js                      # Production server manager with auto-restart
├── tsconfig.json                 # TypeScript configuration
├── components.json               # shadcn/ui component configuration
├── postcss.config.mjs            # PostCSS configuration
├── eslint.config.mjs             # ESLint configuration
│
├── src/
│   ├── app/
│   │   ├── page.tsx              # Landing page (hero, features, stats, CTA)
│   │   ├── layout.tsx            # Root layout with AuthProvider
│   │   ├── globals.css           # Global styles and Tailwind theme
│   │   ├── error.tsx             # Global error boundary
│   │   ├── not-found.tsx         # 404 page
│   │   ├── about/page.tsx        # About page
│   │   ├── pricing/page.tsx      # Pricing page
│   │   ├── contact/page.tsx      # Contact page
│   │   ├── login/page.tsx        # Login page
│   │   ├── signup/page.tsx       # Signup page
│   │   ├── forgot-password/page.tsx # Password reset page
│   │   ├── auth/callback/route.ts   # Auth callback handler
│   │   │
│   │   ├── dashboard/
│   │   │   ├── layout.tsx        # Dashboard layout with sidebar
│   │   │   ├── page.tsx          # Dashboard home (stats, recent activity)
│   │   │   ├── workspaces/page.tsx   # Workspace management
│   │   │   ├── databases/page.tsx    # Database listing
│   │   │   ├── api-keys/page.tsx     # API key management
│   │   │   ├── settings/page.tsx     # Settings page
│   │   │   ├── studio/
│   │   │   │   ├── page.tsx      # Studio page (main AI chat + data view)
│   │   │   │   └── [id]/page.tsx # Studio for specific database (loads data + conversations)
│   │   │
│   │   └── api/
│   │       ├── route.ts          # API root (health check)
│   │       ├── chat/route.ts     # Chat API (DeepSeek streaming)
│   │       ├── databases/route.ts    # Database CRUD
│   │       ├── conversations/route.ts # Conversation CRUD
│   │       ├── sql/execute/route.ts   # SQL execution engine
│   │       ├── export/route.ts        # Data export (CSV, JSON, SQL)
│   │       ├── health/route.ts        # Health check with diagnostics
│   │       └── auth/
│   │           ├── login/route.ts     # Login endpoint
│   │           ├── register/route.ts  # Registration endpoint
│   │           ├── logout/route.ts    # Logout endpoint
│   │           ├── session/route.ts   # Session info
│   │           └── user/route.ts      # User profile
│   │
│   ├── components/
│   │   ├── ui/                   # shadcn/ui components (40+)
│   │   │   ├── button.tsx
│   │   │   ├── input.tsx
│   │   │   ├── dialog.tsx
│   │   │   ├── tabs.tsx
│   │   │   ├── badge.tsx
│   │   │   ├── card.tsx
│   │   │   ├── scroll-area.tsx
│   │   │   └── ... (40+ more)
│   │   ├── layout/
│   │   │   ├── navbar.tsx        # Top navigation bar
│   │   │   ├── footer.tsx        # Footer component
│   │   │   └── dashboard-sidebar.tsx # Dashboard sidebar navigation
│   │   ├── error-boundary.tsx    # React error boundary
│   │   └── theme-provider.tsx    # Dark/light theme provider
│   │
│   ├── lib/
│   │   ├── ai-agents.ts         # Agent definitions, option parsing, display text cleaning
│   │   ├── api-client.ts        # Deduplicated API client with caching
│   │   ├── auth.ts              # Auth utilities
│   │   ├── mock-data.ts         # Mock data for development
│   │   ├── utils.ts             # Utility functions (cn, etc.)
│   │   └── supabase/
│   │       ├── client.ts        # Browser Supabase client (singleton)
│   │       ├── server.ts        # Server-side Supabase client
│   │       ├── admin.ts         # Admin Supabase client (service role)
│   │       └── types.ts         # Supabase database types
│   │
│   └── hooks/
│       ├── use-auth.tsx         # Auth context provider and hook
│       ├── use-toast.ts         # Toast notification hook
│       └── use-mobile.ts        # Mobile viewport detection hook
│
├── public/
│   ├── favicon.ico              # Site favicon
│   ├── logo.svg                 # Logo SVG
│   └── robots.txt               # SEO robots file
│
└── download/                    # Generated files and exports
```

---

## Database Schema (Supabase)

The application uses Supabase (PostgreSQL) for all persistent data. The following tables are required:

### Tables

```sql
-- User profiles (linked to Supabase Auth)
profiles (
  id          UUID PRIMARY KEY REFERENCES auth.users(id),
  full_name   TEXT,
  email       TEXT UNIQUE NOT NULL,
  avatar_url  TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
)

-- Synthetic databases
synthetic_databases (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID REFERENCES profiles(id),
  name          TEXT NOT NULL,
  db_type       TEXT DEFAULT 'postgresql',
  schema_json   JSONB DEFAULT '[]',
  data_json     JSONB DEFAULT '{}',
  row_count     INTEGER DEFAULT 0,
  quality_score DECIMAL(3,2) DEFAULT 0,
  status        TEXT DEFAULT 'draft',
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
)

-- Conversations
conversations (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  database_id UUID REFERENCES synthetic_databases(id) ON DELETE CASCADE,
  user_id     UUID REFERENCES profiles(id),
  title       TEXT DEFAULT 'New Conversation',
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
)

-- Messages
messages (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
  role            TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content         TEXT NOT NULL,
  agent_name      TEXT,
  tokens_in       INTEGER DEFAULT 0,
  tokens_out      INTEGER DEFAULT 0,
  cost            DECIMAL(10,6) DEFAULT 0,
  created_at      TIMESTAMPTZ DEFAULT NOW()
)

-- Datasets (saved snapshots)
datasets (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  database_id UUID REFERENCES synthetic_databases(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  version     INTEGER DEFAULT 1,
  format      TEXT DEFAULT 'json',
  row_count   INTEGER DEFAULT 0,
  data_json   JSONB DEFAULT '{}',
  schema_json JSONB DEFAULT '[]',
  seed        TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
)

-- API Keys
api_keys (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID REFERENCES profiles(id),
  name        TEXT NOT NULL,
  key_hash    TEXT NOT NULL,
  key_prefix  TEXT NOT NULL,
  active      BOOLEAN DEFAULT true,
  last_used   TIMESTAMPTZ,
  created_at  TIMESTAMPTZ DEFAULT NOW()
)
```

### Setting Up Supabase

1. Create a new Supabase project at [supabase.com](https://supabase.com/)
2. Go to the SQL Editor in your Supabase dashboard
3. Run the SQL above to create the required tables
4. Enable Row Level Security (RLS) policies as needed
5. Copy the project URL and keys to your `.env.local`

---

## Running in Development

### Quick Start

```bash
# Install dependencies
bun install

# Set up environment variables
cp .env.example .env.local
# Edit .env.local with your Supabase and DeepSeek credentials

# Start the development server with Turbopack
bun run dev
```

The dev server runs on `http://localhost:3000` with:
- **Turbopack** for fast HMR (Hot Module Replacement)
- **8GB Node memory** (`--max-old-space-size=8192`)
- **TypeScript** error checking (build errors are ignored in dev for speed)

### Development Scripts

| Script | Command | Description |
|--------|---------|-------------|
| `dev` | `bun run dev` | Start Next.js dev server on port 3000 |
| `build` | `bun run build` | Create production build |
| `lint` | `bun run lint` | Run ESLint |
| `db:generate` | `bun run db:generate` | Generate Prisma client |

### Development Workflow

1. Start the dev server: `bun run dev`
2. Open `http://localhost:3000` in your browser
3. Navigate to `/signup` to create an account (or use existing credentials)
4. Go to Dashboard → Studio to start the AI chat
5. Describe the data you need and interact with the AI agent

### Hot Reload Notes

- The `api-client.ts` module includes a cleanup function (`cleanupApiClient()`) that runs on hot module reload to prevent memory leaks from cached intervals and request maps
- The `use-auth.tsx` hook uses `initRef` to prevent double initialization during React strict mode development
- Supabase browser client is a singleton to prevent auth state desync during hot reloads

---

## Running in Production

### Option 1: Next.js Built-in Server (Recommended for Simple Deployments)

```bash
# Build the application
bun run build

# Start with Next.js built-in server
NODE_OPTIONS='--max-old-space-size=8192' next start -p 3000
```

### Option 2: Custom HTTP Server (Recommended for Production)

```bash
# Build the application
bun run build

# Start with custom server (server.js)
node server.js
```

The custom `server.js` provides:
- **Connection tracking** — Monitors active connections and total requests
- **Slow request logging** — Logs requests taking more than 5 seconds
- **Connection: close headers** — Prevents keep-alive resource leaks
- **Generous timeouts** — 5-minute timeout for AI streaming requests
- **Memory monitoring** — Periodic health logs with RSS and heap stats
- **Global error handlers** — Catches unhandled rejections and uncaught exceptions

### Option 3: Production Server Manager (Maximum Reliability)

```bash
# Build the application
bun run build

# Start with auto-restart manager (start.js)
node start.js
```

The `start.js` manager provides everything in `server.js` plus:
- **Automatic restart** — Restarts the server on crash (up to 50 times)
- **Health check monitoring** — Periodic `/api/health` checks every 30 seconds
- **Graceful shutdown** — SIGTERM/SIGINT handling with forced kill after 10s
- **Restart cooldown** — 2-second delay between restarts to prevent crash loops
- **Crash detection** — Resets restart counter if server runs for more than 30 seconds

### Production Configuration

| Setting | Value | Description |
|---------|-------|-------------|
| Node memory | 4096MB (start.js) / 8192MB (dev) | Memory limit for Node.js |
| Server timeout | 300000ms | 5 minutes for AI streaming |
| Keep-alive timeout | 5000ms | Short keep-alive to prevent leaks |
| Max connections | 100 | Concurrent connection limit |
| Health check interval | 30000ms | Automatic health monitoring |
| Max restarts | 50 | Crash recovery limit |

### Environment-Specific Notes

**Production:**
- Set `NODE_ENV=production` for optimized builds and console removal
- Use `start.js` for auto-restart capability
- Consider using a reverse proxy (Nginx, Caddy) in front for SSL termination
- The `compiler.removeConsole` option strips all console logs except `error` and `warn` in production

**Staging/Preview:**
- Same as production but can use `server.js` directly
- Consider reducing memory limits if running on smaller instances

---

## Deployment

### Docker (Recommended)

```dockerfile
FROM oven/bun:1 AS base
WORKDIR /app

# Install dependencies
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

# Copy source and build
COPY . .
RUN bun run build

# Expose port
EXPOSE 3000

# Start with production manager
CMD ["node", "start.js"]
```

### Vercel

```bash
# Deploy to Vercel
vercel deploy --prod
```

Note: The custom `server.js` and `start.js` are not used on Vercel. Vercel handles serverless deployment automatically.

### Manual Server

```bash
# On your server
git pull origin main
bun install
bun run build

# Using PM2 for process management
pm2 start start.js --name synthforge

# Or using systemd
sudo systemctl start synthforge
```

---

## Troubleshooting

### Common Issues

#### 1. "DeepSeek API key not configured" (503 error)

**Cause**: Missing `DEEPSEEK_API_KEY` in `.env.local`

**Fix**: Add your DeepSeek API key to `.env.local`:
```env
DEEPSEEK_API_KEY=sk-your-key-here
```

#### 2. "Supabase connection failing"

**Cause**: Missing or incorrect Supabase environment variables

**Fix**: Verify all three Supabase variables are set:
```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_KEY=eyJ...
```

#### 3. ERR_TOO_MANY_REDIRECTS on login

**Cause**: Supabase auth env vars missing, causing middleware redirect loops

**Fix**: Ensure `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` are set. The middleware is currently a pass-through (`NextResponse.next()`) — if you add server-side auth checks, make sure the login/signup routes are excluded.

#### 4. 413 Payload Too Large on /api/chat

**Cause**: Request payload exceeds the 50KB limit

**Fix**: The chat API has a 50KB payload limit. Reduce the conversation history size or simplify the data being sent. The API already trims history to the last 10 messages.

#### 5. 504 Gateway Timeout during AI generation

**Cause**: DeepSeek Reasoner model can take 30-60 seconds for complex requests

**Fix**: The production server has a 5-minute timeout for AI streaming. Ensure your reverse proxy (if any) also has a sufficiently long timeout. For Nginx:
```nginx
proxy_read_timeout 300s;
proxy_send_timeout 300s;
```

#### 6. Raw JSON appearing in AI chat

**Cause**: The `parseInteractiveOptions()` and `cleanDisplayText()` functions may not catch all JSON block formats

**Fix**: The AI is instructed to embed structured data in specific formats (`{"type":"options",...}` and `{"type":"agent_status",...}`). If you see raw JSON, the response parsing may need updating in `src/lib/ai-agents.ts`. The `parseAIResponse()` function in `studio/page.tsx` also handles JSON code blocks for table data extraction.

#### 7. Auth re-render cascades

**Cause**: Supabase `TOKEN_REFRESHED` events fire every few minutes and trigger unnecessary re-renders

**Fix**: The `use-auth.tsx` hook debounces `TOKEN_REFRESHED` events with a 2-second cooldown and only silently updates the session without triggering loading states.

#### 8. Memory leaks in development

**Cause**: Hot module reloading creates multiple instances of Supabase clients and API client caches

**Fix**: The Supabase browser client uses a singleton pattern. The API client has `cleanupApiClient()` for HMR cleanup. If issues persist, refresh the page.

### Health Check

Visit `/api/health` to get a full system diagnostic:

```json
{
  "status": "healthy",
  "checks": {
    "supabase": { "ok": true, "latencyMs": 45 },
    "ai": { "ok": true, "latencyMs": 2300 },
    "envVars": { "ok": true, "latencyMs": 0 }
  }
}
```

If any check fails, the `failureAnalysis.recommendation` field provides actionable guidance.

---

## Contributing

### Development Setup

1. Fork and clone the repository
2. Install dependencies: `bun install`
3. Create `.env.local` from the template above
4. Start the dev server: `bun run dev`
5. Open `http://localhost:3000` in your browser

### Code Style

- **TypeScript** throughout with strict typing
- **ES6+** import/export syntax
- **shadcn/ui** components preferred over custom implementations
- Use `'use client'` for client-side components
- Follow existing naming conventions: `kebab-case` for files, `PascalCase` for components
- All environment variables accessed on the server must use `process.env.VARIABLE_NAME`
- All client-side environment variables must be prefixed with `NEXT_PUBLIC_`

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
2. Implement changes with appropriate testing
3. Ensure linting passes: `bun run lint`
4. Ensure build passes: `bun run build`
5. Submit PR with a clear description of changes
6. Address review feedback

---

## License

Private — All rights reserved.
