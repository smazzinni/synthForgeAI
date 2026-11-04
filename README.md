# SynthForge AI

AI-Powered Synthetic Data Generation Platform with multi-agent pipeline, live DB connections, and CRUD operations via natural language.

## Features

- **Multi-Agent AI Pipeline**: Schema Architect, Data Generator, Quality Analyst, Privacy Officer
- **Live Database Connections**: Connect to PostgreSQL/MySQL and perform CRUD via AI chat
- **Synthetic Data Generation**: Generate realistic, referentially-intact test data
- **AI Chat Studio**: Streaming chat with DeepSeek v4-pro, SQL execution, schema preview
- **Database Management**: Filter, sort, bulk export (JSON/CSV/SQL), detail views
- **Workspaces**: Organize databases into collaborative workspaces
- **Keyboard Shortcuts**: Full studio keyboard navigation

## Prerequisites

- Node.js >= 18.0.0
- npm (the repo ships a `package-lock.json`; use `npm ci` for reproducible installs)

## Quick Start

### 1. Install dependencies

```bash
npm ci
```

### 2. Set up environment variables

```bash
cp .env.example .env
```

Edit `.env` and fill in your actual values:
- `DATABASE_URL` — SQLite for local dev, PostgreSQL for production
- `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_KEY` — Supabase project credentials
- `DEEPSEEK_API_KEY` — Your DeepSeek API key (get one at https://platform.deepseek.com)
- `DEEPSEEK_MODEL` — `deepseek-chat`, `deepseek-reasoner`, or `deepseek-v4-pro`

### 3. Generate Prisma client

```bash
npm run db:generate
```

### 4. Run the development server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Production checklist

- Set `NEXT_PUBLIC_AUTH_ENABLED=true` and the Supabase keys. Every API route verifies the
  Supabase session (set `SUPABASE_JWT_SECRET` for fast local verification); without auth
  enabled the app runs as a single shared demo user.
- Set `CONNECTION_ENCRYPTION_KEY` so saved database passwords are encrypted at rest.
- Run `db-connections-migration.sql` in Supabase if you use live DB connections.
- Data generation runs as a server-side job: it continues if the user closes the tab, saves
  progress every few seconds, and is stopped only by the Stop button. On Vercel it relies on
  `maxDuration` (Fluid compute) — very large generations may need a higher plan limit.
- `GET /api/health` is a safe, unauthenticated probe for uptime monitors.

## Production Deployment

### Build

```bash
npm run build
```

### Start

```bash
npm start
```

### Vercel Deployment

1. Push your code to GitHub
2. Import the repository in Vercel
3. Set all environment variables from `.env.example` in the Vercel dashboard
4. Deploy — Vercel will automatically run `npm install` and `npm run build`

## Available Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Start development server on port 3000 |
| `npm run build` | Create production build |
| `npm start` | Start production server on port 3000 |
| `npm run lint` | Run ESLint |
| `npm run type-check` | Run TypeScript type checker |
| `npm run db:generate` | Generate Prisma client |
| `npm run db:push` | Push Prisma schema to database |
| `npm run db:studio` | Open Prisma Studio |

## Tech Stack

- **Framework**: Next.js 16 (App Router, Turbopack)
- **Language**: TypeScript 5
- **Styling**: Tailwind CSS 4, shadcn/ui (New York)
- **Database**: Prisma ORM (SQLite/PostgreSQL)
- **Auth**: Supabase
- **AI**: DeepSeek v4-pro (streaming, reasoning)
- **State**: Zustand, TanStack Query

## Environment Variables

See [`.env.example`](.env.example) for all required and optional environment variables.

## License

Private — All rights reserved.
