# SynthForge AI — demo runbook

A 10-minute walkthrough that shows the strongest parts of the product, with
numbers measured against the real DeepSeek API on 2026-11-05.

## 0. Before the demo (15 minutes earlier)

| Check | How | Expected |
|---|---|---|
| App is up | open `https://<your-app>/api/health` | `"status":"healthy"`, `"ai":"ok"`, `"storage":"ok"` |
| AI key works | `ai` in the health check is `ok`; send "hi" in AI chat | reply in ~1–2 s |
| You can log in | sign in with the demo account | lands on the dashboard |
| Live demo database | a **separate** Postgres/MySQL database with sample data (not the app's own database) | connects from *Connections* |
| Warm-up | run one small generation | the first request after a deploy is slower |

Railway variables the app needs: `DATABASE_URL=${{Postgres.DATABASE_URL}}`,
`DEEPSEEK_API_KEY`, `CONNECTION_ENCRYPTION_KEY` (32+ random chars),
`NEXT_PUBLIC_APP_URL=https://<your-app>`, `AUTH_REQUIRED=true`.

> If Railway shows **"Application not found"**, the domain is not attached to
> a running service: in Railway open the app service → *Settings → Networking*
> and generate/attach the domain again, and make sure the latest deployment is
> *Active* (redeploy if it is *Removed* or *Crashed*).

**Live demo database tip:** never point the live-DB demo at the app's own
database (it holds users and sessions). Create a second database, e.g. in the
Railway Postgres: `CREATE DATABASE demo_shop;`, then load data into it — the
quickest way is to generate an e-commerce dataset in SynthForge, *Export →
SQL*, and run that file against `demo_shop`.

## 1. The 30-second pitch

"Describe a database in one sentence. SynthForge's AI agents design the schema,
ask only the questions that matter, and generate thousands of realistic,
referentially-correct rows in seconds. Then you can explore it, query it with
SQL, export it — or connect your own live database and work on it in plain
English."

## 2. Script

### Step 1 — A vague request: the AI asks smart questions (≈1 min)
AI chat → type: **`create a database for a hospital`**

- In ~2 s the Schema Architect lists the entities and shows **one form** with
  2–4 questions, each about one decision, e.g.
  - **Modules** (multi-select): Clinical core · Billing & insurance · Inpatient & beds · Pharmacy & labs
  - **Scale**: 50 · 1,000 · 25,000 rows per table
  - **Locale**: US · UK · EU
- Point out: recommended answers are pre-selected, each choice explains its
  trade-off, "Other…" lets you type anything, one click sends all answers.
- Tick **Billing & insurance**, pick **1,000 rows per table**, press **Send answers**.

### Step 2 — Agents at work (≈40 s)
- The status line walks through Schema Architect → Quality Analyst → Privacy
  Officer → Data Generator.
- Measured: 8 tables, **6,240 rows in ~31 s** (AI writes a realistic sample
  of every table in parallel, the expander scales it up with valid foreign
  keys, the Quality Analyst repairs integrity, the Privacy Officer scrubs
  real-looking PII).

### Step 3 — Explore and query (≈2 min)
- *Explorer*: open `appointments`, show patient/doctor IDs that resolve to real
  rows; page through 1,000 rows instantly (server-side paging).
- *SQL*: run a join, for example
  ```sql
  SELECT d.name AS department, COUNT(*) AS appointments
  FROM appointments a JOIN doctors doc ON doc.id = a.doctor_id
  JOIN departments d ON d.id = doc.department_id
  GROUP BY d.name ORDER BY appointments DESC;
  ```
- Ask the chat: **`which doctors have the most appointments?`** — it writes and
  runs the SQL for you.

### Step 4 — A precise request: zero questions (≈30 s)
New chat → **`make an e-commerce database with 1000 customers and 5000 orders, US data`**
- No questions — it goes straight to design and picks sensible related counts
  (products, order_items, reviews, payments).

### Step 5 — Your live database (≈3 min)
*Connections* → add the `demo_shop` database → open it in AI chat.
- **`Which 5 customers placed the most orders?`** → the AI writes a SELECT, runs
  it, and summarises the result.
- **`Cancel the old pending orders`** → the AI first inspects the schema; if the
  request is ambiguous it asks (e.g. *which* orders count as old) instead of
  guessing. Any write shows the SQL and needs your confirmation; it runs in a
  transaction.
- Show *Export* of the live database (SQL / CSV / JSON).

### Step 6 — Resilience (optional, 30 s)
Start a large generation, close the tab, reopen the app: the job kept running
on the server and the database is there.

## 3. Talking points

- **Questions like a senior engineer:** one decision per question, defaults
  pre-selected, all questions in one form, and none at all when the request is
  already specific.
- **Correct data, not just plausible data:** primary keys unique, every foreign
  key points at an existing parent, child rows dated after their parents,
  unique columns de-duplicated.
- **Fast at scale:** up to 100,000 rows per table / 250,000 per run; the AI
  writes only a sample, so large runs cost seconds, not minutes.
- **Safe by default:** synthetic e-mails on reserved domains, unissuable SSNs,
  test card numbers; live-DB writes need confirmation; private network
  addresses are blocked; stored DB passwords are encrypted (AES-256-GCM).
- **Works without the AI:** if the AI service is down, the built-in generator
  still produces typed, related data from the schema.

## 4. How it compares (for questions)

| Approach | Examples | Difference |
|---|---|---|
| Learns from your real data | Gretel (now part of NVIDIA), MOSTLY AI | needs real data first; SynthForge starts from a sentence |
| Masks/subsets production data | Tonic.ai | needs production access; SynthForge needs none |
| Rule/field generators | Faker, Mockaroo | you define every field; SynthForge designs the schema and relationships |

## 5. If something goes wrong

| Symptom | Quick fix |
|---|---|
| AI reply is slow or errors | send again; generation still completes with the built-in generator |
| "Authentication required" | log in again (sessions expire) |
| Live DB won't connect | check host/port, SSL, and that the DB is reachable from the internet (private IPs are blocked on purpose) |
| Railway URL down | run locally: `docker compose up` then open `http://localhost:3000` |
