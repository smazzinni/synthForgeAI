import { NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdmin, isAuthEnabled } from "@/lib/supabase/admin";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import type { Database, Json } from "@/lib/supabase/types";
import { validateAndCleanRecord } from "@/lib/record-validation";

// ─── Streaming Database Generation API ───
// Receives a generation signal (schema + row counts + instructions),
// calls the AI to produce NDJSON records, parses them line-by-line,
// batch-inserts into the database, and streams SSE progress to the frontend.

const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;
const DEEPSEEK_API_URL =
  process.env.DEEPSEEK_API_URL || "https://api.deepseek.com";
const BATCH_SIZE = 200;
const FLUSH_INTERVAL_MS = 300;
const STALE_GENERATION_TIMEOUT_MS = 5 * 60 * 1000;

const dbLocks: Map<string, Promise<void>> = new Map();

async function markDatabaseStatus(
  client: SupabaseClient<Database>,
  databaseId: string,
  status: "generating" | "ready" | "error",
) {
  try {
    await client
      .from("synthetic_databases")
      .update({ status })
      .eq("id", databaseId);
  } catch (err) {
    console.warn(
      `[Generate-Stream] Failed to set database ${databaseId} status to ${status}:`,
      err,
    );
  }
}

function isStaleGeneration(
  status: string | null | undefined,
  updatedAt: string | null | undefined,
) {
  if (status !== "generating") return false;
  if (!updatedAt) return false;
  const ageMs = Date.now() - new Date(updatedAt).getTime();
  return ageMs > STALE_GENERATION_TIMEOUT_MS;
}

async function acquireDbLock(id: string) {
  const prev = dbLocks.get(id) || Promise.resolve();
  let resolveFn!: () => void;
  const next = new Promise<void>((res) => {
    resolveFn = res;
  });
  // Chain waiters; compare this tail on release (not `next`) or delete never runs.
  const tail = prev.then(() => next);
  dbLocks.set(id, tail);
  await prev;
  return () => {
    resolveFn();
    if (dbLocks.get(id) === tail) dbLocks.delete(id);
  };
}

// ─── Safe UUID generator (Bug 7 fix) ───
function generateUUID(): string {
  if (
    typeof globalThis.crypto !== "undefined" &&
    typeof (globalThis.crypto as Crypto).randomUUID === "function"
  ) {
    return (globalThis.crypto as Crypto).randomUUID();
  }
  // Fallback: proper RFC 4122 v4 UUID
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// ─── Types ───
interface GenerationSchema {
  name: string;
  columns: Array<{ name: string; type: string }>;
}

interface GenerationRequest {
  databaseId?: string;
  databaseName?: string;
  schema: GenerationSchema[];
  rowCounts: Record<string, number>;
  instructions?: string;
  conversationHistory?: Array<{ role: string; content: string }>;
}

interface SSEEvent {
  type:
    | "progress"
    | "table_complete"
    | "complete"
    | "error"
    | "database_created";
  table?: string;
  rowsInserted?: number;
  totalInserted?: number;
  targetRows?: number;
  totalRows?: number;
  tablesGenerated?: number;
  durationMs?: number;
  message?: string;
  recoverable?: boolean;
  databaseId?: string;
}

/** Fallback when auth is off or server client is unavailable — keep patterns aligned with `src/app/api/auth/user/route.ts`. */
function getUserIdFromCookies(request: NextRequest): string | null {
  try {
    const supabaseCookies = request.cookies.getAll().filter(
      (c) =>
        c.name.includes("auth-token") ||
        c.name.startsWith("sb-") ||
        c.name.includes("-auth-token"),
    );
    for (const cookie of supabaseCookies) {
      try {
        const rawValue = decodeURIComponent(cookie.value);
        let accessToken: string | null = null;
        try {
          const parsed = JSON.parse(rawValue);
          accessToken = parsed?.access_token || null;
        } catch {
          accessToken = rawValue;
        }
        if (!accessToken) continue;
        const parts = accessToken.split(".");
        if (parts.length !== 3) continue;
        const payload = JSON.parse(atob(parts[1]));
        if (payload?.sub) return payload.sub;
      } catch {
        continue;
      }
    }
    return null;
  } catch (err) {
    console.warn("[Generate-Stream] getUserIdFromCookies failed:", err);
    return null;
  }
}

/**
 * Resolve the signed-in user the same way as middleware (`getSupabaseServerClient` +
 * `auth.getUser()`), so Route Handlers see the session cookies @supabase/ssr sets.
 * When auth is off, fall back to cookie JWT decode and SYNTHFORGE_DEV_USER_UUID.
 */
async function resolveGenerationUserId(
  request: NextRequest,
): Promise<string | null> {
  const supabase = await getSupabaseServerClient();
  if (supabase) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user?.id) return user.id;
  }
  if (isAuthEnabled()) {
    return null;
  }
  const fromCookies = getUserIdFromCookies(request);
  if (fromCookies) return fromCookies;
  const dev = process.env.SYNTHFORGE_DEV_USER_UUID?.trim();
  return dev || null;
}

function extractLocaleFromHistory(
  history: Array<{ role: string; content: string }>,
): string {
  if (!history || history.length === 0) return "";

  const localeKeywords = [
    "country", "region", "city", "locale", "location", "area", "nation",
    "state", "province", "territory", "postal code", "phone format",
    "address format", "currency", "timezone",
    "india", "delhi", "mumbai", "bangalore", "chennai", "kolkata",
    "hyderabad", "pune", "usa", "united states", "america", "new york",
    "california", "texas", "florida", "uk", "united kingdom", "london",
    "england", "manchester", "germany", "berlin", "munich", "france",
    "paris", "lyon", "japan", "tokyo", "osaka", "china", "beijing",
    "shanghai", "brazil", "são paulo", "rio", "australia", "sydney",
    "melbourne", "canada", "toronto", "vancouver", "mexico", "mexico city",
    "italy", "rome", "milan", "spain", "madrid", "barcelona",
    "south korea", "seoul", "netherlands", "amsterdam", "singapore",
    "hong kong", "dubai", "uae", "africa", "nigeria", "lagos", "kenya",
    "nairobi", "south africa", "cape town", "russia", "moscow", "poland",
    "warsaw", "sweden", "stockholm", "norway", "oslo", "denmark",
    "copenhagen", "finland", "helsinki", "switzerland", "zurich", "geneva",
    "austria", "vienna", "belgium", "brussels", "portugal", "lisbon",
    "argentina", "buenos aires", "colombia", "bogota", "chile", "santiago",
    "peru", "lima", "ecuador", "venezuela", "thailand", "bangkok",
    "vietnam", "hanoi", "ho chi minh", "malaysia", "kuala lumpur",
    "philippines", "manila", "indonesia", "jakarta", "pakistan", "karachi",
    "lahore", "bangladesh", "dhaka", "egypt", "cairo", "morocco",
    "casablanca", "saudi arabia", "riyadh", "jeddah", "qatar", "doha",
    "turkey", "istanbul", "ankara", "israel", "tel aviv", "greece",
    "athens", "czech", "prague", "hungary", "budapest", "romania",
    "bucharest", "ireland", "dublin", "new zealand", "auckland", "wellington",
  ];

  const localeParts: string[] = [];

  for (const msg of history) {
    if (!msg || typeof msg.content !== "string" || !msg.content.trim()) {
      continue;
    }
    const lower = msg.content.toLowerCase();
    for (const keyword of localeKeywords) {
      if (lower.includes(keyword)) {
        const idx = lower.indexOf(keyword);
        const start = Math.max(0, idx - 60);
        const end = Math.min(msg.content.length, idx + keyword.length + 90);
        const snippet = msg.content.substring(start, end).trim();
        localeParts.push(snippet);
        break;
      }
    }
  }

  if (localeParts.length === 0) return "";

  const unique = [...new Set(localeParts.map((s) => s.toLowerCase()))].slice(0, 5);
  return `LOCALE CONTEXT (from user conversation):
The user specified the following location/region preferences:
${unique.map((s) => `- ${s}`).join("\n")}
You MUST use this locale for ALL location-sensitive fields: city names, state/province names, phone number prefixes and formats, postal/zip code formats, address formats, currency symbols, and any other region-specific data. Do NOT default to US or any other region.`;
}

function buildGenerationPrompt(
  req: GenerationRequest,
  localeContext: string,
): string {
  const tableDescriptions = req.schema
    .map((table) => {
      const colDefs = table.columns
        .map((c) => `  ${c.name}: ${c.type}`)
        .join("\n");
      const rowCount = req.rowCounts[table.name] || 10;
      const columnNames = table.columns.map((c) => c.name).join(", ");
      return `Table: ${table.name} (${rowCount} rows)
Columns: ${columnNames}
${colDefs}`;
    })
    .join("\n\n");

  return `You are a data generation engine. Generate realistic synthetic data for the following database schema.

DATABASE: ${req.databaseName || "synthetic_db"}

SCHEMA:
${tableDescriptions}

${localeContext ? `${localeContext}\n\n` : ""}${req.instructions ? `ADDITIONAL INSTRUCTIONS:\n${req.instructions}\n` : ""}

STRICT COLUMN RULES:
- You MUST generate ONLY the columns listed above for each table. No extra fields.
- Each JSON record must contain exactly the columns listed in the schema — nothing more, nothing less.
- Do NOT add fields like date_of_birth, gender, city, state, specialty, or any field not listed in the table's column list.
- If a column is not in the schema, do NOT include it in the record.
- Each value must match the declared data type of its column exactly.

DATA FORMAT RULES:
- Output ONLY raw NDJSON — one JSON object per line.
- No arrays. No wrapper keys like {"tables":...}. No markdown. No explanation. No code fences.
- Each line must be a complete, valid JSON record for the CURRENT table.
- Generate records for each table sequentially: first ALL records for the first table, then ALL for the next, etc.
- Before each table's records, output a single marker line: ###TABLE:table_name###
- Use realistic values (real-looking names, emails, addresses, phone numbers, cities, companies).
- Use proper data types (numbers for quantities, ISO 8601 dates for timestamps, UUIDs for IDs).
- Always include an "id" column as a UUID string for each record.
- Include timestamps (created_at, updated_at) as ISO 8601 strings.
- Make data internally consistent (e.g., order dates after customer registration).
- Maintain referential integrity between tables (foreign key values must reference existing primary keys).
- For localized data, use appropriate names, phone formats, currencies, and addresses.
- UUID columns must contain properly formatted UUIDs (e.g., "a1b2c3d4-5678-9012-abcd-ef1234567890"), never names, emails, or other values.
- Email columns must contain properly formatted email addresses (e.g., "user@example.com").
- created_at/updated_at columns must contain recent timestamps (2024-2025), never birth years or historical dates.
- Foreign key columns (ending in _id) must contain valid UUIDs referencing existing parent records, never names or other values.

Begin immediately. Do not confirm or summarize first.

Example output format:
###TABLE:users###
{"id":"a1b2c3d4-5678-9012-abcd-ef1234567890","name":"Alice Johnson","email":"alice@example.com","created_at":"2024-01-15T10:30:00Z"}
{"id":"b2c3d4e5-6789-0123-bcde-f12345678901","name":"Bob Smith","email":"bob@example.com","created_at":"2024-01-16T14:22:00Z"}
###TABLE:orders###
{"id":"c3d4e5f6-7890-1234-cdef-123456789012","user_id":"a1b2c3d4-5678-9012-abcd-ef1234567890","total":99.99,"created_at":"2024-02-01T09:15:00Z"}

Now generate the data. Start with ###TABLE:${req.schema[0]?.name || "table1"}###`;
}

export async function POST(request: NextRequest) {
  try {
    const text = await request.text();
    if (text.length > 200000) {
      return new Response(JSON.stringify({ error: "Request too large" }), {
        status: 413,
        headers: { "Content-Type": "application/json" },
      });
    }

    const body: GenerationRequest = JSON.parse(text);

    if (!body.schema || body.schema.length === 0) {
      return new Response(JSON.stringify({ error: "Schema is required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (!DEEPSEEK_API_KEY) {
      return new Response(
        JSON.stringify({ error: "DeepSeek API key not configured" }),
        { status: 503, headers: { "Content-Type": "application/json" } },
      );
    }

    const userId = await resolveGenerationUserId(request);
    if (isAuthEnabled() && !userId) {
      return new Response(
        JSON.stringify({ error: "Authentication required" }),
        { status: 401, headers: { "Content-Type": "application/json" } },
      );
    }
    const startTime = Date.now();

    let databaseId = body.databaseId;
    const supabaseRaw = getSupabaseAdmin();

    // If Supabase admin client isn't configured, fail fast so frontend can
    // surface a clear error instead of silently accumulating in-memory data
    // and never writing to the user's database.
    if (!supabaseRaw) {
      console.warn('[Generate-Stream] Supabase admin client not configured');
      return new Response(JSON.stringify({ error: 'Database service not configured' }), {
        status: 503,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const supabase: SupabaseClient<Database> = supabaseRaw;

    if (databaseId) {
        const { data: existingDb, error: selectError } = await supabase
          .from("synthetic_databases")
          .select("status, updated_at")
          .eq("id", databaseId)
          .single();

        const isStale =
          existingDb &&
          !selectError &&
          isStaleGeneration(existingDb.status, existingDb.updated_at);

        if (
          existingDb &&
          !selectError &&
          existingDb.status === "generating" &&
          !isStale
        ) {
          return new Response(
            JSON.stringify({
              error: "Database is currently generating. Try again later.",
            }),
            { status: 409, headers: { "Content-Type": "application/json" } },
          );
        }

        if (existingDb && !selectError && existingDb.status === "generating" && isStale) {
          console.warn(
            `[Generate-Stream] Reclaiming stale generating status for database ${databaseId}`,
          );
        }

        await supabase
          .from("synthetic_databases")
          .update({ status: "generating" })
          .eq("id", databaseId);
      } else {
        const dbName =
          body.databaseName || body.schema[0]?.name || "synthetic_db";

        const existingByName = supabase
          .from("synthetic_databases")
          .select("id, status, updated_at")
          .eq("name", dbName);
        const { data: existingDb, error: selectError } = userId
          ? await existingByName.eq("user_id", userId).single()
          : await existingByName.is("user_id", null).single();

        if (existingDb && !selectError) {
          const isStale = isStaleGeneration(existingDb.status, existingDb.updated_at);
          if (existingDb.status === "generating" && !isStale) {
            return new Response(
              JSON.stringify({
                error: "Database is currently generating. Try again later.",
              }),
              { status: 409, headers: { "Content-Type": "application/json" } },
            );
          }

          if (existingDb.status === "generating" && isStale) {
            console.warn(
              `[Generate-Stream] Reclaiming stale generating status for database ${existingDb.id}`,
            );
          }

          databaseId = existingDb.id;
          await supabase
            .from("synthetic_databases")
            .update({ status: "generating" })
            .eq("id", databaseId);
        } else {
          const { data: newDb, error: dbError } = await supabase
            .from("synthetic_databases")
            .insert({
              name: dbName,
              db_type: "postgresql",
              schema_json: body.schema as unknown as Json,
              data_json: {} as Json,
              row_count: 0,
              quality_score: 0.85,
              status: "generating",
              user_id: userId,
            })
            .select()
            .single();

          if (!dbError && newDb) {
            databaseId = newDb.id;
          } else if (dbError) {
            if (
              dbError.code === "23505" ||
              dbError.message?.includes("unique")
            ) {
              const fallbackQuery = supabase
                .from("synthetic_databases")
                .select("id")
                .eq("name", dbName);
              const { data: fallbackDb } = userId
                ? await fallbackQuery.eq("user_id", userId).single()
                : await fallbackQuery.is("user_id", null).single();

              if (fallbackDb) {
                databaseId = fallbackDb.id;
                await supabase
                  .from("synthetic_databases")
                  .update({ status: "generating" })
                  .eq("id", databaseId);
              } else {
                const uniqueName = `${dbName}_${Date.now()}`;
                const { data: newDb2 } = await supabase
                  .from("synthetic_databases")
                  .insert({
                    name: uniqueName,
                    db_type: "postgresql",
                    schema_json: body.schema as unknown as Json,
                    data_json: {} as Json,
                    row_count: 0,
                    quality_score: 0.85,
                    status: "generating",
                    user_id: userId,
                  })
                  .select()
                  .single();
                if (newDb2) databaseId = newDb2.id;
              }
            }
          }
        }
    }

    const localeContext = extractLocaleFromHistory(
      body.conversationHistory || [],
    );

    const originalTableData: Record<string, unknown[]> = {};

    if (databaseId) {
      const { data: existingDataResponse, error: existingDataError } = await supabase
        .from("synthetic_databases")
        .select("data_json")
        .eq("id", databaseId)
        .single();
      if (!existingDataError && existingDataResponse?.data_json) {
        Object.assign(
          originalTableData,
          existingDataResponse.data_json as Record<string, unknown[]>,
        );
      }
    }

    const schemaLookup = new Map<
      string,
      Array<{ name: string; type: string }>
    >();
    for (const table of body.schema) {
      schemaLookup.set(table.name, table.columns);
    }

    const generationPrompt = buildGenerationPrompt(body, localeContext);

    const messages: Array<{ role: string; content: string }> = [
      { role: "system", content: generationPrompt },
    ];

    if (body.conversationHistory && body.conversationHistory.length > 0) {
      const recentHistory = body.conversationHistory.slice(-6);
      for (const msg of recentHistory) {
        if (
          (msg.role === "user" || msg.role === "assistant") &&
          typeof msg.content === "string" &&
          msg.content.length > 0
        ) {
          messages.push({
            role: msg.role,
            content: msg.content.slice(0, 32000),
          });
        }
      }
    }

    const totalRows = Object.values(body.rowCounts).reduce(
      (sum, n) => sum + n,
      0,
    );
    messages.push({
      role: "user",
      content: `Generate the data now. ${totalRows} total rows across ${body.schema.length} tables. Begin with ###TABLE:${body.schema[0]?.name}###`,
    });

    // Use chat (not reasoner) for NDJSON: reasoner spends long stretches in
    // internal reasoning before emitting content, which looks like a hung UI.
    const generationModel =
      process.env.DEEPSEEK_GENERATION_MODEL?.trim() || "deepseek-chat";

    const upstreamAbort = new AbortController();
    const upstreamTimeoutRaw = Number(process.env.DEEPSEEK_GENERATION_TIMEOUT_MS);
    const upstreamTimeoutMs = Math.min(
      Math.max(
        Number.isFinite(upstreamTimeoutRaw) && upstreamTimeoutRaw > 0
          ? upstreamTimeoutRaw
          : 720_000,
        60_000,
      ),
      1_800_000,
    );
    const upstreamTimer = setTimeout(() => {
      upstreamAbort.abort();
    }, upstreamTimeoutMs);

    let deepseekResponse: Response;
    try {
      deepseekResponse = await fetch(`${DEEPSEEK_API_URL}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${DEEPSEEK_API_KEY}`,
        },
        body: JSON.stringify({
          model: generationModel,
          messages,
          stream: true,
          max_tokens: 65536,
          stream_options: { include_usage: true },
        }),
        signal: upstreamAbort.signal,
      });
    } catch (fetchErr) {
      console.error("[Generate-Stream] DeepSeek fetch failed:", fetchErr);
      if (databaseId) {
        await markDatabaseStatus(supabase, databaseId, "error");
      }
      const msg =
        fetchErr instanceof Error ? fetchErr.message : "AI request failed";
      return new Response(
        JSON.stringify({ error: "AI request failed", message: msg }),
        { status: 504, headers: { "Content-Type": "application/json" } },
      );
    } finally {
      clearTimeout(upstreamTimer);
    }

    if (!deepseekResponse.ok) {
      const errorText = await deepseekResponse
        .text()
        .catch(() => "Unknown error");
      console.error(
        "[Generate-Stream] DeepSeek error:",
        deepseekResponse.status,
        errorText,
      );

      if (databaseId) {
        await markDatabaseStatus(supabase, databaseId, "error");
      }

      return new Response(JSON.stringify({ error: "AI service error" }), {
        status: deepseekResponse.status,
        headers: { "Content-Type": "application/json" },
      });
    }

    const encoder = new TextEncoder();
    const reader = deepseekResponse.body?.getReader();

    if (!reader) {
      if (databaseId) {
        await markDatabaseStatus(supabase, databaseId, "error");
      }
      return new Response(JSON.stringify({ error: "No response stream" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    const allTableData: Record<string, unknown[]> = {};
    const primaryKeySets: Map<string, Set<string>> = new Map();
    let currentTable = "";
    let insertQueue: unknown[] = [];
    let totalInserted = 0;
    let currentTableInserted = 0;
    let lastFlushTime = Date.now();
    let malformedLines = 0;
    const allValidationFailures: Array<{
      table: string;
      column: string;
      value: unknown;
      reason: string;
    }> = [];

    const sendSSE = (event: SSEEvent): Uint8Array => {
      return encoder.encode(`data: ${JSON.stringify(event)}\n\n`);
    };

    // Serialize generation per database on this instance; cross-instance
    // consistency relies on merge_generation_flush RPC (see migration 002).
    let generationLockRelease: (() => void) | null = null;

    if (databaseId) {
      try {
        generationLockRelease = await acquireDbLock(databaseId);
      } catch (err) {
        console.warn("[Generate-Stream] acquireDbLock failed:", err);
        generationLockRelease = null;
      }
    }

    const flushBatch = async (
      tableName: string,
      records: unknown[],
    ): Promise<void> => {
      if (records.length === 0) return;

      if (!allTableData[tableName]) {
        allTableData[tableName] = [];
      }
      allTableData[tableName].push(...records);

      if (databaseId) {
        let release: (() => void) | null = null;
        const newRowCount = totalInserted + records.length;
        try {
          const { error: rpcError } = await supabase.rpc(
            "merge_generation_flush",
            {
              p_database_id: databaseId,
              p_table_name: tableName,
              p_rows: records as Json,
              p_row_count: newRowCount,
            },
          );

          if (rpcError) {
            const msg = rpcError.message ?? "";
            const rpcMissing =
              rpcError.code === "PGRST202" ||
              /could not find the function/i.test(msg) ||
              /function .* does not exist/i.test(msg);
            if (rpcMissing) {
              console.warn(
                "[Generate-Stream] merge_generation_flush RPC missing; apply supabase/migrations/002_merge_generation_flush.sql. Using legacy flush (may race across instances).",
              );
            } else {
              console.warn(
                "[Generate-Stream] merge_generation_flush RPC failed, using legacy flush:",
                rpcError,
              );
            }

            release = await acquireDbLock(`flush:${databaseId}`);

            const { data: db } = await supabase
              .from("synthetic_databases")
              .select("data_json")
              .eq("id", databaseId)
              .single();

            const existingData =
              (db?.data_json as Record<string, unknown[]>) || {};
            if (!existingData[tableName]) {
              existingData[tableName] = [];
            }
            existingData[tableName] = [
              ...existingData[tableName],
              ...records,
            ];

            await supabase
              .from("synthetic_databases")
              .update({
                data_json: existingData as unknown as Json,
                row_count: newRowCount,
              })
              .eq("id", databaseId);
          }
        } catch (err) {
          console.warn("[Generate-Stream] DB update failed:", err);
        } finally {
          if (release) release();
        }
      }

      totalInserted += records.length;
      currentTableInserted += records.length;
    };

    // ─── Helper: process a single NDJSON/marker line ───
    const processLine = async (
      line: string,
      controller: ReadableStreamDefaultController,
      closed: { value: boolean },
    ) => {
      const safeEnqueue = (data: Uint8Array) => {
        if (closed.value) return;
        try {
          controller.enqueue(data);
        } catch {
          closed.value = true;
        }
      };

      if (!line) return;

      const tableMarker = line.match(/^#{3}\s*TABLE\s*:\s*([^#]+?)\s*#{3}$/i);
      if (tableMarker) {
        if (insertQueue.length > 0 && currentTable) {
          await flushBatch(currentTable, insertQueue.splice(0));
          safeEnqueue(
            sendSSE({
              type: "progress",
              table: currentTable,
              rowsInserted: currentTableInserted,
              totalInserted,
              targetRows: body.rowCounts[currentTable] || 0,
            }),
          );
        }

        currentTable = tableMarker[1].trim();
        const existingRows =
          originalTableData[currentTable] || allTableData[currentTable] || [];
        const pkSet = new Set<string>();
        for (const row of existingRows) {
          const id = (row as Record<string, unknown>)["id"];
          if (id != null) pkSet.add(String(id));
        }
        primaryKeySets.set(currentTable, pkSet);
        currentTableInserted = existingRows.length;

        safeEnqueue(
          sendSSE({
            type: "progress",
            table: currentTable,
            rowsInserted: currentTableInserted,
            totalInserted,
            targetRows: body.rowCounts[currentTable] || 0,
            message: `Streaming records into [${currentTable}]`,
          }),
        );
        return;
      }

      if (!currentTable && line.trim().startsWith('{') && body.schema.length > 0) {
        currentTable = body.schema[0].name;
        const existingRows =
          originalTableData[currentTable] || allTableData[currentTable] || [];
        const pkSet = new Set<string>();
        for (const row of existingRows) {
          const id = (row as Record<string, unknown>)["id"];
          if (id != null) pkSet.add(String(id));
        }
        primaryKeySets.set(currentTable, pkSet);
        currentTableInserted = existingRows.length;

        safeEnqueue(
          sendSSE({
            type: "progress",
            table: currentTable,
            rowsInserted: currentTableInserted,
            totalInserted,
            targetRows: body.rowCounts[currentTable] || 0,
            message: `Streaming records into [${currentTable}]`,
          }),
        );
      }

      if (currentTable) {
        try {
          const rawRecord = JSON.parse(line);
          if (
            typeof rawRecord === "object" &&
            rawRecord !== null &&
            !Array.isArray(rawRecord)
          ) {
            const tableColumns = schemaLookup.get(currentTable);
            if (tableColumns) {
              const existingPKs =
                primaryKeySets.get(currentTable) || new Set<string>();
              const result = validateAndCleanRecord(
                currentTable,
                rawRecord as Record<string, unknown>,
                tableColumns,
                existingPKs,
              );

              // FIX (Bug 3): collect validation failures from result *after*
              // the duplicate-ID check so all failures are captured together.
              const idVal = String(result.cleanedRecord["id"] || "");
              if (idVal) {
                const pkSet =
                  primaryKeySets.get(currentTable) || new Set<string>();
                if (pkSet.has(idVal)) {
                  // FIX (Bug 7): use safe generateUUID() instead of broken genHex
                  const newId = generateUUID();
                  result.failures.push({
                    column: "id",
                    value: idVal,
                    reason: `Duplicate id auto-replaced: ${newId}`,
                  });
                  result.cleanedRecord["id"] = newId;
                  pkSet.add(newId);
                } else {
                  pkSet.add(idVal);
                }
                primaryKeySets.set(currentTable, pkSet);
              }

              // Collect all failures (including the possible duplicate above)
              for (const f of result.failures) {
                allValidationFailures.push({ table: currentTable, ...f });
                if (allValidationFailures.length <= 20) {
                  console.warn(
                    `[Generate-Stream] Validation failure in ${currentTable}: column=${f.column}, value=${String(f.value).substring(0, 50)}, reason=${f.reason}`,
                  );
                }
              }

              // ─── Foreign key checks: ensure *_id columns reference existing parent PKs ───
              for (const [colName, colVal] of Object.entries(result.cleanedRecord)) {
                if (!colName.endsWith('_id')) continue;
                const fkVal = String(colVal || '');
                if (!fkVal) continue;

                // Heuristic: parent table is the column name without _id (try singular/plural)
                const base = colName.slice(0, -3).toLowerCase();
                const candidateTables = Array.from(schemaLookup.keys());
                let parentTable: string | null = null;
                for (const t of candidateTables) {
                  const tn = t.toLowerCase();
                  if (tn === base || tn === `${base}s` || tn === `${base}es`) {
                    parentTable = t;
                    break;
                  }
                }

                if (!parentTable) continue;

                const parentPKs = primaryKeySets.get(parentTable) || new Set<string>();
                if (!parentPKs.has(fkVal)) {
                  // If parent table already has some PKs, reuse one to maintain referential integrity
                  if (parentPKs.size > 0) {
                    const existingPk = parentPKs.values().next().value as string;
                    result.failures.push({ column: colName, value: fkVal, reason: `Foreign key ${colName} did not match any known ${parentTable} id; replaced with existing id ${existingPk}` });
                    result.cleanedRecord[colName] = existingPk;
                  } else {
                    // Create a placeholder parent PK and add a minimal record so FK can point to it
                    const placeholder = generateUUID();
                    parentPKs.add(placeholder);
                    primaryKeySets.set(parentTable, parentPKs);
                    if (!allTableData[parentTable]) allTableData[parentTable] = [];
                    allTableData[parentTable].push({ id: placeholder });
                    result.failures.push({ column: colName, value: fkVal, reason: `Foreign key ${colName} did not match any ${parentTable} id; created placeholder id ${placeholder}` });
                    result.cleanedRecord[colName] = placeholder;
                  }
                }
              }

              insertQueue.push(result.cleanedRecord);
            } else {
              insertQueue.push(rawRecord);
            }

            const now = Date.now();
            if (
              insertQueue.length >= BATCH_SIZE ||
              now - lastFlushTime >= FLUSH_INTERVAL_MS
            ) {
              await flushBatch(currentTable, insertQueue.splice(0));
              lastFlushTime = now;

              safeEnqueue(
                sendSSE({
                  type: "progress",
                  table: currentTable,
                  rowsInserted: currentTableInserted,
                  totalInserted,
                  targetRows: body.rowCounts[currentTable] || 0,
                }),
              );
            }
          }
        } catch {
          malformedLines++;
          if (malformedLines <= 5) {
            console.warn(
              "[Generate-Stream] Malformed NDJSON line:",
              line.substring(0, 100),
            );
          }
        }
      }
    };

    const stream = new ReadableStream({
      async start(controller) {
        const decoder = new TextDecoder();
        let aiBuffer = "";
        let contentBuffer = "";
        const closed = { value: false };

        const safeEnqueue = (data: Uint8Array) => {
          if (closed.value) return;
          try {
            controller.enqueue(data);
          } catch {
            closed.value = true;
          }
        };

        safeEnqueue(
          sendSSE({
            type: "progress",
            table: "",
            message: `Generating database schema...`,
            rowsInserted: 0,
            totalInserted: 0,
            targetRows: totalRows,
          }),
        );

        if (databaseId) {
          safeEnqueue(
            encoder.encode(
              `data: ${JSON.stringify({ type: "database_created", databaseId })}\n\n`,
            ),
          );
        }

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            aiBuffer += decoder.decode(value, { stream: true });
            const aiLines = aiBuffer.split("\n");
            aiBuffer = aiLines.pop() || "";

            for (const aiLine of aiLines) {
              const trimmed = aiLine.trim();
              if (!trimmed || !trimmed.startsWith("data: ")) continue;

              const aiData = trimmed.slice(6);
              if (aiData === "[DONE]") continue;

              try {
                const parsed = JSON.parse(aiData);
                const choice = parsed.choices?.[0];
                if (!choice) continue;

                const delta = choice.delta;

                if (delta?.content) {
                  contentBuffer += delta.content;

                  const contentLines = contentBuffer.split("\n");
                  contentBuffer = contentLines.pop() || "";

                  for (const contentLine of contentLines) {
                    await processLine(contentLine.trim(), controller, closed);
                  }
                }

                if (choice.finish_reason) {
                  // FIX (Bug 8): flush any remaining content in the buffer
                  // before handling finish, since the last line may not have
                  // a trailing newline.
                  if (contentBuffer.trim()) {
                    await processLine(contentBuffer.trim(), controller, closed);
                    contentBuffer = "";
                  }

                  if (insertQueue.length > 0 && currentTable) {
                    await flushBatch(currentTable, insertQueue.splice(0));
                  }

                  if (currentTable) {
                    safeEnqueue(
                      sendSSE({
                        type: "table_complete",
                        table: currentTable,
                        totalRows: currentTableInserted,
                      }),
                    );
                  }
                }
              } catch {
                // Skip unparseable AI chunks
              }
            }
          }
        } catch (err) {
          console.error("[Generate-Stream] Stream error:", err);

          if (insertQueue.length > 0 && currentTable) {
            try {
              await flushBatch(currentTable, insertQueue.splice(0));
            } catch (flushErr) {
              console.warn("[Generate-Stream] flush after stream error:", flushErr);
            }
          }

          safeEnqueue(
            sendSSE({
              type: "error",
              message:
                err instanceof Error ? err.message : "Stream interrupted",
              recoverable: totalInserted > 0,
            }),
          );
        } finally {
          // Final flush for any stragglers
          if (insertQueue.length > 0 && currentTable) {
            try {
              await flushBatch(currentTable, insertQueue.splice(0));
            } catch (err) {
              console.warn("[Generate-Stream] final flush in finally:", err);
            }
          }

          // FIX (Bug 8): flush any remaining content buffer in the finally block
          if (contentBuffer.trim() && currentTable) {
            try {
              await processLine(contentBuffer.trim(), controller, closed);
              if (insertQueue.length > 0) {
                await flushBatch(currentTable, insertQueue.splice(0));
              }
            } catch (err) {
              console.warn("[Generate-Stream] final content-buffer flush failed:", err);
            }
          }

          if (databaseId) {
            try {
              // Build final data: start with original data for tables NOT
              // being regenerated, then overlay allTableData for generated
              // tables. allTableData is the source of truth — flushBatch
              // already wrote these rows incrementally so we must NOT
              // re-append them on top of flushed data.
              const finalDataJson: Record<string, unknown[]> = {};

              // Preserve original data for tables not in this generation
              for (const [tableName, rows] of Object.entries(originalTableData)) {
                if (!allTableData[tableName]) {
                  finalDataJson[tableName] = rows;
                }
              }

              // Use allTableData as-is for generated tables (already complete)
              for (const [tableName, rows] of Object.entries(allTableData)) {
                finalDataJson[tableName] = rows;
              }

              await supabase
                .from("synthetic_databases")
                .update({
                  status: "ready",
                  data_json: finalDataJson as unknown as Json,
                  schema_json: body.schema as unknown as Json,
                  row_count: totalInserted,
                  quality_score: 0.85,
                })
                .eq("id", databaseId);
            } catch (err) {
              console.warn("[Generate-Stream] Final DB update failed:", err);
            }
          }

          try {
            if (generationLockRelease) {
              generationLockRelease();
              generationLockRelease = null;
            }
          } catch (err) {
            console.warn("[Generate-Stream] generationLockRelease failed:", err);
          }

          if (allValidationFailures.length > 0) {
            console.warn(
              `[Generate-Stream] Total validation failures: ${allValidationFailures.length} across ${new Set(allValidationFailures.map((f) => f.table)).size} tables`,
            );
          }
          if (malformedLines > 0) {
            console.warn(
              `[Generate-Stream] Total malformed NDJSON lines: ${malformedLines}`,
            );
          }

          const durationMs = Date.now() - startTime;
          const tablesGenerated = Object.keys(allTableData).length;

          // FIX (Bug 6): emit table_complete for ALL tables, not just those
          // that differ from currentTable. Use a Set to avoid double-emitting
          // for the last table (already emitted on finish_reason above).
          const completedTables = new Set<string>();
          // currentTable was already emitted on finish_reason; mark it done.
          if (currentTable) completedTables.add(currentTable);

          for (const tableName of Object.keys(allTableData)) {
            if (!completedTables.has(tableName)) {
              safeEnqueue(
                sendSSE({
                  type: "table_complete",
                  table: tableName,
                  totalRows: allTableData[tableName].length,
                }),
              );
              completedTables.add(tableName);
            }
          }

          safeEnqueue(
            sendSSE({
              type: "complete",
              tablesGenerated,
              totalRows: totalInserted,
              durationMs,
            }),
          );

          if (!closed.value) {
            try {
              controller.close();
            } catch {
              // Already closed
            }
          }
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (err) {
    console.error("[Generate-Stream] Unhandled error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}