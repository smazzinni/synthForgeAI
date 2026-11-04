# SynthForge AI

**AI-powered synthetic data platform with live database access.** Describe a database in plain
English and SynthForge designs the schema and fills it with realistic, referentially-intact data —
or connect your own PostgreSQL / MySQL database and query, change and export it by chatting with an AI
that asks good questions before it acts.

[![CI](https://github.com/smazzinni/synthForgeAI/actions/workflows/ci.yml/badge.svg)](https://github.com/smazzinni/synthForgeAI/actions/workflows/ci.yml)

---

## Contents

- [Features](#features)
- [How it works](#how-it-works)
- [Quick start (local)](#quick-start-local)
- [Configuration](#configuration)
- [Deploy on Railway](#deploy-on-railway)
- [Other hosting (Docker, Vercel)](#other-hosting-docker-vercel)
- [Working with large data](#working-with-large-data)
- [Live database connections](#live-database-connections)
- [API reference](#api-reference)
- [Testing & CI](#testing--ci)
- [Security](#security)
- [Project structure](#project-structure)
- [Troubleshooting](#troubleshooting)

---

## Features

| Area | What you get |
|---|---|
| **AI Studio (chat)** | Streaming chat with a multi-agent pipeline (Orchestrator, Schema Architect, Data Generator, Quality Analyst, Privacy Officer). The AI asks one focused multiple-choice question whenever the answer changes the result — including mid-task — and you can always type your own answer. |
| **Synthetic data generation** | Any domain, any schema. The AI writes a realistic seed sample, then the expander scales each table up to **100,000 rows (250,000 per generation)** with valid foreign keys, unique ids/emails and realistic distributions. |
| **Survives disconnects** | Generation runs as a server-side job. Close the tab, lose Wi-Fi, refresh — it keeps going, saves progress every few seconds, and the studio picks it back up. Only **Stop** cancels it. |
| **SQL on generated data** | A real SQL engine (JOINs, GROUP BY, aggregates, CTEs, sub-queries, multi-statement scripts, INSERT/UPDATE/DELETE, CREATE/ALTER/DROP TABLE) with Postgres syntax support. |
| **Live databases** | Connect PostgreSQL- or MySQL-compatible databases (Supabase, Neon, RDS/Aurora, Railway, Render, CockroachDB, PlanetScale, MariaDB, TiDB…). Run **every** statement type from the SQL tab or the AI chat; destructive statements ask for confirmation first; multi-statement SQL runs in one transaction and rolls back on error. |
| **Data & Explorer tabs** | Server-side paging, sorting and filtering for tables with millions of rows; exact row counts; ER diagram of tables and relationships. |
| **Export** | SQL dump, CSV, JSON or Excel — for generated databases *and* connected live databases, whole database or a single table. |
| **Accounts** | Supabase Auth (email/password); every record is scoped to its owner. A single-user demo mode works with zero setup. |
| **Mobile** | Responsive layout with a drawer sidebar and a Chat / Data toggle in the studio. |

## How it works

```
Browser (Next.js app)
  │  chat / SQL / explorer / export
  ▼
Next.js API routes (Node runtime)
  ├─ /api/chat ─────────────► DeepSeek (streaming)          AI answers, questions, SQL
  ├─ /api/generate-stream ──► generation job registry ─► DeepSeek seed rows ─► data expander
  │                                                    └─► progress persisted every few seconds
  ├─ /api/sql/execute ──────► AlaSQL engine over the stored JSON dataset
  ├─ /api/connections/* ────► pg / mysql2 pools ─► YOUR database (transactions, confirmation)
  ├─ /api/export ───────────► SQL / CSV / JSON / Excel
  └─ storage: Supabase  →  Prisma (PostgreSQL)  →  in-memory (dev fallback)
```

## Quick start (local)

Requirements: **Node.js ≥ 20.9**, npm, and Docker (for the local Postgres) or any Postgres 14+.

```bash
git clone https://github.com/smazzinni/synthForgeAI.git
cd synthForgeAI
cp .env.example .env            # then set DEEPSEEK_API_KEY
docker compose up -d db         # Postgres on localhost:5432
npm ci
npm run db:deploy               # apply Prisma migrations
npm run dev                     # http://localhost:3000
```

Without `DATABASE_URL` the app still runs (in-memory storage), and without `DEEPSEEK_API_KEY`
everything except AI chat/generation works.

## Configuration

All settings are environment variables (see [`.env.example`](.env.example)).

| Variable | Required | Purpose |
|---|---|---|
| `DATABASE_URL` | recommended | PostgreSQL URL for the app's own storage (Prisma). Migrations run on boot in Docker/Railway. |
| `DEEPSEEK_API_KEY` | for AI | DeepSeek API key. |
| `DEEPSEEK_MODEL` | no | `deepseek-chat` (default), `deepseek-reasoner`, … |
| `DEEPSEEK_BASE_URL` | no | Override the API base URL (OpenAI-compatible endpoints). |
| `DEEPSEEK_MAX_TOKENS` | no | Max tokens per AI call (default 32000). |
| `CONNECTION_ENCRYPTION_KEY` | **production** | Encrypts saved external-database passwords (AES-256-GCM). `openssl rand -base64 32`. |
| `NEXT_PUBLIC_AUTH_ENABLED` | for accounts | `true` turns on Supabase login in the UI. Build-time value. |
| `AUTH_REQUIRED` | no | Runtime switch for the API (`true`/`false`); overrides the build-time flag on the server. |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | for accounts | Supabase project (browser login). |
| `SUPABASE_SERVICE_KEY` | optional | Use Supabase tables as storage instead of Prisma. |
| `SUPABASE_JWT_SECRET` | recommended with auth | Verifies session tokens locally (no network round-trip). |
| `GENERATION_SEED_ROWS` | no | Rows per table the AI writes before the expander takes over (default 200). |
| `DB_SSL_REJECT_UNAUTHORIZED` | no | `true` to verify TLS certificates of external databases. |
| `ALLOW_PRIVATE_DB_HOSTS` | no | `true` to allow connections to private/internal addresses in production (blocked by default). |

## Deploy on Railway

Everything — the app **and** its PostgreSQL database — runs on Railway.

1. **Create a project** → *New* → *Database* → **PostgreSQL**.
2. *New* → *GitHub Repo* → `smazzinni/synthForgeAI`. `railway.json` tells Railway to build the
   `Dockerfile`, health-check `/api/health` and restart on failure. Migrations run automatically.
3. **Variables** on the app service:
   ```
   DATABASE_URL=${{Postgres.DATABASE_URL}}
   CONNECTION_ENCRYPTION_KEY=<openssl rand -base64 32>
   DEEPSEEK_API_KEY=<your key>
   # optional accounts:
   NEXT_PUBLIC_AUTH_ENABLED=true
   NEXT_PUBLIC_SUPABASE_URL=…  NEXT_PUBLIC_SUPABASE_ANON_KEY=…  SUPABASE_JWT_SECRET=…
   ```
4. *Settings* → *Networking* → **Generate Domain** (port 3000).

Pushes to `main` redeploy automatically when the repo is connected. To deploy from GitHub Actions
instead, add the repo secret `RAILWAY_TOKEN` (project token) and variable `RAILWAY_SERVICE`; the
[`deploy-railway.yml`](.github/workflows/deploy-railway.yml) workflow deploys after CI passes.

## Other hosting (Docker, Vercel)

**Docker** (any host):

```bash
docker build -t synthforge .
docker run -p 3000:3000 --env-file .env synthforge
# or the full local stack:
docker compose up --build
```

**Vercel** works for the UI and APIs, but serverless time limits (≤300 s) cap how long a single
generation job can run; very large generations and long-lived DB pools are better on Railway/Docker.

## Working with large data

- **Generation**: the AI produces up to `GENERATION_SEED_ROWS` realistic rows per table, then the
  [data expander](src/lib/server/data-expander.ts) synthesises the rest locally — new unique ids,
  foreign keys that always reference existing parent rows (parents are expanded first), numbers and
  dates within the observed ranges, categories with the observed distribution, unique emails /
  usernames. 70,000 rows across two related tables take ~20 s end to end.
- **Browsing**: the studio loads a 200-row preview per table and pages the rest from the server
  (`/api/databases/:id/rows`, `/api/connections/:id/rows`) with sorting and filtering.
- **SQL**: results return at most 1,000 rows (with the true match count and a *truncated* notice);
  use `LIMIT`, `WHERE` or export for more.
- **Export**: generated databases export in full; live databases export up to 50,000 rows per table.
- **Limits**: 100,000 rows per table / 250,000 per generation. The dataset is stored as one JSON
  document per database, so keep individual databases under a few hundred thousand rows.

## Live database connections

Add a connection from **DB Connections** (fill the form or paste a connection string such as
`postgresql://user:pass@host:5432/db?sslmode=require`). Then open it in the studio:

- **Data / Explorer** — browse every table with server-side paging and exact counts; ER diagram.
- **SQL tab** — run anything: SELECT, INSERT/UPDATE/DELETE, DDL, GRANT, EXPLAIN, SHOW, CALL…
- **AI chat** — "show the 10 biggest orders", "add 20 realistic customers", "add a status column"…
  The AI reads the schema first, asks one question when something is ambiguous (which rows, how many,
  which table), runs read queries automatically and shows results inline.
- **Safety** — DELETE, DROP, TRUNCATE, ALTER, GRANT/REVOKE and UPDATE without WHERE always ask for
  confirmation. Multi-statement SQL runs in a transaction: if any statement fails, nothing is changed.
- **Supabase**: use the pooler host (`aws-0-<region>.pooler.supabase.com`, user `postgres.<project-ref>`)
  or the direct host `db.<project-ref>.supabase.co`; SSL is enabled automatically.

## API reference

All endpoints require a Supabase session (cookie or `Authorization: Bearer <token>`) when auth is
enabled, and are scoped to the caller.

| Method & path | Description |
|---|---|
| `POST /api/chat` | Streaming AI chat (SSE: `content`, `reasoning`, `truncated`, `finish`, `done`, `error`). |
| `POST /api/generate-stream` | Start a generation job; SSE progress (`job_started`, `progress`, `table_complete`, `complete`, `cancelled`, `error`). |
| `GET /api/generate-stream?jobId=…\|databaseId=…` | Job status JSON, or re-attach with `Accept: text/event-stream`. |
| `DELETE /api/generate-stream?jobId=…` | Stop a job (rows so far are kept). |
| `GET/POST/PATCH/DELETE /api/databases` | Synthetic databases CRUD (`?id=…&preview=N`). |
| `GET /api/databases/:id/rows` | Paged rows: `table, offset, limit, sort, dir, q`. |
| `POST /api/sql/execute` | Run SQL on a synthetic database (`databaseId`) or a connection (`connectionId`). |
| `GET/POST /api/connections` | List / create (and test) external connections. |
| `GET/PATCH/DELETE /api/connections/:id` | Read (`?include=introspect` → schema, sample, counts) / update / delete. |
| `GET /api/connections/:id/rows` | Paged rows of a live table. |
| `POST /api/connections/execute` | Run SQL on a live database (`skipDangerousCheck` after the user confirms). |
| `POST /api/connections/:id/agent` | `introspect` (schema + counts), `execute`, `verify` (read-only). |
| `POST /api/export` | `{databaseId \| connectionId, format: sql\|csv\|json\|xlsx, tableName?}` → file. |
| `GET/POST/DELETE /api/conversations` | Chat history. |
| `GET /api/health` | Public health probe (storage, AI, auth status — no secrets). |

## Testing & CI

```bash
npm test                      # unit tests (vitest): SQL engine, expander, auth, crypto, jobs, …
npx tsc --noEmit && npx eslint src --quiet
./e2e/seed.sh && node e2e/live-db.mjs   # 83 end-to-end scenarios against real Postgres + MySQL
```

GitHub Actions ([`ci.yml`](.github/workflows/ci.yml)) runs on every push and PR:

- **verify** — lint, type-check, unit tests, production build, smoke test against Postgres
- **E2E (live Postgres + MySQL connections)** — the 83-scenario suite against real database services
- **docker** — builds the production image

## Security

- Every API route verifies the Supabase JWT signature (HS256 locally or via Supabase Auth); there
  is no trust in client-supplied user ids. Records are owner-scoped in every storage backend.
- External database passwords are encrypted at rest and never returned to the browser.
- Connections to private/internal network addresses are blocked in production (SSRF guard).
- Destructive SQL requires explicit confirmation; multi-statement SQL is transactional.
- Per-user rate limits; security headers (HSTS, X-Frame-Options, nosniff…); no wildcard CORS.
- Report vulnerabilities privately to the repository owner.

## Project structure

```
src/
  app/
    api/                 route handlers (chat, generate-stream, databases, connections, sql, export, …)
    dashboard/           studio, databases, connections, settings pages
  components/            UI (shadcn/ui) and layout
  lib/
    server/              auth, crypto, rate limits, generation jobs, SQL engine, data expander, storage
    db-connections/      external DB store, executor (pools, transactions), confirmation rules
prisma/                  schema + migrations (PostgreSQL)
e2e/                     live-database end-to-end suite
Dockerfile, railway.json, docker-compose.yml, .github/workflows/
```

## Troubleshooting

| Symptom | Fix |
|---|---|
| `/api/health` → `storage: error` | `DATABASE_URL` unreachable, or run `npm run db:deploy`. |
| AI chat says the service is not configured | Set `DEEPSEEK_API_KEY`. |
| "Connections to private or internal network addresses are not allowed" | Expected in production; set `ALLOW_PRIVATE_DB_HOSTS=true` only for trusted self-hosted setups. |
| Supabase connection: "tenant/user not found" | Pooler user must be `postgres.<project-ref>` and the region must match. |
| Everyone shares the same data | Auth is off (demo mode). Set `NEXT_PUBLIC_AUTH_ENABLED=true` + Supabase keys (or `AUTH_REQUIRED=true`). |
| Prisma: "URL must start with file:" | Stale client — run `npx prisma generate`. |
