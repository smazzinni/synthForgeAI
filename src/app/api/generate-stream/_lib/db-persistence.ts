// ─── Streaming Database Generation API — database persistence ───
//
// All durable-storage concerns for the `/api/generate-stream` route live here:
//   - Creating / marking-generating the `synthetic_databases` row.
//   - Building the per-batch `persistBatch` callback used by StreamProcessor.
//   - Marking the row `ready` with final data/counts in the finally block.
//
// Keeping this out of `stream-processor.ts` lets the processor stay
// storage-agnostic, and keeping it out of `route.ts` lets the route stay
// a thin orchestrator (POST handler only, under 400 lines).

import { getSupabaseAdmin } from '@/lib/supabase/admin'
import {
  createDatabaseInMemory,
  updateDatabaseInMemory,
} from '@/lib/in-memory-store'
import {
  createDatabasePrisma,
  updateDatabasePrisma,
} from '@/lib/prisma-store'
import type { GenerationRequest, GenerationSchema } from './types'

/** The Supabase admin client (or null when Supabase isn't configured). */
export type SupabaseAdmin = ReturnType<typeof getSupabaseAdmin>

/** Resolved database context shared across the request lifecycle. */
export interface DatabaseContext {
  databaseId?: string
  userId: string
  admin: SupabaseAdmin
}

/**
 * Ensure a `synthetic_databases` row exists for this generation request.
 *
 * - If `body.databaseId` is set, mark that row `generating` and return it.
 * - Otherwise create a new row (Supabase → Prisma → in-memory) and return
 *   the new id. Returns `undefined` if creation failed (Supabase insert
 *   error with no fallback — matches the original route behavior).
 */
export async function ensureDatabaseRecord(
  body: GenerationRequest,
  userId: string,
  admin: SupabaseAdmin,
): Promise<string | undefined> {
  if (body.databaseId) {
    await markDatabaseGenerating(body.databaseId, userId, admin)
    return body.databaseId
  }

  const dbName = body.databaseName || body.schema[0]?.name || 'synthetic_db'

  if (admin) {
    const { data: newDb, error: dbError } = await admin
      .from('synthetic_databases')
      .insert({
        name: dbName,
        db_type: 'postgresql',
        schema_json: body.schema,
        data_json: {},
        row_count: 0,
        quality_score: 0.85,
        status: 'generating',
        user_id: userId,
      })
      .select()
      .single()

    if (!dbError && newDb) {
      return newDb.id
    }
    return undefined
  }

  // Prisma-backed durable storage (survives server restarts), with an
  // in-memory fallback if Prisma itself is unavailable.
  try {
    const newDb = await createDatabasePrisma(userId, {
      name: dbName,
      db_type: 'postgresql',
      schema_json: body.schema,
      data_json: {},
      row_count: 0,
      quality_score: 0.85,
      status: 'generating',
    })
    return newDb.id
  } catch (err) {
    console.warn(
      '[Generate-Stream] Prisma create failed, falling back to in-memory:',
      err,
    )
    const newDb = createDatabaseInMemory(userId, {
      name: dbName,
      db_type: 'postgresql',
      schema_json: body.schema,
      data_json: {},
      row_count: 0,
      quality_score: 0.85,
      status: 'generating',
    })
    return newDb.id
  }
}

/** Mark an existing database row as `generating`. */
async function markDatabaseGenerating(
  databaseId: string,
  userId: string,
  admin: SupabaseAdmin,
): Promise<void> {
  if (admin) {
    await admin
      .from('synthetic_databases')
      .update({ status: 'generating' })
      .eq('id', databaseId)
    return
  }
  try {
    await updateDatabasePrisma(userId, databaseId, { status: 'generating' })
  } catch {
    updateDatabaseInMemory(userId, databaseId, { status: 'generating' })
  }
}

/** Parameters passed to the persistBatch callback by StreamProcessor. */
export interface PersistBatchParams {
  tableName: string
  records: unknown[]
  /** `totalInserted` value AFTER this batch is counted in. */
  newTotalCount: number
  /** Reference to the processor's in-memory table data (already mutated). */
  allTableData: Record<string, unknown[]>
}

/**
 * Build the `persistBatch` callback for StreamProcessor.
 *
 * The callback writes a batch of records to durable storage (Supabase or
 * Prisma/in-memory) and is invoked AFTER the processor has already mutated
 * its in-memory `allTableData` to include `records`.
 */
export function createPersistBatch(
  ctx: DatabaseContext,
): (params: PersistBatchParams) => Promise<void> {
  const { databaseId, userId, admin } = ctx

  return async ({ tableName, records, newTotalCount, allTableData }) => {
    if (!databaseId) return

    if (admin) {
      try {
        const { data: db } = await admin
          .from('synthetic_databases')
          .select('data_json')
          .eq('id', databaseId)
          .single()

        const existingData =
          (db?.data_json as Record<string, unknown[]>) || {}
        if (!existingData[tableName]) {
          existingData[tableName] = []
        }
        existingData[tableName] = [...existingData[tableName], ...records]

        await admin
          .from('synthetic_databases')
          .update({
            data_json: existingData,
            row_count: newTotalCount,
          })
          .eq('id', databaseId)
      } catch (err) {
        console.warn('[Generate-Stream] DB update failed:', err)
      }
      return
    }

    // Prisma-backed durable storage (with in-memory fallback)
    try {
      const merged: Record<string, unknown[]> = { ...allTableData }
      try {
        updateDatabasePrisma(userId, databaseId, {
          data_json: merged,
          row_count: newTotalCount,
        }).catch(() => {})
      } catch {
        updateDatabaseInMemory(userId, databaseId, {
          data_json: merged,
          row_count: newTotalCount,
        })
      }
    } catch (err) {
      console.warn('[Generate-Stream] DB update failed:', err)
    }
  }
}

/**
 * Mark the database row as `ready` and persist the final schema/data/counts.
 * Called from the route's `finally` block.
 */
export async function markDatabaseReady(
  ctx: DatabaseContext & {
    allTableData: Record<string, unknown[]>
    schema: GenerationSchema[]
    totalInserted: number
  },
): Promise<void> {
  const { databaseId, userId, admin, allTableData, schema, totalInserted } = ctx
  if (!databaseId) return

  if (admin) {
    try {
      await admin
        .from('synthetic_databases')
        .update({
          status: 'ready',
          data_json: allTableData,
          schema_json: schema,
          row_count: totalInserted,
          quality_score: 0.85,
        })
        .eq('id', databaseId)
    } catch (err) {
      console.warn('[Generate-Stream] Final DB update failed:', err)
    }
    return
  }

  // Prisma-backed durable storage — persist the final data so the studio
  // can load it via /api/databases?id=... (with in-memory fallback)
  try {
    try {
      await updateDatabasePrisma(userId, databaseId, {
        status: 'ready',
        data_json: allTableData,
        schema_json: schema,
        row_count: totalInserted,
        quality_score: 0.85,
      })
    } catch {
      updateDatabaseInMemory(userId, databaseId, {
        status: 'ready',
        data_json: allTableData,
        schema_json: schema,
        row_count: totalInserted,
        quality_score: 0.85,
      })
    }
  } catch (err) {
    console.warn('[Generate-Stream] Final DB update failed:', err)
  }
}
