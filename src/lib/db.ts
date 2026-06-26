/**
 * Prisma client singleton.
 *
 * Next.js dev mode (Turbopack) re-evaluates modules on hot-reload. If we
 * instantiated `new PrismaClient()` at module top-level on every reload we
 * would quickly exhaust the database connection pool. We therefore cache the
 * client on `globalThis` so the same instance is reused across hot-reloads.
 *
 * In production (a single long-lived process) `globalThis.__synthPrisma` is
 * undefined on first import, so we create exactly one client.
 *
 * NOTE: This file is server-only. It must never be imported from a client
 * component (Prisma depends on Node APIs). All imports live in API routes
 * and server-only lib modules (e.g. `src/lib/prisma-store.ts`).
 */
import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  __synthPrisma?: PrismaClient
}

export const db =
  globalForPrisma.__synthPrisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  })

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.__synthPrisma = db
}
