import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

export const db = globalForPrisma.prisma ?? new PrismaClient({
  log: ['error'],
  datasources: {
    db: {
      url: process.env.DATABASE_URL || 'file:./db/custom.db'
    }
  }
})

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db

// Graceful shutdown — handles SIGTERM, SIGINT, and beforeExit
async function gracefulShutdown(signal: string) {
  try {
    await db.$disconnect()
    console.log(`[SynthForge DB] Disconnected on ${signal}`)
  } catch (err) {
    console.error('[SynthForge DB] Error during shutdown:', err)
  }
  process.exit(0)
}

process.on('beforeExit', () => gracefulShutdown('beforeExit'))
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'))
process.on('SIGINT', () => gracefulShutdown('SIGINT'))
