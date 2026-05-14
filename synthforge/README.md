# SynthForge AI

**AI-Powered Synthetic Data Generation Platform**

SynthForge AI is a full-stack web application that uses multi-agent AI orchestration to generate realistic, privacy-safe synthetic data. Describe your data needs in plain English, and the system automatically designs schemas, generates data with referential integrity, validates quality, and provides export capabilities.

## Key Features

- **Multi-Agent AI System** — Plan Agent, Execute Agent, and Auto Agent orchestrate schema design, data generation, and quality validation
- **Streaming Chat Interface** — Real-time streaming responses with progress indicators, abort/cancel support, and agent pipeline visualization
- **PII Detection & Shielding** — Automatic detection and redaction of personally identifiable information (emails, phones, SSNs, credit cards)
- **Data Quality Scoring** — Real-time quality analysis with 11 check types and auto-fix/self-heal capabilities
- **ER Diagram Visualization** — Interactive SVG-based entity-relationship diagrams with drag/pan/zoom and minimap
- **Graph Analysis** — Topological sort, cutpoint detection, BFS reachability, DFS traversal, cycle detection, constraint closure
- **SQL Playground** — Built-in SQL query editor with syntax highlighting and validation
- **Multi-format Export** — Export data as JSON, CSV, SQL INSERT statements, or full SQL schemas
- **File Upload & Schema Extraction** — Upload SQL, CSV, JSON, or XML files; auto-detect schema and cross-file relationships

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16 (App Router) |
| UI | React 19, TailwindCSS 4, shadcn/ui, Framer Motion |
| State | Zustand 5 |
| Database | SQLite via Prisma 6 |
| AI | z-ai-web-dev-sdk (DeepSeek API compatible) |
| Language | TypeScript 5 |

## Prerequisites

- **Node.js** 18.17 or later
- **npm** 9+ or **pnpm** 8+ or **yarn** 1.22+
- **AI API Key** — A DeepSeek-compatible API key (or any OpenAI-compatible endpoint)

## Installation

```bash
# 1. Clone the repository
git clone <repository-url>
cd synthforge

# 2. Install dependencies
npm install

# 3. Set up environment variables
cp .env.local.example .env.local
# Edit .env.local and add your DEEPSEEK_API_KEY

# 4. Initialize the database
npx prisma db push

# 5. Start the development server
npm run dev
```

The app will be available at `http://localhost:3000`.

## Environment Variables

| Variable | Required | Description | Example |
|----------|----------|-------------|---------|
| `DEEPSEEK_API_KEY` | Yes | API key for the AI provider (DeepSeek or OpenAI-compatible) | `sk-4185dcf...` |
| `DATABASE_URL` | No | SQLite database path (default: `file:./db/custom.db`) | `file:./db/custom.db` |
| `LOG_LEVEL` | No | Logging verbosity: `debug`, `info`, `warn`, `error` (default: `info`) | `debug` |
| `NODE_ENV` | No | Runtime environment | `development` |

## Running the App

### Development

```bash
npm run dev
```

Starts the Next.js dev server on port 3000 with hot reloading.

### Production Build

```bash
npm run build
npm start
```

Creates an optimized production build and starts the server.

### Using the start script

```bash
./start.sh
```

Kills any existing dev server, clears the `.next` cache, and starts fresh on port 3000.

## Running Tests

```bash
npm test
```

> Note: The test suite is minimal in the current version. Contributions welcome.

## Project Structure

```
synthforge/
├── prisma/
│   └── schema.prisma          # Database models (Workspace, Project, Database, Conversation, Message, etc.)
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── route.ts       # Health check endpoint (GET /api)
│   │   │   ├── chat/          # Chat API with streaming SSE + multi-agent orchestration
│   │   │   ├── databases/     # CRUD operations for databases
│   │   │   ├── datasets/      # Dataset listing and saving
│   │   │   ├── generate/      # Direct data generation endpoint
│   │   │   ├── projects/      # Project management
│   │   │   ├── quality/       # Data quality checks with 11 validators + auto-fix/self-heal
│   │   │   ├── upload/        # Multi-file upload with schema extraction
│   │   │   └── workspaces/    # Workspace management
│   │   ├── globals.css        # Tailwind v4 + custom CSS variables + scrollbar styles
│   │   ├── layout.tsx         # Root layout with ErrorBoundary and Toaster
│   │   └── page.tsx           # Dynamic import of SynthForgeApp (SSR disabled)
│   ├── components/
│   │   ├── chat/
│   │   │   ├── chat-panel.tsx       # Chat panel with messages, input, file drag-and-drop
│   │   │   └── chat-message.tsx     # Message rendering with reasoning timeline, SQL blocks, actions
│   │   ├── common/
│   │   │   ├── animated-dots.tsx    # Loading dots animation
│   │   │   └── badges.tsx           # QualityBadge, PIIShieldBadge, AgentBadge
│   │   ├── data/
│   │   │   ├── data-table.tsx       # Paginated data table with column type badges
│   │   │   └── schema-card.tsx      # Schema column display with PK/FK icons
│   │   ├── quality/
│   │   │   └── quality-report.tsx   # Quality report dialog with score and issues
│   │   ├── ui/                      # shadcn/ui components (button, card, dialog, etc.)
│   │   ├── visualization/
│   │   │   ├── agent-pipeline.tsx   # Agent step progress visualization
│   │   │   └── schema-visualization.tsx  # ER diagram + Explorer tree/graph
│   │   ├── workspace/
│   │   │   └── data-workspace.tsx   # Tabbed right panel (Data, Schema, ER, SQL, Explorer)
│   │   ├── error-boundary.tsx       # React ErrorBoundary with structured logging
│   │   └── synthforge-app.tsx       # Main app: Landing, Dashboard, Studio views
│   ├── hooks/
│   │   ├── use-chat.ts              # Chat logic with SSE streaming, abort/retry/regenerate
│   │   ├── use-database.ts          # Workspace/project/database CRUD operations
│   │   ├── use-export.ts            # Export to JSON/CSV/SQL, copy to clipboard
│   │   ├── use-graph-analysis.ts    # Graph algorithms (topo sort, cutpoints, BFS, DFS, cycles)
│   │   ├── use-mobile.ts            # 768px breakpoint detection
│   │   ├── use-quality.ts           # Quality check runner with auto-fix
│   │   └── use-toast.ts             # Toast notification system
│   ├── lib/
│   │   ├── ai.ts                    # AI orchestration: multi-agent prompts, local fallback, PII detection, quality scoring
│   │   ├── constants.ts             # Animation variants, schema templates
│   │   ├── db.ts                    # Prisma singleton with graceful shutdown
│   │   ├── logger.ts                # Server-side logger with file rotation
│   │   ├── sql-utils.tsx            # SQL syntax highlighting and validation hooks
│   │   ├── types.ts                 # TypeScript interfaces
│   │   └── utils.ts                 # cn() helper (clsx + tailwind-merge)
│   └── stores/
│       └── app-store.ts             # Zustand store (~60 state slices)
├── log/                              # Server logs (auto-created, git-ignored)
├── .env.local.example               # Environment variable template
├── .gitignore                        # Git ignore rules
├── next.config.ts                    # Next.js configuration
├── package.json                      # Dependencies and scripts
├── start.sh                         # Dev server start script
├── tailwind.config.ts                # TailwindCSS configuration
└── tsconfig.json                     # TypeScript configuration
```

## Logging

All server-side logs are written to `/log/app.log` with automatic rotation:

- **Location**: `<project-root>/log/app.log`
- **Rotation**: When the log file exceeds 10MB, it is rotated to `app.log.1` (up to `app.log.5`, oldest deleted)
- **Log levels** (controlled by `LOG_LEVEL` env var):
  - `debug` — Verbose output for development
  - `info` — Standard operational messages (default in production)
  - `warn` — Warning conditions
  - `error` — Error conditions
- **Format**: `[ISO_TIMESTAMP] [LEVEL] message {data}`

To change log level, set the `LOG_LEVEL` environment variable in `.env.local`:

```bash
LOG_LEVEL=debug  # for development
LOG_LEVEL=info   # for production
```

## Deployment

### Vercel

```bash
npm run build
vercel deploy --prod
```

Ensure environment variables (`DEEPSEEK_API_KEY`, `DATABASE_URL`, `LOG_LEVEL`) are set in the Vercel dashboard. Note: SQLite is file-based and not ideal for serverless — consider migrating to PostgreSQL for production.

### Docker

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npx prisma db push
RUN npm run build
EXPOSE 3000
CMD ["npm", "start"]
```

### Custom Server

```bash
npm run build
NODE_ENV=production LOG_LEVEL=info node .next/standalone/server.js
```

## Troubleshooting

### Infinite Re-render / Maximum Update Depth

**Symptom**: Browser console shows "Maximum update depth exceeded" or the page freezes with constant re-renders.

**Cause**: The Zustand selector `useAppStore((s) => s.projects.flatMap(...))` returned a new array reference on every call, causing infinite re-subscriptions.

**Fix**: Already resolved — `allDatabases` is now derived via `useMemo` from the stable `projects` selector. If you encounter similar issues with other Zustand selectors, ensure they return referentially stable values (primitives or the same object/array reference).

### 502 Bad Gateway

**Symptom**: API requests return 502 errors.

**Cause**: The Next.js development server crashed or was not running.

**Fix**: Restart the dev server with `./start.sh` or `npm run dev`. Check `log/app.log` for error details.

### AI Chat Not Responding

**Symptom**: Chat sends a message but no response comes back.

**Cause**: The AI API key is invalid or the AI service is unavailable.

**Fix**:
1. Verify `DEEPSEEK_API_KEY` in `.env.local`
2. Check network connectivity
3. The system falls back to local data generation if the AI is unavailable — look for "local fallback" indicators in the chat

### Missing Styles in Production

**Symptom**: Some Tailwind classes don't appear in production builds.

**Cause**: The `tailwind.config.ts` content paths must include all source directories.

**Fix**: Ensure `content` array in `tailwind.config.ts` includes `./src/**/*.{js,ts,jsx,tsx,mdx}` patterns.

## License

Private — All rights reserved.
